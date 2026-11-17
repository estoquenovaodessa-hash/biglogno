import type {
  AnalyzedItem, ConferenciaState, EnderecoBase, ZonaSeguraRecord,
} from "./types";
import { parseAddress } from "./address";

export type AjusteRoboRegistro = {
  codigo: string;
  saldoAnterior: number;
  saldoSolicitado: number;
  saldoAtual: number;
  status: "correto" | "divergente";
  ajusteRealizado: boolean;
};

export type AjusteRoboRelatorio = {
  versao: 1;
  rotina: "ajuste_estoque";
  data: string;
  registros: AjusteRoboRegistro[];
};

function objeto(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function numero(value: unknown, campo: string, linha: number): number {
  if (typeof value !== "string" && typeof value !== "number")
    throw new Error("Registro " + linha + ": " + campo + " deve ser um número.");
  const raw = String(value).trim();
  if (!/^-?\d+(?:[.,]\d+)?$/.test(raw))
    throw new Error("Registro " + linha + ": valor inválido em " + campo + ".");
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || Math.abs(n) > 1_000_000_000)
    throw new Error("Registro " + linha + ": " + campo + " fora do limite.");
  return n;
}

function dataValida(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Lê apenas o formato versao=1, rotina=ajuste_estoque. Não grava dados. */
export function parseAjusteEstoqueJson(text: string): AjusteRoboRelatorio {
  if (text.length > 2_000_000)
    throw new Error("O relatório JSON deve ter no máximo 2 MB.");
  let doc: unknown;
  try { doc = JSON.parse(text.replace(/^\uFEFF/, "").trim()); }
  catch { throw new Error("Arquivo inválido: não foi possível interpretar o JSON."); }
  if (!objeto(doc) || doc.versao !== 1 || doc.rotina !== "ajuste_estoque")
    throw new Error("Formato não reconhecido. Esperado: versao 1 e rotina ajuste_estoque.");
  if (!dataValida(doc.data))
    throw new Error("A data do relatório deve ser válida no formato AAAA-MM-DD.");
  if (!Array.isArray(doc.registros) || doc.registros.length === 0 || doc.registros.length > 5000)
    throw new Error("O JSON deve conter entre 1 e 5.000 registros.");
  if (typeof doc.total_registros !== "number" || !Number.isInteger(doc.total_registros) ||
      doc.total_registros !== doc.registros.length)
    throw new Error("total_registros não corresponde à quantidade em registros.");

  const codigos = new Set<string>();
  const registros: AjusteRoboRegistro[] = doc.registros.map((value: unknown, index: number) => {
    const linha = index + 1;
    if (!objeto(value)) throw new Error("Registro " + linha + ": objeto inválido.");
    if (typeof value.codigo !== "string" || !/^\d{1,12}$/.test(value.codigo.trim()))
      throw new Error("Registro " + linha + ": código deve ser texto contendo apenas dígitos.");
    const codigo = value.codigo.trim().padStart(5, "0");
    if (codigos.has(codigo))
      throw new Error("Código " + codigo + " duplicado no relatório.");
    codigos.add(codigo);
    if (value.status !== "correto" && value.status !== "divergente")
      throw new Error("Registro " + linha + ": status deve ser correto ou divergente.");
    if (typeof value.ajuste_realizado !== "boolean")
      throw new Error("Registro " + linha + ": ajuste_realizado deve ser true ou false.");
    return {
      codigo,
      saldoAnterior: numero(value.saldo_anterior, "saldo_anterior", linha),
      saldoSolicitado: numero(value.saldo_solicitado, "saldo_solicitado", linha),
      saldoAtual: numero(value.saldo_atual, "saldo_atual", linha),
      status: value.status,
      ajusteRealizado: value.ajuste_realizado,
    };
  });
  return { versao: 1, rotina: "ajuste_estoque", data: doc.data, registros };
}

export type AjusteRoboResultado = {
  zonaSegura: ZonaSeguraRecord[];
  conferencia: Record<string, ConferenciaState>;
  adicionados: number;
  atualizados: number;
  ignorados: number;
};

type DadosItem = Pick<AnalyzedItem, "codigo" | "descricao" | "endereco" | "curva" | "categoria" |
  "tipoErro" | "qtdEstoque" | "qtdMovimentada" | "linha" | "grupo">;

/** Aplica um relatório validado ao estado, sem atualizar o estoque do ERP.
 * Reimportar a mesma linha ou um ajuste anterior à última correção é inofensivo.
 */
export function aplicarAjusteEstoqueJson(
  relatorio: AjusteRoboRelatorio,
  zonaAnterior: ZonaSeguraRecord[],
  conferenciaAnterior: Record<string, ConferenciaState>,
  baseEnderecos: EnderecoBase,
  itens: DadosItem[],
  agora: { iso: string; hora: string },
): AjusteRoboResultado {
  const map = new Map(zonaAnterior.map(z => [z.codigo, z]));
  const conferencia = { ...conferenciaAnterior };
  const lookup = new Map(itens.map(item => [item.codigo, item]));
  let adicionados = 0;
  let atualizados = 0;
  let ignorados = 0;

  for (const row of relatorio.registros) {
    const existing = map.get(row.codigo);
    const assinatura = JSON.stringify([relatorio.data, row.codigo, row.saldoAnterior,
      row.saldoSolicitado, row.saldoAtual, row.status, row.ajusteRealizado]);
    // Mesmo conteúdo já importado: não somar uma nova correção.
    // Não sobrepor uma correção com data posterior ao relatório do robô.
    if (existing?.ajusteEstoqueRobo?.assinatura === assinatura ||
        (existing?.dataCorrecao && existing.dataCorrecao > relatorio.data)) {
      ignorados++;
      continue;
    }

    const motivo = row.status === "divergente" ? "Divergente" : "Correto";
    const observacao = "Robô ajuste_estoque · Saldo anterior: " + row.saldoAnterior +
      " · Solicitado: " + row.saldoSolicitado +
      " · Atual: " + row.saldoAtual +
      " · Ajuste realizado: " + (row.ajusteRealizado ? "sim" : "não");
    const item = lookup.get(row.codigo);
    const enderecoRec = baseEnderecos.registros[row.codigo];
    const descricao = existing?.descricao || item?.descricao || enderecoRec?.descricao || "";
    const endereco = existing?.endereco || item?.endereco || enderecoRec?.endereco || "";
    const parsedAddress = parseAddress(endereco);
    const ajusteEstoqueRobo = {
      data: relatorio.data,
      saldoAnterior: row.saldoAnterior,
      saldoSolicitado: row.saldoSolicitado,
      saldoAtual: row.saldoAtual,
      status: row.status,
      ajusteRealizado: row.ajusteRealizado,
      assinatura,
    };
    map.set(row.codigo, {
      ...(existing ?? {
        codigo: row.codigo,
        descricao,
        endereco,
        bloco: parsedAddress.blocoNome,
        rua: parsedAddress.valido ? String(parsedAddress.rua).padStart(2, "0") : "",
        curvaOperacional: item?.curva ?? "",
        categoriaOriginal: item?.categoria ?? "Ajuste de estoque (robô)",
        tipoErro: item?.tipoErro ?? "AJUSTE_ESTOQUE_ROBO",
        quantidadeMovimentadaNaCorrecao: 0,
        importacaoId: "robo-ajuste-estoque:" + relatorio.data,
        quantidadeReincidencias: 0,
        ultimaReincidencia: null,
        linha: item?.linha ?? enderecoRec?.linha ?? "",
        grupo: item?.grupo ?? enderecoRec?.grupo ?? "",
      }),
      descricao,
      endereco,
      estoqueNaCorrecao: row.saldoAtual,
      acaoRealizada: row.ajusteRealizado ? "Ajuste informado pelo robô" : "Conferido pelo robô (sem ajuste)",
      status: motivo,
      observacao,
      dataCorrecao: relatorio.data,
      horaCorrecao: agora.hora,
      dataImportacaoOriginal: existing?.dataImportacaoOriginal || relatorio.data,
      quantidadeCorrecoes: (existing?.quantidadeCorrecoes ?? 0) + 1,
      ajusteEstoqueRobo,
    });

    conferencia[row.codigo] = {
      status: motivo === "Divergente" ? "Divergente" : "Conferido",
      motivo,
      observacao,
      atualizadoEm: agora.iso,
    };
    if (existing) atualizados++;
    else adicionados++;
  }

  return {
    zonaSegura: Array.from(map.values()), conferencia,
    adicionados, atualizados, ignorados,
  };
}

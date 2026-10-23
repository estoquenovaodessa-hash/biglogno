import type {
  RawMovimento,
  AnalyzedItem,
  EnderecoBase,
  CurvaOperacional,
  StatusEstoque,
  PrioridadeLabel,
  CategoriaAlerta,
  EnderecoStatus,
  ZonaSeguraRecord,
  ResolvidoNoDia,
  ConferenciaState,
} from "./types";
import { parseAddress, compareAddress } from "./address";

export function dailyKey(
  data: string,
  codigo: string,
  tipoErro: string,
  endereco: string,
): string {
  return `${data}|${codigo}|${tipoErro}|${endereco || "SEM_END"}`;
}

// Classificação do status físico do item, focada apenas no movimento e no
// saldo. Sem conceitos de suprimentos/compra.
// Estoque baixo = saldo de 1 ou 2 unidades, independente da unidade de
// medida ou do movimento registrado.
export const LIMITE_ESTOQUE_BAIXO = 2;

function classifyStatus(estoque: number, mov: number): StatusEstoque {
  if (mov < 0) return "Devolução/Ajuste";
  if (estoque < 0) return "Estoque negativo";
  if (estoque === 0) return "Sem estoque";
  if (estoque <= LIMITE_ESTOQUE_BAIXO) return "Estoque baixo";
  return "Estoque adequado";
}

function tipoErroFor(status: StatusEstoque): string {
  switch (status) {
    case "Estoque negativo":
      return "ESTOQUE_NEGATIVO";
    case "Sem estoque":
      return "ESTOQUE_ZERADO";
    case "Estoque baixo":
      return "ESTOQUE_BAIXO";
    case "Devolução/Ajuste":
      return "DEVOLUCAO_AJUSTE";
    default:
      return "NENHUM";
  }
}

function categoriaFor(status: StatusEstoque): CategoriaAlerta {
  switch (status) {
    case "Estoque negativo":
      return "Estoque negativo";
    case "Sem estoque":
      return "Estoque zerado";
    case "Estoque baixo":
      return "Risco de ruptura";
    case "Devolução/Ajuste":
      return "Devolução/Ajuste";
    default:
      return "Conferência manual";
  }
}

function prioridadeLabel(score: number): PrioridadeLabel {
  if (score >= 80) return "Crítico";
  if (score >= 60) return "Alta prioridade";
  if (score >= 40) return "Monitorar";
  if (score >= 20) return "Atenção baixa";
  return "Sem ação imediata";
}

export interface AnalysisInput {
  movimentos: RawMovimento[];
  enderecoBase: EnderecoBase;
  zonaSegura: ZonaSeguraRecord[];
  resolvidosDoDia: ResolvidoNoDia[];
  dataImportacao: string; // YYYY-MM-DD
}

export function analyze(input: AnalysisInput): AnalyzedItem[] {
  const { movimentos, enderecoBase, zonaSegura, resolvidosDoDia, dataImportacao } =
    input;

  const zsByCodigo = new Map<string, ZonaSeguraRecord>();
  for (const z of zonaSegura) zsByCodigo.set(z.codigo, z);

  const resolvidosSet = new Map<string, ResolvidoNoDia>();
  for (const r of resolvidosDoDia) {
    if (r.data === dataImportacao) resolvidosSet.set(r.chave, r);
  }

  const totalMov = movimentos
    .filter((m) => m.qtdMovimentada > 0)
    .reduce((s, m) => s + m.qtdMovimentada, 0);

  const items: AnalyzedItem[] = movimentos.map((m) => {
    // Endereço
    const rec = enderecoBase.registros[m.codigo];
    let endereco = "";
    let enderecoStatus: EnderecoStatus = "nao_localizado";
    let enderecoMotivo = "Código não localizado na base de endereços";
    if (rec) {
      const e = (rec.endereco ?? "").trim();
      if (!e) {
        enderecoStatus = "sem_endereco";
        enderecoMotivo = "Produto localizado, mas sem endereço cadastrado";
      } else {
        endereco = e;
        const p = parseAddress(e);
        if (p.valido) {
          enderecoStatus = "ok";
          enderecoMotivo = "";
        } else {
          enderecoStatus = "invalido";
          enderecoMotivo = "Endereço inválido ou incompleto";
        }
      }
    }
    const parsed = parseAddress(endereco);

    const curva: CurvaOperacional =
      m.qtdMovimentada < 0 ? "Devolução/Ajuste" : "C";

    const giroFisico =
      m.qtdEstoque !== 0 ? m.qtdMovimentada / m.qtdEstoque : m.qtdMovimentada > 0 ? 999 : 0;
    const coberturaFisica =
      m.qtdMovimentada > 0 ? m.qtdEstoque / m.qtdMovimentada : m.qtdEstoque > 0 ? 999 : 0;

    const status = classifyStatus(m.qtdEstoque, m.qtdMovimentada);
    const tipoErro = tipoErroFor(status);

    // Reincidência: só quando o item está NEGATIVO e a planilha é posterior à
    // correção registrada na Zona Segura.
    const zs = zsByCodigo.get(m.codigo);
    const isErro = tipoErro !== "NENHUM";
    const dataCorrecaoZs = zs ? zs.dataImportacaoOriginal || zs.dataCorrecao : "";
    const reincidente = !!zs && m.qtdEstoque < 0 && dataImportacao > dataCorrecaoZs;
    const reincidenciaCount = zs ? zs.quantidadeReincidencias : 0;
    const ultimaCorrecao = zs ? zs.dataCorrecao : null;

    // Tratado no dia
    const chave = dailyKey(dataImportacao, m.codigo, tipoErro, parsed.enderecoNormalizado);
    const resolvido = resolvidosSet.get(chave);
    const tratadoNoDia = !!resolvido && isErro;

    // Score simples, apenas para ordenar por gravidade física.
    let score = 0;
    if (m.qtdEstoque < 0) score += 60;
    if (m.qtdEstoque === 0 && m.qtdMovimentada > 0) score += 30;
    if (status === "Estoque baixo") score += 20;
    if (status === "Devolução/Ajuste") score += 15;
    if (reincidente) score += 30;
    score = Math.max(0, Math.min(100, Math.round(score)));

    const prioridade = prioridadeLabel(score);
    const categoria = reincidente
      ? ("Reincidência" as CategoriaAlerta)
      : categoriaFor(status);

    const item: AnalyzedItem = {
      ...m,
      endereco,
      enderecoStatus,
      enderecoMotivo,
      parsed,
      bloco: parsed.bloco,
      rua: parsed.rua,
      curva,
      giroFisico: Math.round(giroFisico * 100) / 100,
      coberturaFisica: Math.round(coberturaFisica * 100) / 100,
      status,
      score,
      prioridade,
      categoria,
      acaoSugerida: "",
      tipoErro,
      reincidente,
      reincidenciaCount,
      ultimaCorrecao,
      tratadoNoDia,
      horarioTratado: resolvido ? resolvido.horarioTratamento : null,
      noRoteiro: false,
      linha: rec?.linha ?? "",
      grupo: rec?.grupo ?? "",
    };


    // Reincidentes sempre entram no roteiro, mesmo se tratados em outro dia.
    item.noRoteiro =
      entraNoRoteiro(item) && (item.reincidente || !item.tratadoNoDia);
    return item;
  });

  return items;
}

export function entraNoRoteiro(i: AnalyzedItem): boolean {
  if (i.reincidente) return true;
  return [
    "Estoque negativo",
    "Sem estoque",
    "Estoque baixo",
    "Devolução/Ajuste",
  ].includes(i.status);
}

// ===== Helpers de filtragem para abas (apenas status físico do movimento) =====
export const isZerado = (i: AnalyzedItem) =>
  i.qtdEstoque === 0 && i.qtdMovimentada >= 0;

export const isNegativo = (i: AnalyzedItem) => i.qtdEstoque < 0;

export const isBaixo = (i: AnalyzedItem) => i.status === "Estoque baixo";

export const isAdequado = (i: AnalyzedItem) => i.status === "Estoque adequado";

export const isDevolucao = (i: AnalyzedItem) => i.qtdMovimentada < 0;

// "Atenção" abrange itens zerados, com estoque baixo e devoluções.
export const isAtencao = (i: AnalyzedItem) =>
  isZerado(i) || isBaixo(i) || isDevolucao(i);

// Crítico = qualquer item negativo ou reincidente.
export const isCritico = (i: AnalyzedItem) => isNegativo(i) || i.reincidente;

// Ruptura = APENAS item já conferido que está negativo.
export const isRupturaConferida = (
  i: AnalyzedItem,
  conferencia: Record<string, ConferenciaState>,
) => !!conferencia[i.codigo] && i.qtdEstoque < 0;

export function sortByAddress(items: AnalyzedItem[]): AnalyzedItem[] {
  return [...items].sort((a, b) => {
    const c = compareAddress(a.parsed, b.parsed);
    if (c !== 0) return c;
    return a.codigo.localeCompare(b.codigo);
  });
}

import { parseAddress } from "./address";
import type {
  AnalyzedItem,
  ConferenciaState,
  EnderecoBase,
  ZonaSeguraRecord,
} from "./types";

export type MotivoConferido = "Correto" | "Divergente";

export interface AcurRecord {
  codigo: string;
  descricao: string;
  endereco: string;
  grupoEndereco: string; // ex: BR01
  blocoNome: string;
  curva: string;
  linha: string;
  grupo: string;
  motivo: MotivoConferido;
  observacao: string;
  dataConferencia: string;
}


export interface AcurAgrupamento {
  label: string;
  corretos: number;
  divergentes: number;
  total: number;
  acuracidade: number; // %
}

export interface AcurResumo {
  totalZonaSegura: number;
  totalConferidos: number;
  corretos: number;
  divergentes: number;
  acuracidade: number; // %
}

// Acuracidade = (itens corretos / itens conferidos) * 100
export function calcAcuracidade(corretos: number, total: number): number {
  if (total <= 0) return 0;
  return (corretos / total) * 100;
}

// Constrói os registros de acuracidade a partir das conferências que possuem
// motivo definido (Correto / Divergente), cruzando com Zona Segura, base de
// endereços e itens da importação atual para enriquecer os dados.
export function buildAcurRecords(
  conferencia: Record<string, ConferenciaState>,
  zonaSegura: ZonaSeguraRecord[],
  enderecoBase: EnderecoBase,
  items: AnalyzedItem[],
): AcurRecord[] {
  const zsMap = new Map(zonaSegura.map((z) => [z.codigo, z]));
  const itemMap = new Map(items.map((i) => [i.codigo, i]));

  const records: AcurRecord[] = [];
  for (const [codigo, c] of Object.entries(conferencia)) {
    if (c.motivo !== "Correto" && c.motivo !== "Divergente") continue;
    const zs = zsMap.get(codigo);
    const item = itemMap.get(codigo);
    const endRec = enderecoBase.registros[codigo];
    const descricao = zs?.descricao || item?.descricao || endRec?.descricao || "";
    const endereco = zs?.endereco || item?.endereco || endRec?.endereco || "";
    const p = parseAddress(endereco);
    const grupoEndereco = p.valido
      ? `${p.bloco}R${String(p.rua).padStart(2, "0")}`
      : "SEM";
    const blocoNome = p.valido ? p.blocoNome : "Sem endereço";
    const curva = zs?.curvaOperacional || item?.curva || "—";
    const linha = zs?.linha || item?.linha || endRec?.linha || "";
    const grupo = zs?.grupo || item?.grupo || endRec?.grupo || "";
    records.push({
      codigo,
      descricao,
      endereco,
      grupoEndereco,
      blocoNome,
      curva,
      linha,
      grupo,
      motivo: c.motivo,
      observacao: c.observacao || "",
      dataConferencia: c.atualizadoEm,
    });

  }
  return records;
}

export function resumoAcuracidade(
  records: AcurRecord[],
  totalZonaSegura: number,
): AcurResumo {
  const corretos = records.filter((r) => r.motivo === "Correto").length;
  const divergentes = records.filter((r) => r.motivo === "Divergente").length;
  const total = corretos + divergentes;
  return {
    totalZonaSegura,
    totalConferidos: total,
    corretos,
    divergentes,
    acuracidade: calcAcuracidade(corretos, total),
  };
}

// Agrupa por uma dimensão (endereço, curva, etc.) e calcula a acuracidade.
export function agruparAcuracidade(
  records: AcurRecord[],
  keyFn: (r: AcurRecord) => string,
): AcurAgrupamento[] {
  const map = new Map<string, { corretos: number; divergentes: number }>();
  for (const r of records) {
    const k = keyFn(r) || "—";
    const cur = map.get(k) ?? { corretos: 0, divergentes: 0 };
    if (r.motivo === "Correto") cur.corretos++;
    else cur.divergentes++;
    map.set(k, cur);
  }
  return Array.from(map.entries())
    .map(([label, v]) => {
      const total = v.corretos + v.divergentes;
      return {
        label,
        corretos: v.corretos,
        divergentes: v.divergentes,
        total,
        acuracidade: calcAcuracidade(v.corretos, total),
      };
    })
    .sort((a, b) => b.total - a.total);
}

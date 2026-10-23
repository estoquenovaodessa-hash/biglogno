import type { AnalyzedItem, ZonaSeguraRecord } from "./types";
import {
  isBaixo,
  isAdequado,
  isZerado,
  isNegativo,
  isDevolucao,
} from "./analysis";
import { fmtInt } from "./format";

// Conta alertas por rua para descobrir a mais problemática
export function ruaComMaisAlertas(items: AnalyzedItem[]): string {
  const map = new Map<string, number>();
  for (const i of items) {
    if (!i.noRoteiro || !i.parsed.valido) continue;
    const k = `${i.parsed.blocoNome} - Rua ${String(i.parsed.rua).padStart(2, "0")}`;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  let best = "";
  let max = 0;
  for (const [k, v] of map) if (v > max) { max = v; best = k; }
  return best || "—";
}

export function buildResumoTexto(
  items: AnalyzedItem[],
  zonaSegura: ZonaSeguraRecord[],
  tratadosHoje: number,
): string {
  if (items.length === 0)
    return "Nenhuma importação carregada. Importe um relatório de movimentação para gerar a análise.";

  const zerados = items.filter(isZerado).length;
  const baixos = items.filter(isBaixo).length;
  const adequados = items.filter(isAdequado).length;
  const negativos = items.filter(isNegativo).length;
  const devolucoes = items.filter(isDevolucao).length;
  const atencao = zerados + baixos + devolucoes;
  const reincidentes = items.filter((i) => i.reincidente).length;
  const noRoteiro = items.filter((i) => i.noRoteiro).length;
  const rua = ruaComMaisAlertas(items);

  const corrigidos = zonaSegura.length;
  const reincidiram = zonaSegura.filter((z) => z.quantidadeReincidencias > 0).length;
  const falhaPos = corrigidos > 0 ? Math.round((reincidiram / corrigidos) * 100) : 0;
  const corrigEfetiva = 100 - falhaPos;

  return (
    `Durante esta importação, foram identificados ${fmtInt(noRoteiro)} itens com necessidade de apuração física. ` +
    `O roteiro foi ordenado por endereço, iniciando pelo Bloco A e depois pelo Bloco B, para reduzir deslocamentos da equipe. ` +
    `Do total movimentado, ${fmtInt(negativos)} itens estão com estoque negativo, ${fmtInt(zerados)} zerados, ` +
    `${fmtInt(baixos)} com estoque baixo, ${fmtInt(adequados)} adequados e ${fmtInt(devolucoes)} devoluções/ajustes. ` +
    `Os itens de Atenção (zerados, baixos e devoluções) somam ${fmtInt(atencao)}; a ruptura considera apenas itens já conferidos que permanecem negativos. ` +
    `Foram identificados ${fmtInt(reincidentes)} itens que já estavam na Zona Segura e voltaram a apresentar estoque negativo, classificados como reincidência. ` +
    `Além disso, ${fmtInt(tratadosHoje)} itens já haviam sido tratados no mesmo dia e foram separados da lista principal para evitar reconferência. ` +
    `A rua que concentra mais alertas é ${rua}. ` +
    `O índice de correção efetiva é de ${corrigEfetiva}% e o índice de falha pós-correção é de ${falhaPos}%.`
  );
}

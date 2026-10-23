import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { EnderecoBase, RawMovimento, ZonaSeguraRecord, ConferenciaState } from "./types";
import { parseAddress, compareAddress } from "./address";
import { downloadCSV, nowParts } from "./format";

export interface ParadoItem {
  codigo: string;
  descricao: string;
  endereco: string;
  linha: string;
  ultimaContagem: string; // ISO ou ""
}

// Itens parados = itens da base de endereços que não tiveram saída no relatório de vendas.
// Prioridade: nunca contados primeiro, depois os contados há mais tempo.
export function listarParados(
  base: EnderecoBase,
  movimentos: RawMovimento[],
  zonaSegura: ZonaSeguraRecord[],
  conferencia: Record<string, ConferenciaState>,
): ParadoItem[] {
  const vendidos = new Set(movimentos.filter((m) => m.qtdMovimentada !== 0).map((m) => m.codigo));
  const ultima: Record<string, string> = {};
  const mark = (c: string, d: string) => {
    if (d && (!ultima[c] || d > ultima[c])) ultima[c] = d;
  };
  for (const z of zonaSegura) mark(z.codigo, String(z.dataCorrecao ?? ""));
  for (const [c, s] of Object.entries(conferencia)) mark(c, String(s.atualizadoEm ?? "").slice(0, 10));

  const out: ParadoItem[] = [];
  for (const r of Object.values(base.registros)) {
    if (vendidos.has(r.codigo)) continue;
    out.push({
      codigo: r.codigo,
      descricao: r.descricao,
      endereco: r.endereco || "",
      linha: r.linha || "",
      ultimaContagem: ultima[r.codigo] || "",
    });
  }
  return out.sort((a, b) => {
    if (!a.ultimaContagem !== !b.ultimaContagem) return a.ultimaContagem ? 1 : -1;
    if (a.ultimaContagem !== b.ultimaContagem) return a.ultimaContagem < b.ultimaContagem ? -1 : 1;
    return compareAddress(parseAddress(a.endereco), parseAddress(b.endereco)) || a.codigo.localeCompare(b.codigo);
  });
}

function fmtData(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "Nunca";
}

const BLANK = "__________________";

export function selecionarLote(todos: ParadoItem[], tamanho: number): ParadoItem[] {
  return todos
    .slice(0, Math.max(1, tamanho))
    .sort(
      (a, b) =>
        compareAddress(parseAddress(a.endereco), parseAddress(b.endereco)) ||
        a.codigo.localeCompare(b.codigo),
    );
}

export function exportarLoteParados(todos: ParadoItem[], tamanho: number, selecao?: { titulo: string; arquivo: string }): number {
  const lote = selecionarLote(todos, tamanho);
  const { data, dataBR, hora } = nowParts();
  const arquivo = selecao?.arquivo ?? "parados";

  downloadCSV(`contar-${arquivo}-${data}.csv`, [
    ["Código", "Descrição", "Localização", "Contagem"],
    ...lote.map((i) => [i.codigo, i.descricao, i.endereco, BLANK]),
  ]);
  const trava = (v: string) =>
    lote.map((i) => {
      const l = new Array<string>(23).fill("");
      l[0] = i.codigo;
      l[22] = v;
      return l;
    });
  downloadCSV(`Travar-${arquivo}.csv`, trava("N"));
  downloadCSV(`Destravar-${arquivo}.csv`, trava("S"));

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setFontSize(12);
  doc.text(selecao ? doc.splitTextToSize(selecao.titulo, 192)[0] : "Contar Parados — lote do dia, por ordem de endereço", 8, 10);
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`${selecao ? "Contagem por endereço" : "Itens sem venda"} · ${lote.length} itens · ${dataBR} ${hora}`, 8, 14);
  doc.setTextColor(0);
  autoTable(doc, {
    startY: 17,
    margin: { left: 6, right: 6, top: 8, bottom: 8 },
    head: [["Código", "Descrição", "Localização", "Última contagem", "Contagem"]],
    body: lote.map((i) => [i.codigo, i.descricao, i.endereco || "—", fmtData(i.ultimaContagem), ""]),
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 1, lineWidth: 0.1, lineColor: [150, 150, 150], overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: [100, 116, 139], textColor: 255, lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: 16, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 22, halign: "center" },
      3: { cellWidth: 22, halign: "center" },
      4: { cellWidth: 24 },
    },
  });
  doc.save(`contar-${arquivo}-${data}.pdf`);
  return lote.length;
}

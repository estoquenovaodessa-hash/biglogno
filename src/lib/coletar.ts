import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AnalyzedItem } from "./types";
import { sortByAddress, isZerado, isBaixo, isNegativo } from "./analysis";
import { downloadCSV, nowParts } from "./format";

const BLANK = "__________________";

export function itensColeta(items: AnalyzedItem[]): AnalyzedItem[] {
  return sortByAddress(items.filter((i) => isZerado(i) || isBaixo(i) || isNegativo(i)));
}

function linhasTrava(lista: AnalyzedItem[], valor: string): string[][] {
  // Coluna A = código do item; colunas B..V vazias; coluna W = valor (N/S)
  return lista.map((i) => {
    const linha = new Array<string>(23).fill("");
    linha[0] = i.codigo;
    linha[22] = valor;
    return linha;
  });
}

function fmtData(d?: string): string {
  if (!d) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

export function coletarEContar(
  items: AnalyzedItem[],
  datasApuracao: Record<string, string> = {},
): number {
  const lista = itensColeta(items);
  const { data, dataBR, hora } = nowParts();

  downloadCSV(`coletar-e-contar-${data}.csv`, [
    ["Código", "Descrição", "Localização", "Contagem"],
    ...lista.map((i) => [i.codigo, i.descricao, i.endereco || "", BLANK]),
  ]);

  downloadCSV("Travar.csv", linhasTrava(lista, "N"));
  downloadCSV("Destravar.csv", linhasTrava(lista, "S"));

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setFontSize(12);
  doc.text("Coletar e Contar — por ordem de endereço", 8, 10);
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`Zerados, estoque baixo e negativos · ${lista.length} itens · ${dataBR} ${hora}`, 8, 14);
  doc.setTextColor(0);
  autoTable(doc, {
    startY: 17,
    margin: { left: 6, right: 6, top: 8, bottom: 8 },
    head: [["Código", "Descrição", "Localização", "Data de Apuração", "Contagem"]],
    body: lista.map((i) => [
      i.codigo,
      i.descricao,
      i.endereco || "—",
      fmtData(datasApuracao[i.codigo]),
      "",
    ]),
    theme: "grid",
    styles: {
      fontSize: 7.5,
      cellPadding: 1,
      lineWidth: 0.1,
      lineColor: [150, 150, 150],
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: 16, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 22, halign: "center" },
      3: { cellWidth: 22, halign: "center" },
      4: { cellWidth: 24 },
    },
  });
  doc.save(`coletar-e-contar-${data}.pdf`);
  return lista.length;
}

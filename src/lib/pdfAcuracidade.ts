import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { nowParts } from "./format";
import {
  agruparAcuracidade,
  resumoAcuracidade,
  type AcurRecord,
} from "./acuracidade";

const COLORS = {
  info: [37, 99, 235] as [number, number, number],
  success: [22, 140, 90] as [number, number, number],
  critical: [220, 38, 38] as [number, number, number],
  neutral: [120, 120, 120] as [number, number, number],
};

export function gerarRelatorioAcuracidadePDF(
  records: AcurRecord[],
  totalZonaSegura: number,
  filtro: "todos" | "Correto" | "Divergente",
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const parts = nowParts();
  const resumo = resumoAcuracidade(records, totalZonaSegura);
  let y = 14;

  doc.setFontSize(16);
  doc.text("Relatório de Acuracidade — Bignotto", 14, y);
  y += 6;
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Gerado em ${parts.dataBR} ${parts.hora}`, 14, y);
  doc.setTextColor(0);
  y += 8;

  // Cabeçalho com totais
  autoTable(doc, {
    startY: y,
    head: [[
      "Itens na Zona Segura",
      "Conferidos (acuracidade)",
      "Corretos",
      "Divergentes",
      "Acuracidade",
    ]],
    body: [[
      String(resumo.totalZonaSegura),
      String(resumo.totalConferidos),
      String(resumo.corretos),
      String(resumo.divergentes),
      `${resumo.acuracidade.toFixed(1)}%`,
    ]],
    theme: "grid",
    styles: { fontSize: 10, halign: "center" },
    headStyles: { fillColor: COLORS.info },
  });
  // @ts-expect-error lastAutoTable injected by plugin
  y = doc.lastAutoTable.finalY + 8;

  // Acuracidade por endereço
  const porEndereco = agruparAcuracidade(records, (r) => r.grupoEndereco);
  if (porEndereco.length) {
    doc.setFontSize(12);
    doc.text("Acuracidade por endereço", 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [["Endereço", "Corretos", "Divergentes", "Total", "Acuracidade"]],
      body: porEndereco.map((g) => [
        g.label,
        String(g.corretos),
        String(g.divergentes),
        String(g.total),
        `${g.acuracidade.toFixed(1)}%`,
      ]),
      theme: "striped",
      styles: { fontSize: 8 },
      headStyles: { fillColor: COLORS.info },
    });
    // @ts-expect-error lastAutoTable injected by plugin
    y = doc.lastAutoTable.finalY + 8;
  }

  // Acuracidade por curva
  const porCurva = agruparAcuracidade(records, (r) => r.curva);
  if (porCurva.length) {
    if (y > 160) {
      doc.addPage();
      y = 16;
    }
    doc.setFontSize(12);
    doc.text("Acuracidade por curva operacional", 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [["Curva", "Corretos", "Divergentes", "Total", "Acuracidade"]],
      body: porCurva.map((g) => [
        g.label,
        String(g.corretos),
        String(g.divergentes),
        String(g.total),
        `${g.acuracidade.toFixed(1)}%`,
      ]),
      theme: "striped",
      styles: { fontSize: 8 },
      headStyles: { fillColor: COLORS.info },
    });
  }

  // Detalhamento dos itens (aplica filtro selecionado)
  const detalhe =
    filtro === "todos" ? records : records.filter((r) => r.motivo === filtro);
  doc.addPage();
  const titulo =
    filtro === "todos"
      ? "Itens conferidos"
      : filtro === "Correto"
        ? "Itens corretos"
        : "Itens divergentes";
  doc.setFontSize(13);
  doc.text(`${titulo} (${detalhe.length})`, 14, 16);
  autoTable(doc, {
    startY: 20,
    head: [["Código", "Descrição", "Endereço", "Curva", "Motivo", "Observação"]],
    body: detalhe.map((r) => [
      r.codigo,
      r.descricao.slice(0, 45),
      r.endereco || "—",
      r.curva,
      r.motivo,
      r.observacao.slice(0, 40),
    ]),
    theme: "striped",
    styles: { fontSize: 7 },
    headStyles: { fillColor: COLORS.info },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const r = detalhe[data.row.index];
      if (!r) return;
      if (r.motivo === "Divergente") data.cell.styles.textColor = COLORS.critical;
      else data.cell.styles.textColor = COLORS.success;
    },
  });

  doc.save(`relatorio-acuracidade-${parts.data}.pdf`);
}

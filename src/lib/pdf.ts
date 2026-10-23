import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AnalyzedItem, ZonaSeguraRecord } from "./types";
import {
  sortByAddress,
  isBaixo,
  isAdequado,
  isZerado,
  isNegativo,
  isDevolucao,
} from "./analysis";
import { fmtInt, nowParts } from "./format";
import { buildResumoTexto } from "./narrative";

const COLORS = {
  critical: [220, 38, 38] as [number, number, number],
  warning: [234, 140, 30] as [number, number, number],
  reverse: [147, 51, 187] as [number, number, number],
  neutral: [120, 120, 120] as [number, number, number],
  info: [37, 99, 235] as [number, number, number],
  success: [22, 140, 90] as [number, number, number],
};

export function gerarRelatorioPDF(
  items: AnalyzedItem[],
  zonaSegura: ZonaSeguraRecord[],
  resolvidosHoje: { codigo: string; descricao: string; endereco: string; tipoErro: string; horarioTratamento: string; status: string; observacao: string }[],
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const parts = nowParts();
  let y = 14;

  doc.setFontSize(16);
  doc.text("Monitor ABC de Movimentos — Bignotto", 14, y);
  y += 6;
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Relatório operacional gerado em ${parts.dataBR} ${parts.hora}`, 14, y);
  doc.setTextColor(0);
  y += 8;

  // KPIs
  const kpis = [
    ["Itens analisados", fmtInt(items.length)],
    ["Estoque negativo", fmtInt(items.filter(isNegativo).length)],
    ["Estoque zerado", fmtInt(items.filter(isZerado).length)],
    ["Estoque baixo", fmtInt(items.filter(isBaixo).length)],
    ["Estoque adequado", fmtInt(items.filter(isAdequado).length)],
    ["Devoluções/Ajustes", fmtInt(items.filter(isDevolucao).length)],
    ["Reincidências", fmtInt(items.filter((i) => i.reincidente).length)],
    ["No roteiro", fmtInt(items.filter((i) => i.noRoteiro).length)],
  ];
  autoTable(doc, {
    startY: y,
    head: [["Indicador", "Valor", "Indicador", "Valor"]],
    body: [
      [kpis[0][0], kpis[0][1], kpis[1][0], kpis[1][1]],
      [kpis[2][0], kpis[2][1], kpis[3][0], kpis[3][1]],
      [kpis[4][0], kpis[4][1], kpis[5][0], kpis[5][1]],
      [kpis[6][0], kpis[6][1], kpis[7][0], kpis[7][1]],
    ],
    theme: "grid",
    styles: { fontSize: 8 },
    headStyles: { fillColor: COLORS.info },
  });
  // @ts-expect-error lastAutoTable injected by plugin
  y = doc.lastAutoTable.finalY + 6;

  // Análise automática
  doc.setFontSize(11);
  doc.text("Análise automática", 14, y);
  y += 5;
  doc.setFontSize(8);
  const texto = buildResumoTexto(items, zonaSegura, resolvidosHoje.length);
  const linhas = doc.splitTextToSize(texto, 270);
  doc.text(linhas, 14, y);
  y += linhas.length * 4 + 4;

  // ROTEIRO DE APURAÇÃO FÍSICA POR ENDEREÇO
  const roteiro = sortByAddress(items.filter((i) => i.noRoteiro));
  doc.addPage();
  doc.setFontSize(13);
  doc.text("ROTEIRO DE APURAÇÃO FÍSICA POR ENDEREÇO", 14, 16);
  autoTable(doc, {
    startY: 20,
    head: [["#", "Endereço", "Código", "Descrição", "Estq", "Mov", "Status"]],
    body: roteiro.map((i, idx) => [
      idx + 1,
      i.endereco || i.enderecoMotivo,
      i.codigo,
      i.descricao.slice(0, 44),
      fmtInt(i.qtdEstoque),
      fmtInt(i.qtdMovimentada),
      i.status,
    ]),
    theme: "striped",
    styles: { fontSize: 7 },
    headStyles: { fillColor: COLORS.info },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const item = roteiro[data.row.index];
      if (!item) return;
      if (item.reincidente) data.cell.styles.textColor = COLORS.critical;
      else if (item.status === "Estoque negativo") data.cell.styles.textColor = COLORS.critical;
      else if (item.status === "Devolução/Ajuste") data.cell.styles.textColor = COLORS.reverse;
    },
  });

  // Seções por status
  const secoes: [string, AnalyzedItem[], [number, number, number]][] = [
    ["Estoque negativo", items.filter(isNegativo), COLORS.critical],
    ["Estoque zerado", items.filter(isZerado), COLORS.critical],
    ["Estoque baixo", items.filter(isBaixo), COLORS.warning],
    ["Estoque adequado", items.filter(isAdequado), COLORS.success],
    ["Devoluções/Ajustes", items.filter(isDevolucao), COLORS.reverse],
  ];
  for (const [titulo, lista, cor] of secoes) {
    if (lista.length === 0) continue;
    doc.addPage();
    doc.setFontSize(12);
    doc.text(titulo, 14, 16);
    autoTable(doc, {
      startY: 20,
      head: [["Endereço", "Código", "Descrição", "Estq", "Mov", "Status"]],
      body: sortByAddress(lista).map((i) => [
        i.endereco || i.enderecoMotivo,
        i.codigo,
        i.descricao.slice(0, 46),
        fmtInt(i.qtdEstoque),
        fmtInt(i.qtdMovimentada),
        i.status,
      ]),
      theme: "striped",
      styles: { fontSize: 7 },
      headStyles: { fillColor: cor },
    });
  }

  // Itens reincidentes
  const reincidentes = items.filter((i) => i.reincidente);
  if (reincidentes.length) {
    doc.addPage();
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.critical);
    doc.text("Itens reincidentes", 14, 16);
    doc.setTextColor(0);
    autoTable(doc, {
      startY: 20,
      head: [["Código", "Descrição", "Endereço", "Categoria", "Tipo de erro", "Última correção", "Reincidências", "Ação"]],
      body: reincidentes.map((i) => [
        i.codigo,
        i.descricao.slice(0, 38),
        i.endereco || i.enderecoMotivo,
        i.categoria,
        i.tipoErro,
        i.ultimaCorrecao ?? "—",
        fmtInt(i.reincidenciaCount),
        i.acaoSugerida,
      ]),
      theme: "striped",
      styles: { fontSize: 7, textColor: COLORS.critical },
      headStyles: { fillColor: COLORS.critical, textColor: [255, 255, 255] },
    });
  }

  // Itens já tratados no dia
  if (resolvidosHoje.length) {
    doc.addPage();
    doc.setFontSize(12);
    doc.text("Itens já tratados no dia", 14, 16);
    autoTable(doc, {
      startY: 20,
      head: [["Código", "Descrição", "Endereço", "Tipo de erro", "Horário", "Status", "Observação"]],
      body: resolvidosHoje.map((r) => [
        r.codigo,
        r.descricao.slice(0, 40),
        r.endereco || "—",
        r.tipoErro,
        r.horarioTratamento,
        r.status,
        r.observacao,
      ]),
      theme: "striped",
      styles: { fontSize: 7, textColor: COLORS.neutral },
      headStyles: { fillColor: COLORS.neutral },
    });
  }

  // Itens sem endereço
  const semEnd = items.filter((i) => i.enderecoStatus !== "ok");
  if (semEnd.length) {
    doc.addPage();
    doc.setFontSize(12);
    doc.text("Itens sem endereço cadastrado ou não encontrados na base", 14, 16);
    autoTable(doc, {
      startY: 20,
      head: [["Código", "Descrição", "Categoria", "Motivo", "Ação sugerida"]],
      body: semEnd.map((i) => [
        i.codigo,
        i.descricao.slice(0, 45),
        i.categoria,
        i.enderecoMotivo,
        "Cadastrar endereço no ERP / conferir cadastro do produto",
      ]),
      theme: "striped",
      styles: { fontSize: 7 },
      headStyles: { fillColor: COLORS.neutral },
    });
  }

  doc.save(`relatorio-monitor-abc-${parts.data}.pdf`);
}

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { errorComment, percentageTone, salesMetrics, type VerificationRecord } from "./sales-verification";

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number) => `${n.toFixed(1)}%`;

export function createSalesReport(records: VerificationRecord[], period: string, sales: number) {
  const css = getComputedStyle(document.documentElement);
  const color = (role: string): [number, number, number] => {
    const raw = css.getPropertyValue(`--report-${role}`).trim().replace("#", "");
    const hex = raw.length === 3 ? [...raw].map(c => c + c).join("") : raw;
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  };
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  pdf.setProperties({ title: "Bignotto — Relatório executivo de conferência", author: "Bignotto Ferramentas", subject: period });
  const metrics = salesMetrics(records);
  const width = pdf.internal.pageSize.getWidth(), height = pdf.internal.pageSize.getHeight();
  let y = 42;
  function section(title: string, headers: string[], rows: string[][], accuracyIndex?: number) {
    if (y > height - 40) { pdf.addPage(); y = 42; }
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.setTextColor(...color("brand")); pdf.text(title, 14, y);
    autoTable(pdf, { startY: y + 5, margin: { top: 44, bottom: 18, left: 14, right: 14 }, head: [headers], body: rows.length ? rows : [["Nenhum registro no período."]], theme: "plain", rowPageBreak: "avoid",
      styles: { font: "helvetica", fontSize: 10, cellPadding: 3, textColor: color("ink"), lineColor: color("line"), lineWidth: { bottom: 0.15 }, overflow: "linebreak" },
      headStyles: { fillColor: color("brand"), textColor: color("paper"), fontStyle: "bold", fontSize: 9 }, alternateRowStyles: { fillColor: color("surface") },
      didParseCell: data => { if (data.section === "body" && data.column.index === accuracyIndex && rows.length) { data.cell.styles.textColor = color(percentageTone(parseFloat(data.cell.text.join("")))); data.cell.styles.fontStyle = "bold"; } },
      didDrawPage: () => { /* Shared header/footer is stamped after every section. */ },
    });
    y = (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 15;
    y += 5;
  }
  const cards: [string, string, string][] = [
    ["Conferências", num(metrics.count), "ink"], ["Quantidade de itens", num(metrics.items), "ink"], ["Certas", num(metrics.correct), "success"], ["Erros", num(metrics.errors), "destructive"],
    ["Acerto", records.length ? pct(metrics.accuracy) : "—", percentageTone(metrics.accuracy)], ["Valor conferido", money(metrics.value), "ink"], ["Vendas no período", num(sales), "ink"], ["Vendas conferidas", sales > 0 ? pct(metrics.count / sales * 100) : "—", sales > 0 ? percentageTone(metrics.count / sales * 100) : "ink"],
    ["Meta de acuracidade", "100%", "success"],
  ];
  const gap = 4, cardWidth = (width - 28 - gap * 4) / 5;
  cards.forEach(([label, value, tone], i) => {
    const x = 14 + (i % 5) * (cardWidth + gap), top = 43 + Math.floor(i / 5) * 28;
    pdf.setFillColor(...color("surface")); pdf.setDrawColor(...color("line")); pdf.roundedRect(x, top, cardWidth, 24, 1, 1, "FD");
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(...color("muted")); pdf.text(label, x + 3, top + 7);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(value.length > 15 ? 13 : 17); pdf.setTextColor(...color(tone)); pdf.text(value, x + 3, top + 18);
  });
  y = 103;
  const verifiers = [...new Set(records.map(r => r.verifierCode))].map(code => { const list = records.filter(r => r.verifierCode === code); return { code, name: list[0]?.verifierName ?? code, hasTime: list.some(r => r.durationSeconds !== null), ...salesMetrics(list) }; }).sort((a, b) => b.count - a.count);
  section("01  Desempenho por conferente", ["Código", "Conferente", "Conferências", "Erros", "Acerto", "Tempo médio", "Valor conferido"], verifiers.map(v => [v.code, v.name, num(v.count), num(v.errors), pct(v.accuracy), v.hasTime ? `${Math.round(v.minutes)} min` : "—", money(v.value)]), 4);
  const sellers = [...new Set(records.map(r => r.seller))].map(name => ({ name, ...salesMetrics(records.filter(r => r.seller === name)) })).sort((a, b) => b.count - a.count);
  section("02  Conferências por vendedor", ["Vendedor", "Conferências", "Itens", "Certas", "Erros", "Acerto", "Valor conferido"], sellers.map(v => [v.name, num(v.count), num(v.items), num(v.correct), num(v.errors), pct(v.accuracy), money(v.value)]), 5);
  section("03  Comentários dos erros", ["Documento", "Conferente", "Comentário do erro", "Valor", "Data", "Hora"], records.filter(r => !r.correct && r.source !== "csv").map(r => [r.document, `${r.verifierCode} · ${r.verifierName}`, errorComment(r), money(r.value), new Date(r.createdAt).toLocaleDateString("pt-BR"), new Date(r.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })]));
  const total = pdf.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    pdf.setPage(page); pdf.setFillColor(...color("brand")); pdf.rect(0, 0, width, 34, "F");
    pdf.setTextColor(...color("paper")); pdf.setFont("helvetica", "bold"); pdf.setFontSize(19); pdf.text("BIGNOTTO FERRAMENTAS", 14, 13);
    pdf.setFontSize(12); pdf.text("Relatório executivo de conferência", 14, 23);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.text(`Período: ${period}`, width - 14, 13, { align: "right" });
    pdf.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, width - 14, 23, { align: "right" });
    pdf.setDrawColor(...color("line")); pdf.line(14, height - 13, width - 14, height - 13);
    pdf.setTextColor(...color("muted")); pdf.setFontSize(8); pdf.text("Gestão de Logística | Uso interno · Diretoria", 14, height - 8); pdf.text(`${page} / ${total}`, width - 14, height - 8, { align: "right" });
  }
  return pdf;
}
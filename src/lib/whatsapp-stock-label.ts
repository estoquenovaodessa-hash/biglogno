import jsPDF from "jspdf";

export const WHATSAPP_LABEL_WIDTH_MM = 60;
export const WHATSAPP_LABEL_HEIGHT_MM = 30;
export const WHATSAPP_LABELS_PER_PDF = 40;
export const WHATSAPP_MAX_REQUEST_LABELS = 500;
export const WHATSAPP_MAX_PDF_BASE64 = 550000;

export type WhatsAppStockItem = { code: string; description: string; address?: string; quantity?: string };
export type WhatsAppStockLabel = WhatsAppStockItem & { company: string };
export type WhatsAppStockPrintPart = { pdfBase64: string; labelCount: number };

function fitLine(pdf: jsPDF, text: string, x: number, y: number, maxWidth: number, start: number, minimum: number) {
  let size = start;
  pdf.setFontSize(size);
  while (size > minimum && pdf.getTextWidth(text) > maxWidth) {
    size = Math.max(minimum, size - 0.35);
    pdf.setFontSize(size);
  }
  let printed = text;
  if (pdf.getTextWidth(printed) > maxWidth) {
    while (printed.length > 1 && pdf.getTextWidth(printed + "...") > maxWidth) printed = printed.slice(0, -1);
    printed += "...";
  }
  pdf.text(printed, x, y);
}

function drawDescription(pdf: jsPDF, raw: string) {
  const text = raw.replace(/\s+/g, " ").trim();
  pdf.setFont("helvetica", "bold");
  let size = 7.0;
  let lines: string[] = [];
  while (size >= 5.4) {
    pdf.setFontSize(size);
    lines = pdf.splitTextToSize(text, 55.2) as string[];
    if (lines.length <= 2) break;
    size -= 0.4;
  }
  const first = lines[0] ?? text;
  const second = lines.length > 1 ? lines.slice(1).join(" ") : "";
  fitLine(pdf, first, 2.3, 26.65, 55.2, size, 5.1);
  if (second) fitLine(pdf, second, 2.3, 28.65, 55.2, size, 5.1);
}

/** Uma página por código solicitado. A etiqueta contém destino, código,
 * quantidade solicitada e endereço do CSV. Campo SEPARADO permanece
 * vazio para marcação manual após a separação.
 */
export function createWhatsAppStockLabelsPdf(labels: WhatsAppStockLabel[]): jsPDF {
  if (!labels.length || labels.length > WHATSAPP_MAX_REQUEST_LABELS)
    throw new Error("Quantidade de etiquetas fora do limite de 1 a 500.");
  if (labels.some(row => !row.code.trim() || !row.description.trim() || !row.company.trim()))
    throw new Error("Etiqueta sem código, descrição ou empresa.");

  const pdf = new jsPDF({
    orientation: "landscape", unit: "mm", format: [60, 30], compress: true,
  });
  pdf.setProperties({
    title: "Solicitação WhatsApp - Etiquetas de Estoque",
    subject: "Argox 60 x 30 mm; quantidade, endereço e confirmação de separação",
    author: "Bignotto Ferramentas",
  });
  for (let index = 0; index < labels.length; index++) {
    if (index) pdf.addPage([60, 30], "landscape");
    const row = labels[index];
    pdf.setTextColor(0); pdf.setDrawColor(0); pdf.setLineWidth(0.17);
    pdf.roundedRect(0.5, 0.5, 59, 29, 1.3, 1.3, "S");
    pdf.setFont("helvetica", "bold");
    fitLine(pdf, "BIGNOTTO FERRAMENTAS", 2.3, 3.9, 55.2, 10.2, 8.5);
    pdf.line(1.8, 4.8, 58.2, 4.8);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.4);
    pdf.text("EMPRESA / DESTINO", 2.3, 6.65);
    pdf.setFont("helvetica", "bold");
    fitLine(pdf, row.company.toUpperCase().trim(), 2.3, 9.65, 55.2, 11.5, 7.3);
    pdf.line(1.8, 10.55, 58.2, 10.55);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(5.4);
    pdf.text("CÓDIGO", 2.3, 12.35);
    fitLine(pdf, "QTD. SOLICITADA", 28.0, 12.35, 16.5, 5.4, 4.5);
    fitLine(pdf, "SEPARADO", 47.0, 12.35, 10.2, 5.4, 4.9);
    fitLine(pdf, row.code.trim(), 2.3, 17.1, 24.4, 14.5, 9.2);
    fitLine(pdf, row.quantity?.trim() || "-", 28.0, 17.1, 16.5, 14.0, 8.5);
    // Quadrado de marcação à mão, sem marca pré-impressa.
    pdf.rect(50.1, 13.55, 4.5, 4.1, "S");
    pdf.line(1.8, 18.35, 58.2, 18.35);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.5);
    pdf.text("ENDEREÇO", 2.3, 19.95);
    pdf.setFont("helvetica", "bold");
    fitLine(pdf, row.address?.trim() || "NÃO INFORMADO", 2.3, 22.65, 55.2, 9.4, 6.0);
    pdf.line(1.8, 23.4, 58.2, 23.4);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.1);
    pdf.text("DESCRIÇÃO", 2.3, 24.7);
    drawDescription(pdf, row.description);
  }
  return pdf;
}

/** PDFs menores para a fila Windows. Nenhum job é enviado pelo renderizador. */
export function prepareWhatsAppStockLabelParts(labels: WhatsAppStockLabel[]): WhatsAppStockPrintPart[] {
  if (!labels.length || labels.length > WHATSAPP_MAX_REQUEST_LABELS)
    throw new Error("A mensagem deve conter de 1 a 500 produtos encontrados.");
  const parts: WhatsAppStockPrintPart[] = [];
  function add(batch: WhatsAppStockLabel[]) {
    const dataUri = createWhatsAppStockLabelsPdf(batch).output("datauristring");
    const pdfBase64 = dataUri.slice(dataUri.indexOf(",") + 1);
    if (pdfBase64.length >= 20 && pdfBase64.length <= WHATSAPP_MAX_PDF_BASE64) {
      parts.push({ pdfBase64, labelCount: batch.length });
      return;
    }
    if (batch.length === 1)
      throw new Error("A etiqueta ultrapassou o tamanho máximo da fila da Argox.");
    const middle = Math.ceil(batch.length / 2);
    add(batch.slice(0, middle));
    add(batch.slice(middle));
  }
  for (let i = 0; i < labels.length; i += WHATSAPP_LABELS_PER_PDF)
    add(labels.slice(i, i + WHATSAPP_LABELS_PER_PDF));
  if (parts.length > 50) throw new Error("A solicitação ultrapassou o limite de lotes de impressão.");
  return parts;
}

import jsPDF from "jspdf";

export const WHATSAPP_LABEL_WIDTH_MM = 60;
export const WHATSAPP_LABEL_HEIGHT_MM = 30;
export const WHATSAPP_LABELS_PER_PDF = 40;
export const WHATSAPP_MAX_REQUEST_LABELS = 500;
export const WHATSAPP_MAX_PDF_BASE64 = 550000;

export type WhatsAppStockItem = {
  code: string;
  description: string;
  /** Opcional para aceitar pedidos pendentes criados pela versão anterior do bot. */
  requestedQuantity?: string;
  address?: string;
};
export type WhatsAppStockLabel = WhatsAppStockItem & { company: string };
export type WhatsAppStockPrintPart = { pdfBase64: string; labelCount: number };

function fitLine(
  pdf: jsPDF, raw: string, x: number, y: number,
  maxWidth: number, start: number, minimum: number,
) {
  const text = raw.replace(/\s+/g, " ").trim() || "N/D";
  let size = start;
  pdf.setFontSize(size);
  while (size > minimum && pdf.getTextWidth(text) > maxWidth) {
    size = Math.max(minimum, size - 0.35);
    pdf.setFontSize(size);
  }
  let printed = text;
  if (pdf.getTextWidth(printed) > maxWidth) {
    while (printed.length > 0 && pdf.getTextWidth(printed + "...") > maxWidth)
      printed = printed.slice(0, -1);
    printed += "...";
  }
  pdf.text(printed, x, y);
}

function drawDescription(pdf: jsPDF, raw: string) {
  const text = raw.replace(/\s+/g, " ").trim();
  pdf.setFont("helvetica", "bold");
  let size = 7.0;
  let lines: string[] = [];
  while (size >= 5.5) {
    pdf.setFontSize(size);
    lines = pdf.splitTextToSize(text, 54.8) as string[];
    if (lines.length <= 2) break;
    size -= 0.3;
  }
  const first = lines[0] ?? text;
  const second = lines.length > 1 ? lines.slice(1).join(" ") : "";
  fitLine(pdf, first, 2.3, 19.8, 54.8, Math.max(size, 5.5), 5.2);
  if (second) fitLine(pdf, second, 2.3, 22.0, 54.8, Math.max(size, 5.5), 5.2);
}

/**
 * Uma etiqueta Argox 60 × 30 mm por código encontrado.
 * A quantidade SOLICITADA vem do WhatsApp; a quantidade SEPARADA
 * permanece em branco para o operador preencher à mão.
 */
export function createWhatsAppStockLabelsPdf(labels: WhatsAppStockLabel[]): jsPDF {
  if (!labels.length || labels.length > WHATSAPP_MAX_REQUEST_LABELS)
    throw new Error("Quantidade de etiquetas fora do limite de 1 a 500.");
  if (labels.some(row => !row.code.trim() || !row.description.trim() || !row.company.trim()))
    throw new Error("Etiqueta sem código, descrição ou empresa.");

  const pdf = new jsPDF({
    orientation: "landscape", unit: "mm",
    format: [WHATSAPP_LABEL_WIDTH_MM, WHATSAPP_LABEL_HEIGHT_MM], compress: true,
  });
  pdf.setProperties({
    title: "Solicitação WhatsApp - Etiquetas de Estoque",
    subject: "Argox 60 x 30 mm; quantidade solicitada e campo para quantidade separada",
    author: "Bignotto Ferramentas",
  });

  for (let index = 0; index < labels.length; index++) {
    if (index) pdf.addPage([WHATSAPP_LABEL_WIDTH_MM, WHATSAPP_LABEL_HEIGHT_MM], "landscape");
    const row = labels[index];
    const requestedQuantity = row.requestedQuantity?.trim() || "N/D";
    const address = row.address?.trim() || "N/D";

    pdf.setTextColor(0);
    pdf.setDrawColor(0);
    pdf.setLineWidth(0.17);
    pdf.roundedRect(0.5, 0.5, 59, 29, 1.3, 1.3, "S");

    pdf.setFont("helvetica", "bold");
    fitLine(pdf, "BIGNOTTO FERRAMENTAS", 2.3, 3.9, 55.2, 9.6, 8.5);
    pdf.line(1.8, 5.0, 58.2, 5.0);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.4);
    pdf.text("DESTINO", 2.3, 7.4);
    pdf.setFont("helvetica", "bold");
    fitLine(pdf, row.company.toUpperCase(), 13.0, 7.7, 44.5, 9.2, 5.8);
    pdf.line(1.8, 9.1, 58.2, 9.1);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.2);
    pdf.text("CÓDIGO", 2.3, 11.1);
    pdf.text("QTD. SOLICITADA", 39.2, 11.1);
    pdf.setFont("helvetica", "bold");
    fitLine(pdf, row.code.trim(), 2.3, 15.0, 35.0, 12.6, 8.5);
    fitLine(pdf, requestedQuantity, 39.2, 15.0, 18.0, 12.0, 8.0);
    pdf.line(1.8, 15.8, 58.2, 15.8);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.2);
    pdf.text("DESCRIÇÃO", 2.3, 17.45);
    drawDescription(pdf, row.description);
    pdf.line(1.8, 23.25, 58.2, 23.25);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.2);
    pdf.text("ENDEREÇO", 2.3, 25.1);
    pdf.text("QTD. SEPARADA", 39.2, 25.1);
    pdf.setFont("helvetica", "bold");
    fitLine(pdf, address.toUpperCase(), 2.3, 28.0, 35.0, 8.2, 5.8);
    // Caixa de preenchimento manual: propositalmente SEM valor.
    pdf.setLineWidth(0.2);
    pdf.rect(39.2, 25.6, 18.2, 3.2, "S");
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

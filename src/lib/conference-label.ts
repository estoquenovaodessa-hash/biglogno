import jsPDF from "jspdf";
import type { VerificationRecord } from "./sales-verification";

/** Etiqueta para Argox: 3,5 x 1,5 polegadas (88,9 x 38,1 mm).
 * Termotransferência monocromática. Uma única etiqueta por página, sem escala.
 * Logotipo preto e branco reproduzido da arte fornecida pela Bignotto.
 */
export const CONFERENCE_LABEL_WIDTH_MM = 88.9;
export const CONFERENCE_LABEL_HEIGHT_MM = 38.1;
const LOGO_MONO_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACcAAAAvCAIAAADvkkQPAAAAhElEQVR42u2Y4QrAIAiEvfD9X9n9G0IThJmjdv6vrzzviGBm0l5DvihSz6SqiADogd1+oa6kkrpXSiStnaxM5lBXUt+Nkp9KLd89Y4SODs/eG/3I5dQoYdZSI/mXd/gR3DFNM1hrBYsuB8Av6csmfxrm8F9fMCXpT11JJXVbKvijdyT1AsACIWf/YDBHAAAAAElFTkSuQmCC";

export type ConferenceLabelRecord = Pick<VerificationRecord,
  "document" | "clientName" | "items" | "createdAt" | "verifierName">;

export function conferenceLabelValues(record: ConferenceLabelRecord) {
  const stamp = new Date(record.createdAt);
  const date = Number.isNaN(stamp.getTime()) ? "—" :
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit", month: "2-digit", year: "numeric",
    }).format(stamp);
  return {
    document: record.document?.trim() || "—",
    client: record.clientName?.trim() || "Não informado",
    items: Number.isFinite(record.items) ? Math.max(0, Math.trunc(record.items)) : 0,
    date,
    verifier: record.verifierName?.trim() || "Não informado",
  };
}

/** Mantém todo o número do documento; clientes extensos são abreviados
 * somente na impressão, sem alterar os registros do banco. */
function fitted(pdf: jsPDF, raw: string, x: number, y: number,
  maxWidth: number, start: number, minimum = 6,
  options: { align?: "left" | "right" | "center" } = {}) {
  let size = start;
  pdf.setFontSize(size);
  while (size > minimum && pdf.getTextWidth(raw) > maxWidth) {
    size = Math.max(minimum, size - 0.3);
    pdf.setFontSize(size);
  }
  let rendered = raw;
  if (pdf.getTextWidth(rendered) > maxWidth) {
    while (rendered.length > 1 && pdf.getTextWidth(rendered + "...") > maxWidth) {
      rendered = rendered.slice(0, -1);
    }
    rendered += "...";
  }
  pdf.text(rendered, x, y, options);
}

export function conferenceLabelFilename(record: ConferenceLabelRecord): string {
  const safe = String(record.document ?? "documento").replace(/[^0-9a-zA-Z_-]+/g, "-").slice(0, 50);
  return "etiqueta-conferencia-" + (safe || "documento") + "-argox.pdf";
}

/** Gera o PDF em formato físico real. O gestor baixa o arquivo e imprime
 * na Argox com mídia 3,5x1,5 pol, orientação horizontal e escala 100%.
 */
export function createConferenceLabelPdf(record: ConferenceLabelRecord): jsPDF {
  const v = conferenceLabelValues(record);
  const pdf = new jsPDF({
    orientation: "landscape", unit: "mm",
    format: [CONFERENCE_LABEL_WIDTH_MM, CONFERENCE_LABEL_HEIGHT_MM],
    compress: true,
  });
  pdf.setProperties({
    title: "Etiqueta de Conferência - " + v.document,
    subject: "Etiqueta Argox 3,5 x 1,5 polegadas",
    author: "Bignotto Ferramentas",
  });
  pdf.setTextColor(0, 0, 0);
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.26);
  pdf.roundedRect(0.75, 0.75, 87.4, 36.6, 1.8, 1.8, "S");

  // Logo original, apenas preto; sem retângulos preenchidos.
  pdf.addImage(LOGO_MONO_PNG, "PNG", 3.4, 1.5, 8.4, 9.1);
  pdf.line(13.4, 1.9, 13.4, 10.6);
  pdf.setFont("helvetica", "bold");
  fitted(pdf, "BIGNOTTO", 16, 6.95, 69, 17.5, 14);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.2);
  pdf.text("F E R R A M E N T A S", 16.5, 10.1);
  pdf.line(2.3, 11.45, 86.6, 11.45);

  // Duas informações de maior destaque: documento e quantidade.
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.1);
  pdf.text("Nº DO DOCUMENTO", 3.6, 14.4);
  fitted(pdf, v.document, 3.3, 20.0, 63.8, 21, 9.5);
  pdf.line(69, 12.05, 69, 25.65);
  pdf.setFontSize(7.2);
  pdf.text("QTD. DE ITENS", 71, 14.5);
  fitted(pdf, String(v.items), 77.8, 22.5, 16, 23, 12, { align: "center" });

  // Cliente abaixo do documento: nome ajustado para a largura da bobina.
  pdf.setLineWidth(0.22);
  pdf.line(2.8, 21.4, 68.6, 21.4);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.3);
  pdf.text("CLIENTE:", 3.5, 24.35);
  pdf.setFont("helvetica", "normal");
  fitted(pdf, v.client, 17.2, 24.35, 50.4, 9.0, 6);
  pdf.line(2.4, 25.85, 86.5, 25.85);

  // Data e conferente reais associados ao registro escolhido.
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.6);
  pdf.text("DATA:", 3.5, 28.35);
  pdf.setFont("helvetica", "normal");
  fitted(pdf, v.date, 12, 28.35, 22.5, 8.6, 7);
  pdf.line(35.7, 26.35, 35.7, 29.1);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.4);
  pdf.text("CONFERENTE:", 37.4, 28.35);
  pdf.setFont("helvetica", "normal");
  fitted(pdf, v.verifier, 57.8, 28.35, 28.3, 8.4, 6);
  pdf.line(2.4, 29.7, 86.5, 29.7);

  // Rodapé discreto, em duas colunas, sem preenchimento escuro.
  pdf.setFont("helvetica", "bolditalic");
  fitted(pdf, "Bignotto agradece a preferência!", 3.1, 34.25, 48.1, 8.7, 6.7);
  pdf.line(53, 30.3, 53, 36.65);
  // Ícone simples de embalagem, desenhado em vetor preto.
  pdf.setLineWidth(0.25);
  pdf.rect(55.0, 32.0, 3.4, 3.4, "S");
  pdf.line(55.0, 32.0, 56.7, 31.1);
  pdf.line(56.7, 31.1, 60.0, 32.0);
  pdf.line(60.0, 32.0, 58.4, 32.0);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(5.65);
  pdf.text("Guarde a embalagem", 61.1, 32.8);
  pdf.text("para futura reclamação.", 61.1, 35.4);

  return pdf;
}

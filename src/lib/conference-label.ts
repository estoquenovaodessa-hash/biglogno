import jsPDF from "jspdf";
import type { VerificationRecord } from "./sales-verification";

/**
 * Padrão aprovado da Argox OS-214 plus: etiqueta de 60 mm de largura
 * por 30 mm de altura, orientação horizontal e uma etiqueta por página.
 * Reproduz o PDF de referência enviado pela Bignotto em 03/11/2026.
 * Traços e textos apenas em preto, sem fundos preenchidos.
 */
export const CONFERENCE_LABEL_WIDTH_MM = 60;
export const CONFERENCE_LABEL_HEIGHT_MM = 30;

// Ícone oficial fornecido pela Bignotto, monocromático.
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


/** Reduz o texto para caber na largura útil da etiqueta, sem mudar
 * os dados no sistema. Quando realmente necessário usa reticências. */
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


/**
 * PDF pronto para a configuração de mídia 60 x 30 mm que foi testada
 * com sucesso na Argox. NÃO rotacionar a página para 30 x 60 mm.
 */
export function createConferenceLabelPdf(record: ConferenceLabelRecord): jsPDF {
  const v = conferenceLabelValues(record);
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [CONFERENCE_LABEL_WIDTH_MM, CONFERENCE_LABEL_HEIGHT_MM],
    compress: true,
  });
  pdf.setProperties({
    title: "Etiqueta de Conferência - " + v.document,
    subject: "Argox 60 x 30 mm - Bignotto Ferramentas",
    author: "Bignotto Ferramentas",
  });
  pdf.setTextColor(0, 0, 0);
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.17);

  // Contorno fino e logotipo. A etiqueta não usa preenchimento preto.
  pdf.roundedRect(0.55, 0.55, 58.9, 28.9, 1.4, 1.4, "S");
  pdf.addImage(LOGO_MONO_PNG, "PNG", 1.8, 1.4, 5.0, 6.15);
  pdf.setLineWidth(0.16);
  pdf.line(8.4, 1.4, 8.4, 7.6);

  pdf.setFont("helvetica", "bold");
  fitted(pdf, "BIGNOTTO", 9.55, 5.6, 48, 17.8, 15);
  pdf.setFont("helvetica", "normal");
  fitted(pdf, "F E R R A M E N T A S", 10.05, 7.35, 44, 6.15, 5.5);
  pdf.setLineWidth(0.20);
  pdf.line(1.6, 8.35, 58.4, 8.35);

  // Destaque principal: número do documento, com quantidade à direita.
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.4);
  pdf.text("Nº DO DOCUMENTO", 2.1, 10.45);
  fitted(pdf, v.document, 2.0, 15.8, 40.0, 16.3, 8.2);
  pdf.setLineWidth(0.19);
  pdf.line(44.6, 9.1, 44.6, 17.0);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.1);
  pdf.text("QTD. ITENS", 46.2, 10.45);
  fitted(pdf, String(v.items), 51.5, 16.1, 11.8, 17.2, 9, { align: "center" });
  pdf.setLineWidth(0.18);
  pdf.line(1.9, 17.1, 58.2, 17.1);

  // Cliente ocupa uma única linha como no arquivo enviado.
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.35);
  pdf.text("CLIENTE:", 2.1, 19.75);
  pdf.setFont("helvetica", "normal");
  fitted(pdf, v.client, 14.0, 19.75, 43.2, 7.0, 5.4);
  pdf.line(1.9, 20.75, 58.2, 20.75);

  // Data da conferência e conferente extraídos do registro.
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.2);
  pdf.text("DATA:", 2.1, 23.2);
  pdf.setFont("helvetica", "normal");
  fitted(pdf, v.date, 9.1, 23.2, 16.0, 6.7, 5.4);
  pdf.setLineWidth(0.13);
  pdf.line(26.3, 21.45, 26.3, 24.0);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.2);
  pdf.text("CONF.:", 27.8, 23.2);
  pdf.setFont("helvetica", "normal");
  fitted(pdf, v.verifier, 37.9, 23.2, 19.8, 6.75, 5.1);
  pdf.setLineWidth(0.18);
  pdf.line(1.9, 24.6, 58.2, 24.6);

  // Mensagens discretas, sem caixas pretas; uma etiqueta por página.
  pdf.setFont("helvetica", "bolditalic");
  fitted(pdf, "Bignotto agradece a preferência!", 2.1, 27.45, 30.8, 5.55, 4.6);
  pdf.setLineWidth(0.14);
  pdf.line(34.3, 25.15, 34.3, 28.55);
  pdf.setFont("helvetica", "normal");
  fitted(pdf, "Guarde a embalagem para", 35.3, 26.7, 22.2, 5.35, 4.25);
  fitted(pdf, "futura reclamação.", 35.3, 28.15, 22.2, 5.35, 4.25);

  return pdf;
}

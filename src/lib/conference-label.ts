import jsPDF from "jspdf";
import type { VerificationRecord } from "./sales-verification";
import { conferenceLabelKind } from "./conference-label-selection";

/**
 * Padrão aprovado da Argox OS-214 plus: etiqueta de 60 mm de largura
 * por 30 mm de altura, orientação horizontal e uma etiqueta por página.
 * Reproduz o PDF de referência enviado pela Bignotto em 03/11/2026.
 * Traços e textos apenas em preto, sem fundos preenchidos.
 */
export const CONFERENCE_LABEL_WIDTH_MM = 60;
export const CONFERENCE_LABEL_HEIGHT_MM = 30;

// Ícone oficial fornecido pela Bignotto, monocromático.
export const LOGO_MONO_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACcAAAAvCAIAAADvkkQPAAAAhElEQVR42u2Y4QrAIAiEvfD9X9n9G0IThJmjdv6vrzzviGBm0l5DvihSz6SqiADogd1+oa6kkrpXSiStnaxM5lBXUt+Nkp9KLd89Y4SODs/eG/3I5dQoYdZSI/mXd/gR3DFNM1hrBYsuB8Av6csmfxrm8F9fMCXpT11JJXVbKvijdyT1AsACIWf/YDBHAAAAAElFTkSuQmCC";

export type ConferenceLabelRecord = Pick<VerificationRecord,
  "document" | "clientName" | "items" | "createdAt" | "verifierName"
    | "verifierCode" | "forDelivery" | "balcaoDestination" | "source">;

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
 * O nome da empresa cliente é o elemento de maior destaque da etiqueta.
 * Nomes extensos ganham duas linhas em vez de serem reduzidos a caracteres
 * minúsculos; a área do documento começa somente depois dessas linhas.
 */
function drawClientCompany(pdf: jsPDF, rawName: string): void {
  const name = rawName.replace(/\s+/g, " ").trim();
  pdf.setFont("helvetica", "bold");
  for (let size = 15.8; size >= 10.0; size -= 0.35) {
    pdf.setFontSize(size);
    if (pdf.getTextWidth(name) <= 55.0) {
      pdf.text(name, 30.0, 9.25, { align: "center" });
      return;
    }
  }

  // Duas linhas, mantendo o maior tamanho de letra que caiba no espaço.
  for (let size = 10.0; size >= 7.4; size -= 0.3) {
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(name, 55.0) as string[];
    if (lines.length <= 2) {
      const first = lines[0] ?? "";
      const second = lines[1] ?? "";
      pdf.text(first, 30.0, second ? 7.65 : 9.25, { align: "center" });
      if (second) pdf.text(second, 30.0, 10.25, { align: "center" });
      return;
    }
  }

  // Casos excepcionalmente longos: evita ultrapassar a margem física.
  pdf.setFontSize(7.4);
  const lines = pdf.splitTextToSize(name, 55.0) as string[];
  pdf.text(lines[0] ?? "", 30.0, 7.65, { align: "center" });
  fitted(pdf, lines.slice(1).join(" "), 30.0, 10.25, 55.0, 7.4, 7.4,
    { align: "center" });
}

/** Desenha uma etiqueta por página. Mantém o layout 60 x 30 mm que
 * já foi testado na Argox, com distinção visual Entrega / Retira. */
function drawConferenceLabel(pdf: jsPDF, record: ConferenceLabelRecord): void {
  const v = conferenceLabelValues(record);
  pdf.setTextColor(0, 0, 0);
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.17);

  // Cabeçalho institucional discreto: B ORIGINAL, não a imagem gerada.
  pdf.roundedRect(0.55, 0.55, 58.9, 28.9, 1.4, 1.4, "S");
  pdf.addImage(LOGO_MONO_PNG, "PNG", 2.05, 1.05, 2.95, 3.45);
  pdf.setLineWidth(0.15);
  pdf.line(6.20, 1.15, 6.20, 4.37);
  pdf.setFont("helvetica", "bold");
  fitted(pdf, "BIGNOTTO FERRAMENTAS", 8.1, 3.50, 49.8, 9.0, 7.0);
  pdf.setLineWidth(0.20);
  pdf.line(1.50, 4.65, 58.50, 4.65);

  // Principal destaque: EMPRESA CLIENTE (sem prefixo "CLIENTE" que
  // consumia espaço), visível acima do documento e da quantidade.
  drawClientCompany(pdf, v.client);
  pdf.setLineWidth(0.19);
  pdf.line(1.50, 11.08, 58.50, 11.08);

  // Documento grande à esquerda; quantidade grande à direita.
  // O número completo é preservado sempre que couber na coluna.
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.0);
  pdf.text("DOCUMENTO", 2.0, 13.32);
  fitted(pdf, v.document, 2.00, 19.0, 40.2, 21.0, 8.5);

  pdf.setLineWidth(0.18);
  pdf.line(44.10, 11.75, 44.10, 19.86);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.0);
  pdf.text("QTD. ITENS", 46.10, 13.32);
  fitted(pdf, String(v.items), 51.0, 19.02, 12.2, 22.0, 10.0,
    { align: "center" });
  pdf.setLineWidth(0.19);
  pdf.line(1.50, 20.25, 58.50, 20.25);

  // Data, conferente e destino em uma faixa própria.
  // Cada campo tem título e valor, com fonte ajustada à coluna.
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.5);
  pdf.text("DATA", 2.0, 22.10);
  fitted(pdf, v.date, 2.00, 24.22, 16.2, 8.2, 6.0);

  pdf.setLineWidth(0.13);
  pdf.line(19.35, 20.82, 19.35, 24.48);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.5);
  pdf.text("CONFERENTE", 20.65, 22.10);
  fitted(pdf, v.verifier, 20.65, 24.22, 23.0, 8.7, 5.7);

  pdf.line(45.15, 20.82, 45.15, 24.48);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.5);
  pdf.text("TIPO", 46.4, 22.10);
  fitted(pdf, conferenceLabelKind(record) === "entrega" ? "ENTREGA" : "RETIRA",
    46.4, 24.22, 11.0, 8.4, 6.3);
  pdf.setLineWidth(0.19);
  pdf.line(1.50, 24.92, 58.50, 24.92);

  // Agradecimento solicitado, mais o aviso original em corpo menor.
  pdf.setFont("helvetica", "bolditalic");
  fitted(pdf, "Bignotto agradece a preferência!", 2.00, 27.06,
    55.6, 7.2, 6.1);
  pdf.setFont("helvetica", "normal");
  fitted(pdf, "Guarde a embalagem para futura reclamação.", 2.00, 28.66,
    55.6, 5.2, 4.5);

}

/** Um único PDF com N etiquetas, cada uma numa página física independente
 * de 60 x 30 mm. Nunca combina várias etiquetas na mesma página. */
export function createConferenceLabelsPdf(records: ConferenceLabelRecord[]): jsPDF {
  if (!records.length) throw new Error("Não existem etiquetas selecionadas.");
  if (records.some(record => !conferenceLabelKind(record)))
    throw new Error("Somente conferências de Entrega ou Retira podem gerar etiquetas.");
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [CONFERENCE_LABEL_WIDTH_MM, CONFERENCE_LABEL_HEIGHT_MM],
    compress: true,
  });
  for (let i = 0; i < records.length; i++) {
    if (i) pdf.addPage([CONFERENCE_LABEL_WIDTH_MM, CONFERENCE_LABEL_HEIGHT_MM], "landscape");
    drawConferenceLabel(pdf, records[i]);
  }
  pdf.setProperties({
    title: "Etiquetas de Conferência - " + records.length + " documento(s)",
    subject: "Argox 60 x 30 mm - 1 etiqueta por página",
    author: "Bignotto Ferramentas",
  });
  return pdf;
}

/** Compatibilidade do botão por documento na coluna Ações. */
export function createConferenceLabelPdf(record: ConferenceLabelRecord): jsPDF {
  return createConferenceLabelsPdf([record]);
}

/** Arquivos distintos para impressão do dia e impressão seletiva do histórico. */
export function conferenceLabelsBatchFilename(mode: "hoje" | "selecionadas", day: string): string {
  const safeDay = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "data";
  return mode === "hoje" ? `etiquetas-conferencia-${safeDay}-argox.pdf`
    : `etiquetas-conferencia-selecionadas-${safeDay}-argox.pdf`;
}

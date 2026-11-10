import { createSboLabelsPdf, type SboLabel } from "./sbo-label";

/** Mesmo limite usado pelo BigLogno Print v2.0 (sem mudar o agente Windows). */
export const SBO_MAX_PRINT_PDF_BASE64 = 550000;
export const SBO_PRINT_LABELS_PER_PART = 40;

export type SboPrintPart = { pdfBase64: string; labelCount: number };

/** Monta PDFs 60x30mm de 40 páginas, reduzindo o lote se ultrapassar
 * o limite aceito pelo agente Windows. Não manda dados ao spooler aqui. */
export function prepareSboPrintParts(labels: SboLabel[]): SboPrintPart[] {
  if (labels.length < 1 || labels.length > 500)
    throw new Error("Informe entre 1 e 500 etiquetas para imprimir.");
  const parts: SboPrintPart[] = [];
  const append = (batch: SboLabel[]): void => {
    const pdf = createSboLabelsPdf(batch);
    const dataUri = pdf.output("datauristring");
    const pdfBase64 = dataUri.slice(dataUri.indexOf(",") + 1);
    if (pdfBase64.length <= SBO_MAX_PRINT_PDF_BASE64 && pdfBase64.length >= 20) {
      parts.push({ pdfBase64, labelCount: batch.length });
      return;
    }
    if (batch.length === 1)
      throw new Error("Uma etiqueta ultrapassou o limite permitido para impressão remota.");
    const half = Math.ceil(batch.length / 2);
    append(batch.slice(0, half));
    append(batch.slice(half));
  };
  for (let i = 0; i < labels.length; i += SBO_PRINT_LABELS_PER_PART)
    append(labels.slice(i, i + SBO_PRINT_LABELS_PER_PART));
  return parts;
}

export type SboPrintJobStatus = "pending" | "claimed" | "spooled" | "error";
export function summarizeSboPrintJobs(
  jobs: { status: SboPrintJobStatus; sbo_label_count: number | null; last_error?: string | null }[],
) {
  const total = jobs.length;
  const spooled = jobs.filter(job => job.status === "spooled").length;
  const errors = jobs.filter(job => job.status === "error").length;
  const claimed = jobs.filter(job => job.status === "claimed").length;
  const completed = total > 0 && spooled + errors === total;
  return {
    total, spooled, errors, claimed, completed,
    printedLabels: jobs.filter(job => job.status === "spooled")
      .reduce((sum, job) => sum + (job.sbo_label_count || 0), 0),
    error: jobs.find(job => job.status === "error")?.last_error ?? null,
  };
}

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SBO_UNITS, parseSboQuantity } from "./sbo-label";
import { prepareSboPrintParts, summarizeSboPrintJobs, type SboPrintJobStatus } from "./sbo-print";

const sboRecord = z.object({
  code: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().finite().positive().max(1000000),
  unit: z.enum(SBO_UNITS),
}).superRefine((label, ctx) => {
  if (parseSboQuantity(String(label.quantity), label.unit) === null)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Quantidade inválida para a unidade informada." });
});

const queueInput = z.object({
  requestId: z.string().uuid(),
  labels: z.array(sboRecord).min(1).max(500),
});

/** Um clique no tablet enfileira a lista S.B.O para o MESMO BigLogno Print
 * do Windows. O tablet não recebe nem conhece o token da impressora. */
export const requestSboPrint = createServerFn({ method: "POST" })
  .inputValidator(queueInput).handler(async ({ data }) => {
    const { requireSelectedOperator } = await import("./employees.functions");
    const operator = await requireSelectedOperator();
    if (process.env.AUTO_CONFERENCE_PRINT_ENABLED !== "true")
      throw new Error("Impressão no Windows está desativada no servidor. Verifique a configuração do Cloudflare.");

    const parts = prepareSboPrintParts(data.labels);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const jobs = parts.map((part, index) => ({
      verification_id: null,
      document: "S.B.O — lote " + (index + 1) + "/" + parts.length,
      pdf_base64: part.pdfBase64,
      status: "pending",
      job_kind: "sbo",
      sbo_request_id: data.requestId,
      sbo_part_number: index + 1,
      sbo_label_count: part.labelCount,
      sbo_requested_by: operator.name,
    }));
    // Unicidade em (request_id, part_number): retry de rede nunca
    // duplica a impressão. A inserção de todos os lotes é atômica.
    const { error } = await supabaseAdmin.from("conference_label_print_jobs")
      .upsert(jobs, { onConflict: "sbo_request_id,sbo_part_number", ignoreDuplicates: true });
    if (error) {
      console.error("[S.B.O] Não foi possível enfileirar:", error.code, error.message);
      throw new Error("Não foi possível enviar as etiquetas ao computador. Verifique a fila de impressão.");
    }
    return { requestId: data.requestId, labelCount: data.labels.length, batches: parts.length };
  });

export const getSboPrintRequestStatus = createServerFn({ method: "GET" })
  .inputValidator(z.object({ requestId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { requireSelectedOperator } = await import("./employees.functions");
    await requireSelectedOperator();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: jobs, error } = await supabaseAdmin.from("conference_label_print_jobs")
      .select("status,sbo_part_number,sbo_label_count,last_error")
      .eq("sbo_request_id", data.requestId).order("sbo_part_number", { ascending: true });
    if (error) throw new Error("Não foi possível consultar o estado das etiquetas.");
    const summary = summarizeSboPrintJobs((jobs ?? []) as Array<{
      status: SboPrintJobStatus; sbo_label_count: number | null; last_error: string | null;
    }>);
    return summary;
  });

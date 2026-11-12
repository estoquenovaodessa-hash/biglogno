import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { prepareWhatsAppStockLabelParts } from "@/lib/whatsapp-stock-label";

const noCache = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'",
};
function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: noCache });
}

const requestSchema = z.object({
  requestId: z.string().uuid(),
  company: z.string().trim().min(1).max(100),
  items: z.array(z.object({
    code: z.string().trim().min(1).max(60),
    description: z.string().trim().min(1).max(360),
  })).min(1).max(500),
}).strict();

function verifyBot(request: Request): Response | null {
  const expected = (process.env.WHATSAPP_STOCK_PRINT_TOKEN ?? "").trim();
  // Nunca reutilizar PRINT_AGENT_TOKEN: o bot só pode SOLICITAR jobs,
  // não ler a fila nem confirmar/roubar trabalhos da impressora.
  if (!/^[a-f0-9]{64}$/i.test(expected))
    return json({ error: "Integração do bot não configurada no Cloudflare." }, 503);
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([a-f0-9]{64})$/i.exec(header);
  if (!match) return json({ error: "Não autorizado." }, 401);
  // Ambos têm sempre 64 caracteres: comparação de tempo fixo.
  const supplied = match[1].toLowerCase();
  const known = expected.toLowerCase();
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= supplied.charCodeAt(i) ^ known.charCodeAt(i);
  return difference === 0 ? null : json({ error: "Não autorizado." }, 401);
}

export const Route = createFileRoute("/api/whatsapp-stock-print")({
  server: { handlers: {
    GET: async ({ request }) => {
      const denied = verifyBot(request);
      if (denied) return denied;
      return json({ ok: true, printingEnabled: process.env.AUTO_CONFERENCE_PRINT_ENABLED === "true" });
    },
    POST: async ({ request }) => {
      const denied = verifyBot(request);
      if (denied) return denied;
      if (process.env.AUTO_CONFERENCE_PRINT_ENABLED !== "true")
        return json({ error: "Impressão automática está desativada no servidor." }, 503);
      if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json"))
        return json({ error: "Formato de requisição inválido." }, 415);
      const length = Number(request.headers.get("content-length"));
      if (Number.isFinite(length) && length > 220000)
        return json({ error: "Solicitação acima do limite." }, 413);
      let raw: string;
      try { raw = await request.text(); }
      catch { return json({ error: "Não foi possível ler a solicitação." }, 400); }
      if (raw.length > 220000) return json({ error: "Solicitação acima do limite." }, 413);
      const parsed = requestSchema.safeParse((() => { try { return JSON.parse(raw); } catch { return null; } })());
      if (!parsed.success) return json({ error: "Código, descrição, empresa ou identificador inválido." }, 400);
      const { requestId, company, items } = parsed.data;
      let parts: ReturnType<typeof prepareWhatsAppStockLabelParts>;
      try {
        parts = prepareWhatsAppStockLabelParts(items.map(item => ({ ...item, company })));
      } catch (error) {
        console.error("[Bot WhatsApp/Argox] PDF inválido:", error instanceof Error ? error.message : error);
        return json({ error: "Falha ao preparar as etiquetas 60 × 30 mm." }, 422);
      }
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const records = parts.map((part, index) => ({
          verification_id: null,
          document: ("WhatsApp " + company + " • lote " + (index + 1) + "/" + parts.length).slice(0, 180),
          pdf_base64: part.pdfBase64,
          status: "pending",
          job_kind: "sbo",
          sbo_request_id: requestId,
          sbo_part_number: index + 1,
          sbo_label_count: part.labelCount,
          sbo_requested_by: "Bot Estoque WhatsApp",
        }));
        // Em reentregas do WhatsApp, o requestId permanece igual.
        // onConflict + ignoreDuplicates garante que não volte à fila.
        const { error } = await supabaseAdmin.from("conference_label_print_jobs")
          .upsert(records, { onConflict: "sbo_request_id,sbo_part_number", ignoreDuplicates: true });
        if (error) {
          console.error("[Bot WhatsApp/Argox] Falha na fila:", error.code, error.message);
          return json({ error: "Não foi possível registrar etiquetas na fila Windows." }, 503);
        }
        return json({ ok: true, requestId, labels: items.length, batches: parts.length,
          note: "Solicitação recebida; confirmação física depende da Argox." });
      } catch (error) {
        console.error("[Bot WhatsApp/Argox] Falha geral ao solicitar impressão:", error);
        return json({ error: "Serviço de impressão temporariamente indisponível." }, 503);
      }
    },
  } },
});

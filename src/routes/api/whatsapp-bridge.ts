import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

// A sessão do WhatsApp NÃO roda dentro do Cloudflare Worker.
// Esta rota só entrega/recebe confirmação da fila para um conector Node local.
const resultSchema = z.object({
  messageId: z.string().uuid(),
  attemptToken: z.string().uuid(),
  sent: z.boolean(),
  externalMessageId: z.string().max(300).optional(),
  error: z.string().max(400).optional(),
});

const json = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
});

async function isAuthorized(request: Request) {
  const expected = process.env.WHATSAPP_BRIDGE_TOKEN;
  if (!expected || expected.length < 32) return false;
  const supplied = request.headers.get("authorization") ?? "";
  if (!supplied.startsWith("Bearer ") || supplied.length > 1024) return false;
  const encoder = new TextEncoder();
  // Compara hashes, sem expor tamanho ou conteúdo do token.
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode("Bearer " + expected)),
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
  ]);
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

async function getDb(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

export const Route = createFileRoute("/api/whatsapp-bridge")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthorized(request))) return json({ error: "Não autorizado" }, 401);
        try {
          const db = await getDb();
          const { data, error } = await db.rpc("claim_delivery_whatsapp_message");
          if (error) {
            console.error("[WhatsApp Bridge] Falha ao retirar aviso", error.code);
            return json({ error: "Fila indisponível. Confirme a migração SQL." }, 503);
          }
          const next = Array.isArray(data) ? data[0] : null;
          return json(next ? {
            messageId: next.message_id,
            attemptToken: next.attempt_token,
            phone: next.target_phone,
            message: next.message_text,
          } : { message: null });
        } catch {
          return json({ error: "Serviço de envio indisponível" }, 503);
        }
      },
      POST: async ({ request }) => {
        if (!(await isAuthorized(request))) return json({ error: "Não autorizado" }, 401);
        try {
          const parsed = resultSchema.safeParse(await request.json());
          if (!parsed.success) return json({ error: "Dados inválidos" }, 400);
          const db = await getDb();
          const { data, error } = await db.rpc("finish_delivery_whatsapp_message", {
            p_message_id: parsed.data.messageId,
            p_attempt_token: parsed.data.attemptToken,
            p_sent: parsed.data.sent,
            p_external_message_id: parsed.data.externalMessageId ?? null,
            p_error: parsed.data.error ?? null,
          });
          if (error) {
            console.error("[WhatsApp Bridge] Falha ao confirmar aviso", error.code);
            return json({ error: "Não foi possível confirmar o resultado." }, 503);
          }
          return json({ ok: data === true }, data === true ? 200 : 409);
        } catch {
          return json({ error: "Não foi possível confirmar o resultado." }, 503);
        }
      },
    },
  },
});

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const clientCode = z.string().trim().regex(/^\d{1,12}$/);
const contactInput = z.object({
  code: clientCode,
  companyName: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(30),
  optedIn: z.boolean(),
});

async function managerDb(): Promise<SupabaseClient> {
  const { requireAccess } = await import("./access.server");
  if (await requireAccess() !== "gestor") throw new Error("Apenas o gestor pode administrar os avisos.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}
function ensureOk(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === "42P01" || error.code === "PGRST205" ||
    /delivery_whatsapp_contacts|delivery_whatsapp_outbox/i.test(error.message))
    throw new Error("Execute o SQL da integração WhatsApp no Supabase antes de utilizar este recurso.");
  console.error("[WhatsApp Entregas]", error.code, error.message);
  throw new Error("Não foi possível acessar os avisos de entrega.");
}
function normalizeBrazilPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  const national = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (!/^\d{10,11}$/.test(national) || national.startsWith("0")) {
    throw new Error("Informe um telefone brasileiro válido com DDD, por exemplo: 19999999999.");
  }
  return "+55" + national;
}

export const readDeliveryWhatsAppSettings = createServerFn({ method: "GET" })
  .handler(async () => {
    const db = await managerDb();
    const { data: contacts, error: e1 } = await db.from("delivery_whatsapp_contacts")
      .select("company_code,company_name,phone_e164,opted_in,opted_in_at,updated_at")
      .order("company_name").limit(5000);
    ensureOk(e1);
    const { data: history, error: e2 } = await db.from("delivery_whatsapp_outbox")
      .select("id,company_code,company_name,document,status,last_error,created_at,sent_at,attempted_at")
      .order("created_at", { ascending: false }).limit(100);
    ensureOk(e2);
    return {
      contacts: (contacts ?? []).map(c => ({
        code: c.company_code as string,
        name: c.company_name as string,
        phone: c.phone_e164 as string,
        optedIn: Boolean(c.opted_in),
        updatedAt: c.updated_at as string,
      })),
      history: (history ?? []).map(h => ({
        id: h.id as string,
        code: h.company_code as string,
        name: h.company_name as string,
        document: h.document as string,
        status: h.status as string,
        error: h.last_error as string | null,
        createdAt: h.created_at as string,
        sentAt: h.sent_at as string | null,
        attemptedAt: h.attempted_at as string | null,
      })),
    };
  });

export const saveDeliveryWhatsAppContact = createServerFn({ method: "POST" })
  .inputValidator(contactInput)
  .handler(async ({ data }) => {
    const db = await managerDb();
    const code = data.code.replace(/^0+(?=\d)/, "");
    const phone = normalizeBrazilPhone(data.phone);
    const { data: previous, error: readError } = await db.from("delivery_whatsapp_contacts")
      .select("phone_e164,opted_in").eq("company_code", code).maybeSingle();
    ensureOk(readError);
    // Não basta ter o número: o gestor deve registrar o opt-in autorizado pelo cliente.
    const { error } = await db.from("delivery_whatsapp_contacts").upsert({
      company_code: code, company_name: data.companyName,
      phone_e164: phone, opted_in: data.optedIn,
      opted_in_at: data.optedIn ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_code" });
    ensureOk(error);
    // Se a autorização foi revogada ou o número mudou, os avisos
    // pendentes devem ser cancelados para evitar envio ao contato antigo.
    if (previous && (!data.optedIn || previous.phone_e164 !== phone)) {
      const { error: cancelError } = await db.from("delivery_whatsapp_outbox")
        .update({ status: "cancelado", last_error: "Contato alterado ou autorização revogada." })
        .eq("company_code", code).eq("status", "pendente");
      ensureOk(cancelError);
    }
    return { ok: true };
  });

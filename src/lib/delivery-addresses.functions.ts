import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { normalizeDeliveryClientCode } from "./delivery-addresses";

const addressSchema = z.object({
  client_code: z.string().regex(/^\d{1,12}$/),
  address: z.string().min(1).max(300),
  neighborhood: z.string().max(300),
  city: z.string().min(1).max(300),
  state: z.string().regex(/^[A-Z]{2}$/),
});

export const readDeliveryAddresses = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAccess } = await import("./access.server");
  await requireAccess();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("app_state")
    .select("value").eq("key", "delivery-addresses").maybeSingle();
  if (error) throw new Error("Não foi possível consultar os endereços.");
  return z.array(addressSchema).parse(data?.value ?? []);
});

export const saveDeliveryAddresses = createServerFn({ method: "POST" })
  .inputValidator(z.array(addressSchema).min(1).max(100000))
  .handler(async ({ data }) => {
    const { requireAccess } = await import("./access.server");
    if (await requireAccess() !== "gestor") throw new Error("Somente o gestor pode importar endereços.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: previous, error: readError } = await supabaseAdmin.from("app_state")
      .select("value").eq("key", "delivery-addresses").maybeSingle();
    if (readError) throw new Error("Não foi possível conferir os endereços atuais.");
    const current = z.array(addressSchema).parse(previous?.value ?? []);
    const merged = new Map(current.map(a => [normalizeDeliveryClientCode(a.client_code), a]));
    for (const address of data) merged.set(normalizeDeliveryClientCode(address.client_code), address);
    const { error } = await supabaseAdmin.from("app_state").upsert({
      key: "delivery-addresses", value: [...merged.values()], updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Não foi possível salvar os endereços no Supabase.");
    return { imported: data.length, total: merged.size };
  });

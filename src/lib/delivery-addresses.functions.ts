import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mergeDeliveryAddress, normalizeDeliveryClientCode } from "./delivery-addresses";

const addressSchema = z.object({
  client_code: z.string().regex(/^\d{1,12}$/),
  address: z.string().min(1).max(300),
  neighborhood: z.string().max(300),
  city: z.string().min(1).max(300),
  state: z.string().regex(/^[A-Z]{2}$/),
});
const savedAddressSchema = addressSchema.extend({
  latitude: z.number().finite().min(-34).max(6).optional(),
  longitude: z.number().finite().min(-74).max(-28).optional(),
  locationSource: z.literal("google_maps").optional(),
  locationConfirmedAt: z.string().datetime().optional(),
});

export const readDeliveryAddresses = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAccess } = await import("./access.server");
  await requireAccess();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("app_state")
    .select("value").eq("key", "delivery-addresses").maybeSingle();
  if (error) throw new Error("Não foi possível consultar os endereços.");
  return z.array(savedAddressSchema).parse(data?.value ?? []);
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
    const current = z.array(savedAddressSchema).parse(previous?.value ?? []);
    const merged = new Map(current.map(a => [normalizeDeliveryClientCode(a.client_code), a]));
    for (const address of data) {
      const code = normalizeDeliveryClientCode(address.client_code);
      merged.set(code, mergeDeliveryAddress(merged.get(code), { ...address, client_code: code }));
    }
    const { error } = await supabaseAdmin.from("app_state").upsert({
      key: "delivery-addresses", value: [...merged.values()], updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Não foi possível salvar os endereços no Supabase.");
    return { imported: data.length, total: merged.size };
  });

/** Confirma um ponto conferido pelo gestor no Google Maps sem alterar
 * o endereço textual ou os pedidos; fica disponível em todas as sessões. */
export const confirmDeliveryAddressLocation = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clientCode: z.string().regex(/^\d{1,12}$/),
    latitude: z.number().finite().min(-34).max(6),
    longitude: z.number().finite().min(-74).max(-28),
  }))
  .handler(async ({ data }) => {
    const { requireAccess } = await import("./access.server");
    if (await requireAccess() !== "gestor") throw new Error("Somente o gestor pode confirmar localizações.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: readError } = await supabaseAdmin.from("app_state")
      .select("value").eq("key", "delivery-addresses").maybeSingle();
    if (readError) throw new Error("Não foi possível consultar o cadastro de endereços.");
    const addresses = z.array(savedAddressSchema).parse(existing?.value ?? []);
    const code = normalizeDeliveryClientCode(data.clientCode);
    const index = addresses.findIndex(address => normalizeDeliveryClientCode(address.client_code) === code);
    if (index < 0) throw new Error("Cadastre primeiro o endereço do cliente para confirmar o ponto no mapa.");
    const address = addresses[index];
    const next = [...addresses];
    next[index] = {
      ...address,
      latitude: data.latitude, longitude: data.longitude,
      locationSource: "google_maps" as const,
      locationConfirmedAt: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin.from("app_state").upsert({
      key: "delivery-addresses",
      value: next,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Não foi possível salvar o ponto confirmado.");
    return { ok: true, clientCode: code };
  });

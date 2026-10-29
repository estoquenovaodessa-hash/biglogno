import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { CollectionLocationCatalog } from "./collection-locations";

const LOCATION_PREFIX = "collection-location:";
const LOCATION_COMPANY = LOCATION_PREFIX + "company:";
const LOCATION_RECORD = LOCATION_PREFIX + "collection:";

const locationSchema = z.object({
  collectionId: z.string().uuid(),
  companyId: z.string().uuid(),
  companyName: z.string().trim().min(2).max(180),
  address: z.string().trim().min(5, "Informe rua, número, cidade e UF.").max(400),
  initialAddress: z.string().max(400).optional(),
  latitude: z.number().finite().min(-34).max(6),
  longitude: z.number().finite().min(-74).max(-28),
  confirmedAt: z.string().datetime(),
});

export async function loadCollectionLocations(): Promise<CollectionLocationCatalog> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("app_state")
    .select("key,value").like("key", LOCATION_PREFIX + "%");
  if (error) throw new Error("Não foi possível consultar os locais das coletas.");
  const catalog: CollectionLocationCatalog = {
    defaults: {}, specific: {},
  };
  for (const row of data ?? []) {
    const parsed = locationSchema.safeParse(row.value);
    if (!parsed.success) continue;
    if (row.key === LOCATION_COMPANY + parsed.data.companyId)
      catalog.defaults[parsed.data.companyId] = parsed.data;
    if (row.key === LOCATION_RECORD + parsed.data.collectionId)
      catalog.specific[parsed.data.collectionId] = parsed.data;
  }
  return catalog;
}

/** Pode ser consultado nos três painéis: operador, Expedição, gestor. */
export const readCollectionLocations = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAccess } = await import("./access.server");
  await requireAccess();
  return loadCollectionLocations();
});

/** Gestor confirma endereço + ponto de uma coleta, inclusive finalizada.
 * Atualiza o local padrão da empresa para novas coletas sem mexer no
 * payload/timestamps/assinaturas do histórico. Cada coleta antiga confirmada
 * mantém seu próprio ponto, mesmo que o padrão da empresa seja alterado. */
export const confirmCollectionLocation = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    collectionId: z.string().uuid(),
    address: z.string().trim().min(5).max(400),
    latitude: z.number().finite().min(-34).max(6),
    longitude: z.number().finite().min(-74).max(-28),
  })).handler(async ({ data }) => {
    const { requireAccess } = await import("./access.server");
    if (await requireAccess() !== "gestor")
      throw new Error("Somente o gestor pode confirmar um endereço de coleta.");
    const { logisticsClient } = await import("./logistics.server");
    const db = await logisticsClient();
    const { data: row, error } = await db.from("deliveries")
      .select("id,payload").eq("id", data.collectionId).maybeSingle();
    if (error || !row) throw new Error("Coleta não encontrada. Atualize o painel.");
    const original = row.payload as Record<string, unknown>;
    if (original.source !== "coleta") throw new Error("Este registro não é uma coleta.");
    let companyId = typeof original.collectionCompanyId === "string" ? original.collectionCompanyId : "";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!companyId) {
      const { data: companyCatalog, error: catalogError } = await supabaseAdmin.from("app_state")
        .select("value").eq("key", "collection-companies").maybeSingle();
      if (catalogError) throw new Error("Não foi possível localizar a empresa da coleta.");
      const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .trim().toLocaleLowerCase("pt-BR");
      const matches = z.array(z.object({ id: z.string().uuid(), name: z.string() }))
        .parse(companyCatalog?.value ?? [])
        .filter(company => normalize(company.name) === normalize(String(original.company ?? "")));
      if (matches.length !== 1) throw new Error("Associe a coleta a uma empresa cadastrada na Expedição antes de confirmar o endereço.");
      companyId = matches[0].id;
    }
    const confirmed = locationSchema.parse({
      collectionId: data.collectionId, companyId,
      companyName: String(original.company ?? ""),
      address: data.address.trim(),
      initialAddress: String(original.collectionAddress ?? "").slice(0, 400),
      latitude: data.latitude,
      longitude: data.longitude, confirmedAt: new Date().toISOString(),
    });
    const timestamp = new Date().toISOString();
    const jsonLocation = JSON.parse(JSON.stringify(confirmed));
    // Dois registros persistidos numa única operação, sem alterar entregas.
    const { error: saveError } = await supabaseAdmin.from("app_state").upsert([
      { key: LOCATION_RECORD + confirmed.collectionId, value: jsonLocation, updated_at: timestamp },
      { key: LOCATION_COMPANY + confirmed.companyId, value: jsonLocation, updated_at: timestamp },
    ], { onConflict: "key" });
    if (saveError) throw new Error("Não foi possível salvar o local confirmado no Supabase.");
    return { ok: true, companyId, collectionId: data.collectionId };
  });

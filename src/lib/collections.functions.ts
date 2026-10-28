import { createServerFn } from "@tanstack/react-start";
import { createCollectionCompanySchema, createCollectionSchema, collectionCompanySchema } from "./collections";
import { z } from "zod";

const CATALOG_KEY = "collection-companies";

async function getCatalog() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("app_state").select("value").eq("key", CATALOG_KEY).maybeSingle();
  if (error) throw new Error("Não foi possível consultar as empresas de coleta.");
  return z.array(collectionCompanySchema).parse(data?.value ?? []);
}

/** Todos que conseguem acessar a Expedição podem consultar o catálogo. */
export const listCollectionCompanies = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAccess } = await import("./access.server");
  await requireAccess();
  return getCatalog();
});

/** Gestor visualiza, mas não cadastra. O direito de Expedição é verificado no servidor. */
export const addCollectionCompany = createServerFn({ method: "POST" })
  .inputValidator(createCollectionCompanySchema)
  .handler(async ({ data }) => {
    const { requireOperatorPermission } = await import("./employees.functions");
    await requireOperatorPermission("expedicao");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const catalog = await getCatalog();
    const normalized = data.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    if (catalog.some(company => company.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === normalized))
      throw new Error("Essa empresa de coleta já está cadastrada.");
    if (catalog.length >= 5000) throw new Error("O cadastro atingiu o limite de empresas.");
    const { error } = await supabaseAdmin.from("app_state").upsert({
      key: CATALOG_KEY, value: [...catalog, data], updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
    if (error) throw new Error("Não foi possível salvar a empresa de coleta.");
    return { ok: true };
  });

/** Cada coleta é um registro independente na mesma fila do entregador.
 * Mantém timestamps e status da entrega para aproveitar a medição e a rota. */
export const addCollection = createServerFn({ method: "POST" })
  .inputValidator(createCollectionSchema)
  .handler(async ({ data }) => {
    const { requireOperatorPermission } = await import("./employees.functions");
    await requireOperatorPermission("expedicao");
    const companies = await getCatalog();
    const company = companies.find(row => row.id === data.companyId);
    if (!company) throw new Error("Empresa de coleta não encontrada. Atualize o cadastro e tente novamente.");
    const { logisticsClient } = await import("./logistics.server");
    const db = await logisticsClient();
    const payload = {
      source: "coleta", company: company.name, document: "", value: data.value,
      status: "nao_iniciada", collectionAddress: data.address,
      collectionContact: data.contact, onlyDelivery: false,
    };
    const { error } = await db.from("deliveries").upsert({
      id: data.requestId, payload, position: Date.now() / 1000,
    }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error("Não foi possível adicionar a coleta.");
    return { ok: true };
  });

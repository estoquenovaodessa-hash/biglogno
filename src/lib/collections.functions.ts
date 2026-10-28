import { createServerFn } from "@tanstack/react-start";
import { createCollectionCompanySchema, createCollectionSchema, editCollectionSchema, collectionCompanySchema } from "./collections";
import { z } from "zod";
import { collectionEditCommitPayload, type LogisticsSnapshotRow } from "./collection-edit-commit";

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
      source: "coleta", company: company.name, document: "", value: data.value ?? 0,
      collectionValueProvided: data.value !== undefined,
      collectionTransport: data.vehicle,
      collectionCompanyId: company.id,
      status: "nao_iniciada", collectionAddress: data.address,
      collectionContact: data.contact, collectionPayment: data.payment,
      expeditionShift: data.shift ?? undefined,
      scheduledDate: data.scheduledDate || undefined, onlyDelivery: false,
    };
    const { error } = await db.from("deliveries").upsert({
      id: data.requestId, payload, position: Date.now() / 1000,
    }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error("Não foi possível adicionar a coleta.");
    return { ok: true };
  });

/** Editar coleta pendente pela Expedição, sem modificar eventos de trajeto.
 * A operação verifica a permissão novamente e preserva a concorrência usando
 * o procedimento atômico já existente no Supabase. */
export const editCollection = createServerFn({ method: "POST" })
  .inputValidator(editCollectionSchema)
  .handler(async ({ data }) => {
    const { requireOperatorPermission } = await import("./employees.functions");
    await requireOperatorPermission("expedicao");
    const company = (await getCatalog()).find(row => row.id === data.companyId);
    if (!company) throw new Error("Selecione uma empresa de coleta cadastrada.");
    const { logisticsClient } = await import("./logistics.server");
    const { logisticsCommitError } = await import("./logistics-commit-error");
    const db = await logisticsClient();
    // O RPC confere a contagem e o payload de TODA a fila de Entregas.
    // A consulta por id isolado gerava falsos conflitos quando havia 2+ pedidos.
    const rows: LogisticsSnapshotRow[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data: batch, error } = await db.from("deliveries")
        .select("id,payload,position").order("position").order("id")
        .range(offset, offset + 999);
      if (error) throw new Error("Não foi possível carregar a fila de Entregas para editar a coleta.");
      rows.push(...(batch ?? []));
      if (!batch || batch.length < 1000) break;
    }
    const row = rows.find(item => item.id === data.id);
    if (!row) throw new Error("Coleta não encontrada. Atualize a Expedição.");
    const payload = row.payload as Record<string, unknown>;
    if (payload.source !== "coleta") throw new Error("Este registro não é uma coleta.");
    if (payload.status !== "nao_iniciada")
      throw new Error("Coletas já iniciadas não podem ser editadas na Expedição.");
    const next = {
      ...payload,
      company: company.name,
      collectionCompanyId: company.id,
      collectionAddress: data.address,
      collectionContact: data.contact,
      value: data.value ?? 0,
      collectionValueProvided: data.value !== undefined,
      collectionTransport: data.vehicle,
      collectionPayment: data.payment,
      scheduledDate: data.scheduledDate || undefined,
      expeditionShift: data.shift ?? undefined,
    };
    const { data: saved, error: saveError } = await db.rpc(
      "commit_logistics_changes", collectionEditCommitPayload(rows, row.id, next),
    );
    if (saveError) throw logisticsCommitError("editar a coleta", saveError);
    if (saved !== true) throw new Error("A edição não foi confirmada pelo Supabase. Atualize e tente novamente.");
    return { ok: true };
  });

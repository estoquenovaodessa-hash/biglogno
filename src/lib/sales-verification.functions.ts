import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { historicalKey, parseHistoricalSales } from "./sales-import";
import { canManageSales, sellerCountKey, sellerSalesSchema, canonicalCode, clientSchema, documentPrefix, lastVerificationFields, verificationSchema, verificationDestination, verifierSchema, type SalesClient, type Verifier, type VerificationRecord } from "./sales-verification";

export const readSalesVerification = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAccess } = await import("./access.server");
  const role = await requireAccess();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: state, error } = await supabaseAdmin.from("app_state").select("key,value").in("key", ["sales-clients", "sales-verifiers", "sales-period-counts"]);
  if (error) throw new Error("Não foi possível carregar a conferência.");
  const values = Object.fromEntries((state ?? []).map(r => [r.key, r.value]));
  const { data: last, error: lastError } = await supabaseAdmin.from("sales_verification_records").select("payload").order("created_at", { ascending: false }).limit(1);
  if (lastError) throw new Error("Não foi possível carregar o último documento.");
  const lastRecord = last?.[0]?.payload as unknown as VerificationRecord | undefined;
  const records: VerificationRecord[] = [];
  if (role === "gestor") {
    for (let offset = 0; ; offset += 1000) {
      const { data, error: recordsError } = await supabaseAdmin.from("sales_verification_records").select("id,created_at,payload").order("created_at", { ascending: false }).order("id").range(offset, offset + 999);
      if (recordsError) throw new Error("Não foi possível carregar os registros.");
      records.push(...(data ?? []).map(r => ({ ...(r.payload as unknown as VerificationRecord), id: r.id, createdAt: r.created_at })));
      if (!data || data.length < 1000) break;
    }
  }
  const sellerCounts: Record<string, number> = {};
  if (role === "gestor") {
    const { data: counts, error: countsError } = await supabaseAdmin.from("app_state").select("key,value").like("key", "sales-seller-count:%");
    if (countsError) throw new Error("Não foi possível carregar as vendas por vendedor.");
    for (const row of counts ?? []) sellerCounts[row.key] = Number(row.value);
  }
  return { clients: z.array(clientSchema).parse(values["sales-clients"] ?? []), verifiers: z.array(verifierSchema).parse(values["sales-verifiers"] ?? []), records, ...lastVerificationFields(lastRecord), periodCounts: (values["sales-period-counts"] ?? {}) as Record<string, number>, sellerCounts };
});

export const replaceSalesClients = createServerFn({ method: "POST" }).inputValidator(z.array(clientSchema).min(1).max(100000)).handler(async ({ data }) => {
  const { requireAccess } = await import("./access.server");
  if (await requireAccess() !== "gestor") throw new Error("Somente o gestor pode importar clientes.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("app_state").upsert({ key: "sales-clients", value: data, updated_at: new Date().toISOString() });
  if (error) throw new Error("Não foi possível salvar a base de clientes.");
  return { count: data.length };
});

export const saveSalesVerifiers = createServerFn({ method: "POST" }).inputValidator(z.array(verifierSchema).max(1000)).handler(async ({ data }) => {
  const { requireAccess } = await import("./access.server");
  if (await requireAccess() !== "gestor") throw new Error("Somente o gestor pode cadastrar conferentes.");
  if (new Set(data.map(v => canonicalCode(v.code))).size !== data.length) throw new Error("Código de conferente já cadastrado.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("app_state").upsert({ key: "sales-verifiers", value: data, updated_at: new Date().toISOString() });
  if (error) throw new Error("Não foi possível salvar os conferentes.");
  return { ok: true };
});

export const registerSalesVerification = createServerFn({ method: "POST" }).inputValidator(verificationSchema).handler(async ({ data }) => {
  const { requireOperatorPermission } = await import("./employees.functions");
  const operator = await requireOperatorPermission("conferencia");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: state, error } = await supabaseAdmin.from("app_state").select("key,value").eq("key", "sales-clients");
  if (error) throw new Error("Não foi possível validar os cadastros.");
  const values = Object.fromEntries((state ?? []).map(r => [r.key, r.value]));
  const client = (values["sales-clients"] as unknown as SalesClient[] | undefined)?.find(c => canonicalCode(c.code) === canonicalCode(data.clientCode));
  const code = canonicalCode(data.verifierCode);
  if (!client) throw new Error("Cliente não encontrado na base importada.");
  if (code !== "101" && code !== "102") throw new Error("Selecione o setor Balcão (101) ou Expedição (102).");
  const expedition = code === "102";
  if (expedition !== (data.seller === "EXPEDIÇÃO")) throw new Error("Vendedor incompatível com o setor.");
  const { data: existing, error: dupError } = await supabaseAdmin.from("sales_verification_records").select("id").eq("payload->>document", data.document).neq("id", data.requestId).limit(1);
  if (dupError) throw new Error("Não foi possível validar o documento.");
  if (existing?.length) throw new Error(`Documento ${data.document} já foi registrado.`);
  const payload = { ...data, verifierCode: code, clientName: client.name, verifierName: operator.name, employeeId: operator.id, channel: expedition ? "expedicao" : "balcao" };
  if (data.forDelivery && !expedition) throw new Error("Somente a Expedição utiliza a opção antiga 'Para entrega'.");
  if (expedition && data.balcaoDestination) throw new Error("As opções Entrega e Retira são exclusivas do Balcão.");
  // Balcão: Entrega / Retira / nenhuma. A Expedição conserva seu fluxo atual.
  // Esta rotina do Supabase registra Conferência e eventual pedido logístico
  // na mesma transação, com o mesmo requestId (proteção contra duplicações).
  const kind = expedition
    ? (data.forDelivery ? "deliveries" : "pickups")
    : data.balcaoDestination === "entrega" ? "deliveries"
      : data.balcaoDestination === "retira" ? "pickups" : "none";
  const { error: insertError } = await supabaseAdmin.rpc("register_verification_logistics", {
    record_id: data.requestId, verification: payload,
    logistics_kind: kind, logistics: { document: data.document, company: client.name, companyCode: client.code, value: data.value, source: "conferencia", channel: expedition ? "expedicao" : "balcao", status: kind === "deliveries" ? "nao_iniciada" : "pendente" },
  });
  if (insertError) {
    // Não mostrar informações internas do banco ao operador, mas registrar
    // detalhes técnicos nos logs da Cloudflare para diagnóstico.
    console.error("[Conferência] Erro na gravação atômica", {
      code: insertError.code,
      message: insertError.message,
      details: insertError.details,
      hint: insertError.hint,
    });
    const code = insertError.code || "desconhecido";
    if (code === "PGRST202" || code === "42883") {
      throw new Error("A rotina de gravação não está disponível no Supabase. Solicite ao gestor a correção do banco.");
    }
    if (code === "42P01") {
      throw new Error("Falta uma tabela necessária no Supabase. Solicite ao gestor a correção do banco.");
    }
    if (code === "42501") {
      throw new Error("A rotina do banco está sem permissão para registrar. Solicite ao gestor a correção do banco.");
    }
    if (code === "23505" || /documento.*já foi registrado/i.test(insertError.message || "")) {
      throw new Error(`Documento ${data.document} já foi registrado. Atualize o painel antes de tentar novamente.`);
    }
    throw new Error(`Não foi possível registrar a conferência (erro ${code}). Informe esse código ao gestor.`);
  }
  return { prefix: documentPrefix(data.document) };
});

/** Busca apenas um documento na Conferência ao sair do campo numérico.
 * Não envia listas privadas inteiras ao operador, somente o próprio registro. */
export const findRegisteredVerification = createServerFn({ method: "POST" })
  .inputValidator(z.object({ document: z.string().regex(/^\d{4,20}$/) }))
  .handler(async ({ data }) => {
    const { requireOperatorPermission } = await import("./employees.functions");
    await requireOperatorPermission("conferencia");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.from("sales_verification_records")
      .select("id,payload").eq("payload->>document", data.document).limit(2);
    if (error) throw new Error("Não foi possível verificar o número do documento.");
    if (!rows?.length) return null;
    if (rows.length > 1) throw new Error("Existem registros duplicados desse documento. Solicite a análise do gestor.");
    const row = rows[0];
    const payload = row.payload as Record<string, unknown>;
    const editable = payload.source !== "csv"
      ? verificationSchema.safeParse({ ...payload, requestId: row.id }) : null;
    return {
      id: row.id,
      snapshot: JSON.stringify(payload),
      record: editable?.success ? editable.data : null,
    };
  });

/** Salva o mesmo documento sem criar nova conferência. A atualização dos
 * pedidos ligados é confirmada por uma única transação SQL, com o mesmo ID. */
export const editSalesVerification = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    snapshot: z.string().min(2).max(50000),
    record: verificationSchema,
  }))
  .handler(async ({ data }) => {
    const { requireOperatorPermission } = await import("./employees.functions");
    const operator = await requireOperatorPermission("conferencia");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let original: Record<string, unknown>;
    try {
      original = z.record(z.unknown()).parse(JSON.parse(data.snapshot));
    } catch {
      throw new Error("Os dados originais da conferência são inválidos. Reabra o documento.");
    }
    if (original.source === "csv")
      throw new Error("Esse registro foi importado do histórico e não pode ser editado pelo operador.");
    if (original.document !== data.record.document)
      throw new Error("O número do documento não pode ser alterado durante a edição.");

    const { data: state, error } = await supabaseAdmin.from("app_state")
      .select("value").eq("key", "sales-clients").maybeSingle();
    if (error) throw new Error("Não foi possível validar o cliente da conferência.");
    const clients = z.array(clientSchema).parse(state?.value ?? []);
    const client = clients.find(c => canonicalCode(c.code) === canonicalCode(data.record.clientCode));
    if (!client) throw new Error("Cliente não encontrado na base importada.");
    const code = canonicalCode(data.record.verifierCode);
    if (code !== "101" && code !== "102")
      throw new Error("Selecione o setor Balcão (101) ou Expedição (102).");
    const expedition = code === "102";
    if (expedition !== (data.record.seller === "EXPEDIÇÃO"))
      throw new Error("Vendedor incompatível com o setor.");
    if (data.record.forDelivery && !expedition)
      throw new Error("A opção 'Para entrega' é exclusiva da Expedição.");
    if (expedition && data.record.balcaoDestination)
      throw new Error("As opções Entrega e Retira são exclusivas do Balcão.");

    const next = {
      ...original,
      // Evita manter motivos antigos quando a conferência passa de Errado a Certo.
      errorReason: undefined,
      errorReasons: undefined,
      balcaoDestination: undefined,
      forDelivery: undefined,
      ...data.record,
      verifierCode: code,
      clientName: client.name,
      verifierName: operator.name,
      employeeId: operator.id,
      channel: expedition ? "expedicao" : "balcao",
      updatedAt: new Date().toISOString(),
      updatedBy: operator.name,
    };
    const previousChoice = verificationDestination({
      verifierCode: String(original.verifierCode ?? ""),
      forDelivery: original.forDelivery === true,
      balcaoDestination: original.balcaoDestination === "entrega" || original.balcaoDestination === "retira"
        ? original.balcaoDestination : undefined,
    });
    const chosenKind = verificationDestination(data.record);
    // Se o funcionário não mudou o destino, não desfaz movimentações feitas
    // posteriormente pela Expedição (ex.: Retira já transferida para Entrega).
    const kind = chosenKind === previousChoice ? "keep" : chosenKind;
    const logistics = {
      document: data.record.document,
      company: client.name,
      companyCode: client.code,
      value: data.record.value,
      source: "conferencia", channel: expedition ? "expedicao" : "balcao",
      status: chosenKind === "deliveries" ? "nao_iniciada" : "pendente",
    };
    const { data: saved, error: updateError } = await supabaseAdmin.rpc("edit_verification_logistics", {
      p_record_id: data.record.requestId,
      p_expected_verification: original as never,
      p_verification: JSON.parse(JSON.stringify(next)),
      p_logistics_kind: kind,
      p_logistics: logistics,
    });
    if (updateError) {
      console.error("[Conferência] Falha na edição vinculada", {
        code: updateError.code, message: updateError.message, details: updateError.details,
      });
      const msg = updateError.message || "";
      if (updateError.code === "PGRST202" || updateError.code === "42883")
        throw new Error("A rotina SQL de edição da Conferência não está instalada. Execute sql/2026-10-28-editar-conferencia-documento.sql no Supabase.");
      if (msg.includes("CONFERENCIA_MODIFICADA"))
        throw new Error("Esse registro mudou desde que foi aberto. Atualize a Conferência e tente novamente.");
      if (msg.includes("CONFERENCIA_OPERACAO_INICIADA"))
        throw new Error("A nota já iniciou uma Entrega ou Retira. Não é possível modificar os dados operacionais.");
      if (msg.includes("CONFERENCIA_DOCUMENTO_DUPLICADO"))
        throw new Error("Já existe outra conferência com este número de documento.");
      if (msg.includes("CONFERENCIA_NAO_ENCONTRADA"))
        throw new Error("Documento não encontrado. Atualize a Conferência.");
      if (msg.includes("CONFERENCIA_IMPORTADA"))
        throw new Error("Este registro foi importado do histórico e não pode ser editado aqui.");
      throw new Error(`Não foi possível salvar a conferência (erro ${updateError.code || "desconhecido"}). Nenhuma alteração foi confirmada.`);
    }
    if (saved !== true) throw new Error("O Supabase não confirmou a edição da Conferência.");
    return { prefix: documentPrefix(data.record.document) };
  });

export const saveSalesPeriodCount = createServerFn({ method: "POST" }).inputValidator(z.object({ period: z.string().regex(/^(all|\d{4}-\d{2}(?:-\d{2})?)$/), count: z.number().int().min(0).max(100000000) })).handler(async ({ data }) => {
  const { requireAccess } = await import("./access.server");
  if (await requireAccess() !== "gestor") throw new Error("Sem permissão.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: state, error: readError } = await supabaseAdmin.from("app_state").select("value").eq("key", "sales-period-counts").maybeSingle();
  if (readError) throw new Error("Não foi possível carregar as vendas.");
  const counts = (state?.value ?? {}) as Record<string, number>;
  const { error } = await supabaseAdmin.from("app_state").upsert({ key: "sales-period-counts", value: { ...counts, [data.period]: data.count }, updated_at: new Date().toISOString() });
  if (error) throw new Error("Não foi possível salvar as vendas do período.");
  return { ok: true };
});

export const deleteSalesVerification = createServerFn({ method: "POST" }).inputValidator(z.object({ id: z.string().uuid() })).handler(async ({ data }) => {
  const { requireAccess } = await import("./access.server");
  if (!canManageSales(await requireAccess())) throw new Error("Somente o gestor pode excluir conferências.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Exclui a conferência e sua retirada/entrega de forma atômica no Supabase.
  // Nunca apagar em duas requisições separadas: isso deixaria registros órfãos em caso de falha.
  const { data: outcome, error } = await supabaseAdmin.rpc("delete_verification_logistics", {
    record_id: data.id,
  });
  if (error) {
    console.error("[Conferência] Falha na exclusão vinculada", {
      code: error.code, message: error.message, details: error.details,
    });
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("A rotina de exclusão vinculada ainda não foi instalada no Supabase. Execute o SQL da atualização.");
    }
    throw new Error("Não foi possível excluir a conferência e o pedido vinculado. Nenhuma exclusão foi confirmada.");
  }
  const result = outcome as { pickupsDeleted?: number; deliveriesDeleted?: number } | null;
  return {
    ok: true,
    pickupsDeleted: result?.pickupsDeleted ?? 0,
    deliveriesDeleted: result?.deliveriesDeleted ?? 0,
  };
});

export const saveSellerSalesCount = createServerFn({ method: "POST" }).inputValidator(sellerSalesSchema).handler(async ({ data }) => {
  const { requireAccess } = await import("./access.server");
  if (!canManageSales(await requireAccess())) throw new Error("Somente o gestor pode informar vendas.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("app_state").upsert({ key: sellerCountKey(data.period, data.seller), value: data.count, updated_at: new Date().toISOString() });
  if (error) throw new Error("Não foi possível salvar as vendas do vendedor.");
  return { ok: true };
});

export const importHistoricalSales = createServerFn({ method: "POST" }).inputValidator(z.object({ text: z.string().min(1).max(10000000) })).handler(async ({ data }) => {
  const { requireAccess } = await import("./access.server");
  if (!canManageSales(await requireAccess())) throw new Error("Somente o gestor pode importar conferências.");
  const parsed = parseHistoricalSales(data.text);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const existing = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data: rows, error } = await supabaseAdmin.from("sales_verification_records").select("payload").order("id").range(offset, offset + 999);
    if (error) throw new Error("Não foi possível verificar registros já importados.");
    for (const row of rows ?? []) existing.add(historicalKey(row.payload as unknown as VerificationRecord));
    if (!rows || rows.length < 1000) break;
  }
  const fresh = parsed.records.filter(r => !existing.has(historicalKey(r)));
  let imported = 0;
  for (let offset = 0; offset < fresh.length; offset += 250) {
    const batch = await Promise.all(fresh.slice(offset, offset + 250).map(async record => {
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`bignotto:sales-csv:${historicalKey(record)}`)));
      digest[6] = (digest[6] & 15) | 80; digest[8] = (digest[8] & 63) | 128;
      const hex = [...digest.slice(0, 16)].map(b => b.toString(16).padStart(2, "0")).join("");
      const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      return { id, created_at: record.createdAt, payload: { ...record, requestId: id } };
    }));
    const { data: inserted, error } = await supabaseAdmin.from("sales_verification_records").upsert(batch, { onConflict: "id", ignoreDuplicates: true }).select("id");
    if (error) throw new Error(`${imported} registros importados antes da falha. Tente novamente com o mesmo arquivo; os já salvos não serão duplicados.`);
    imported += inserted?.length ?? 0;
  }
  return { imported, skipped: parsed.records.length + parsed.duplicates - imported };
});
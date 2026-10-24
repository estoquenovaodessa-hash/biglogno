import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chatCommandSchema, parseChatCommand, type ItemOccurrence } from "./item-chat";

async function chatDb(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // A migração SQL do chat ainda não integra os tipos gerados do Supabase.
  return supabaseAdmin as unknown as SupabaseClient;
}
function handleChatError(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === "42P01" || /item_chat_occurrences/i.test(error.message)) {
    throw new Error("O Chat precisa da migração SQL. Solicite ao gestor a execução no Supabase.");
  }
  if (error.code === "PGRST202" || error.code === "42883") {
    throw new Error("A rotina de resolução do Chat ainda não foi instalada no Supabase.");
  }
  console.error("[Chat de ocorrências]", error.code, error.message);
  throw new Error("Não foi possível atualizar o Chat. Tente novamente.");
}

export const listItemOccurrences = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAccess } = await import("./access.server");
  await requireAccess();
  const db = await chatDb();
  const { data, error } = await db.from("item_chat_occurrences")
    .select("id,codigo,descricao,endereco,motivo,criado_por_id,criado_por_nome,criado_em,resolvido_por_id,resolvido_por_nome,resolvido_em")
    .order("criado_em", { ascending: false }).limit(300);
  handleChatError(error);
  return (data ?? []) as ItemOccurrence[];
});

export const createItemOccurrence = createServerFn({ method: "POST" })
  .inputValidator(z.object({ command: chatCommandSchema }))
  .handler(async ({ data }) => {
    const { requireSelectedOperator } = await import("./employees.functions");
    const employee = await requireSelectedOperator();
    const { codigo, motivo } = parseChatCommand(data.command);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current, error: baseError } = await supabaseAdmin.from("app_state")
      .select("value").eq("key", "endereco-base").maybeSingle();
    if (baseError) throw new Error("Não foi possível conferir a base de itens.");
    const root = current?.value as { registros?: Record<string, { codigo?: string; descricao?: string; endereco?: string }> } | null;
    const registros = root?.registros ?? {};
    const short = String(Number(codigo));
    const item = registros[codigo] ?? registros[short] ??
      Object.values(registros).find(r => String(r.codigo ?? "").padStart(5, "0") === codigo);
    if (!item || !item.descricao?.trim()) {
      throw new Error(`O código ${codigo} não foi encontrado na base de endereçamento. Confira o código e a importação.`);
    }
    const db = await chatDb();
    const { error } = await db.from("item_chat_occurrences").insert({
      codigo, descricao: item.descricao.trim(), endereco: String(item.endereco ?? "").trim(),
      motivo, criado_por_id: employee.id, criado_por_nome: employee.name,
    });
    handleChatError(error);
    return { ok: true, codigo };
  });

export const resolveItemOccurrence = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { requireSelectedOperator } = await import("./employees.functions");
    const employee = await requireSelectedOperator();
    const db = await chatDb();
    const { data: resolved, error } = await db.rpc("resolve_item_chat_occurrence", {
      occurrence_id: data.id, resolver_id: employee.id, resolver_name: employee.name,
    });
    handleChatError(error);
    if (resolved !== true) throw new Error("Esta ocorrência já foi resolvida. Atualize o Chat.");
    return { ok: true };
  });

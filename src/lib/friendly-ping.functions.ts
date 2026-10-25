import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Employee } from "./employees";

const areaSchema = z.enum(["Contagem", "Conferência", "Entregas", "Fora"]);
const operationAreaSchema = z.enum(["Contagem", "Conferência", "Entregas"]);
const clientSchema = z.string().uuid();

export type FriendlyEvent = {
  id: string;
  kind: "peek" | "ping";
  area: "Contagem" | "Conferência" | "Entregas";
  actor_name: string;
  from_client_id: string;
  target_client_id: string;
  source_event_id: string | null;
  created_at: string;
};

async function getDb(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}
function dbError(error: { message: string; code?: string } | null, message: string): void {
  if (!error) return;
  if (["42P01", "PGRST205"].includes(error.code ?? "") || /friendly_presence|friendly_events/i.test(error.message)) {
    throw new Error("A interação Gestor ↔ Operador precisa do SQL de pings instalado no Supabase.");
  }
  console.error("[Friendly ping]", error.code, error.message);
  throw new Error(message);
}
async function who(): Promise<{ role: "gestor" | "operador"; employee: Employee }> {
  const { requireAccess, accessSession } = await import("./access.server");
  const role = await requireAccess();
  const session = await accessSession();
  if (!session.data.employeeId) throw new Error("Selecione seu perfil de funcionário para usar as mensagens.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("app_state")
    .select("value").eq("key", "employees").maybeSingle();
  if (error) throw new Error("Não foi possível identificar o perfil conectado.");
  const employees = (data?.value ?? []) as unknown as Employee[];
  const employee = employees.find(e => e.id === session.data.employeeId && e.active);
  if (!employee || (role === "gestor" && employee.role !== "GESTOR")) {
    throw new Error("Perfil indisponível. Selecione novamente.");
  }
  return { role, employee };
}
async function validatePresence(clientId: string) {
  const user = await who();
  const db = await getDb();
  const { data, error } = await db.from("friendly_presence")
    .select("client_id,role,employee_id,display_name,area,last_seen")
    .eq("client_id", clientId).maybeSingle();
  dbError(error, "Não foi possível verificar a presença na operação.");
  if (!data || data.role !== user.role || data.employee_id !== user.employee.id
    || Date.parse(data.last_seen) < Date.now() - 35000) {
    throw new Error("A conexão com a operação expirou. Abra a tela novamente.");
  }
  return { db, user, presence: data };
}

// Leve: um heartbeat a cada 8 s por tela conectada.
// A aba do gestor não se faz passar por uma aba do operador.
export const updateFriendlyPresence = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clientId: clientSchema, area: areaSchema }))
  .handler(async ({ data }) => {
    const { role, employee } = await who();
    const db = await getDb();
    const { error } = await db.from("friendly_presence").upsert({
      client_id: data.clientId, role, employee_id: employee.id,
      display_name: employee.name, area: data.area, last_seen: new Date().toISOString(),
    }, { onConflict: "client_id" });
    dbError(error, "Não foi possível conectar os avisos divertidos.");
    return { ok: true };
  });

export const announceManagerVisit = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clientId: clientSchema, area: operationAreaSchema }))
  .handler(async ({ data }) => {
    const { db, user, presence } = await validatePresence(data.clientId);
    if (user.role !== "gestor" || presence.area !== data.area) {
      throw new Error("Somente o gestor conectado à aba pode enviar este aviso.");
    }
    const cutoff = new Date(Date.now() - 25000).toISOString();
    const { data: operators, error } = await db.from("friendly_presence")
      .select("client_id").eq("role", "operador").eq("area", data.area).gte("last_seen", cutoff);
    dbError(error, "Não foi possível identificar operadores nesta tela.");
    if (!operators?.length) return { sent: 0 };
    // Cada tela conectada recebe somente um aviso dessa visita.
    const { error: insertError } = await db.from("friendly_events").insert(operators.map(p => ({
      kind: "peek", area: data.area, actor_name: user.employee.name,
      from_client_id: data.clientId, target_client_id: p.client_id,
    })));
    dbError(insertError, "Não foi possível avisar os operadores.");
    return { sent: operators.length };
  });

export const readFriendlyEvents = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clientId: clientSchema, after: z.string().datetime() }))
  .handler(async ({ data }) => {
    const { db } = await validatePresence(data.clientId);
    // Evita leitura de eventos antigos ao reabrir o painel.
    const cutoff = new Date(Math.max(Date.now() - 60000, Date.parse(data.after))).toISOString();
    const { data: events, error } = await db.from("friendly_events")
      .select("id,kind,area,actor_name,from_client_id,target_client_id,source_event_id,created_at")
      .eq("target_client_id", data.clientId)
      .gte("created_at", cutoff).order("created_at", { ascending: true }).limit(60);
    dbError(error, "Não foi possível consultar os avisos.");
    return (events ?? []) as FriendlyEvent[];
  });

export const sendFriendlyPing = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clientId: clientSchema, sourceEventId: clientSchema }))
  .handler(async ({ data }) => {
    const { db, user, presence } = await validatePresence(data.clientId);
    if (user.role !== "operador") throw new Error("Somente o operador pode responder com um ping.");
    const { data: event, error } = await db.from("friendly_events")
      .select("id,kind,area,from_client_id,target_client_id,created_at")
      .eq("id", data.sourceEventId).eq("target_client_id", data.clientId).maybeSingle();
    dbError(error, "Não foi possível encontrar o aviso do gestor.");
    if (!event || event.kind !== "peek" || event.area !== presence.area
      || Date.parse(event.created_at) < Date.now() - 30000) {
      throw new Error("Esse aviso já expirou. Aguarde a próxima visita do gestor.");
    }
    const { data: manager, error: managerError } = await db.from("friendly_presence")
      .select("client_id,role,last_seen").eq("client_id", event.from_client_id).maybeSingle();
    dbError(managerError, "Não foi possível localizar o gestor.");
    if (!manager || manager.role !== "gestor" || Date.parse(manager.last_seen) < Date.now() - 35000) {
      throw new Error("O gestor saiu da tela. O ping não foi enviado.");
    }
    const { error: insertError } = await db.from("friendly_events").insert({
      kind: "ping", area: event.area, actor_name: user.employee.name,
      from_client_id: data.clientId, target_client_id: event.from_client_id,
      source_event_id: event.id,
    });
    if (insertError?.code === "23505") throw new Error("Você já mandou ping para essa visita.");
    dbError(insertError, "Não foi possível enviar o ping.");
    return { ok: true };
  });

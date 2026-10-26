import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { employeeListSchema, type Employee } from "./employees";

async function fetchEmployees(): Promise<Employee[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("app_state").select("value").eq("key", "employees").maybeSingle();
  if (error) throw new Error("Não foi possível consultar os funcionários.");
  return employeeListSchema.parse(data?.value ?? []);
}

export const listEmployees = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAccess } = await import("./access.server");
  const role = await requireAccess();
  const list = await fetchEmployees();
  // Operadores somente veem perfis elegíveis à escolha; gestores veem todos.
  return role === "gestor" ? list : list.filter(e => e.active);
});

export const saveEmployees = createServerFn({ method: "POST" }).inputValidator(employeeListSchema)
  .handler(async ({ data }) => {
    const { requireAccess } = await import("./access.server");
    if (await requireAccess() !== "gestor") throw new Error("Somente o gestor pode cadastrar funcionários.");
    if (new Set(data.map(e => e.id)).size !== data.length) throw new Error("Há funcionários com IDs duplicados.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_state").upsert({
      key: "employees", value: data, updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
    if (error) throw new Error("Não foi possível salvar os funcionários.");
    return { count: data.length };
  });

export const currentEmployee = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAccess, accessSession } = await import("./access.server");
  const role = await requireAccess();
  const session = await accessSession();
  const id = session.data.employeeId;
  if (!id) return null;
  const list = await fetchEmployees();
  const employee = list.find(e => e.id === id && e.active);
  return employee && (role === "operador" || employee.role === "GESTOR") ? employee : null;
});

export const selectEmployee = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { requireAccess, accessSession } = await import("./access.server");
    const role = await requireAccess();
    const list = await fetchEmployees();
    const selected = list.find(e => e.id === data.id && e.active && (role === "operador" || e.role === "GESTOR"));
    if (!selected) throw new Error("Perfil indisponível para este tipo de acesso.");
    const session = await accessSession();
    await session.update({ ...session.data, employeeId: selected.id });
    return selected;
  });

export const clearSelectedEmployee = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAccess, accessSession } = await import("./access.server");
  await requireAccess();
  const session = await accessSession();
  await session.update({ ...session.data, employeeId: undefined });
  return { ok: true };
});

// Resolução segura no servidor: o cliente não informa o nome para atribuição.
export async function requireSelectedOperator(): Promise<Employee> {
  const { requireAccess, accessSession } = await import("./access.server");
  if (await requireAccess() !== "operador") throw new Error("Ação permitida somente ao operador.");
  const session = await accessSession();
  const id = session.data.employeeId;
  if (!id) throw new Error("Selecione seu perfil de funcionário antes de operar.");
  const employee = (await fetchEmployees()).find(e => e.id === id && e.active && (e.role === "OPERADOR" || e.role === "GESTOR"));
  if (!employee) throw new Error("Perfil de funcionário indisponível. Selecione novamente.");
  return employee;
}

// Exclusão exclusiva do gestor: preserva nomes já gravados nas ocorrências, entregas e conferências.
export const deleteEmployee = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { requireAccess } = await import("./access.server");
    if (await requireAccess() !== "gestor") throw new Error("Somente o gestor pode excluir funcionários.");
    const current = await fetchEmployees();
    if (!current.some(e => e.id === data.id)) throw new Error("Funcionário não encontrado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_state").upsert({
      key: "employees", value: current.filter(e => e.id !== data.id), updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
    if (error) throw new Error("Não foi possível excluir o funcionário.");
    return { ok: true };
  });

// Permissão especial da Central de Expedição.
// Valida no servidor o ID de sessão contra o cadastro ativo de Cauê.
// Se houver cadastros homônimos, falha fechado em vez de conceder a todos.
// O login por senha compartilhada + escolha de perfil NÃO equivale
// a autenticação pessoal; essa limitação é esclarecida ao gestor.
function isCaue(name: string) {
  const normalized = name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  return /^caue(?:\s|$)/.test(normalized);
}

async function selectedExpeditionTransferOperator() {
  const { requireAccess, accessSession } = await import('./access.server');
  if (await requireAccess() !== 'operador') return null;
  const session = await accessSession();
  const selectedId = session.data.employeeId;
  if (!selectedId) return null;
  const employees = await fetchEmployees();
  const eligible = employees.filter(e => e.active && e.role === 'OPERADOR' && isCaue(e.name));
  if (eligible.length !== 1 || eligible[0].id !== selectedId) return null;
  return eligible[0];
}

export const canTransferExpedition = createServerFn({ method: 'GET' }).handler(async () => {
  return { allowed: !!(await selectedExpeditionTransferOperator()) };
});

export async function requireExpeditionTransferOperator(): Promise<Employee> {
  const employee = await selectedExpeditionTransferOperator();
  if (!employee) throw new Error('Somente o perfil do Cauê pode transferir pedidos entre Entregas e Retiras.');
  return employee;
}

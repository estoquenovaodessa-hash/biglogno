import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { effectiveEmployeePermissions, employeeListSchema, type Employee, type EmployeePermission } from "./employees";

async function fetchEmployees(): Promise<Employee[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("app_state").select("value").eq("key", "employees").maybeSingle();
  if (error) throw new Error("Não foi possível consultar os funcionários.");
  return employeeListSchema.parse(data?.value ?? []);
}

/** Cauê auxilia o motorista Luciano; não deve gerar uma segunda rota.
 * Esta resolução acontece no servidor, a partir do perfil autenticado.
 * As permissões continuam as do funcionário que clicou no botão. */
export async function deliveryResponsibleForOperator(actor: Employee): Promise<Employee> {
  const { isCaue, findLucianoDriver } = await import("./delivery-accountability");
  if (!isCaue(actor.name)) return actor;
  const luciano = findLucianoDriver(await fetchEmployees());
  if (!luciano) {
    throw new Error("Não foi possível identificar um único Luciano ativo com emblema ENTREGADOR. Confira o Cadastro de Funcionários.");
  }
  return luciano;
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

// Direitos agora são configuráveis individualmente pelo gestor, sem regras de nomes.
// O cargo role continua sendo apenas a credencial de acesso ao ambiente.
export async function requireOperatorPermission(permission: EmployeePermission): Promise<Employee> {
  const employee = await requireSelectedOperator();
  if (!effectiveEmployeePermissions(employee)[permission]) {
    const areas: Record<EmployeePermission, string> = {
      expedicao: "transferir pedidos na Expedição",
      entregas: "operar os botões de Entregas",
      contagem: "operar os botões de Contagem",
      conferencia: "operar os botões de Conferência",
    };
    throw new Error(`O seu perfil não tem permissão para ${areas[permission]}.`);
  }
  return employee;
}

export const currentOperatorPermissions = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAccess } = await import("./access.server");
  const role = await requireAccess();
  if (role !== "operador") {
    return { expedicao: true, entregas: true, contagem: true, conferencia: true };
  }
  const employee = await requireSelectedOperator();
  return effectiveEmployeePermissions(employee);
});

export const canTransferExpedition = createServerFn({ method: 'GET' }).handler(async () => {
  const { requireAccess } = await import('./access.server');
  if (await requireAccess() !== 'operador') return { allowed: false };
  try {
    const employee = await requireSelectedOperator();
    return { allowed: effectiveEmployeePermissions(employee).expedicao };
  } catch {
    return { allowed: false };
  }
});

export async function requireExpeditionTransferOperator(): Promise<Employee> {
  return requireOperatorPermission("expedicao");
}

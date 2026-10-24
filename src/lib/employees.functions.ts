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
  return role === "gestor" ? list : list.filter(e => e.active && e.role === "OPERADOR");
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
  return employee && employee.role.toLowerCase() === role ? employee : null;
});

export const selectEmployee = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { requireAccess, accessSession } = await import("./access.server");
    const role = await requireAccess();
    const list = await fetchEmployees();
    const selected = list.find(e => e.id === data.id && e.active && e.role.toLowerCase() === role);
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
  const employee = (await fetchEmployees()).find(e => e.id === id && e.active && e.role === "OPERADOR");
  if (!employee) throw new Error("Perfil de funcionário indisponível. Selecione novamente.");
  return employee;
}

import type { Delivery } from "./deliveries";
import type { Employee } from "./employees";

/** Vinculação operacional definida pela empresa: Cauê apoia Luciano,
 * mas não é um terceiro motorista nas entregas e nos indicadores gerenciais.
 * Usar primeiro nome inteiro evita colidir "Luciana", "Marcelino" etc. */
export function firstEmployeeName(value?: string | null): string {
  return (value ?? "").trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")
    .split(/\s+/)[0] ?? "";
}
export const isCaue = (value?: string | null) => firstEmployeeName(value) === "caue";
export const isLuciano = (value?: string | null) => firstEmployeeName(value) === "luciano";
export const isMarcelo = (value?: string | null) => firstEmployeeName(value) === "marcelo";

/** A atribuição ocorre pelo cadastro real do funcionário Luciano.
 * Retorna erro se houver nomes ambíguos ou se Luciano estiver inativo,
 * em vez de atribuir pedidos a uma pessoa errada. */
export function findLucianoDriver(employees: Employee[]): Employee | null {
  const candidates = employees.filter(e =>
    e.active && e.badge === "ENTREGADOR" && isLuciano(e.name));
  return candidates.length === 1 ? candidates[0] : null;
}

/** Crédito visível da entrega, inclusive na Expedição e na tela do operador.
 * Não altera o nome de quem realizou a ação, preservado em campos de auditoria. */
export function deliveryResponsibleName(row: Pick<Delivery, "driver">): string {
  return isCaue(row.driver) ? "Luciano" : row.driver ?? "";
}

/** Reconciliação apenas para exibição/relatórios de entregas antigas, quando
 * o pedido foi iniciado em nome de Cauê. Não altera registro do Supabase nem
 * modifica a contagem de notas. Outras identidades continuam intactas. */
export function consolidateCaueDeliveries(
  records: Delivery[],
  employees: Employee[],
): Delivery[] {
  const luciano = findLucianoDriver(employees);
  const caueIds = new Set(employees.filter(e => isCaue(e.name)).map(e => e.id));
  return records.map(row => {
    const isCaueRecord = (row.driverEmployeeId && caueIds.has(row.driverEmployeeId))
      || isCaue(row.driver);
    if (isCaueRecord) return {
      ...row,
      driver: luciano?.name ?? "Luciano",
      driverEmployeeId: luciano?.id ?? undefined,
    };
    // Notas antigas do próprio Luciano nem sempre têm driverEmployeeId.
    // Completar a referência na VISÃO evita criar uma segunda rota por nome.
    if (luciano && !row.driverEmployeeId && isLuciano(row.driver)) return {
      ...row, driver: luciano.name, driverEmployeeId: luciano.id,
    };
    return row;
  });
}

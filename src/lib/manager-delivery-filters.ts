import type { Delivery } from "./deliveries";
import type { Employee } from "./employees";
import { expeditionLocalDay } from "./expedition-history";
import { isCaue, isLuciano } from "./delivery-accountability";

export type ManagerDeliveryPeriod = "all" | "today" | "7d" | "month" | "previous";

/** A data do pedido na consulta gerencial corresponde à sua etapa mais recente.
 * Finalizadas: conclusão; em rota/no destino: início ou chegada;
 * não iniciadas: data da coleta agendada ou criação da nota.
 * Assim, uma entrega criada ontem e finalizada hoje aparece em "Hoje". */
export function managerDeliveryDay(record: Delivery): string {
  if (record.status === "finalizada") {
    return expeditionLocalDay(record.finishedAt || record.arrivedAt || record.startedAt || record.createdAt);
  }
  // A virada automática também aparece no filtro "Hoje" do gestor.
  if (record.status !== "finalizada" && record.expeditionShiftDate)
    return record.source === "coleta" && record.scheduledDate ? record.scheduledDate : record.expeditionShiftDate;
  if (record.status === "no_destino") {
    return expeditionLocalDay(record.arrivedAt || record.startedAt || record.createdAt);
  }
  if (record.status === "em_rota" || record.status === "pausada") {
    return expeditionLocalDay(record.startedAt || record.createdAt);
  }
  return (record.source === "coleta" && record.scheduledDate)
    ? record.scheduledDate
    : expeditionLocalDay(record.createdAt);
}

export function managerDeliveryInPeriod(record: Delivery, period: ManagerDeliveryPeriod, now: Date): boolean {
  if (period === "all") return true;
  const day = managerDeliveryDay(record);
  const today = expeditionLocalDay(now.toISOString());
  if (!day || !today) return false;
  if (period === "today") return day === today;
  if (period === "month") return day.slice(0, 7) === today.slice(0, 7);
  if (period === "previous") {
    const startOfMonth = new Date(today.slice(0, 7) + "-01T12:00:00Z");
    startOfMonth.setUTCMonth(startOfMonth.getUTCMonth() - 1);
    return day.slice(0, 7) === startOfMonth.toISOString().slice(0, 7);
  }
  // Últimos 7 dias civis em São Paulo, incluindo hoje.
  const start = new Date(today + "T12:00:00Z");
  start.setUTCDate(start.getUTCDate() - 6);
  return day >= start.toISOString().slice(0, 10) && day <= today;
}

export function managerDeliveryDrivers(employees: Employee[]): Employee[] {
  // Cauê é apoio do Luciano, não um segundo motorista nos relatórios.
  // Se o perfil Luciano ainda não existir, não esconder Cauê silenciosamente.
  const hasLuciano = employees.some(e => e.badge === "ENTREGADOR" && isLuciano(e.name));
  return employees.filter(employee => employee.badge === "ENTREGADOR"
    && !(hasLuciano && isCaue(employee.name)))
    .slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id));
}

export function managerMatchesDriver(delivery: Delivery, selectedId: string, employees: Employee[]): boolean {
  if (selectedId === "all") return true;
  const chosen = employees.find(employee => employee.id === selectedId && employee.badge === "ENTREGADOR");
  if (!chosen) return false;
  const caueIds = new Set(employees.filter(employee => isCaue(employee.name)).map(employee => employee.id));
  const caueDelivery = (delivery.driverEmployeeId && caueIds.has(delivery.driverEmployeeId))
    || isCaue(delivery.driver);
  // O histórico de Cauê pertence ao motorista Luciano, inclusive pedidos
  // antigos que tenham apenas um ID ou nome, sem duplicar a seleção.
  if (caueDelivery) return isLuciano(chosen.name);
  if (delivery.driverEmployeeId) return delivery.driverEmployeeId === chosen.id;
  // Registros históricos anteriores à gravação de driverEmployeeId: buscar por nome.
  const normalize = (s: string) => s.trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
  return normalize(delivery.driver ?? "") === normalize(chosen.name);
}

import type { Delivery } from "./deliveries";
import type { Pickup } from "./pickups";

/** Converte datas registradas em UTC no dia civil de São Paulo (sem usar o
 * fuso do aparelho do usuário, evitando deslocamento na meia-noite). */
export function expeditionLocalDay(value?: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return get("year") + "-" + get("month") + "-" + get("day");
}

export function expeditionDateTime(value?: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
  }).format(new Date(value));
}

export type ExpeditionDateRange = { from: string; to: string };
export function expeditionWithinPeriod(finishedAt: string | undefined, range: ExpeditionDateRange): boolean {
  if (!range.from && !range.to) return true;
  const day = expeditionLocalDay(finishedAt);
  if (!day) return false;
  return (!range.from || day >= range.from) && (!range.to || day <= range.to);
}

const byFinishedDesc = (a: { finishedAt?: string; createdAt: string; id: string }, b: { finishedAt?: string; createdAt: string; id: string }) =>
  (b.finishedAt || "").localeCompare(a.finishedAt || "")
  || b.createdAt.localeCompare(a.createdAt)
  || a.id.localeCompare(b.id);

export function completedDeliveryHistory(records: Delivery[], range: ExpeditionDateRange): Delivery[] {
  return records.filter(item => item.source !== "coleta" && item.status === "finalizada" && expeditionWithinPeriod(item.finishedAt, range))
    .slice().sort(byFinishedDesc);
}

/** Grid operacional mostra somente pendências. Concluídos ficam no histórico "Retirados". */
export function pendingExpeditionPickups(records: Pickup[]): Pickup[] {
  return records.filter(item => item.status === "pendente")
    .slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function completedPickupHistory(records: Pickup[], range: ExpeditionDateRange): Pickup[] {
  return records.filter(item => item.status === "finalizada" && expeditionWithinPeriod(item.finishedAt, range))
    .slice().sort(byFinishedDesc);
}

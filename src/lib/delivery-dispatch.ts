import type { Delivery } from "./deliveries";
import { firstEmployeeName } from "./delivery-accountability";

export type ExpeditionVehicle = "moto" | "carro";
export const assignedDriverForVehicle = (vehicle?: ExpeditionVehicle | null): string | null =>
  vehicle === "moto" ? "Marcelo" : vehicle === "carro" ? "Luciano" : null;

export const vehicleForDelivery = (record: Pick<Delivery, "source" | "collectionTransport" | "expeditionVehicle">): ExpeditionVehicle | null =>
  record.source === "coleta"
    ? record.collectionTransport ?? record.expeditionVehicle ?? null
    : record.expeditionVehicle ?? null;

export function canSeeInMyDeliveries(
  record: Pick<Delivery, "source" | "collectionTransport" | "expeditionVehicle">,
  operatorName?: string | null,
): boolean {
  const name = firstEmployeeName(operatorName);
  const vehicle = vehicleForDelivery(record);
  return (name === "marcelo" && vehicle === "moto") ||
    ((name === "luciano" || name === "caue") && vehicle === "carro");
}

export function deliveryCompanyIdentity(record: Pick<Delivery, "company" | "companyCode">): string {
  const code = record.companyCode?.trim().replace(/^0+(?=\d)/, "") ?? "";
  if (code) return "code:" + code;
  return "name:" + record.company.trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("pt-BR").replace(/\s+/g, " ");
}

export const EXPEDITION_CLIENT_COLORS = [
  "#f87171", "#4ade80", "#c084fc", "#60a5fa", "#fbbf24", "#2dd4bf",
] as const;

export function clientAccent(identity: string): string {
  let sum = 0;
  for (const char of identity) sum = (sum * 31 + char.codePointAt(0)!) >>> 0;
  return EXPEDITION_CLIENT_COLORS[sum % EXPEDITION_CLIENT_COLORS.length];
}

/** Turno derivado da conclusão, sem depender de seleção manual por Expedição.
 * 07:00–12:00 manhã; 12:30–17:30 tarde; fora: indefinido. */
export function shiftFromCompletion(finishedAt?: string): "manha" | "tarde" | "indefinido" {
  if (!finishedAt || !Number.isFinite(Date.parse(finishedAt))) return "indefinido";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(finishedAt));
  const num = (type: string) => Number(parts.find(part => part.type === type)?.value ?? -1);
  const minute = num("hour") * 60 + num("minute");
  if (minute >= 7 * 60 && minute <= 12 * 60) return "manha";
  if (minute >= 12 * 60 + 30 && minute <= 17 * 60 + 30) return "tarde";
  return "indefinido";
}

import { salesDay, shiftSalesDay } from "./sales-weekly";

/** Filtros rápidos pelo dia civil de São Paulo, inclusive na virada de mês. */
export function conferencePeriodKey(period: string, now: Date): string {
  const today = salesDay(now);
  if (period === "today") return today;
  if (period === "yesterday") return shiftSalesDay(today, -1);
  if (period === "dayBeforeYesterday") return shiftSalesDay(today, -2);
  return period; // all, YYYY-MM ou YYYY-MM-DD
}

/** Mesmo período aplicado aos indicadores, relatórios, tabelas e PDF. */
export function conferencePeriodContains(createdAt: string, key: string): boolean {
  if (key === "all") return true;
  return !!createdAt && Number.isFinite(Date.parse(createdAt)) && salesDay(createdAt).startsWith(key);
}

export function conferencePeriodLabel(period: string): string {
  if (period === "all") return "Todo o período";
  if (period === "today") return "Hoje";
  if (period === "yesterday") return "Ontem";
  if (period === "dayBeforeYesterday") return "Anteontem";
  return new Date(period + "-02T12:00:00Z").toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo", month: "long", year: "numeric",
  });
}
export function conferenceMonthOptions(now: Date) {
  const current = salesDay(now).slice(0, 7);
  return { current, previous: shiftSalesDay(current + "-01", -1).slice(0, 7) };
}

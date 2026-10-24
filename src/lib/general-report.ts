import type { Ciclo } from "./ciclos";
import type { VerificationRecord } from "./sales-verification";
import type { Delivery } from "./deliveries";
import type { Pickup } from "./pickups";
import { salesDay } from "./sales-weekly";

export type IndicatorKey =
  | "accuracy" | "cycles" | "recounts" | "checks" | "checkAccuracy" | "deliveries" | "pickups";

export type GeneralIndicator = {
  key: IndicatorKey;
  title: string;
  detail: string;
  unit: "count" | "percent";
  current: number | null;
  previous: number | null;
  difference: number | null;
  percentChange: number | null;
  direction: "up" | "down" | "equal" | "unavailable";
};
export type GeneralReport = {
  weekStart: string;
  weekEnd: string;
  priorStart: string;
  priorEnd: string;
  partial: boolean;
  indicators: GeneralIndicator[];
  highlights: string[];
  improved: number;
  declined: number;
  stable: number;
  comparable: number;
};

function shiftDay(day: string, days: number) {
  const d = new Date(day + "T12:00:00Z");
  if (!Number.isFinite(d.getTime())) throw new Error("Data inválida.");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function mondayOf(day: string) {
  const date = new Date(day + "T12:00:00Z");
  if (!Number.isFinite(date.getTime())) throw new Error("Selecione uma data válida.");
  const dayOfWeek = (date.getUTCDay() + 6) % 7;
  return shiftDay(day, -dayOfWeek);
}
export function lastClosedWeek() { return shiftDay(mondayOf(salesDay(new Date())), -7); }
export function nextWeek(day: string, steps: number) { return shiftDay(day, steps * 7); }
export function displayDay(day: string) {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}
export function weekCaption(start: string) { return `${displayDay(start)} a ${displayDay(shiftDay(start, 6))}`; }
function inWeek(iso: string | undefined, start: string) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return false;
  const d = salesDay(iso);
  return d >= start && d <= shiftDay(start, 6);
}
function inventoryAccuracy(cycles: Ciclo[], week: string): number | null {
  // Acuracidade ponderada por ITEM, sem media ingênua dos percentuais por ciclo.
  // Conta somente primeiros inventários concluídos NESTA semana.
  const finished = cycles.filter(c => c.status === "finalizado" && inWeek(c.finalizadoEm, week));
  const allItems = finished.flatMap(c => c.itens ?? []);
  if (!allItems.length) return null;
  return 100 * allItems.filter(item => Number(item.diferenca) === 0).length / allItems.length;
}
function verificationAccuracy(records: VerificationRecord[], week: string): number | null {
  const current = records.filter(r => inWeek(r.createdAt, week));
  return current.length ? 100 * current.filter(r => r.correct).length / current.length : null;
}
function compare(
  key: IndicatorKey, title: string, detail: string,
  unit: "count" | "percent", current: number | null, previous: number | null,
): GeneralIndicator {
  const valid = current !== null && previous !== null && Number.isFinite(current) && Number.isFinite(previous);
  const difference = valid ? current - previous : null;
  const direction = !valid ? "unavailable" : Math.abs(difference!) < 1e-8 ? "equal" : difference! > 0 ? "up" : "down";
  const percentChange = valid && unit === "count" && previous !== 0 ? (difference! / previous) * 100 : null;
  return { key, title, detail, unit, current, previous, difference, percentChange, direction };
}
const count = (items: unknown[], test: (v: any) => boolean) => items.filter(test).length;

export function buildGeneralReport(
  cycles: Ciclo[], checks: VerificationRecord[], deliveries: Delivery[], pickups: Pickup[], selectedDate: string,
  today = new Date(),
): GeneralReport {
  const weekStart = mondayOf(selectedDate);
  const weekEnd = shiftDay(weekStart, 6);
  const priorStart = shiftDay(weekStart, -7);
  const priorEnd = shiftDay(weekStart, -1);
  const partial = weekEnd >= salesDay(today);
  const periods = [weekStart, priorStart] as const;
  const values = periods.map(week => ({
    accuracy: inventoryAccuracy(cycles, week),
    cycles: count(cycles, c => c.status === "finalizado" && inWeek(c.finalizadoEm, week)),
    recounts: cycles.reduce((sum, cycle) =>
      sum + (cycle.reinventarios ?? []).filter(r => r.status === "finalizado" && inWeek(r.finalizadoEm, week)).length, 0),
    checks: count(checks, c => inWeek(c.createdAt, week)),
    checkAccuracy: verificationAccuracy(checks, week),
    deliveries: count(deliveries, d => d.status === "finalizada" && inWeek(d.finishedAt, week)),
    pickups: count(pickups, p => p.status === "finalizada" && inWeek(p.finishedAt, week)),
  }));
  const [current, previous] = values;
  const defs: { key: IndicatorKey; title: string; detail: string; unit: "count" | "percent" }[] = [
    { key: "accuracy", title: "Acuracidade do inventário", detail: "Itens corretos nos ciclos concluídos", unit: "percent" },
    { key: "cycles", title: "Ciclos concluídos", detail: "Primeiros inventários finalizados", unit: "count" },
    { key: "recounts", title: "Reinventários concluídos", detail: "Recontagens finalizadas", unit: "count" },
    { key: "checks", title: "Conferências realizadas", detail: "Registros de conferência", unit: "count" },
    { key: "checkAccuracy", title: "Acerto da conferência", detail: "Proporção de registros corretos", unit: "percent" },
    { key: "deliveries", title: "Entregas finalizadas", detail: "Pedidos entregues e assinados", unit: "count" },
    { key: "pickups", title: "Retiras finalizadas", detail: "Pedidos retirados", unit: "count" },
  ];
  const indicators = defs.map(d => compare(d.key, d.title, d.detail, d.unit, current[d.key], previous[d.key]));
  const comparable = indicators.filter(x => x.direction !== "unavailable");
  const improved = comparable.filter(x => x.direction === "up").length;
  const declined = comparable.filter(x => x.direction === "down").length;
  const stable = comparable.filter(x => x.direction === "equal").length;

  const highlights = indicators
    .filter(x => x.direction === "up" || x.direction === "down")
    .sort((a, b) => {
      // Primeiro os ganhos, depois as quedas. Não comparar variações de unidades diferentes.
      return (a.direction === "up" ? 0 : 1) - (b.direction === "up" ? 0 : 1);
    })
    .slice(0, 4)
    .map(x => {
      const verb = x.direction === "up" ? "subiu" : "caiu";
      const diff = x.unit === "percent"
        ? `${Math.abs(x.difference!).toFixed(1).replace(".", ",")} p.p.`
        : `${Math.abs(x.difference!).toLocaleString("pt-BR")} registro(s)`;
      return `${x.title} ${verb} ${diff} em relação à semana anterior.`;
    });
  if (!highlights.length) highlights.push(comparable.length
    ? "Sem variações nos indicadores comparáveis deste período."
    : "Ainda não há dados suficientes para comparar a acuracidade dos períodos.");

  return { weekStart, weekEnd, priorStart, priorEnd, partial, indicators, highlights, improved, declined, stable, comparable: comparable.length };
}
export function indicatorValue(value: number | null, unit: "count" | "percent") {
  if (value === null) return "—";
  return unit === "percent" ? `${value.toFixed(1).replace(".", ",")}%` : value.toLocaleString("pt-BR");
}
export function indicatorChange(indicator: GeneralIndicator) {
  if (indicator.difference === null) return "Sem base para comparar";
  if (indicator.difference === 0) return "Sem alteração";
  const prefix = indicator.difference > 0 ? "+" : "−";
  if (indicator.unit === "percent") return `${prefix}${Math.abs(indicator.difference).toFixed(1).replace(".", ",")} p.p.`;
  const diff = `${prefix}${Math.abs(indicator.difference).toLocaleString("pt-BR")}`;
  if (indicator.previous === 0) return diff + " (base anterior zero)";
  return `${diff} (${Math.abs(indicator.percentChange ?? 0).toFixed(0)}%)`;
}

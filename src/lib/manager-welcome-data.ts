import type { Ciclo } from "./ciclos";
import type { Delivery } from "./deliveries";
import type { VerificationRecord } from "./sales-verification";
import { salesDay, shiftSalesDay } from "./sales-weekly";

export type WelcomeCount = { today: number; yesterday: number; difference: number };
export type WelcomeAccuracy = { label: string; percent: number; at: string };
export type WelcomeSummary = {
  deliveries: WelcomeCount; checks: WelcomeCount; cycles: WelcomeCount;
  accuracy: WelcomeAccuracy[]; accuracyDifference: number | null; day: string;
};

/** Contagem real por dia civil em São Paulo; acuracidade de cada ciclo por itens. */
export function managerWelcomeSummary(
  deliveries: Delivery[], checks: VerificationRecord[], cycles: Ciclo[], now: Date,
): WelcomeSummary {
  const day = salesDay(now), yesterday = shiftSalesDay(day, -1);
  const summarize = (dates: string[]): WelcomeCount => {
    const a = dates.filter(d => d === day).length, b = dates.filter(d => d === yesterday).length;
    return { today: a, yesterday: b, difference: a - b };
  };
  const validDate = (iso?: string) => !!iso && Number.isFinite(Date.parse(iso));
  const deliveryDays = deliveries.filter(d => d.source !== "coleta" && d.status === "finalizada" && validDate(d.finishedAt))
    .map(d => salesDay(d.finishedAt!));
  const checkDays = checks.filter(c => validDate(c.createdAt)).map(c => salesDay(c.createdAt));
  const closed = cycles.filter(c => c.status === "finalizado" && validDate(c.finalizadoEm));
  const cycleDays = closed.map(c => salesDay(c.finalizadoEm!));
  const accuracy = closed.filter(c => (c.itens ?? []).length > 0)
    .sort((a, b) => a.finalizadoEm!.localeCompare(b.finalizadoEm!) || a.id.localeCompare(b.id))
    .slice(-8).map(c => ({
      label: c.titulo, at: c.finalizadoEm!,
      percent: 100 * c.itens.filter(item => Number(item.diferenca) === 0).length / c.itens.length,
    }));
  const last = accuracy.at(-1), previous = accuracy.at(-2);
  return { day, deliveries: summarize(deliveryDays), checks: summarize(checkDays),
    cycles: summarize(cycleDays), accuracy,
    accuracyDifference: last && previous ? last.percent - previous.percent : null };
}
export function managerWelcomeGreeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23",
  }).format(now));
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}
export function welcomeChange(value: WelcomeCount): string {
  if (!value.difference) return "Mesmo total de ontem";
  return (value.difference > 0 ? "+" : "−") + Math.abs(value.difference).toLocaleString("pt-BR") + " em relação a ontem";
}
export function welcomeMotivation(diff: number | null): string {
  if (diff === null) return "Cada operação faz diferença. Vamos construir um grande dia! ✨";
  if (diff > 0.000001) return "A acuracidade está evoluindo. Excelente trabalho, equipe! 🚀";
  if (diff < -0.000001) return "Temos oportunidades de melhorar. Vamos conquistar mais precisão! 💪";
  return "A acuracidade estável mostra consistência. Vamos avançar juntos! ✨";
}

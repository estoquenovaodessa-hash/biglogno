import { z } from "zod";
import type { Delivery } from "./deliveries";
import { expeditionLocalDay } from "./expedition-history";

export const expeditionShiftSchema = z.enum(["manha", "tarde"]);
export type ExpeditionShift = z.infer<typeof expeditionShiftSchema>;
export type ShiftSection = ExpeditionShift | "indefinido";

export const scheduledDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data no formato AAAA-MM-DD.")
  .refine(value => {
    const date = new Date(value + "T12:00:00Z");
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Data inválida.");

export const expeditionScheduleInputSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1000),
  shift: expeditionShiftSchema.nullable(),
  /** Omitido preserva a data; null remove; uma data só pode ser associada a coleta. */
  scheduledDate: scheduledDateSchema.nullable().optional(),
});

export function shiftOf(record: Pick<Delivery, "expeditionShift">): ShiftSection {
  return record.expeditionShift === "manha" || record.expeditionShift === "tarde"
    ? record.expeditionShift : "indefinido";
}
export const shiftLabel = (shift: ShiftSection) =>
  shift === "manha" ? "MANHÃ" : shift === "tarde" ? "TARDE" : "TURNO INDEFINIDO";

/** Data civil de São Paulo, independente do fuso do aparelho.
 * Formata apenas a apresentação: o valor persistido continua AAAA-MM-DD. */
export function scheduledDateLabel(date?: string, now: Date = new Date()): string {
  if (!date) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const today = expeditionLocalDay(now.toISOString());
  if (today && date === today) return "HOJE";
  if (today) {
    const tomorrow = new Date(today + "T12:00:00Z");
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    if (date === tomorrow.toISOString().slice(0, 10)) return "AMANHÃ";
  }
  const [year, month, day] = date.split("-");
  return day + "/" + month + "/" + year;
}

export function operatorShiftSections(groups: Delivery[][]) {
  return (["manha", "tarde", "indefinido"] as const).map(shift => {
    const rows = groups.filter(group => group[0] && shiftOf(group[0]) === shift);
    const indexed = rows.map((group, index) => ({ group, index }));
    indexed.sort((a, b) => {
      const firstA = a.group[0], firstB = b.group[0];
      // Coletas com data agendada vêm primeiro dentro do turno correspondente.
      const rank = (d: Delivery) => d.source === "coleta" ? (d.scheduledDate ? 0 : 1) : 2;
      const diff = rank(firstA) - rank(firstB);
      if (diff) return diff;
      if (firstA.source === "coleta" && firstB.source === "coleta") {
        const dateDiff = (firstA.scheduledDate || "9999").localeCompare(firstB.scheduledDate || "9999");
        if (dateDiff) return dateDiff;
      }
      return a.index - b.index;
    });
    return { shift, groups: indexed.map(entry => entry.group) };
  });
}

import { SELLERS, salesMetrics, verificationChannel, type VerificationRecord } from "./sales-verification";

export function salesDay(date: string | Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(date));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function shiftSalesDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function compareSalesWeeks(records: VerificationRecord[], start: string) {
  const dated = records.map(record => ({ record, day: salesDay(record.createdAt) }));
  const weeks = [0, 7].map(offset => {
    const from = shiftSalesDay(start, offset), to = shiftSalesDay(from, 6);
    const list = dated.filter(r => r.day >= from && r.day <= to).map(r => r.record);
    const metrics = salesMetrics(list);
    const sellers = SELLERS.map(seller => ({ seller, ...salesMetrics(list.filter(r => r.seller === seller)) }));
    const leaders = (key: "count" | "errors", least = false) => {
      if (!list.length) return [];
      const target = (least ? Math.min : Math.max)(...sellers.map(s => s[key]));
      if (!least && target === 0) return [];
      return sellers.filter(s => s[key] === target).map(s => ({ seller: s.seller, count: s[key] }));
    };
    const expedition = list.filter(r => verificationChannel(r) === "expedicao").length;
    return { from, to, ...metrics, accuracy: list.length ? metrics.accuracy : null, sellers,
      most: leaders("count"), least: leaders("count", true), mostErrors: leaders("errors"),
      counter: list.length - expedition, expedition,
      counterShare: list.length ? (list.length - expedition) / list.length * 100 : null,
      expeditionShare: list.length ? expedition / list.length * 100 : null,
      days: Array.from({ length: 7 }, (_, index) => {
        const day = shiftSalesDay(from, index);
        const daily = list.filter(r => salesDay(r.createdAt) === day);
        const accumulated = list.filter(r => salesDay(r.createdAt) <= day);
        return { day, count: daily.length, errors: daily.filter(r => !r.correct).length,
          accuracy: accumulated.length ? salesMetrics(accumulated).accuracy : null };
      }) };
  });
  const previous = weeks[0], current = weeks[1];
  if (!previous || !current) throw new Error("Período inválido.");
  return { previous, current, difference: { count: current.count - previous.count, errors: current.errors - previous.errors,
    value: current.value - previous.value, accuracy: previous.accuracy === null || current.accuracy === null ? null : current.accuracy - previous.accuracy },
    chart: previous.days.map((day, index) => ({ label: `Dia ${index + 1}`, previousDate: day.day, currentDate: current.days[index]?.day,
      previousCount: day.count, currentCount: current.days[index]?.count ?? 0,
      previousAccuracy: day.accuracy, currentAccuracy: current.days[index]?.accuracy ?? null })) };
}
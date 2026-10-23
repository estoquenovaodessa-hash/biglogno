import { describe, test, expect } from "bun:test";
import { compareSalesWeeks, salesDay } from "./sales-weekly";

const record = (date, seller, correct, value = 10, extra = {}) => ({ createdAt: `${date}T12:00:00-03:00`, seller, correct, value, items: 1, durationSeconds: 60, ...extra });
describe("comparação semanal de conferências", () => {
  const records = [record("2026-10-01", "José", true, 100), record("2026-10-07", "José", false, 50, { errorReasons: ["CPF", "MATERIAL"] }), record("2026-10-08", "Daniel", true, 200), record("2026-10-14", "EXPEDIÇÃO", false, 30), record("2026-09-30", "Carlos", true, 999), record("2026-10-15", "Carlos", true, 999)];
  test("duas semanas têm sete dias, incluem limites e não se sobrepõem", () => {
    const { previous, current } = compareSalesWeeks(records, "2026-10-01");
    expect([previous.from, previous.to, current.from, current.to]).toEqual(["2026-10-01", "2026-10-07", "2026-10-08", "2026-10-14"]);
    expect(previous.count).toBe(2); expect(current.count).toBe(2); expect(previous.days).toHaveLength(7); expect(current.days).toHaveLength(7);
  });
  test("erros contam documentos, não quantidade de motivos", () => {
    expect(compareSalesWeeks(records, "2026-10-01").previous.errors).toBe(1);
  });
  test("diferença de valor compara somas dos valores conferidos", () => {
    const result = compareSalesWeeks(records, "2026-10-01");
    expect(result.previous.value).toBe(150); expect(result.current.value).toBe(230); expect(result.difference.value).toBe(80);
  });
  test("classifica vendedores, preserva empates e inclui os sem conferências no menor volume", () => {
    const { previous } = compareSalesWeeks(records, "2026-10-01");
    expect(previous.most).toEqual([{ seller: "José", count: 2 }]); expect(previous.mostErrors).toEqual([{ seller: "José", count: 1 }]);
    expect(previous.least).toHaveLength(7); expect(previous.least.every(s => s.count === 0)).toBe(true);
  });
  test("participações balcão e expedição usam o total de conferências", () => {
    const { current } = compareSalesWeeks(records, "2026-10-01");
    expect(current.counterShare).toBe(50); expect(current.expeditionShare).toBe(50);
  });
  test("gráfico usa acerto conjunto acumulado de cada semana", () => {
    const { previous } = compareSalesWeeks(records, "2026-10-01");
    expect(previous.days[0].accuracy).toBe(100); expect(previous.days[6].accuracy).toBe(50);
  });
  test("sem registros não inventa percentuais ou vencedores", () => {
    const { previous, difference } = compareSalesWeeks([], "2026-10-01");
    expect(previous.accuracy).toBeNull(); expect(previous.counterShare).toBeNull(); expect(previous.most).toEqual([]); expect(previous.least).toEqual([]); expect(difference.accuracy).toBeNull();
  });
  test("datas usam o horário de São Paulo inclusive viradas de mês", () => {
    expect(salesDay("2026-10-08T01:00:00Z")).toBe("2026-10-07");
    expect(compareSalesWeeks([], "2026-09-27").current.to).toBe("2026-10-10");
  });
});
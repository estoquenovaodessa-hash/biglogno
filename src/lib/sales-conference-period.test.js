import { describe, expect, test } from "bun:test";
import {
  conferencePeriodKey, conferencePeriodContains,
  conferencePeriodLabel, conferenceMonthOptions,
} from "./sales-conference-period";
describe("Conferência gestor — Ontem e Anteontem", () => {
  test("interpreta hoje e ontem no fuso de São Paulo, não UTC", () => {
    const now = new Date("2026-10-30T02:30:00Z"); // 29/10, 23h30 de Brasília
    expect(conferencePeriodKey("today", now)).toBe("2026-10-29");
    expect(conferencePeriodKey("yesterday", now)).toBe("2026-10-28");
    expect(conferencePeriodKey("dayBeforeYesterday", now)).toBe("2026-10-27");
    expect(conferencePeriodContains("2026-10-29T02:59:59Z", "2026-10-28")).toBe(true);
    expect(conferencePeriodContains("2026-10-29T03:00:00Z", "2026-10-28")).toBe(false);
  });
  test("calcula datas corretamente nas viradas de mês e ano", () => {
    const now = new Date("2027-01-01T14:00:00Z");
    expect(conferencePeriodKey("yesterday", now)).toBe("2026-12-31");
    expect(conferencePeriodKey("dayBeforeYesterday", now)).toBe("2026-12-30");
    expect(conferenceMonthOptions(now)).toEqual({ current: "2027-01", previous: "2026-12" });
  });
  test("preserva Todo o período, mês atual, mês anterior e chaves SQL de vendas", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    expect(conferencePeriodKey("all", now)).toBe("all");
    expect(conferencePeriodKey("2026-10", now)).toBe("2026-10");
    expect(conferencePeriodContains("2026-10-14T18:00:00Z", "2026-10")).toBe(true);
    expect(conferencePeriodContains("2026-09-30T18:00:00Z", "2026-10")).toBe(false);
    expect(conferencePeriodContains("", "all")).toBe(true);
    expect(conferencePeriodContains("", "2026-10-30")).toBe(false);
    expect(conferencePeriodKey("dayBeforeYesterday", now)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  test("rótulos para relatório e interface permanecem legíveis", () => {
    expect(conferencePeriodLabel("yesterday")).toBe("Ontem");
    expect(conferencePeriodLabel("dayBeforeYesterday")).toBe("Anteontem");
    expect(conferencePeriodLabel("today")).toBe("Hoje");
    expect(conferencePeriodLabel("all")).toBe("Todo o período");
    expect(conferencePeriodLabel("2026-10")).toBe("outubro de 2026");
  });
});

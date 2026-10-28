import { describe, expect, test } from "bun:test";
import { deliveryGroups } from "./deliveries";
import {
  expeditionScheduleInputSchema, scheduledDateSchema, shiftOf, shiftLabel,
  scheduledDateLabel, operatorShiftSections,
} from "./expedition-schedule";

const id = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const order = (n, props = {}) => ({
  id: id(n), position: n, createdAt: "2026-10-28T12:00:00Z", company: "Cliente",
  document: String(n), value: n, status: "nao_iniciada", source: "conferencia", ...props,
});

describe("programação de turnos da Expedição", () => {
  test("valida somente datas reais e turno manhã/tarde ou indefinido", () => {
    expect(scheduledDateSchema.parse("2026-10-29")).toBe("2026-10-29");
    expect(scheduledDateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(scheduledDateSchema.safeParse("2026-13-01").success).toBe(false);
    expect(scheduledDateSchema.safeParse("29/10/2026").success).toBe(false);
    expect(expeditionScheduleInputSchema.safeParse({ ids: [id(1)], shift: "manha" }).success).toBe(true);
    expect(expeditionScheduleInputSchema.safeParse({ ids: [id(1)], shift: null }).success).toBe(true);
    expect(expeditionScheduleInputSchema.safeParse({ ids: [id(1)], shift: "noite" }).success).toBe(false);
    expect(expeditionScheduleInputSchema.safeParse({ ids: [id(1)], shift: "tarde", scheduledDate: "2026-10-29" }).success).toBe(true);
  });
  test("entregas do mesmo cliente só unificam dentro do mesmo turno", () => {
    const all = [
      order(1, { expeditionShift: "manha" }),
      order(2, { expeditionShift: "tarde" }),
      order(3, { expeditionShift: "manha" }),
      order(4),
    ];
    expect(deliveryGroups(all).map(group => group.map(item => item.document)))
      .toEqual([["1", "3"], ["2"], ["4"]]);
    expect(shiftOf(order(4))).toBe("indefinido");
    expect(shiftLabel("manha")).toBe("MANHÃ");
    expect(scheduledDateLabel("2026-10-29")).toBe("29/10/2026");
  });
  test("organiza MANHÃ, TARDE, INDEFINIDO e coletas agendadas antes das entregas", () => {
    const all = [
      order(1, { expeditionShift: "manha", company: "A" }),
      order(2, { expeditionShift: "tarde", company: "B" }),
      order(3, { expeditionShift: "manha", source: "coleta", company: "C", scheduledDate: "2026-10-30" }),
      order(4, { expeditionShift: "manha", source: "coleta", company: "D", scheduledDate: "2026-10-29" }),
      order(5, { source: "coleta", company: "E", scheduledDate: "2026-10-29" }),
      order(6, { expeditionShift: "manha", source: "coleta", company: "F" }),
      order(7, { company: "G" }),
      order(8, { expeditionShift: "tarde", source: "coleta", company: "H", scheduledDate: "2026-10-29" }),
    ];
    const sections = operatorShiftSections(deliveryGroups(all));
    expect(sections.map(section => section.shift)).toEqual(["manha", "tarde", "indefinido"]);
    expect(sections[0].groups.map(group => group[0].id)).toEqual([id(4), id(3), id(6), id(1)]);
    expect(sections[1].groups.map(group => group[0].id)).toEqual([id(8), id(2)]);
    expect(sections[2].groups.map(group => group[0].id)).toEqual([id(5), id(7)]);
  });
  test("não agrupa duas coletas, nem coleta com entrega de mesmo nome", () => {
    const records = [
      order(1, { expeditionShift: "tarde", source: "coleta" }),
      order(2, { expeditionShift: "tarde", source: "coleta" }),
      order(3, { expeditionShift: "tarde" }),
    ];
    expect(deliveryGroups(records)).toHaveLength(3);
  });
});

import { describe, expect, test } from "bun:test";
import {
  completedDeliveryHistory, completedPickupHistory,
  expeditionDateTime, expeditionLocalDay, expeditionWithinPeriod,
} from "./expedition-history";

const deliveries = [
  { id: "2", company: "B", source: "conferencia", createdAt: "2026-10-27T10:00:00Z",
    status: "finalizada", finishedAt: "2026-10-28T02:15:00Z", position: 2 },
  { id: "1", company: "A", source: "manual", createdAt: "2026-10-26T10:00:00Z",
    status: "finalizada", finishedAt: "2026-10-27T02:30:00Z", position: 1 },
  { id: "3", company: "C", source: "conferencia", createdAt: "2026-10-27T12:00:00Z",
    status: "nao_iniciada", position: 3 },
  { id: "4", company: "D", source: "conferencia", createdAt: "2026-10-26T12:00:00Z",
    status: "finalizada", finishedAt: "2026-10-27T03:10:00Z", position: 4 },
];

const pickups = [
  { id: "a", company: "Retira A", createdAt: "2026-10-26T17:00:00Z",
    source: "conferencia", status: "finalizada", finishedAt: "2026-10-27T02:59:00Z" },
  { id: "b", company: "Retira B", createdAt: "2026-10-27T17:00:00Z",
    source: "SBO", status: "finalizada", finishedAt: "2026-10-27T03:00:00Z" },
  { id: "c", company: "Retira C", createdAt: "2026-10-27T17:00:00Z",
    source: "NO", status: "pendente" },
];

describe("histórico somente leitura da Expedição", () => {
  test("considera a virada do dia no horário de São Paulo", () => {
    expect(expeditionLocalDay("2026-10-27T02:30:00Z")).toBe("2026-10-26");
    expect(expeditionLocalDay("2026-10-27T03:10:00Z")).toBe("2026-10-27");
    expect(expeditionWithinPeriod("2026-10-27T02:59:00Z",
      { from: "2026-10-27", to: "2026-10-27" })).toBe(false);
  });
  test("retorna finalizadas na ordem mais recente e não modifica o array original", () => {
    const original = deliveries.map(d => d.id);
    const all = completedDeliveryHistory(deliveries, { from: "", to: "" });
    expect(all.map(d => d.id)).toEqual(["2", "4", "1"]);
    expect(deliveries.map(d => d.id)).toEqual(original);
  });
  test("filtra datas inicial e final inclusive", () => {
    const one = completedDeliveryHistory(deliveries, { from: "2026-10-27", to: "2026-10-27" });
    expect(one.map(d => d.id)).toEqual(["4"]);
  });
  test("inclui retiradas concluídas de todas as origens sem listar pendências", () => {
    expect(completedPickupHistory(pickups, { from: "", to: "" }).map(p => p.id)).toEqual(["b", "a"]);
    expect(completedPickupHistory(pickups, { from: "2026-10-26", to: "2026-10-26" }).map(p => p.id))
      .toEqual(["a"]);
  });
  test("registros sem horário de conclusão aparecem no histórico total, mas não são datados arbitrariamente", () => {
    const completed = { ...deliveries[0], id: "sem-hora", finishedAt: undefined };
    expect(completedDeliveryHistory([completed], { from: "", to: "" })).toHaveLength(1);
    expect(completedDeliveryHistory([completed], { from: "2026-10-27", to: "" })).toHaveLength(0);
    expect(expeditionDateTime(undefined)).toBe("—");
  });
});

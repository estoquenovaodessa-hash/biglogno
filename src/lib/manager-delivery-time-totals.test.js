import { describe, expect, test } from "bun:test";
import { managerDeliveryTimeTotals } from "./manager-delivery-time-totals";

const record = (id, overrides = {}) => ({
  id, company: "LOJA ABC", companyCode: "101", source: "conferencia",
  driver: "Ana", driverEmployeeId: "driver-1", position: 1,
  document: id, value: 100, status: "finalizada",
  createdAt: "2026-10-29T09:00:00Z",
  startedAt: "2026-10-29T10:00:00Z",
  arrivedAt: "2026-10-29T10:10:00Z",
  finishedAt: "2026-10-29T10:15:00Z", ...overrides,
});

describe("indicadores gerenciais de trajeto e espera", () => {
  test("duas notas unificadas contam uma viagem e uma espera", () => {
    const a = record("n1");
    const b = record("n2", { source: "manual" });
    expect(managerDeliveryTimeTotals([a, b])).toEqual({
      travelMs: 600000, waitMs: 300000, travelCount: 1, waitCount: 1,
    });
  });
  test("coletas e outros destinos contribuem separadamente", () => {
    const a = record("n1");
    const other = record("n2", { company: "OUTRA LOJA", companyCode: "202" });
    const collect = record("n3", { source: "coleta", company: "COLETA", companyCode: "" });
    expect(managerDeliveryTimeTotals([a, other, collect])).toEqual({
      travelMs: 1800000, waitMs: 900000, travelCount: 3, waitCount: 3,
    });
  });
  test("mesma empresa em visitas diferentes tem trajetos independentes", () => {
    const a = record("n1");
    const b = record("n2", {
      startedAt: "2026-10-29T11:00:00Z", arrivedAt: "2026-10-29T11:10:00Z",
      finishedAt: "2026-10-29T11:15:00Z",
    });
    expect(managerDeliveryTimeTotals([a, b]).travelMs).toBe(1200000);
  });
  test("usa a maior espera entre notas assinadas em momentos distintos", () => {
    const data = [record("n1"), record("n2", { finishedAt: "2026-10-29T10:20:00Z" })];
    expect(managerDeliveryTimeTotals(data).waitMs).toBe(600000);
  });
  test("entrega em rota ou pendente não recebe tempo inventado", () => {
    const underway = record("n1", { status: "em_rota", arrivedAt: undefined, finishedAt: undefined });
    const waiting = record("n2", { status: "no_destino", finishedAt: undefined });
    const pending = record("n3", { status: "nao_iniciada", startedAt: undefined, arrivedAt: undefined, finishedAt: undefined });
    expect(managerDeliveryTimeTotals([underway, waiting, pending])).toEqual({
      travelMs: 600000, waitMs: 0, travelCount: 1, waitCount: 0,
    });
  });
  test("usa somente os registros incluídos no filtro aplicado", () => {
    const rows = [record("n1"), record("n2", { companyCode: "202" })];
    expect(managerDeliveryTimeTotals(rows.filter(row => row.companyCode === "101")).travelMs).toBe(600000);
    expect(managerDeliveryTimeTotals([])).toEqual({
      travelMs: 0, waitMs: 0, travelCount: 0, waitCount: 0,
    });
  });
});

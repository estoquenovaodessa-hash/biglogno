import { describe, expect, test } from "bun:test";
import {
  managerDeliveryDay, managerDeliveryInPeriod,
  managerDeliveryDrivers, managerMatchesDriver,
} from "./manager-delivery-filters";

const delivery = (props = {}) => ({
  id: "00000000-0000-4000-8000-000000000001",
  company: "Cliente", companyCode: "101", document: "123",
  createdAt: "2026-10-27T17:00:00Z",
  status: "nao_iniciada", source: "conferencia", position: 1, value: 20,
  ...props,
});

const employee = (name, badge, props = {}) => ({
  id: "00000000-0000-4000-8000-" + String(name.length + badge.length).padStart(12, "0"),
  name, badge, role: "OPERADOR", job: "Funcionário", active: true, photo: null,
  ...props,
});

const now = new Date("2026-10-28T16:00:00Z");

describe("Entregas do gestor: filtro de data", () => {
  test("mostra hoje a entrega criada ontem e finalizada hoje", () => {
    const row = delivery({
      status: "finalizada", finishedAt: "2026-10-28T15:45:00Z",
      driver: "João",
    });
    expect(managerDeliveryDay(row)).toBe("2026-10-28");
    expect(managerDeliveryInPeriod(row, "today", now)).toBe(true);
  });

  test("mostra uma entrega iniciada hoje mesmo criada no dia anterior", () => {
    const row = delivery({ status: "em_rota", startedAt: "2026-10-28T14:00:00Z" });
    expect(managerDeliveryInPeriod(row, "today", now)).toBe(true);
  });

  test("considera o dia civil de São Paulo, não a data UTC", () => {
    // 02:30 UTC do dia 29 ainda corresponde a 28/10 em São Paulo.
    const row = delivery({ status: "finalizada", finishedAt: "2026-10-29T02:30:00Z" });
    expect(managerDeliveryInPeriod(row, "today", new Date("2026-10-29T02:45:00Z"))).toBe(true);
    expect(managerDeliveryInPeriod(row, "today", new Date("2026-10-29T04:00:00Z"))).toBe(false);
  });

  test("coleta agendada para amanhã não aparece como hoje só por ter sido criada hoje", () => {
    const row = delivery({
      source: "coleta", status: "nao_iniciada",
      createdAt: "2026-10-28T12:00:00Z", scheduledDate: "2026-10-29",
    });
    expect(managerDeliveryDay(row)).toBe("2026-10-29");
    expect(managerDeliveryInPeriod(row, "today", now)).toBe(false);
    expect(managerDeliveryInPeriod(row, "today", new Date("2026-10-29T12:00:00Z"))).toBe(true);
  });

  test("filtro de hoje preserva pedido novo sem início e rejeita pedido de ontem", () => {
    expect(managerDeliveryInPeriod(delivery({ createdAt: "2026-10-28T14:00:00Z" }), "today", now)).toBe(true);
    expect(managerDeliveryInPeriod(delivery(), "today", now)).toBe(false);
  });

  test("últimos 7 dias são dias civis e o mês anterior respeita a virada do ano", () => {
    const startWindow = delivery({ createdAt: "2026-10-22T15:00:00Z" });
    const beforeWindow = delivery({ createdAt: "2026-10-21T15:00:00Z" });
    expect(managerDeliveryInPeriod(startWindow, "7d", now)).toBe(true);
    expect(managerDeliveryInPeriod(beforeWindow, "7d", now)).toBe(false);
    const december = delivery({ createdAt: "2025-12-19T14:00:00Z" });
    const january = new Date("2026-01-05T15:00:00Z");
    expect(managerDeliveryInPeriod(december, "previous", january)).toBe(true);
    expect(managerDeliveryInPeriod(december, "month", january)).toBe(false);
  });
});

describe("Entregas do gestor: entregadores", () => {
  const manager = employee("Gestora", "GESTOR");
  const driver1 = employee("João", "ENTREGADOR", { id: "00000000-0000-4000-8000-000000000010" });
  const driver2 = employee("Maria", "ENTREGADOR", { id: "00000000-0000-4000-8000-000000000011", active: false });
  const seller = employee("Paula", "VENDEDOR");
  const operator = employee("Auxiliar", "AUXILIAR LOG", { permissions: { entregas: true } });
  const employees = [manager, driver2, seller, driver1, operator];

  test("exibe apenas funcionários com emblema ENTREGADOR, mesmo com outros operadores na lista", () => {
    expect(managerDeliveryDrivers(employees).map(e => e.name)).toEqual(["João", "Maria"]);
  });
  test("filtra pelo ID do entregador gravado no pedido", () => {
    const row = delivery({ driver: "João", driverEmployeeId: driver1.id });
    expect(managerMatchesDriver(row, driver1.id, employees)).toBe(true);
    expect(managerMatchesDriver(row, driver2.id, employees)).toBe(false);
    expect(managerMatchesDriver(row, "all", employees)).toBe(true);
  });
  test("mantém filtro de entregas antigas que guardavam apenas nome", () => {
    const row = delivery({ driver: " joão " });
    expect(managerMatchesDriver(row, driver1.id, employees)).toBe(true);
    expect(managerMatchesDriver(row, driver2.id, employees)).toBe(false);
    expect(managerMatchesDriver(row, seller.id, employees)).toBe(false);
  });
});

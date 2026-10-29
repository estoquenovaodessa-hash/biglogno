import { describe, expect, test } from "bun:test";
import {
  firstEmployeeName, isCaue, findLucianoDriver, deliveryResponsibleName,
  consolidateCaueDeliveries,
} from "./delivery-accountability";
import { estimatedKmTrips } from "./delivery-estimated-km";
import { listDeliveryRoutes, getRouteStops } from "./delivery-route";

const employee = (id, name, badge = "ENTREGADOR", active = true) => ({
  id, name, badge, active, role: "OPERADOR", job: "Funcionário", photo: null,
});
const luciano = employee("00000000-0000-4000-8000-000000000001", "Luciano Santos");
const caue = employee("00000000-0000-4000-8000-000000000002", "Cauê Dias", "AUXILIAR LOG");
const marcelo = employee("00000000-0000-4000-8000-000000000003", "Marcelo Pereira");
const people = [luciano, caue, marcelo];
const finish = (id, driver, driverEmployeeId, finishedAt, companyCode = id) => ({
  id, companyCode, company: "Cliente " + id, document: id,
  value: 100, position: Number(id), source: "conferencia",
  status: "finalizada", createdAt: "2026-10-29T10:00:00.000Z",
  finishedAt, driver, driverEmployeeId, expeditionShift: "manha",
});
const store = { client_code: "1", address: "Av. Ampélio Gazetta, 200", city: "Nova Odessa", state: "SP", neighborhood: "" };
const addresses = [store, ...["10","20","30"].map(id => ({
  client_code: id, address: "Rua " + id, city: "Nova Odessa", state: "SP", neighborhood: "",
}))];

describe("Cauê auxilia Luciano; Marcelo permanece independente", () => {
  test("aceita Cauê com acento, sobrenome e diferença de caixa, sem pegar nomes parecidos", () => {
    expect(firstEmployeeName("  CAUÊ   DIAS ")).toBe("caue");
    expect(isCaue("Caue")).toBe(true);
    expect(isCaue("Cauetano")).toBe(false);
    expect(isCaue("José Cauê")).toBe(false);
    expect(deliveryResponsibleName({ driver: "Cauê Dias" })).toBe("Luciano");
    expect(deliveryResponsibleName({ driver: "Marcelo Pereira" })).toBe("Marcelo Pereira");
  });
  test("atribui apenas a Luciano ativo com emblema ENTREGADOR, e exige referência inequívoca", () => {
    expect(findLucianoDriver(people)?.id).toBe(luciano.id);
    expect(findLucianoDriver([caue, marcelo])).toBeNull();
    expect(findLucianoDriver([employee(luciano.id, "Luciano", "AUXILIAR LOG")])).toBeNull();
    expect(findLucianoDriver([luciano, employee("00000000-0000-4000-8000-000000000005", "Luciano B")])).toBeNull();
    expect(findLucianoDriver([employee(luciano.id, "Luciano", "ENTREGADOR", false)])).toBeNull();
  });
  test("consolida registros antigos por nome ou ID sem modificar originais nem duplicar notas", () => {
    const rows = [
      finish("10", "Cauê Dias", caue.id, "2026-10-29T12:00:00.000Z"),
      finish("20", "Luciano Santos", luciano.id, "2026-10-29T12:10:00.000Z"),
      finish("30", "Marcelo Pereira", marcelo.id, "2026-10-29T12:20:00.000Z"),
    ];
    const original = JSON.stringify(rows);
    const consolidated = consolidateCaueDeliveries(rows, people);
    expect(consolidated).toHaveLength(3);
    expect(consolidated.map(row => row.driver)).toEqual(["Luciano Santos", "Luciano Santos", "Marcelo Pereira"]);
    expect(consolidated.map(row => row.driverEmployeeId)).toEqual([luciano.id, luciano.id, marcelo.id]);
    expect(JSON.stringify(rows)).toBe(original);
    expect(listDeliveryRoutes(consolidated).map(route => route.name).sort()).toEqual(["Luciano Santos", "Marcelo Pereira"]);
    const lucianoSelected = consolidated.find(row => row.driver === "Luciano Santos");
    const stops = getRouteStops(consolidated, lucianoSelected, addresses, store);
    expect(stops.filter(stop => stop.kind !== "origin")).toHaveLength(2);
    const trips = estimatedKmTrips(consolidated, people, addresses, store, "2026-10-29", "day");
    expect(trips).toHaveLength(2);
    expect(trips.find(trip => trip.name === "Luciano Santos")?.documents).toBe(2);
    expect(trips.find(trip => trip.name === "Marcelo Pereira")?.documents).toBe(1);
  });
  test("sem cadastro do Luciano, a visão mostra o nome padrão sem atribuir ID fictício", () => {
    const rows = [finish("10", "Cauê", caue.id, "2026-10-29T12:00:00.000Z")];
    const [result] = consolidateCaueDeliveries(rows, [caue, marcelo]);
    expect(result.driver).toBe("Luciano");
    expect(result.driverEmployeeId).toBeUndefined();
  });
});

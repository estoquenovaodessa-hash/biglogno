import { describe, expect, test } from "bun:test";
import {
  completedRouteKilometers, estimatedKmTrips, formatRoadKm, kmPeriodBounds,
} from "./delivery-estimated-km";

const employee = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Ana", job: "Entregadora", badge: "ENTREGADOR", role: "OPERADOR",
  active: true, photo: null,
};
const address = (code, street) => ({
  client_code: code, address: street, neighborhood: "Centro",
  city: "Nova Odessa", state: "SP",
});
const store = address("17", "Av. Ampélio Gazetta, 200");
const addresses = [address("10", "Rua A, 10"), address("20", "Rua B, 20")];
const delivery = (id, finishedAt, more = {}) => ({
  id, document: id, company: "Cliente " + id, companyCode: id,
  position: 1, createdAt: "2026-10-26T10:00:00Z",
  source: "conferencia", value: 50, status: "finalizada",
  driver: "Ana", driverEmployeeId: employee.id,
  finishedAt, ...more,
});

describe("KM estimados de entregas concluídas", () => {
  test("somente notas concluídas entram; uma visita com duas notas não duplica KM", () => {
    const a = delivery("10", "2026-10-26T14:40:00Z", {
      expeditionShift: "manha", arrivedAt: "2026-10-26T14:30:00Z",
      company: "Empresa 10",
    });
    const b = delivery("11", "2026-10-26T14:40:00Z", {
      expeditionShift: "manha", arrivedAt: "2026-10-26T14:30:00Z",
      company: "Empresa 10", companyCode: "10", position: 2,
    });
    const c = delivery("20", "2026-10-26T19:00:00Z", {
      expeditionShift: "tarde", company: "Empresa 20",
    });
    const pending = { ...a, id: "pending", document: "pending", status: "nao_iniciada" };
    const trips = estimatedKmTrips([b, a, c, pending], [employee], addresses, store, "2026-10-26", "day");
    expect(trips).toHaveLength(2);
    expect(trips.map(t => t.shift).sort()).toEqual(["manha", "tarde"]);
    const morning = trips.find(trip => trip.shift === "manha");
    expect(morning?.documents).toBe(2);
    expect(morning?.visits).toBe(1);
    expect(morning?.stops[0].kind).toBe("origin");
    expect(morning?.stops.map(stop => stop.company)).toEqual(["BIGNOTTO FERRAMENTAS", "Empresa 10"]);
    expect(trips.find(trip => trip.shift === "tarde")?.stops[0].kind).toBe("origin");
    expect(pending.status).toBe("nao_iniciada");
  });
  test("coleta finalizada com local confirmado participa da mesma rota e dos KM", () => {
    const delivered = delivery("10", "2026-10-26T13:00:00Z", { expeditionShift: "manha" });
    const collection = delivery("coleta-1", "2026-10-26T14:00:00Z", {
      source: "coleta", expeditionShift: "manha", company: "Empresa de Coleta",
      companyCode: "", collectionAddress: "Rua da Coleta, 88, Nova Odessa - SP",
      collectionLatitude: -22.77, collectionLongitude: -47.29,
      collectionLocationConfirmedAt: "2026-10-26T10:00:00Z",
    });
    const [trip] = estimatedKmTrips([delivered, collection], [employee], addresses, store, "2026-10-26", "day");
    expect(trip.documents).toBe(2);
    expect(trip.stops).toHaveLength(3);
    expect(trip.stops[2].company).toBe("Empresa de Coleta");
    expect(trip.stops[2].address?.locationSource).toBe("google_maps");
    expect(completedRouteKilometers(trip.stops, [2800, 4100]).meters).toBe(6900);
  });
  test("soma Loja → Cliente A → Cliente B sem calcular retorno não confirmado", () => {
    const morning = delivery("10", "2026-10-26T13:00:00Z", { expeditionShift: "manha" });
    const next = delivery("20", "2026-10-26T14:00:00Z", { expeditionShift: "manha" });
    const [trip] = estimatedKmTrips([next, morning], [employee], addresses, store, "2026-10-26", "day");
    expect(trip.stops).toHaveLength(3);
    expect(completedRouteKilometers(trip.stops, [4200, 3400]).meters).toBe(7600);
    expect(formatRoadKm(7600)).toBe("7,60 km");
  });
  test("não inventa KM quando a loja ou um cliente não possui endereço", () => {
    const row = delivery("10", "2026-10-26T13:00:00Z");
    const [withoutOrigin] = estimatedKmTrips([row], [employee], addresses, undefined, "2026-10-26", "day");
    expect(completedRouteKilometers(withoutOrigin.stops, [3500]).meters).toBeNull();
    const [withoutClient] = estimatedKmTrips([row], [employee], [], store, "2026-10-26", "day");
    expect(completedRouteKilometers(withoutClient.stops, [3500]).meters).toBeNull();
    const [proper] = estimatedKmTrips([row], [employee], addresses, store, "2026-10-26", "day");
    expect(completedRouteKilometers(proper.stops, [null]).meters).toBeNull();
    expect(completedRouteKilometers(proper.stops, []).meters).toBeNull();
  });
  test("turno indefinido de nota antiga também parte da loja", () => {
    const row = delivery("10", "2026-10-26T13:00:00Z");
    const [trip] = estimatedKmTrips([row], [employee], addresses, store, "2026-10-26", "day");
    expect(trip.shift).toBe("indefinido");
    expect(trip.stops[0].kind).toBe("origin");
  });
});

describe("períodos civis", () => {
  test("Diário por data de conclusão", () => {
    expect(kmPeriodBounds("2026-10-29", "day")).toEqual({ start: "2026-10-29", end: "2026-10-30" });
  });
  test("Semanal de segunda a domingo, mesmo na virada do mês", () => {
    expect(kmPeriodBounds("2026-10-29", "week")).toEqual({ start: "2026-10-26", end: "2026-11-02" });
  });
  test("Mensal respeita meses de 28/30/31 dias e virada do ano", () => {
    expect(kmPeriodBounds("2026-10-29", "month")).toEqual({ start: "2026-10-01", end: "2026-11-01" });
    expect(kmPeriodBounds("2026-12-31", "month")).toEqual({ start: "2026-12-01", end: "2027-01-01" });
    expect(kmPeriodBounds("2027-02-20", "month")).toEqual({ start: "2027-02-01", end: "2027-03-01" });
  });
  test("agrega entregas finalizadas em diferentes dias da mesma semana", () => {
    const a = delivery("10", "2026-10-26T15:00:00Z");
    const b = delivery("20", "2026-10-27T15:00:00Z");
    const week = estimatedKmTrips([a, b], [employee], addresses, store, "2026-10-29", "week");
    const daily = estimatedKmTrips([a, b], [employee], addresses, store, "2026-10-27", "day");
    expect(week).toHaveLength(2);
    expect(daily).toHaveLength(1);
    expect(week.every(trip => trip.stops[0]?.kind === "origin")).toBe(true);
  });
});

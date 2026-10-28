import { describe, expect, test } from "bun:test";
import { getRouteStops, googleRouteSegments, listDeliveryRoutes, saoPauloDay } from "./delivery-route";

const address = code => ({
  client_code: code, address: "Rua Teste, 10", neighborhood: "Centro",
  city: "Nova Odessa", state: "SP",
});
const done = (id, company, finishedAt, extra = {}) => ({
  id, position: Number(id) || 1, createdAt: "2026-10-26T11:00:00Z",
  document: id, company, companyCode: id, value: 10,
  source: "manual", status: "finalizada", driver: "Ana", finishedAt, ...extra,
});

describe("seleção de rotas no painel do gestor", () => {
  test("encontra as seis entregas finalizadas mesmo se o pedido selecionado na tela estiver pendente", () => {
    const day = ["12", "13", "14", "15", "16", "17"].map((hour, index) =>
      done(String(index + 1), "Cliente " + (index + 1), "2026-10-26T" + hour + ":00:00Z"));
    const other = done("7", "Outro motorista", "2026-10-26T18:00:00Z", { driver: "Carlos" });
    const routes = listDeliveryRoutes([other, ...day, { ...day[0], id: "8", status: "nao_iniciada" }]);
    expect(routes).toHaveLength(2);
    const ana = routes.find(route => route.name === "Ana");
    expect(ana?.count).toBe(6);
    expect(getRouteStops(day, ana.selected, day.map(d => address(d.companyCode)))
      .map(stop => stop.company)).toEqual(["Cliente 1", "Cliente 2", "Cliente 3", "Cliente 4", "Cliente 5", "Cliente 6"]);
  });
  test("separa corretamente as rotas de datas diferentes", () => {
    const a = done("1", "A", "2026-10-26T18:00:00Z");
    const b = done("2", "B", "2026-10-27T18:00:00Z");
    expect(listDeliveryRoutes([a, b]).map(route => route.day)).toEqual(["2026-10-27", "2026-10-26"]);
  });
});

describe("sequência de paradas do gestor", () => {
  test("usa a conclusão real das entregas, não a posição da fila nem a hora de chegada", () => {
    const first = done("1", "Primeiro", "2026-10-26T14:20:00Z", { position: 100, arrivedAt: "2026-10-26T14:01:00Z" });
    const second = done("2", "Segundo", "2026-10-26T14:12:00Z", { position: 1, arrivedAt: "2026-10-26T14:10:00Z" });
    expect(getRouteStops([first, second], first, [address("1"), address("2")])
      .map(stop => stop.company)).toEqual(["Segundo", "Primeiro"]);
  });
  test("agrupa notas entregues na mesma visita", () => {
    const first = done("1", "Cliente X", "2026-10-26T13:20:00Z", { companyCode: "00519", arrivedAt: "2026-10-26T13:15:00Z" });
    const second = done("2", "Cliente X", "2026-10-26T13:20:00Z", { companyCode: "519", arrivedAt: "2026-10-26T13:15:00Z" });
    const stops = getRouteStops([first, second], first, [address("519")]);
    expect(stops).toHaveLength(1);
    expect(stops[0].deliveries.map(d => d.id)).toEqual(["1", "2"]);
    expect(stops[0].address?.client_code).toBe("519");
  });
  test("rota do CONSUMIDOR 100 preserva notas separadas mesmo com horário idêntico", () => {
    const a = done("nota-a", "CONSUMIDOR", "2026-10-26T13:20:00Z",
      { companyCode: "100", document: "501", arrivedAt: "2026-10-26T13:15:00Z" });
    const b = done("nota-b", "CONSUMIDOR", "2026-10-26T13:20:00Z",
      { companyCode: "00100", document: "502", arrivedAt: "2026-10-26T13:15:00Z" });
    const stops = getRouteStops([a, b], a, [address("100")]);
    expect(stops.map(stop => stop.deliveries.map(row => row.document))).toEqual([["501"], ["502"]]);
    expect(stops.every(stop => stop.address?.client_code === "100")).toBe(true);
  });
  test("não confunde duas visitas ao mesmo cliente no mesmo dia", () => {
    const first = done("1", "Cliente X", "2026-10-26T13:20:00Z", { companyCode: "519", arrivedAt: "2026-10-26T13:15:00Z" });
    const second = done("2", "Cliente X", "2026-10-26T16:10:00Z", { companyCode: "519", arrivedAt: "2026-10-26T16:00:00Z" });
    expect(getRouteStops([second, first], first, [address("519")])).toHaveLength(2);
  });
  test("exclui outros entregadores e outros dias, respeitando o fuso de São Paulo", () => {
    const selected = done("1", "A", "2026-10-27T01:00:00Z", { driverEmployeeId: "a" });
    const sameDay = done("2", "B", "2026-10-26T20:00:00Z", { driverEmployeeId: "a" });
    const otherDriver = done("3", "C", "2026-10-26T20:00:00Z", { driverEmployeeId: "b" });
    const nextDay = done("4", "D", "2026-10-27T12:00:00Z", { driverEmployeeId: "a" });
    expect(saoPauloDay(selected.finishedAt)).toBe("2026-10-26");
    expect(getRouteStops([nextDay, otherDriver, sameDay, selected], selected, [])
      .map(stop => stop.company)).toEqual(["B", "A"]);
  });
  test("não omite parada sem endereço e só cria links completos", () => {
    const first = done("1", "A", "2026-10-26T12:00:00Z");
    const second = done("2", "B", "2026-10-26T12:10:00Z");
    const stops = getRouteStops([first, second], first, [address("1")]);
    expect(stops).toHaveLength(2);
    expect(stops[1].address).toBeUndefined();
    expect(googleRouteSegments(stops)).toHaveLength(0);
  });
  test("divide links longos em trechos com conexão entre eles", () => {
    const list = Array.from({ length: 7 }, (_, i) => done(String(i+1), "C"+i, "2026-10-26T"+String(12+i).padStart(2,"0")+":00:00Z"));
    const stops = getRouteStops(list, list[0], list.map(d => address(d.companyCode)));
    const links = googleRouteSegments(stops);
    expect(links).toHaveLength(2);
    expect(links[0].last).toBe(links[1].first);
    expect(links.every(l => l.url.includes("waypoints="))).toBe(true);
  });
});

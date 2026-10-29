import { describe, expect, test } from "bun:test";
import { EMPTY_COLLECTION_LOCATIONS, matchingCollectionLocation, applyCollectionLocations } from "./collection-locations";
import { getRouteStops } from "./delivery-route";

const confirmed = {
  collectionId: "c1", companyId: "empresa-x", companyName: "Empresa X",
  address: "Rua Confirmação, 123, Nova Odessa - SP",
  latitude: -22.78, longitude: -47.28,
  confirmedAt: "2026-10-29T12:00:00.000Z",
};
const collection = (id, address = "", companyId = "empresa-x") => ({
  id, company: "Empresa X", companyCode: "", source: "coleta",
  collectionCompanyId: companyId, collectionAddress: address, status: "finalizada",
  createdAt: "2026-10-29T10:00:00Z", finishedAt: "2026-10-29T13:00:00Z",
  driver: "Luciano", position: 1, document: "", value: 0,
  expeditionShift: "manha",
});
describe("endereço Google Maps de coleta", () => {
  const catalog = { defaults: { "empresa-x": confirmed }, specific: { c1: confirmed } };
  test("a coleta específica mantém o ponto confirmado mesmo quando não tinha endereço textual", () => {
    const [fixed] = applyCollectionLocations([collection("c1")], catalog);
    expect(fixed.collectionAddress).toBe(confirmed.address);
    expect(fixed.collectionLatitude).toBe(confirmed.latitude);
    expect(fixed.collectionLocationConfirmedAt).toBe(confirmed.confirmedAt);
  });
  test("coletas futuras da mesma empresa podem reutilizar o endereço confirmado", () => {
    const future = collection("c2", " Rua Confirmação, 123, Nova Odessa - SP ");
    expect(matchingCollectionLocation(future, catalog)).toEqual(confirmed);
    expect(applyCollectionLocations([future], catalog)[0].collectionLongitude).toBe(confirmed.longitude);
  });
  test("um endereço diferente não herda coordenadas do outro local", () => {
    const other = collection("c3", "Rua Distante, 500");
    expect(matchingCollectionLocation(other, catalog)).toBeUndefined();
    // Uma coleta específica com novo endereço não pode continuar no GPS anterior.
    const correctedCatalog = {
      defaults: catalog.defaults,
      specific: { c3: { ...confirmed, collectionId: "c3", initialAddress: "Rua Antiga, 10" } },
    };
    expect(matchingCollectionLocation(other, correctedCatalog)).toBeUndefined();
    expect(applyCollectionLocations([other], catalog)[0].collectionLatitude).toBeUndefined();
  });
  test("outra empresa não herda localização, mesmo usando o nome da mesma rua", () => {
    const other = collection("c4", confirmed.address, "empresa-y");
    expect(matchingCollectionLocation(other, catalog)).toBeUndefined();
  });
  test("o mapa usa as coordenadas da confirmação e mantém a coleta como parada única", () => {
    const [fixed] = applyCollectionLocations([collection("c1")], catalog);
    const origin = { client_code: "1", address: "Av. Ampélio Gazetta",
      neighborhood: "", city: "Nova Odessa", state: "SP" };
    const stops = getRouteStops([fixed], fixed, [origin], origin);
    expect(stops).toHaveLength(2);
    expect(stops[0].kind).toBe("origin");
    expect(stops[1].deliveries).toHaveLength(1);
    expect(stops[1].address?.latitude).toBe(confirmed.latitude);
    expect(stops[1].address?.locationSource).toBe("google_maps");
  });
  test("não reescreve os pedidos originais nem afeta entregas normais", () => {
    const row = collection("c1");
    const normal = { ...row, id: "nota", source: "conferencia" };
    const originals = JSON.stringify([row, normal]);
    const projected = applyCollectionLocations([row, normal], catalog);
    expect(projected[1]).toBe(normal);
    expect(JSON.stringify([row, normal])).toBe(originals);
    expect(EMPTY_COLLECTION_LOCATIONS).toEqual({ defaults: {}, specific: {} });
  });
});

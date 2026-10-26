import { describe, expect, test } from "bun:test";
import { parseGoogleMapsPoint, googleMapsPointUrl, googleMapsSearchUrl } from "./google-maps-location";
import { mergeDeliveryAddress } from "./delivery-addresses";

const address = {
  client_code: "519", address: "Rua das Flores, 10",
  neighborhood: "Centro", city: "Nova Odessa", state: "SP",
};

describe("confirmação de local no Google Maps", () => {
  test("aceita latitude/longitude copiadas do marcador", () => {
    expect(parseGoogleMapsPoint("-22.7771234, -47.2934567")).toEqual({
      latitude: -22.7771234, longitude: -47.2934567,
    });
  });
  test("aceita URL de resultado com !3d e !4d, não o centro do mapa", () => {
    expect(parseGoogleMapsPoint("https://www.google.com/maps/place/Cliente/@-22.70,-47.20,17z/data=!3m1!4b1!3d-22.7771234!4d-47.2934567")).toEqual({
      latitude: -22.7771234, longitude: -47.2934567,
    });
    expect(parseGoogleMapsPoint("https://www.google.com/maps/@-22.7771234,-47.2934567,18z")).toBeNull();
  });
  test("aceita URL oficial de pesquisa por coordenadas", () => {
    const expected = { latitude: -22.7771234, longitude: -47.2934567 };
    expect(parseGoogleMapsPoint(googleMapsPointUrl(expected))).toEqual(expected);
    expect(googleMapsSearchUrl(address, "Cliente ABC")).toContain("google.com/maps/search");
  });
  test("rejeita URL curta, URL não Google, coordenadas fora do Brasil e entradas sem latitude/longitude", () => {
    expect(parseGoogleMapsPoint("https://maps.app.goo.gl/xxxx")).toBeNull();
    expect(parseGoogleMapsPoint("https://example.org/pos?query=-22.7771234,-47.2934567")).toBeNull();
    expect(parseGoogleMapsPoint("https://www.google.evil/maps?q=-22.7771234,-47.2934567")).toBeNull();
    expect(parseGoogleMapsPoint("22.7771234, -47.2934567")).toBeNull();
    expect(parseGoogleMapsPoint("Rua das Flores, Nova Odessa")).toBeNull();
  });
  test("mantém confirmação após CSV do mesmo endereço e invalida após alteração", () => {
    const validated = {
      ...address,
      latitude: -22.7771234, longitude: -47.2934567,
      locationSource: "google_maps", locationConfirmedAt: "2026-10-26T21:00:00.000Z",
    };
    expect(mergeDeliveryAddress(validated, { ...address }).latitude).toBe(-22.7771234);
    expect(mergeDeliveryAddress(validated, { ...address, address: "Rua Nova, 20" }).latitude).toBeUndefined();
  });
});

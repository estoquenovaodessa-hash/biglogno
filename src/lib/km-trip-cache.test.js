import { describe, expect, test } from "bun:test";
import { kmTripSignature, readCachedTripKm, saveCachedTripKm } from "./km-trip-cache";

const makeStorage = () => {
  const data = new Map();
  return {
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
    entries: data,
  };
};
const address = (street, point) => ({
  client_code: "24", address: street, neighborhood: "Centro",
  city: "Nova Odessa", state: "SP",
  ...(point ? { locationSource: "google_maps", latitude: point[0], longitude: point[1] } : {}),
});
const stop = (key, at, place) => ({
  key, at, company: key, clientCode: "24", deliveries: [],
  ...(place ? { address: place } : {}),
});
const trip = (stops) => ({
  key: "marcelo|2026-11-13|manha", employeeId: "1", name: "Marcelo",
  day: "2026-11-13", shift: "manha", visits: 2, documents: 2,
  stops: [
    { ...stop("loja", "2026-11-13T09:00:00Z", address("Loja")), kind: "origin" },
    ...stops,
  ],
});
const example = () => trip([
  stop("24a", "2026-11-13T09:30:00Z", address("Rua A 20")),
  stop("24b", "2026-11-13T10:05:00Z", address("Rua B 40")),
]);
const valid = { meters: 6200, legs: [2800, 3400] };

describe("cache persistente de KM completos", () => {
  test("reabre a mesma viagem sem rede preservando KM e distâncias entre paradas", () => {
    const storage = makeStorage();
    expect(readCachedTripKm(example(), { storage, now: 1000 })).toBeUndefined();
    expect(saveCachedTripKm(example(), valid, { storage, now: 1000 })).toBe(true);
    expect(readCachedTripKm(example(), { storage, now: 1100 })).toEqual(valid);
    expect(storage.entries.size).toBe(1);
  });

  test("uma correção textual ou confirmação de coordenadas invalida automaticamente o cache", () => {
    const storage = makeStorage();
    const original = example();
    saveCachedTripKm(original, valid, { storage, now: 1000 });
    const corrected = example();
    corrected.stops[1].address.address = "Rua Corrigida 25";
    expect(kmTripSignature(corrected)).not.toBe(kmTripSignature(original));
    expect(readCachedTripKm(corrected, { storage, now: 1100 })).toBeUndefined();
    // Persistir outra vez e confirmar mudança de coordenadas.
    saveCachedTripKm(corrected, valid, { storage, now: 1200 });
    const confirmed = example();
    confirmed.stops[1].address = address("Rua Corrigida 25", [-22.765, -47.29]);
    expect(readCachedTripKm(confirmed, { storage, now: 1300 })).toBeUndefined();
  });

  test("nova parada, troca de ordem ou de horário obriga novo cálculo", () => {
    const storage = makeStorage();
    saveCachedTripKm(example(), valid, { storage, now: 1000 });
    const changedOrder = example();
    changedOrder.stops.reverse();
    expect(readCachedTripKm(changedOrder, { storage, now: 1100 })).toBeUndefined();
    const changedTime = example();
    changedTime.stops[2].at = "2026-11-13T10:10:00Z";
    expect(readCachedTripKm(changedTime, { storage, now: 1100 })).toBeUndefined();
    const moreStops = example();
    moreStops.stops.push(stop("24c", "2026-11-13T10:45:00Z", address("Rua C")));
    expect(readCachedTripKm(moreStops, { storage, now: 1100 })).toBeUndefined();
  });

  test("resultados vencidos não são reutilizados; evita KM antigos indefinidamente", () => {
    const storage = makeStorage();
    saveCachedTripKm(example(), valid, { storage, now: 1000 });
    const fifteenDays = 15 * 24 * 60 * 60 * 1000;
    expect(readCachedTripKm(example(), { storage, now: 1000 + fifteenDays })).toBeUndefined();
    expect(storage.entries.size).toBe(0);
  });

  test("falhas e distâncias parciais não são cacheadas nem somadas como completas", () => {
    const storage = makeStorage();
    const reference = example();
    expect(saveCachedTripKm(reference, { meters: null, failureKind: "routing" }, { storage })).toBe(false);
    expect(saveCachedTripKm(reference, { meters: 2800, legs: [2800] }, { storage })).toBe(false);
    expect(saveCachedTripKm(reference, { meters: 6400, legs: [2800, 3400] }, { storage })).toBe(false);
    expect(storage.entries.size).toBe(0);
  });

  test("cache inacessível ou corrompido não impede novas consultas", () => {
    const storage = makeStorage();
    saveCachedTripKm(example(), valid, { storage, now: 1000 });
    for (const key of storage.entries.keys()) storage.entries.set(key, "{broken");
    expect(readCachedTripKm(example(), { storage, now: 1100 })).toBeUndefined();
    const denied = {
      getItem() { throw new Error("storage blocked"); },
      setItem() { throw new Error("storage blocked"); },
      removeItem() { throw new Error("storage blocked"); },
    };
    expect(readCachedTripKm(example(), { storage: denied })).toBeUndefined();
    expect(saveCachedTripKm(example(), valid, { storage: denied })).toBe(false);
  });
});

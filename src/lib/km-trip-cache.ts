import type { EstimatedKmResult, EstimatedKmTrip } from "./delivery-estimated-km";

const CACHE_PREFIX = "biglogno:km-trip-complete:v1:";
const CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type CacheRecord = {
  signature: string;
  savedAt: number;
  meters: number;
  legs: number[];
};

function defaultStorage(): StorageLike | undefined {
  try { return typeof localStorage === "undefined" ? undefined : localStorage; }
  catch { return undefined; }
}

/** Inclui a ordem real das paradas, horários, endereço textual e coordenadas
 * confirmadas. Qualquer correção de endereço ou alteração da rota invalida
 * automaticamente o KM antigo, mesmo após recarregar o navegador. */
export function kmTripSignature(trip: EstimatedKmTrip): string {
  return JSON.stringify([
    trip.key,
    trip.stops.map(stop => {
      const address = stop.address;
      return [
        stop.kind ?? "", stop.key, stop.at,
        address ? [
          address.client_code, address.address, address.neighborhood,
          address.city, address.state, address.locationSource ?? "",
          address.latitude ?? null, address.longitude ?? null,
        ] : null,
      ];
    }),
  ]);
}

function validResult(
  result: Pick<CacheRecord, "meters" | "legs">,
  trip: EstimatedKmTrip,
): boolean {
  return Number.isFinite(result.meters) && result.meters >= 0 &&
    Array.isArray(result.legs) && result.legs.length === trip.stops.length - 1 &&
    result.legs.every(meters => Number.isFinite(meters) && meters >= 0) &&
    Math.abs(result.legs.reduce((sum, meters) => sum + meters, 0) - result.meters) < 0.01 &&
    trip.stops.length >= 2 && trip.stops[0]?.kind === "origin";
}

function cacheKey(trip: EstimatedKmTrip): string {
  return CACHE_PREFIX + encodeURIComponent(trip.key);
}

export function readCachedTripKm(
  trip: EstimatedKmTrip,
  opts: { storage?: StorageLike; now?: number } = {},
): EstimatedKmResult | undefined {
  const storage = opts.storage ?? defaultStorage();
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(cacheKey(trip));
    if (!raw) return undefined;
    const item = JSON.parse(raw) as CacheRecord;
    const now = opts.now ?? Date.now();
    if (item.signature !== kmTripSignature(trip) ||
        !Number.isFinite(item.savedAt) ||
        item.savedAt > now || now - item.savedAt > CACHE_MAX_AGE_MS ||
        !validResult(item, trip)) {
      // Não mostrar dados antigos; apaga o cache inválido desta viagem.
      storage.removeItem(cacheKey(trip));
      return undefined;
    }
    return { meters: item.meters, legs: item.legs };
  } catch { return undefined; } // localStorage pode estar bloqueado/desabilitado.
}

/** Só grava rotas 100% calculadas. Falha do servidor, falta de endereço e
 * trecho desconectado nunca viram zero nem resultado permanente de cache. */
export function saveCachedTripKm(
  trip: EstimatedKmTrip,
  result: EstimatedKmResult,
  opts: { storage?: StorageLike; now?: number } = {},
): boolean {
  if (typeof result.meters !== "number" || !result.legs ||
      !validResult({ meters: result.meters, legs: result.legs }, trip)) return false;
  const storage = opts.storage ?? defaultStorage();
  if (!storage) return false;
  try {
    storage.setItem(cacheKey(trip), JSON.stringify({
      signature: kmTripSignature(trip), savedAt: opts.now ?? Date.now(),
      meters: result.meters, legs: result.legs,
    } satisfies CacheRecord));
    return true;
  } catch { return false; } // Cota de armazenamento, modo anônimo etc.
}

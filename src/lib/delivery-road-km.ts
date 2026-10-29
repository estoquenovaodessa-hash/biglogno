import type { DeliveryClientAddress } from "./delivery-addresses";
import { fullDeliveryAddress, type RouteStop } from "./delivery-route";
import { completedRouteKilometers, type EstimatedKmResult } from "./delivery-estimated-km";

type Point = { lat: number; lng: number };
type GeocodeEntry = { at: number; point: Point | null };
const GEO_PREFIX = "biglogno:route-geocode:v2:";
const ROAD_PREFIX = "biglogno:road-km:v1:";
const GEO_MAX_AGE = 90 * 86400000;
const ROAD_MAX_AGE = 30 * 86400000;
const MAX_POINTS = 10;
let lastLookup = 0;
let lookupTail: Promise<void> = Promise.resolve();

function safeRead(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeWrite(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* cache opcional */ }
}
function isPoint(point: unknown): point is Point {
  const p = point as Point | null;
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}

async function geocode(address: DeliveryClientAddress, signal: AbortSignal): Promise<Point | null> {
  // Localização validada no Google Maps pelo gestor sempre tem prioridade.
  if (address.locationSource === "google_maps" &&
      Number.isFinite(address.latitude) && Number.isFinite(address.longitude))
    return { lat: address.latitude!, lng: address.longitude! };
  const label = fullDeliveryAddress(address);
  const cacheKey = GEO_PREFIX + label;
  const cache = safeRead(cacheKey);
  if (cache) {
    try {
      const previous = JSON.parse(cache) as GeocodeEntry;
      if (Date.now() - previous.at < (previous.point ? GEO_MAX_AGE : 7 * 86400000))
        return isPoint(previous.point) ? previous.point : null;
    } catch { /* resolve o endereço novamente */ }
  }

  // Uma consulta de geocodificação por vez para não sobrecarregar serviços públicos.
  let unlock!: () => void;
  const current = new Promise<void>(resolve => { unlock = resolve; });
  const previous = lookupTail;
  lookupTail = current;
  await previous;
  try {
    if (signal.aborted) throw new DOMException("Operação cancelada.", "AbortError");
    const wait = Math.max(0, 1300 - (Date.now() - lastLookup));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    if (signal.aborted) throw new DOMException("Operação cancelada.", "AbortError");
    lastLookup = Date.now();
    const query = [address.address, address.city, address.state, "Brasil"].filter(Boolean).join(", ");
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "br");
    url.searchParams.set("q", query);
    const response = await fetch(url, { signal, headers: { "Accept-Language": "pt-BR" } });
    if (!response.ok) throw new Error("Geocodificação temporariamente indisponível.");
    const data = await response.json() as Array<{ lat: string; lon: string }>;
    const point = { lat: Number(data[0]?.lat), lng: Number(data[0]?.lon) };
    const resolved = data.length && isPoint(point) ? point : null;
    safeWrite(cacheKey, { at: Date.now(), point: resolved });
    return resolved;
  } finally {
    unlock();
  }
}

async function roadLegs(points: Point[], signal: AbortSignal): Promise<number[]> {
  const coordinateKey = points.map(p => p.lng.toFixed(6) + "," + p.lat.toFixed(6)).join(";");
  const key = ROAD_PREFIX + coordinateKey;
  const cache = safeRead(key);
  if (cache) {
    try {
      const entry = JSON.parse(cache) as { at: number; legs: number[] };
      if (Date.now() - entry.at < ROAD_MAX_AGE && entry.legs.length === points.length - 1 &&
          entry.legs.every(value => Number.isFinite(value) && value >= 0)) return entry.legs;
    } catch { /* refaz consulta */ }
  }
  const url = "https://router.project-osrm.org/route/v1/driving/" + coordinateKey
    + "?overview=false&steps=false";
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Serviço de distâncias por ruas indisponível.");
  const payload = await response.json() as { code?: string; routes?: Array<{
    legs?: Array<{ distance?: number }>;
  }> };
  const legs = payload.routes?.[0]?.legs?.map(leg => leg.distance) ?? [];
  if (payload.code !== "Ok" || legs.length !== points.length - 1 ||
      legs.some(value => !Number.isFinite(value) || value === undefined || value < 0))
    throw new Error("Não foi possível determinar todos os trechos por vias.");
  const distances = legs as number[];
  safeWrite(key, { at: Date.now(), legs: distances });
  return distances;
}

/** Loja → 1ª parada → ... → última parada do TURNO. Não inclui retorno
 * não informado à loja. Não usa GPS nem linha reta. Não soma rotas parciais. */
export async function calculateEstimatedTripKm(
  stops: RouteStop[], signal: AbortSignal,
): Promise<EstimatedKmResult> {
  if (!stops.length || stops[0]?.kind !== "origin")
    return { meters: null, reason: "Origem BIGNOTTO FERRAMENTAS não cadastrada." };
  if (stops.length < 2) return { meters: null, reason: "Nenhuma parada confirmada." };
  if (stops.some(stop => !stop.address))
    return { meters: null, reason: "Há entregas sem endereço cadastrado." };
  try {
    const points: Point[] = [];
    for (const stop of stops) {
      if (signal.aborted) throw new DOMException("Operação cancelada.", "AbortError");
      const point = await geocode(stop.address!, signal);
      if (!point) return { meters: null, reason: "Endereço não localizado: " + stop.company };
      points.push(point);
    }
    const lengths: number[] = [];
    for (let first = 0; first < points.length - 1; first += MAX_POINTS - 1) {
      if (signal.aborted) throw new DOMException("Operação cancelada.", "AbortError");
      const chunk = points.slice(first, first + MAX_POINTS);
      const legs = await roadLegs(chunk, signal);
      lengths.push(...legs);
    }
    const result = completedRouteKilometers(stops, lengths);
    return result.meters === null ? result : { ...result, legs: lengths };
  } catch (error) {
    if (signal.aborted) throw error;
    return { meters: null, reason: error instanceof Error ? error.message : "Falha ao calcular percurso pelas ruas." };
  }
}

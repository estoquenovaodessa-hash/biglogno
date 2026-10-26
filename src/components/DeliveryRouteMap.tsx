import { useEffect, useRef, useState } from "react";
import type { RouteStop } from "@/lib/delivery-route";
import { fullDeliveryAddress } from "@/lib/delivery-route";
import "leaflet/dist/leaflet.css";

type Point = { lat: number; lng: number };
type LocatedStop = { index: number; stop: RouteStop; point: Point };
type LookupEntry = { at: number; point: Point | null };
type RouteResponse = {
  code?: string;
  routes?: Array<{ geometry?: { type?: string; coordinates?: number[][] } }>;
};
const CACHE_PREFIX = "biglogno:route-geocode:v2:";
const PREVIOUS_CACHE_PREFIX = "biglogno:route-geocode:v1:";
const ROUTE_CACHE_PREFIX = "biglogno:road-route:v1:";
const CACHE_TTL = 90 * 86400000;
const EMPTY_TTL = 7 * 86400000;
const ROAD_TTL = 24 * 60 * 60 * 1000;
const MAX_WAYPOINTS = 10;
let lastPublicLookup = 0;
let lookupQueue: Promise<void> = Promise.resolve();

function fromCache(query: string): Point | null | undefined {
  try {
    const saved = localStorage.getItem(CACHE_PREFIX + query);
    if (!saved) return undefined;
    const entry = JSON.parse(saved) as LookupEntry;
    if (Date.now() - entry.at > (entry.point ? CACHE_TTL : EMPTY_TTL)) return undefined;
    return entry.point;
  } catch { return undefined; }
}

function toCache(query: string, point: Point | null) {
  try { localStorage.setItem(CACHE_PREFIX + query, JSON.stringify({ at: Date.now(), point })); }
  catch { /* Cache opcional. */ }
}

/** Geocodificação de endereços somente quando o gestor abre o mapa.
 * A fila e o cache respeitam o limite de um pedido por segundo do Nominatim público. */
async function locate(stop: RouteStop, signal: AbortSignal): Promise<Point | null> {
  const address = stop.address!;
  const query = fullDeliveryAddress(address);
  const cached = fromCache(query);
  if (cached !== undefined) return cached;
  // Reaproveita localizações já resolvidas antes desta correção.
  try {
    const earlier = localStorage.getItem(PREVIOUS_CACHE_PREFIX + query);
    if (earlier) {
      const parsed = JSON.parse(earlier) as LookupEntry;
      if (parsed.point && Date.now() - parsed.at < CACHE_TTL) {
        toCache(query, parsed.point);
        return parsed.point;
      }
    }
  } catch { /* Continuar com a consulta normal. */ }
  let release!: () => void;
  const next = new Promise<void>(resolve => { release = resolve; });
  const previous = lookupQueue;
  lookupQueue = next;
  await previous;
  try {
    if (signal.aborted) return null;
    const delay = Math.max(0, 1200 - (Date.now() - lastPublicLookup));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (signal.aborted) return null;
    lastPublicLookup = Date.now();
    const candidates = [
      // Retirar o bairro evita falhas em ruas pequenas ou cadastros de bairro abreviados.
      [address.address, address.city, address.state, "Brasil"].filter(Boolean).join(", "),
      query,
    ].filter((candidate, index, list) => list.indexOf(candidate) === index);
    for (const candidate of candidates) {
      if (signal.aborted) return null;
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", "br");
      url.searchParams.set("q", candidate);
      const response = await fetch(url, {
        signal, headers: { "Accept-Language": "pt-BR" },
      });
      if (!response.ok) throw new Error("Busca de endereços indisponível (HTTP " + response.status + ").");
      const results: { lat: string; lon: string }[] = await response.json();
      const lat = Number(results[0]?.lat), lng = Number(results[0]?.lon);
      if (results.length && Number.isFinite(lat) && Number.isFinite(lng)) {
        const point = { lat, lng };
        toCache(query, point);
        return point;
      }
      if (candidate !== candidates[candidates.length - 1]) {
        const pause = Math.max(0, 1200 - (Date.now() - lastPublicLookup));
        if (pause) await new Promise(resolve => setTimeout(resolve, pause));
        lastPublicLookup = Date.now();
      }
    }
    toCache(query, null);
    return null;
  } finally { release(); }
}

/** Consulta a geometria viária pela ordem dada. Nunca usa otimização de rota,
 * pois ela mudaria a sequência efetivamente registrada nas entregas. */
async function drivingGeometry(points: Point[], signal: AbortSignal): Promise<[number, number][]> {
  const query = points.map(point => point.lng.toFixed(6) + "," + point.lat.toFixed(6)).join(";");
  const cacheKey = ROUTE_CACHE_PREFIX + query;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null") as { at: number; coordinates: [number, number][] } | null;
    if (cached?.coordinates?.length && Date.now() - cached.at < ROAD_TTL) return cached.coordinates;
  } catch { /* Seguir com consulta on-line. */ }

  const url = "https://router.project-osrm.org/route/v1/driving/" + query
    + "?overview=full&geometries=geojson&steps=false";
  const response = await fetch(url, { signal, referrerPolicy: "strict-origin-when-cross-origin" });
  if (!response.ok) throw new Error("Serviço de rotas indisponível.");
  const result = (await response.json()) as RouteResponse;
  if (result.code !== "Ok") throw new Error("Não foi possível calcular o trajeto pelas ruas.");
  const coordinates = result.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error("O serviço de rotas não retornou um percurso válido.");
  }
  const geometry = coordinates.map(pair => [pair[1], pair[0]] as [number, number])
    .filter(pair => pair.length === 2 && pair.every(Number.isFinite));
  if (geometry.length < 2) throw new Error("Geometria da rota inválida.");
  try {
    const value = JSON.stringify({ at: Date.now(), coordinates: geometry });
    if (value.length < 240000) localStorage.setItem(cacheKey, value);
  } catch { /* Cache opcional. */ }
  return geometry;
}

/** Quando um endereço estiver ausente, não liga os pontos através dele:
 * somente trechos consecutivos e localizados podem virar rota nas ruas. */
function consecutiveGroups(stops: RouteStop[], located: LocatedStop[]): LocatedStop[][] {
  const byIndex = new Map(located.map(entry => [entry.index, entry]));
  const groups: LocatedStop[][] = [];
  let current: LocatedStop[] = [];
  for (let index = 0; index < stops.length; index++) {
    const entry = byIndex.get(index);
    if (entry) current.push(entry);
    else {
      if (current.length >= 2) groups.push(current);
      current = [];
    }
  }
  if (current.length >= 2) groups.push(current);
  return groups;
}

export function DeliveryRouteMap({ stops }: { stops: RouteStop[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState({ done: 0, found: 0, total: 0 });
  const [routeState, setRouteState] = useState<"loading" | "road" | "partial" | "unavailable">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const element = container.current;
    if (!element || stops.length === 0) return;
    let cancelled = false;
    const controller = new AbortController();
    let map: import("leaflet").Map | null = null;
    const validCount = stops.filter(stop => !!stop.address).length;
    setProgress({ done: 0, found: 0, total: validCount });
    setRouteState("loading");
    setError("");

    async function renderMap() {
      const L = await import("leaflet");
      if (cancelled || !element) return;
      map = L.map(element, { scrollWheelZoom: false, zoomControl: false })
        .setView([-22.78, -47.29], 10);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map);

      const roadLayer = L.layerGroup().addTo(map);
      const markerLayer = L.layerGroup().addTo(map);
      const located: LocatedStop[] = [];
      let done = 0;
      for (const [index, stop] of stops.entries()) {
        if (cancelled) return;
        if (!stop.address) continue;
        let point: Point | null = null;
        try {
          point = await locate(stop, controller.signal);
        } catch (cause) {
          if (cancelled) return;
          setError(cause instanceof Error ? cause.message : "Alguns endereços não foram localizados.");
        }
        if (cancelled || !map) return;
        done++;
        if (point) {
          located.push({ index, stop, point });
          const isFirst = index === 0;
          const icon = L.divIcon({
            className: "biglogno-route-marker",
            html: '<span class="biglogno-route-pin ' + (isFirst ? "biglogno-route-pin--start" : "biglogno-route-pin--stop") + '"><span>' + (index + 1) + '</span></span>',
            iconSize: [40, 40], iconAnchor: [20, 20], popupAnchor: [0, -23],
          });
          const marker = L.marker([point.lat, point.lng], {
            icon, zIndexOffset: 1000 + index,
            title: (index + 1) + "ª parada: " + stop.company,
          }).addTo(markerLayer);
          const popup = document.createElement("div");
          const heading = document.createElement("strong");
          heading.textContent = (index + 1) + "ª parada · " + stop.company;
          const addressText = document.createElement("p");
          addressText.textContent = fullDeliveryAddress(stop.address);
          const docs = document.createElement("p");
          docs.textContent = "Notas: " + stop.deliveries.map(delivery =>
            delivery.onlyDelivery ? "Somente entrega" : delivery.document).join(", ");
          popup.append(heading, addressText, docs);
          marker.bindPopup(popup);
          const coordinates = located.map(entry => [entry.point.lat, entry.point.lng] as [number, number]);
          if (coordinates.length === 1) map.setView(coordinates[0], 13);
          else map.fitBounds(L.latLngBounds(coordinates), { padding: [50, 50], maxZoom: 14 });
        }
        setProgress({ done, found: located.length, total: validCount });
      }
      if (cancelled || !map) return;
      if (!located.length) {
        setRouteState("unavailable");
        setError("Os endereços não puderam ser localizados. Confira o cadastro dos clientes.");
        return;
      }

      const groups = consecutiveGroups(stops, located);
      let roadsDrawn = 0;
      let failures = 0;
      // Até 10 paradas por consulta, com uma parada repetida entre trechos,
      // preservando a ordem das visitas sem reordenar os pontos.
      for (const group of groups) {
        for (let start = 0; start < group.length - 1; start += MAX_WAYPOINTS - 1) {
          if (cancelled) return;
          const chunk = group.slice(start, start + MAX_WAYPOINTS);
          if (chunk.length < 2) continue;
          const points = chunk.map(entry => entry.point);
          try {
            const line = await drivingGeometry(points, controller.signal);
            if (cancelled) return;
            L.polyline(line, { color: "#ffffff", weight: 9, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(roadLayer);
            L.polyline(line, { color: "#2864df", weight: 5.5, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(roadLayer);
            roadsDrawn++;
          } catch (cause) {
            if (cancelled) return;
            failures++;
            // Somente como alternativa: linha pontilhada explicitamente estimada.
            const endpoints: [number, number][] = points.map(point => [point.lat, point.lng]);
            L.polyline(endpoints, { color: "#6d86b6", weight: 3, opacity: 0.85, dashArray: "7 9" }).addTo(roadLayer);
            setError(cause instanceof Error ? cause.message : "Trajeto rodoviário indisponível.");
          }
        }
      }
      if (cancelled || !map) return;



      const coordinates = located.map(entry => [entry.point.lat, entry.point.lng] as [number, number]);
      if (coordinates.length > 1) map.fitBounds(L.latLngBounds(coordinates), { padding: [60, 60], maxZoom: 14 });
      const expected = groups.reduce((sum, group) => sum + Math.ceil((group.length - 1) / (MAX_WAYPOINTS - 1)), 0);
      setRouteState(!expected ? "unavailable" : failures ? "partial" : roadsDrawn ? "road" : "unavailable");
      if (!expected && located.length > 1) setError("Endereços intermediários ausentes: não é possível ligar as paradas com segurança.");
    }

    void renderMap().catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Mapa indisponível.");
    });
    return () => { cancelled = true; controller.abort(); map?.remove(); };
  }, [stops]);

  return <div className="biglogno-route-map-shell relative overflow-hidden rounded-2xl border border-border bg-[#e9f1e9]">
    <div ref={container} className="h-[380px] w-full sm:h-[490px]" role="region" aria-label="Mapa das entregas em sequência pelas ruas" />
    <div className="pointer-events-none absolute left-3 top-3 z-[500] max-w-[calc(100%-24px)] rounded-xl border border-white/90 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 shadow-md">
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-[#2864df]" />
        {routeState === "road" ? "Trajeto estimado pelas ruas" : routeState === "partial" ? "Alguns trechos não puderam ser roteados" : "Sequência das entregas"}
      </span>
      {progress.total > 0 && progress.done < progress.total
        ? <span className="mt-1 block text-slate-500">Localizando {progress.done}/{progress.total} endereços...</span>
        : <span className="mt-1 block text-slate-500">{progress.found} de {stops.length} paradas no mapa</span>}
      {routeState === "partial" && <span className="mt-1 block text-slate-500">Linhas pontilhadas não seguem necessariamente as ruas.</span>}
    </div>
    {error && <div role="status" className="absolute bottom-3 left-3 z-[500] max-w-[75%] rounded-lg bg-white/95 p-2 text-xs text-amber-800 shadow-sm">{error}</div>}
  </div>;
}

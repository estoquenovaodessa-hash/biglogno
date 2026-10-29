import { useEffect, useRef, useState } from "react";
import type { RouteStop } from "@/lib/delivery-route";
import { fullDeliveryAddress } from "@/lib/delivery-route";
import "leaflet/dist/leaflet.css";

type Point = { lat: number; lng: number };
type LocatedStop = { index: number; stop: RouteStop; point: Point };
type LookupEntry = { at: number; point: Point | null };
import { progressiveRoadLine, roadKmLabel, routeAnimationResumeIndex, type RoadPoint } from "@/lib/delivery-route-animation";

type RoadLeg = { line: RoadPoint[]; meters: number | null };
type RouteResponse = {
  code?: string;
  routes?: Array<{ legs?: Array<{
    distance?: number; steps?: Array<{ geometry?: { coordinates?: number[][] } }>;
  }> }>;
};
const CACHE_PREFIX = "biglogno:route-geocode:v2:";
const PREVIOUS_CACHE_PREFIX = "biglogno:route-geocode:v1:";
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
  // A coordenada confirmada tem prioridade absoluta e não depende de APIs públicas.
  if (address.locationSource === "google_maps" && address.latitude !== undefined && address.longitude !== undefined) {
    return { lat: address.latitude, lng: address.longitude };
  }
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
    let primaryError: unknown = null;
    try {
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
    } catch (cause) {
      if (signal.aborted) return null;
      primaryError = cause;
    }
    // Alternativa de baixa frequência quando o endereço não foi localizado pelo
    // Nominatim. Aceitar somente resultados da mesma cidade e com rua identificada;
    // jamais colocar a parada num centro de município fictício.
    try {
      const url = new URL("https://photon.komoot.io/api/");
      url.searchParams.set("q", [address.address, address.city, address.state].join(", "));
      url.searchParams.set("countrycode", "BR");
      url.searchParams.set("limit", "5");
      const response = await fetch(url, { signal });
      if (response.ok) {
        const data = await response.json() as { features?: Array<{
          geometry?: { coordinates?: number[] };
          properties?: { city?: string; county?: string; street?: string; name?: string; osm_key?: string };
        }> };
        const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
        const city = normalized(address.city);
        const street = normalized(address.address.replace(/\b\d+[a-z]?\b/gi, ""));
        const best = data.features?.find(feature => {
          const place = normalized(feature.properties?.city ?? feature.properties?.county ?? "");
          const road = normalized(feature.properties?.street ?? (feature.properties?.osm_key === "highway" ? feature.properties?.name ?? "" : ""));
          const coords = feature.geometry?.coordinates ?? [];
          return place === city && street.length >= 5 && road.length >= 5
            && (road.includes(street) || street.includes(road))
            && Number.isFinite(coords[0]) && Number.isFinite(coords[1]);
        });
        if (best?.geometry?.coordinates) {
          const [lng, lat] = best.geometry.coordinates;
          const point = { lat, lng };
          toCache(query, point);
          return point;
        }
      }
    } catch {
      if (signal.aborted) return null;
      // O serviço alternativo é opcional; sua indisponibilidade não apaga os
      // resultados já localizados e nem bloqueia a sequência das entregas.
    }
    if (primaryError) throw primaryError;
    toCache(query, null);
    return null;
  } finally { release(); }
}

/** Consulta a geometria viária pela ordem dada. Nunca usa otimização de rota,
 * pois ela mudaria a sequência efetivamente registrada nas entregas. */
async function drivingGeometry(points: Point[], signal: AbortSignal): Promise<RoadLeg[]> {
  const query = points.map(point => point.lng.toFixed(6) + "," + point.lat.toFixed(6)).join(";");
  // v2: a geometria de cada perna + seu KM, não apenas a distância agregada.
  const cacheKey = "biglogno:road-route:v2:" + query;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null") as { at: number; legs?: RoadLeg[] } | null;
    if (cached?.legs?.length === points.length - 1
      && cached.legs.every(leg => leg.line.length >= 2 && typeof leg.meters === "number" && Number.isFinite(leg.meters))
      && Date.now() - cached.at < ROAD_TTL) return cached.legs;
  } catch { /* Cache opcional. */ }

  // O OSRM devolve distância por leg e geometria das ruas em steps; sem
  // otimização de paradas para preservar a ordem efetiva do ciclo.
  const url = "https://router.project-osrm.org/route/v1/driving/" + query
    + "?overview=false&geometries=geojson&steps=true";
  const response = await fetch(url, { signal, referrerPolicy: "strict-origin-when-cross-origin" });
  if (!response.ok) throw new Error("Serviço de rotas indisponível.");
  const result = (await response.json()) as RouteResponse;
  if (result.code !== "Ok") throw new Error("Não foi possível calcular o trajeto pelas ruas.");
  const osrmLegs = result.routes?.[0]?.legs;
  if (!osrmLegs || osrmLegs.length !== points.length - 1)
    throw new Error("Não foi possível discriminar o KM de cada trecho da rota.");

  const legs: RoadLeg[] = osrmLegs.map((leg, index) => {
    const meters = leg.distance;
    if (typeof meters !== "number" || !Number.isFinite(meters) || meters < 0)
      throw new Error("Distância não informada para a parada " + (index + 1) + ".");
    const line: RoadPoint[] = [];
    for (const step of leg.steps ?? []) {
      for (const pair of step.geometry?.coordinates ?? []) {
        if (Array.isArray(pair) && Number.isFinite(pair[0]) && Number.isFinite(pair[1])) {
          const point: RoadPoint = [pair[1], pair[0]];
          const previous = line[line.length - 1];
          if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) line.push(point);
        }
      }
    }
    if (line.length < 2) {
      if (meters !== 0) throw new Error("Geometria da via indisponível para a parada " + (index + 1) + ".");
      return { line: [[points[index].lat, points[index].lng], [points[index + 1].lat, points[index + 1].lng]], meters };
    }
    return { line, meters };
  });
  try {
    const value = JSON.stringify({ at: Date.now(), legs });
    if (value.length < 240000) localStorage.setItem(cacheKey, value);
  } catch { /* Cache opcional. */ }
  return legs;
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

export function DeliveryRouteMap({ stops, onUnresolvedChange, onRoadDistanceChange }: {
  stops: RouteStop[];
  onUnresolvedChange?: (indexes: number[]) => void;
  /** Distância calculada pelo serviço viário, não pelo GPS do entregador. */
  onRoadDistanceChange?: (meters: number | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState({ done: 0, found: 0, total: 0 });
  const [routeState, setRouteState] = useState<"loading" | "road" | "partial" | "unavailable">("loading");
  const [error, setError] = useState("");
  const [notLocated, setNotLocated] = useState<string[]>([]);

  useEffect(() => {
    const element = container.current;
    if (!element || stops.length === 0) return;
    let cancelled = false;
    const controller = new AbortController();
    let map: import("leaflet").Map | null = null;
    const validCount = stops.filter(stop => !!stop.address).length;
    setProgress({ done: 0, found: 0, total: validCount });
    setRouteState("loading");
    onRoadDistanceChange?.(null);
    setError("");
    onUnresolvedChange?.([]);
    setNotLocated([]);

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
      const unresolved: string[] = [];
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
        if (!point) {
          unresolved.push((index + 1) + " · " + stop.company);
          setNotLocated([...unresolved]);
          onUnresolvedChange?.(unresolved.map(item => Number(item.split(" · ")[0]) - 1));
        }
        if (point) {
          located.push({ index, stop, point });
          const isOrigin = stop.kind === "origin";
          const hasOrigin = stops[0]?.kind === "origin";
          const number = isOrigin ? 0 : index + (hasOrigin ? 0 : 1);
          const isFirst = index === 0;
          const icon = L.divIcon({
            className: "biglogno-route-marker",
            html: '<span class="biglogno-route-pin ' + (isFirst ? "biglogno-route-pin--start" : "biglogno-route-pin--stop") + '"><span>' + (isOrigin ? "L" : number) + '</span></span>',
            iconSize: [40, 40], iconAnchor: [20, 20], popupAnchor: [0, -23],
          });
          const marker = L.marker([point.lat, point.lng], {
            icon, zIndexOffset: 1000 + index,
            title: isOrigin ? "Origem: BIGNOTTO FERRAMENTAS" : number + "ª parada: " + stop.company,
          }).addTo(markerLayer);
          const popup = document.createElement("div");
          const heading = document.createElement("strong");
          heading.textContent = isOrigin ? "ORIGEM · BIGNOTTO FERRAMENTAS" : number + "ª parada · " + stop.company;
          const addressText = document.createElement("p");
          addressText.textContent = fullDeliveryAddress(stop.address);
          const docs = document.createElement("p");
          docs.textContent = "Notas: " + stop.deliveries.map(delivery =>
            delivery.onlyDelivery ? "Somente entrega" : delivery.document).join(", ");
          popup.append(heading, addressText);
          if (!isOrigin) popup.append(docs);
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
      let totalRoadMeters = 0;
      // Até 10 paradas por consulta, com uma parada repetida entre trechos,
      // preservando a ordem das visitas sem reordenar os pontos.
      for (const group of groups) {
        for (let start = 0; start < group.length - 1; start += MAX_WAYPOINTS - 1) {
          if (cancelled) return;
          const chunk = group.slice(start, start + MAX_WAYPOINTS);
          if (chunk.length < 2) continue;
          const points = chunk.map(entry => entry.point);
          try {
            const route = await drivingGeometry(points, controller.signal);
            if (cancelled) return;
            totalRoadMeters += route.meters;
            L.polyline(route.line, { color: "#ffffff", weight: 9, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(roadLayer);
            L.polyline(route.line, { color: "#2864df", weight: 5.5, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(roadLayer);
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
      const complete = expected > 0 && failures === 0 && roadsDrawn === expected
        && stops.every(stop => !!stop.address) && located.length === stops.length;
      onRoadDistanceChange?.(complete ? totalRoadMeters : null);
      setRouteState(!expected ? "unavailable" : !complete ? "partial" : "road");
      if (!expected && located.length > 1) setError("Endereços intermediários ausentes: não é possível ligar as paradas com segurança.");
    }

    void renderMap().catch(cause => {
      if (!cancelled) {
        onRoadDistanceChange?.(null);
        setError(cause instanceof Error ? cause.message : "Mapa indisponível.");
      }
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
    {(notLocated.length > 0 || error) && <div role="status" className="absolute bottom-3 left-3 z-[500] max-w-[83%] rounded-lg bg-white/95 p-2 text-xs text-amber-900 shadow-sm">
      {error && <p>{error}</p>}
      {notLocated.length > 0 && <p>Sem localização exata: {notLocated.join(", ")}. Confira ou corrija esses endereços nos cartões abaixo.</p>}
    </div>}
  </div>;
}

import { useEffect, useRef, useState } from "react";
import type { RouteStop } from "@/lib/delivery-route";
import { fullDeliveryAddress } from "@/lib/delivery-route";
import "leaflet/dist/leaflet.css";

type Point = { lat: number; lng: number };
type LookupEntry = { at: number; point: Point | null };
const CACHE_PREFIX = "biglogno:route-geocode:v1:";
const CACHE_TTL = 90 * 86400000;
const EMPTY_TTL = 7 * 86400000;
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
  catch { /* Navegação privada ou armazenamento cheio: o mapa continua operacional. */ }
}

/** Consulta somente quando o gestor abre o percurso, uma busca por vez e com cache.
 * O serviço público não deve ser usado como geocodificador em lote. */
async function locate(query: string, signal: AbortSignal): Promise<Point | null> {
  const cached = fromCache(query);
  if (cached !== undefined) return cached;
  let release!: () => void;
  const next = new Promise<void>(resolve => { release = resolve; });
  const previous = lookupQueue;
  lookupQueue = next;
  await previous;
  try {
    if (signal.aborted) return null;
    const wait = Math.max(0, 1200 - (Date.now() - lastPublicLookup));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    if (signal.aborted) return null;
    lastPublicLookup = Date.now();
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "br");
    url.searchParams.set("q", query);
    const response = await fetch(url, {
      signal, headers: { "Accept-Language": "pt-BR" },
      referrerPolicy: "strict-origin-when-cross-origin",
    });
    if (!response.ok) throw new Error("Geocodificação temporariamente indisponível.");
    const results: { lat: string; lon: string }[] = await response.json();
    const lat = Number(results[0]?.lat), lng = Number(results[0]?.lon);
    const point = results.length && Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng } : null;
    toCache(query, point);
    return point;
  } finally { release(); }
}

export function DeliveryRouteMap({ stops }: { stops: RouteStop[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState({ done: 0, found: 0, total: 0 });
  const [error, setError] = useState("");

  useEffect(() => {
    const element = container.current;
    if (!element || stops.length === 0) return;
    let cancelled = false;
    const controller = new AbortController();
    let map: import("leaflet").Map | null = null;
    setProgress({ done: 0, found: 0, total: stops.filter(s => s.address).length });
    setError("");

    async function renderMap() {
      const L = await import("leaflet");
      if (cancelled || !element) return;
      map = L.map(element, { scrollWheelZoom: false, zoomControl: false })
        .setView([-22.78, -47.29], 10);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map);

      const routePoints: [number, number][] = [];
      let done = 0;
      for (const [index, stop] of stops.entries()) {
        if (cancelled) return;
        if (!stop.address) continue;
        const query = fullDeliveryAddress(stop.address);
        let location: Point | null = null;
        try {
          location = await locate(query, controller.signal);
        } catch (cause) {
          if (cancelled) return;
          setError(cause instanceof Error ? cause.message : "Não foi possível localizar alguns endereços.");
        }
        if (cancelled || !map) return;
        done++;
        if (location) {
          const pos: [number, number] = [location.lat, location.lng];
          routePoints.push(pos);
          const icon = L.divIcon({
            className: "biglogno-route-marker",
            html: '<span class="biglogno-route-pin"><span>' + (index + 1) + '</span></span>',
            iconSize: [40, 48], iconAnchor: [20, 46], popupAnchor: [0, -40],
          });
          const marker = L.marker(pos, { icon, title: "Parada " + (index + 1) + ": " + stop.company }).addTo(map);
          const popup = document.createElement("div");
          const heading = document.createElement("strong");
          heading.textContent = (index + 1) + "ª parada · " + stop.company;
          const address = document.createElement("p");
          address.textContent = query;
          const docs = document.createElement("p");
          docs.textContent = "Notas: " + stop.deliveries.map(d => d.onlyDelivery ? "Somente entrega" : d.document).join(", ");
          popup.append(heading, address, docs);
          marker.bindPopup(popup);
          // Segmentos retos apenas conectam locais geocodificados; NÃO são estradas nem GPS.
          if (routePoints.length > 1) {
            L.polyline(routePoints.slice(-2), {
              color: "#ffffff", weight: 9, opacity: 0.9,
            }).addTo(map);
            L.polyline(routePoints.slice(-2), {
              color: "#2989f5", weight: 5, opacity: 0.95, dashArray: "10 8",
            }).addTo(map);
          }
          if (routePoints.length === 1) map.setView(pos, 13);
          else map.fitBounds(L.latLngBounds(routePoints), { padding: [45, 45], maxZoom: 14 });
        }
        setProgress({ done, found: routePoints.length, total: stops.filter(s => s.address).length });
      }
      if (!cancelled && routePoints.length === 0) setError("Nenhum endereço pôde ser localizado no mapa. Confira os cadastros ou abra a rota no Google Maps.");
    }

    void renderMap().catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Mapa indisponível.");
    });
    return () => { cancelled = true; controller.abort(); map?.remove(); };
  }, [stops]);

  return <div className="relative overflow-hidden rounded-2xl border border-border bg-[#e9f1e9]">
    <div ref={container} className="h-[310px] w-full sm:h-[400px]" role="region" aria-label="Mapa interativo da sequência de entregas" />
    <div className="pointer-events-none absolute left-3 top-3 z-[500] max-w-[calc(100%-24px)] rounded-xl border border-white/90 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 shadow-md">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-600" /> Paradas na ordem de finalização</span>
      {progress.total > 0 && progress.done < progress.total && <span className="mt-1 block text-slate-500">Localizando {progress.done}/{progress.total} endereços...</span>}
      {progress.done === progress.total && progress.total > 0 && <span className="mt-1 block text-slate-500">{progress.found} de {progress.total} paradas localizadas</span>}
    </div>
    {error && <div role="status" className="absolute bottom-3 left-3 z-[500] max-w-[75%] rounded-lg bg-white/95 p-2 text-xs text-amber-800 shadow-sm">{error}</div>}
  </div>;
}

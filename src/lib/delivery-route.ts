import type { Delivery } from "./deliveries";
import { normalizeDeliveryClientCode, type DeliveryClientAddress } from "./delivery-addresses";

export interface RouteStop {
  key: string;
  company: string;
  clientCode: string;
  at: string;
  deliveries: Delivery[];
  address?: DeliveryClientAddress;
}

const normalizeName = (value: string) => value.trim().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");

export function deliveryVisitTime(delivery: Delivery): string {
  return delivery.finishedAt || delivery.arrivedAt || "";
}

export function saoPauloDay(iso: string): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(iso));
  const find = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return [find("year"), find("month"), find("day")].join("-");
}

export function fullDeliveryAddress(address: DeliveryClientAddress): string {
  return [address.address, address.neighborhood, address.city, address.state, "Brasil"]
    .filter(Boolean).join(", ");
}

/** Reconstitui a ordem da CONFIRMAÇÃO das entregas, nunca uma trilha de GPS.
 * Várias notas só viram uma parada quando compartilham o mesmo evento de chegada
 * ou de finalização; visitas separadas ao mesmo cliente permanecem separadas. */
export function getRouteStops(deliveries: Delivery[], selected: Delivery, addresses: DeliveryClientAddress[]): RouteStop[] {
  const driverName = normalizeName(selected.driver ?? "");
  if (!driverName) return [];
  const day = saoPauloDay(selected.finishedAt || selected.arrivedAt || selected.startedAt || selected.createdAt);
  if (!day) return [];
  const known = new Map(addresses.map(address => [normalizeDeliveryClientCode(address.client_code), address]));
  const matches = deliveries.filter(delivery => {
    const sameDriver = selected.driverEmployeeId && delivery.driverEmployeeId
      ? selected.driverEmployeeId === delivery.driverEmployeeId
      : normalizeName(delivery.driver ?? "") === driverName;
    const at = deliveryVisitTime(delivery);
    return sameDriver && delivery.status === "finalizada" && !!at && saoPauloDay(at) === day;
  }).sort((a, b) => deliveryVisitTime(a).localeCompare(deliveryVisitTime(b))
    || a.position - b.position || a.id.localeCompare(b.id));

  const stops: RouteStop[] = [];
  for (const delivery of matches) {
    const code = normalizeDeliveryClientCode(delivery.companyCode ?? "");
    const companyKey = code ? "codigo:" + code : "empresa:" + normalizeName(delivery.company);
    const previous = stops[stops.length - 1];
    const firstPrevious = previous?.deliveries[0];
    const sameVisit = firstPrevious && (
      (firstPrevious.arrivedAt && delivery.arrivedAt && firstPrevious.arrivedAt === delivery.arrivedAt)
      || (firstPrevious.finishedAt && delivery.finishedAt && firstPrevious.finishedAt === delivery.finishedAt)
    );
    if (previous?.key === companyKey && sameVisit) {
      previous.deliveries.push(delivery);
    } else {
      stops.push({
        key: companyKey,
        company: delivery.company,
        clientCode: code,
        at: deliveryVisitTime(delivery),
        deliveries: [delivery],
        address: code ? known.get(code) : undefined,
      });
    }
  }
  return stops;
}

/** Uma rota por entregador e data, independente do pedido selecionado no painel.
 * Mostrar a rota mais recente por padrão evita abrir em branco ao selecionar um pendente. */
export function listDeliveryRoutes(deliveries: Delivery[]) {
  const groups = new Map<string, { key: string; name: string; day: string; selected: Delivery; count: number }>();
  const finalized = deliveries.filter(d => d.status === "finalizada" && !!d.driver?.trim() && !!deliveryVisitTime(d))
    .sort((a, b) => deliveryVisitTime(b).localeCompare(deliveryVisitTime(a)) || a.id.localeCompare(b.id));
  for (const delivery of finalized) {
    const day = saoPauloDay(deliveryVisitTime(delivery));
    if (!day) continue;
    const identity = delivery.driverEmployeeId?.trim() || normalizeName(delivery.driver ?? "");
    const key = identity + "|" + day;
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { key, name: delivery.driver!.trim(), day, selected: delivery, count: 1 });
  }
  return [...groups.values()];
}

/** Limita a cinco paradas por link para funcionar também no Google Maps móvel. */
function googleDirectionsPoint(stop: RouteStop): string {
  const address = stop.address!;
  if (address.locationSource === "google_maps" && address.latitude !== undefined && address.longitude !== undefined) {
    return address.latitude.toFixed(7) + "," + address.longitude.toFixed(7);
  }
  return fullDeliveryAddress(address);
}

export function googleRouteSegments(stops: RouteStop[]): { url: string; first: string; last: string }[] {
  if (stops.length < 2 || stops.some(stop => !stop.address)) return [];
  const links: { url: string; first: string; last: string }[] = [];
  for (let i = 0; i < stops.length - 1; i += 4) {
    const group = stops.slice(i, i + 5);
    const params = new URLSearchParams({
      api: "1", origin: googleDirectionsPoint(group[0]),
      destination: googleDirectionsPoint(group[group.length - 1]), travelmode: "driving",
    });
    if (group.length > 2) params.set("waypoints", group.slice(1, -1)
      .map(googleDirectionsPoint).join("|"));
    links.push({ url: "https://www.google.com/maps/dir/?" + params.toString(),
      first: group[0].company, last: group[group.length - 1].company });
  }
  return links;
}

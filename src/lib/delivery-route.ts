import { isConsumerDelivery, type Delivery } from "./deliveries";
import { shiftOf, type ShiftSection } from "./expedition-schedule";
import { normalizeDeliveryClientCode, type DeliveryClientAddress } from "./delivery-addresses";

export interface RouteStop {
  /** Origem fixa, distinta das paradas e da contagem de visitas. */
  kind?: "origin";
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
export function getRouteStops(deliveries: Delivery[], selected: Delivery, addresses: DeliveryClientAddress[], storeOrigin?: DeliveryClientAddress): RouteStop[] {
  const driverName = normalizeName(selected.driver ?? "");
  if (!driverName) return [];
  const day = saoPauloDay(selected.finishedAt || selected.arrivedAt || selected.startedAt || selected.createdAt);
  const shift = shiftOf(selected);
  if (!day) return [];
  const known = new Map(addresses.map(address => [normalizeDeliveryClientCode(address.client_code), address]));
  const matches = deliveries.filter(delivery => {
    const sameDriver = selected.driverEmployeeId && delivery.driverEmployeeId
      ? selected.driverEmployeeId === delivery.driverEmployeeId
      : normalizeName(delivery.driver ?? "") === driverName;
    const at = deliveryVisitTime(delivery);
    return sameDriver && delivery.status === "finalizada" && !!at &&
      saoPauloDay(at) === day && shiftOf(delivery) === shift;
  }).sort((a, b) => deliveryVisitTime(a).localeCompare(deliveryVisitTime(b))
    || a.position - b.position || a.id.localeCompare(b.id));

  const stops: RouteStop[] = [];
  for (const delivery of matches) {
    const code = normalizeDeliveryClientCode(delivery.companyCode ?? "");
    // CONSUMIDOR (100) mantém cada nota individual também na visualização da rota.
    const companyKey = delivery.source === "coleta"
      ? "coleta:" + delivery.id
      : isConsumerDelivery(delivery)
      ? "nota:" + delivery.id
      : code ? "codigo:" + code : "empresa:" + normalizeName(delivery.company);
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
        clientCode: delivery.source === "coleta" ? "" : code,
        at: deliveryVisitTime(delivery),
        deliveries: [delivery],
        address: delivery.source === "coleta" && delivery.collectionAddress
          ? { client_code: "", address: delivery.collectionAddress, neighborhood: "", city: "", state: "" }
          : code ? known.get(code) : undefined,
      });
    }
  }
  // Cada turno sempre parte da loja, inclusive o da tarde.
  // O endereço vem do cadastro: não inventar ponto geográfico se estiver ausente.
  if (storeOrigin && stops.length) {
    stops.unshift({
      kind: "origin", key: "origin:bignotto", company: "BIGNOTTO FERRAMENTAS",
      clientCode: normalizeDeliveryClientCode(storeOrigin.client_code),
      at: matches[0]?.startedAt || matches[0]?.createdAt || "",
      deliveries: [], address: storeOrigin,
    });
  }
  return stops;
}

/** Uma rota por entregador, data E turno, independente do pedido selecionado no painel.
 * Mostrar a rota mais recente por padrão evita abrir em branco ao selecionar um pendente. */
export function listDeliveryRoutes(deliveries: Delivery[]) {
  const groups = new Map<string, { key: string; name: string; day: string; shift: ShiftSection; selected: Delivery; count: number }>();
  const finalized = deliveries.filter(d => d.status === "finalizada" && !!d.driver?.trim() && !!deliveryVisitTime(d))
    .sort((a, b) => deliveryVisitTime(b).localeCompare(deliveryVisitTime(a)) || a.id.localeCompare(b.id));
  for (const delivery of finalized) {
    const day = saoPauloDay(deliveryVisitTime(delivery));
    if (!day) continue;
    const identity = delivery.driverEmployeeId?.trim() || normalizeName(delivery.driver ?? "");
    const shift = shiftOf(delivery);
    const key = identity + "|" + day + "|" + shift;
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { key, name: delivery.driver!.trim(), day, shift, selected: delivery, count: 1 });
  }
  return [...groups.values()];
}

/** Encontra a origem fixa pelo cadastro de clientes E pelo endereço confirmado
 * da Av. Ampélio Gazzetta. Nunca usa um ponto inventado no mapa. */
/** Origem fixa da loja é o cliente CÓDIGO 1 no cadastro de endereços.
 * Não depende do nome fantasia/razão social nem de grafia da avenida.
 * Os endereços podem ser importados com zeros à esquerda (0001 = 1).
 * Se estiver ausente, não inventar coordenadas ou outro cliente. */
export function findBignottoOrigin(
  addresses: DeliveryClientAddress[],
): DeliveryClientAddress | undefined {
  return addresses.find(row =>
    normalizeDeliveryClientCode(row.client_code) === "1"
    && !!row.address?.trim() && !!row.city?.trim() && !!row.state?.trim()
  );
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

import type { EstimatedKmResult, EstimatedKmTrip } from "./delivery-estimated-km";
import type { RouteStop } from "./delivery-route";
import { normalizeDeliveryClientCode } from "./delivery-addresses";
import { shiftLabel } from "./expedition-schedule";

export interface KmAddressIssue {
  key: string;
  stop: RouteStop;
  /** Turnos associados ao mesmo endereço; evita repetir o mesmo cliente. */
  trips: string[];
  reason: string;
}
export interface KmRouteFailure {
  key: string;
  trip: string;
  reason: string;
}

/** Nunca atribuir uma indisponibilidade do roteador a um cliente específico.
 * Retorna paradas somente quando o cálculo identificou ausência de cadastro
 * ou falha real de geocodificação naquele ponto. */
export function unresolvedKmAddresses(
  trips: EstimatedKmTrip[],
  calculated: Record<string, EstimatedKmResult>,
): { issues: KmAddressIssue[]; routeFailures: KmRouteFailure[] } {
  const found = new Map<string, KmAddressIssue>();
  const routeFailures: KmRouteFailure[] = [];
  for (const trip of trips) {
    const result = calculated[trip.key];
    if (!result || typeof result.meters === "number") continue;
    const tripName = trip.name + " · " + trip.day.split("-").reverse().join("/") + " · " + shiftLabel(trip.shift);
    const stops: RouteStop[] = result.failureKind === "origin"
      ? [{
          kind: "origin", key: "origin:bignotto", company: "BIGNOTTO FERRAMENTAS",
          clientCode: "1", at: "", deliveries: [],
        }]
      : (result.problemStopIndices ?? [])
          .map(index => trip.stops[index]).filter((stop): stop is RouteStop => !!stop);
    if (!stops.length) {
      routeFailures.push({ key: trip.key, trip: tripName,
        reason: result.reason || "O serviço de distâncias não conseguiu calcular esta rota." });
      continue;
    }
    for (const stop of stops) {
      const code = normalizeDeliveryClientCode(stop.clientCode);
      const collectionId = stop.deliveries.find(row => row.source === "coleta")?.id;
      const key = stop.kind === "origin" ? "origin:1"
        : collectionId ? "collection:" + collectionId
        : code ? "client:" + code
        : "unknown:" + stop.key + ":" + trip.key;
      const existing = found.get(key);
      if (existing) {
        if (!existing.trips.includes(tripName)) existing.trips.push(tripName);
      } else {
        found.set(key, { key, stop, trips: [tripName],
          reason: result.reason || "Não foi possível localizar o endereço." });
      }
    }
  }
  return { issues: Array.from(found.values()), routeFailures };
}

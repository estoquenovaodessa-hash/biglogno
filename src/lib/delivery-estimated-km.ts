import type { Delivery } from "./deliveries";
import type { DeliveryClientAddress } from "./delivery-addresses";
import type { Employee } from "./employees";
import { getRouteStops, listDeliveryRoutes, type RouteStop } from "./delivery-route";
import { expeditionLocalDay } from "./expedition-history";
import { managerMatchesDriver } from "./manager-delivery-filters";
import type { ShiftSection } from "./expedition-schedule";

export type KmPeriod = "day" | "week" | "month";

export function kmPeriodBounds(date: string, period: KmPeriod): { start: string; end: string } {
  const reference = new Date(date + "T12:00:00Z");
  if (!Number.isFinite(reference.getTime()) || reference.toISOString().slice(0, 10) !== date)
    throw new Error("Data inválida.");
  const start = new Date(reference);
  if (period === "week") start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  if (period === "month") start.setUTCDate(1);
  const end = new Date(start);
  if (period === "day") end.setUTCDate(end.getUTCDate() + 1);
  else if (period === "week") end.setUTCDate(end.getUTCDate() + 7);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function formatRoadKm(meters: number): string {
  return (meters / 1000).toLocaleString("pt-BR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }) + " km";
}

export interface EstimatedKmTrip {
  key: string;
  employeeId: string | null;
  name: string;
  day: string;
  shift: ShiftSection;
  documents: number;
  visits: number;
  stops: RouteStop[];
}

/** Somente entregas finalizadas entram no cálculo. A origem da loja é
 * reiniciada por entregador, dia e turno, sem somar notas unificadas duas vezes.
 * Para registros antigos sem ID, associar entregador por nome cadastrado. */
export function estimatedKmTrips(
  deliveries: Delivery[],
  employees: Employee[],
  addresses: DeliveryClientAddress[],
  storeOrigin: DeliveryClientAddress | undefined,
  date: string,
  period: KmPeriod,
): EstimatedKmTrip[] {
  const { start, end } = kmPeriodBounds(date, period);
  const completed = deliveries.filter(row =>
    row.status === "finalizada" && row.source !== "coleta" && !!row.finishedAt
  );
  return listDeliveryRoutes(completed)
    .filter(route => route.day >= start && route.day < end)
    .map(route => {
      const employee = employees.find(driver =>
        managerMatchesDriver(route.selected, driver.id, employees)
      );
      const stops = getRouteStops(completed, route.selected, addresses, storeOrigin);
      return {
        key: route.key, employeeId: employee?.id ?? null, name: route.name,
        day: route.day, shift: route.shift, documents: route.count,
        visits: stops.filter(stop => stop.kind !== "origin").length, stops,
      };
    })
    .filter(trip => trip.visits > 0);
}

export interface EstimatedKmResult {
  meters: number | null;
  reason?: string;
  /** Em metros, exatamente uma perna por par de endereços consecutivos. */
  legs?: number[];
}

/** Retorna null se qualquer perna não puder ser calculada. Distância parcial
 * NÃO é apresentada como se fosse o total do turno. */
export function completedRouteKilometers(
  stops: RouteStop[], segmentMeters: Array<number | null>,
): EstimatedKmResult {
  if (stops.length < 2 || stops[0]?.kind !== "origin")
    return { meters: null, reason: "Origem da loja não localizada." };
  if (stops.some(stop => !stop.address))
    return { meters: null, reason: "Uma ou mais entregas não possuem endereço." };
  if (segmentMeters.length !== stops.length - 1 || segmentMeters.some(
    meters => meters === null || !Number.isFinite(meters) || meters < 0,
  )) return { meters: null, reason: "Distância pelas ruas não disponível para todas as paradas." };
  return { meters: segmentMeters.reduce<number>((sum, meters) => sum + (meters ?? 0), 0) };
}

export function currentSaoPauloDate() {
  return expeditionLocalDay(new Date().toISOString());
}

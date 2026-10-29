/** Captura de quilômetros durante uma entrega: coordenadas não são enviadas
 * ao servidor. Somente incrementos válidos derivados do GPS ficam registrados.
 * Precisão depende do aparelho, de HTTPS e do app permanecer em primeiro plano. */
export type GpsFix = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};

export function validGpsFix(fix: GpsFix): boolean {
  return Number.isFinite(fix.latitude) && Math.abs(fix.latitude) <= 90
    && Number.isFinite(fix.longitude) && Math.abs(fix.longitude) <= 180
    && Number.isFinite(fix.accuracy) && fix.accuracy > 0 && fix.accuracy <= 30
    && Number.isFinite(fix.timestamp) && fix.timestamp > 0;
}

/** Distância em linha entre leituras sucessivas GPS; não representa rotas do mapa. */
export function gpsHaversineMeters(a: GpsFix, b: GpsFix): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export type GpsDistanceDecision =
  | { kind: "reset" }
  | { kind: "skip" }
  | { kind: "segment"; meters: number };

/** Descarta ruído de GPS, saltos irreais e lacunas longas (ex.: app minimizado).
 * Retorna skip sem mover a âncora para acumular pequenas distâncias reais. */
export function gpsDistanceDecision(from: GpsFix, to: GpsFix): GpsDistanceDecision {
  if (!validGpsFix(to)) return { kind: "skip" };
  if (!validGpsFix(from)) return { kind: "reset" };
  const seconds = (to.timestamp - from.timestamp) / 1000;
  if (seconds <= 0) return { kind: "skip" };
  if (seconds > 180) return { kind: "reset" };
  const meters = gpsHaversineMeters(from, to);
  if (!Number.isFinite(meters) || meters > 1000 || meters / seconds > 38.9) return { kind: "reset" };
  if (seconds < 3) return { kind: "skip" };
  // Limiar proporcional à precisão: reduz registros fictícios com aparelho parado.
  const threshold = Math.max(15, Math.min(45, (from.accuracy + to.accuracy) * 0.75));
  if (meters < threshold) return { kind: "skip" };
  return { kind: "segment", meters: Math.round(meters * 100) / 100 };
}

export type GpsPeriod = "day" | "week" | "month";

export function gpsPeriodBounds(date: string, period: GpsPeriod): { start: string; end: string } {
  const reference = new Date(date + "T12:00:00Z");
  if (!Number.isFinite(reference.getTime()) || reference.toISOString().slice(0, 10) !== date)
    throw new Error("Data inválida.");
  const start = new Date(reference);
  if (period === "week") {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  } else if (period === "month") {
    start.setUTCDate(1);
  }
  const end = new Date(start);
  if (period === "day") end.setUTCDate(end.getUTCDate() + 1);
  else if (period === "week") end.setUTCDate(end.getUTCDate() + 7);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export const formatGpsKm = (meters: number) =>
  (meters / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " km";

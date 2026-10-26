import type { DeliveryClientAddress } from "./delivery-addresses";

export type ConfirmedPoint = { latitude: number; longitude: number };

const PAIR = /^\s*(-?\d{1,3}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})\s*$/;
const GOOGLE_HOST = /^(?:(?:www|maps)\.)?google\.(?:com(?:\.[a-z]{2})?|[a-z]{2,3}(?:\.[a-z]{2})?)$/i;

/** Apenas coordenadas de um marcador são aceitas. Coordenadas de @lat,lng
 * representam frequentemente o CENTRO DO MAPA e não são seguras para confirmar. */
function validPoint(latitude: number, longitude: number): ConfirmedPoint | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  // Operação e cadastros brasileiros: impede trocar acidentalmente a ordem lat/lng.
  if (latitude < -34 || latitude > 6 || longitude < -74 || longitude > -28) return null;
  return { latitude, longitude };
}

function parsePair(text: string): ConfirmedPoint | null {
  const match = PAIR.exec(text.trim());
  if (!match) return null;
  return validPoint(Number(match[1]), Number(match[2]));
}

export function parseGoogleMapsPoint(input: string): ConfirmedPoint | null {
  const text = input.trim();
  if (!text || text.length > 4000) return null;
  const direct = parsePair(text);
  if (direct) return direct;
  if (!/^https:\/\//i.test(text)) return null;
  let url: URL;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== "https:" || !GOOGLE_HOST.test(url.hostname)) return null;
  // !3dLAT!4dLNG indica o local; @LAT,LNG é só o centro da visualização.
  let decoded = "";
  try { decoded = decodeURIComponent(url.toString()); } catch { return null; }
  const lat = /!3d(-?\d{1,3}\.\d{4,})/.exec(decoded);
  const lng = /!4d(-?\d{1,3}\.\d{4,})/.exec(decoded);
  if (lat && lng) return validPoint(Number(lat[1]), Number(lng[1]));
  for (const param of ["query", "q", "ll"]) {
    const point = parsePair(url.searchParams.get(param) ?? "");
    if (point) return point;
  }
  // URL contendo coordenadas de um lugar ou resultado de pesquisa.
  const place = /\/maps\/(?:place|search)\/(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})(?:\/|$|\?)/.exec(decoded);
  return place ? validPoint(Number(place[1]), Number(place[2])) : null;
}

export function googleMapsSearchUrl(address: DeliveryClientAddress | undefined, company: string): string {
  const query = address
    ? [company, address.address, address.city, address.state, "Brasil"].filter(Boolean).join(", ")
    : company;
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query);
}

export function googleMapsPointUrl(point: ConfirmedPoint): string {
  return "https://www.google.com/maps/search/?api=1&query="
    + encodeURIComponent(point.latitude.toFixed(7) + "," + point.longitude.toFixed(7));
}

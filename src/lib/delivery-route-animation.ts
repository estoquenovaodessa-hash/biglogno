/** Utilitários puros para desenhar progressivamente uma via, sem simular GPS.
 * A linha é a geometria devolvida pelo roteador de ruas. */
export type RoadPoint = [number, number];

/** Marcadores visíveis durante uma reprodução.
 * Uma parada só aparece após a conclusão do trecho que chega até ela.
 * Quando há lacunas de endereço, a partida de um trecho isolado aparece
 * apenas ao começar esse trecho, sem inventar uma ligação entre ruas. */
export function visibleAnimatedStopIndexes(
  legs: ReadonlyArray<{ from: number; to: number }>,
  completedLegs: number,
  activeLeg: number | null,
  startingIndex: number | null,
): number[] {
  const indexes = new Set<number>();
  if (startingIndex !== null) indexes.add(startingIndex);
  const count = Math.min(legs.length, Math.max(0, completedLegs));
  for (let i = 0; i < count; i++) {
    indexes.add(legs[i].from);
    indexes.add(legs[i].to);
  }
  if (activeLeg !== null && legs[activeLeg]) indexes.add(legs[activeLeg].from);
  return [...indexes];
}

function metersBetween(a: RoadPoint, b: RoadPoint): number {
  const rad = Math.PI / 180;
  const y1 = a[0] * rad, y2 = b[0] * rad;
  const deltaY = (b[0] - a[0]) * rad;
  const deltaX = (b[1] - a[1]) * rad;
  const h = Math.sin(deltaY / 2) ** 2
    + Math.cos(y1) * Math.cos(y2) * Math.sin(deltaX / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Inclui o último vértice interpolado: útil para a linha parecer ser
 * desenhada sobre as ruas, mesmo com trechos de diferentes comprimentos. */
export function progressiveRoadLine(line: RoadPoint[], fraction: number): RoadPoint[] {
  if (!line.length) return [];
  if (line.length === 1) return [line[0]];
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  if (clamped === 1) return line;
  if (clamped === 0) return [line[0]];
  const lengths = line.slice(1).map((point, index) => metersBetween(line[index], point));
  const total = lengths.reduce((sum, value) => sum + value, 0);
  if (!total) return [line[0], line[0]];
  let remaining = total * clamped;
  const result: RoadPoint[] = [line[0]];
  for (let i = 0; i < lengths.length; i++) {
    const distance = lengths[i];
    if (remaining >= distance) {
      result.push(line[i + 1]);
      remaining -= distance;
    } else {
      const t = distance ? remaining / distance : 0;
      result.push([
        line[i][0] + (line[i + 1][0] - line[i][0]) * t,
        line[i][1] + (line[i + 1][1] - line[i][1]) * t,
      ]);
      break;
    }
  }
  return result;
}

/** Se a rota recebeu novas paradas ao vivo, continua após o último trecho
 * já mostrado. Alterações à rota anterior reiniciam a apresentação. */
export function routeAnimationResumeIndex(
  oldRouteKey: string | undefined,
  nextRouteKey: string,
  oldLegSignatures: string[],
  nextLegSignatures: string[],
  lastCompleted: number,
): number {
  if (oldRouteKey !== nextRouteKey || !oldLegSignatures.length) return 0;
  if (nextLegSignatures.length <= oldLegSignatures.length) return 0;
  if (!oldLegSignatures.every((signature, index) => signature === nextLegSignatures[index])) return 0;
  return Math.min(Math.max(0, lastCompleted), nextLegSignatures.length - 1);
}

export function roadKmLabel(meters: number | null): string {
  return meters === null || !Number.isFinite(meters) || meters < 0
    ? "KM não disponível"
    : (meters / 1000).toLocaleString("pt-BR", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }) + " km";
}

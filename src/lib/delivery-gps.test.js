import { describe, expect, test } from "bun:test";
import {
  validGpsFix, gpsHaversineMeters, gpsDistanceDecision,
  gpsPeriodBounds, formatGpsKm,
} from "./delivery-gps";

const fix = (latitude, longitude, timestamp = 100000, accuracy = 8) =>
  ({ latitude, longitude, timestamp, accuracy });

describe("GPS: quilometragem real disponível apenas com leituras válidas", () => {
  test("não aceita localização sem precisão suficiente ou coordenadas inválidas", () => {
    expect(validGpsFix(fix(-22.78, -47.29))).toBe(true);
    expect(validGpsFix(fix(-22.78, -47.29, 100000, 90))).toBe(false);
    expect(validGpsFix(fix(180, -47.29))).toBe(false);
  });
  test("converte movimento entre GPS em metros sem usar estimativa de endereços", () => {
    const m = gpsHaversineMeters(fix(-22.78, -47.29), fix(-22.78, -47.289));
    expect(m).toBeGreaterThan(90);
    expect(m).toBeLessThan(120);
    expect(gpsDistanceDecision(fix(-22.78, -47.29), fix(-22.78, -47.289, 110000)).kind).toBe("segment");
  });
  test("não contabiliza ruído de GPS com entregador parado", () => {
    expect(gpsDistanceDecision(fix(-22.78, -47.29), fix(-22.78001, -47.29001, 112000)).kind).toBe("skip");
  });
  test("descarta saltos irreais e lacunas do app minimizado", () => {
    expect(gpsDistanceDecision(fix(-22.78, -47.29), fix(-22.78, -47.27, 110000)).kind).toBe("reset");
    expect(gpsDistanceDecision(fix(-22.78, -47.29), fix(-22.78, -47.289, 310000)).kind).toBe("reset");
    expect(gpsDistanceDecision(fix(-22.78, -47.29), fix(-22.78, -47.289, 99000)).kind).toBe("skip");
  });
});

describe("Relatório de KM por dias civis", () => {
  test("Diário seleciona exatamente a data pedida", () => {
    expect(gpsPeriodBounds("2026-10-29", "day")).toEqual({ start: "2026-10-29", end: "2026-10-30" });
  });
  test("Semanal começa segunda-feira, termina na próxima segunda-feira", () => {
    expect(gpsPeriodBounds("2026-10-29", "week")).toEqual({ start: "2026-10-26", end: "2026-11-02" });
  });
  test("Mensal considera calendário e virada do ano, não últimos 30 dias", () => {
    expect(gpsPeriodBounds("2026-10-29", "month")).toEqual({ start: "2026-10-01", end: "2026-11-01" });
    expect(gpsPeriodBounds("2026-12-31", "month")).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });
  test("valor em quilômetros fica legível para o gestor", () => {
    expect(formatGpsKm(3450)).toBe("3,45 km");
    expect(formatGpsKm(12345)).toBe("12,35 km");
  });
});

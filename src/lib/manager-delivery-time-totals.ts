import { travelMs, type Delivery } from "./deliveries";

/** Soma apenas tempos medidos com partida e chegada reais; nao calcula espera. */
export function managerDeliveryTimeTotals(records: Delivery[]): {
  travelMs: number; travelCount: number;
} {
  const events = new Map<string, number>();
  for (const d of records) {
    const travel = travelMs(d);
    if (travel === null) continue;
    const identity = d.companyCode?.trim() || d.company.trim().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("pt-BR").replace(/\s+/g, " ");
    const key = d.source === "coleta" ? "coleta:" + d.id
      : [identity, d.driverEmployeeId || d.driver?.trim().toLocaleLowerCase("pt-BR") || "",
        d.expeditionShift || "", d.expeditionBatchId || "",
        d.startedAt || "", d.arrivedAt || ""].join("|");
    events.set(key, Math.max(events.get(key) ?? 0, travel));
  }
  let totalTravel = 0;
  for (const time of events.values()) totalTravel += time;
  return { travelMs: totalTravel, travelCount: events.size };
}

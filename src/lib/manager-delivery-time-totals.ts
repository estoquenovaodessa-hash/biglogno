import { travelMs, waitMs, type Delivery } from "./deliveries";

/** Acumula os tempos calculáveis das operações filtradas.
 * Notas de uma mesma visita compartilham início/chegada e contam uma vez;
 * coletas e visitas diferentes continuam independentes.
 * Caso uma assinatura seja posterior a outra, usa a maior espera do evento. */
export function managerDeliveryTimeTotals(records: Delivery[]): {
  travelMs: number; waitMs: number; travelCount: number; waitCount: number;
} {
  const events = new Map<string, { travel: number | null; wait: number | null }>();
  for (const d of records) {
    const travel = travelMs(d);
    const wait = waitMs(d);
    if (travel === null && wait === null) continue;
    const identity = (d.companyCode?.trim() || d.company.trim().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("pt-BR").replace(/\s+/g, " "));
    // A referência do evento é o horário de chegada: notas de uma mesma
    // entrega unificada têm a mesma partida e chegada, não o mesmo documento.
    const key = d.source === "coleta" ? "coleta:" + d.id
      : [identity, d.driverEmployeeId || d.driver?.trim().toLocaleLowerCase("pt-BR") || "",
        d.expeditionShift || "", d.expeditionBatchId || "",
        d.startedAt || "", d.arrivedAt || ""].join("|");
    const current = events.get(key) ?? { travel: null, wait: null };
    if (travel !== null) current.travel = Math.max(current.travel ?? 0, travel);
    if (wait !== null) current.wait = Math.max(current.wait ?? 0, wait);
    events.set(key, current);
  }
  let totalTravel = 0, totalWait = 0, travelCount = 0, waitCount = 0;
  for (const event of events.values()) {
    if (event.travel !== null) { totalTravel += event.travel; travelCount++; }
    if (event.wait !== null) { totalWait += event.wait; waitCount++; }
  }
  return { travelMs: totalTravel, waitMs: totalWait, travelCount, waitCount };
}

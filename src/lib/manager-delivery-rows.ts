import { deliveryGroups, type Delivery } from "./deliveries";

/** A grade gerencial usa as mesmas unificações da fila do entregador.
 * Cada nota segue individual no banco e no histórico de finalizadas. */
export function managerDeliveryRows(records: Delivery[], kind: "open" | "finished"): Delivery[][] {
  const sorted = records.slice().sort((a, b) => kind === "finished"
    ? (b.finishedAt ?? "").localeCompare(a.finishedAt ?? "") || a.position - b.position
    : a.position - b.position);
  return kind === "open" ? deliveryGroups(sorted) : sorted.map(record => [record]);
}

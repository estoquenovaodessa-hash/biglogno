import type { Delivery } from "./deliveries";

export type DeliveryTransport = "moto" | "carro" | null;

/** Transporte exibido no histórico de entregas finalizadas.
 * Mantém nomes completos, acentos e registros antigos sem ID de funcionário.
 * Para outros motoristas, só apresenta transporte se estiver explicitamente
 * registrado em uma coleta. Nunca presume o veículo de outros funcionários. */
export function finishedDeliveryTransport(
  delivery: Pick<Delivery, "driver" | "source" | "collectionTransport">,
): DeliveryTransport {
  const firstName = (delivery.driver ?? "").trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")
    .split(/\s+/)[0];

  if (firstName === "marcelo") return "moto";
  if (firstName === "luciano" || firstName === "caue") return "carro";
  if (delivery.source === "coleta") return delivery.collectionTransport ?? null;
  return null;
}

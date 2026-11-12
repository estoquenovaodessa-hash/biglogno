import { z } from "zod";
import { deliveryGroups, type Delivery } from "./deliveries";
import { finishPickup, type Pickup } from "./pickups";

/** Identidade do funcionário autenticado: nunca vem do formulário. */
export type ExpeditionActor = { id: string; name: string };
export type ExpeditionDriver = "Marcelo" | "Luciano";

export const expeditionFinishDeliverySchema = z.object({
  id: z.string().uuid(),
  driver: z.enum(["Marcelo", "Luciano"]),
  /** A Expedição pode não dispor do nome do recebedor ao lançar a baixa. */
  receiver: z.string().trim().max(150).optional(),
});

export const expeditionFinishPickupSchema = z.object({
  id: z.string().uuid(),
  receiver: z.string().trim().min(1, "Informe quem retirou o pedido.").max(150),
});

/** Finaliza somente o grupo exato da nota selecionada.
 * O servidor recalcula todos os integrantes e compara o payload original na
 * mesma transação. Nenhuma nota de outro lote/cliente é incluída por acaso. */
export function finishExpeditionDeliveryGroup(
  deliveries: Delivery[],
  input: z.infer<typeof expeditionFinishDeliverySchema>,
  actor: ExpeditionActor,
  now: Date,
  driverEmployeeId?: string,
): Delivery[] {
  const selected = deliveries.find(d => d.id === input.id);
  if (!selected) throw new Error("Entrega não encontrada. Atualize a Expedição.");
  const group = deliveryGroups(deliveries).find(rows => rows.some(d => d.id === input.id));
  if (!group?.length || group.some(d => d.source === "coleta" || d.status === "finalizada"))
    throw new Error("Uma ou mais notas já foram concluídas ou não são entregas.");
  const iso = now.toISOString();
  const ids = new Set(group.map(d => d.id));
  const receiver = input.receiver?.trim();
  return deliveries.map(d => ids.has(d.id) ? {
    ...d,
    status: "finalizada" as const,
    driver: input.driver,
    driverEmployeeId,
    // Não inventar quem recebeu: opcional na baixa de Expedição.
    receiver: receiver || d.receiver || undefined,
    finishedAt: iso,
    lastActionBy: actor.name,
    lastActionByEmployeeId: actor.id,
    completedBy: actor.name,
    completedByEmployeeId: actor.id,
    completedVia: "expedicao" as const,
  } : d);
}

/** Mantém retirador e funcionário da expedição como pessoas distintas. */
export function finishExpeditionPickup(
  pickup: Pickup,
  receiver: string,
  actor: ExpeditionActor,
  now: Date,
): Pickup {
  if (pickup.source !== "conferencia")
    throw new Error("Somente Retiras da Conferência podem ser concluídas na Expedição.");
  return {
    ...finishPickup(pickup, receiver, actor.name, now),
    completedBy: actor.name,
    completedByEmployeeId: actor.id,
    completedVia: "expedicao" as const,
  };
}

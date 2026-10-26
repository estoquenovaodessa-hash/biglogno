import { z } from "zod";

export interface Pickup {
  id: string; createdAt: string; company: string; companyCode?: string; document?: string; value?: number;
  source: "conferencia" | "NO" | "SBO"; collector?: string; status: "pendente" | "finalizada";
  /** Canal que gerou a conferência (hoje Expedição, futuramente também Balcão). */
  channel?: "balcao" | "expedicao";
  /** Campos legados; o status separado agora é automático ao passar na Conferência. */
  preparedAt?: string; preparedBy?: string;
  /** Pessoa que efetivamente levou o pedido; handedBy é o funcionário que entregou. */
  receiver?: string;
  finishedAt?: string; handedBy?: string;
}
export const manualPickupSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("SBO"), requestId: z.string().uuid(), collector: z.string().trim().min(1, "Informe o nome do retirador.").max(150) }),
  z.object({ source: z.literal("NO"), requestId: z.string().uuid(), document: z.string().trim().regex(/^\d{1,20}$/, "Informe o documento."), companyCode: z.string().trim().regex(/^\d{1,12}$/, "Informe o código da empresa."), value: z.number().finite().min(0).max(100000000) }),
]);
export const finishPickupSchema = z.object({ id: z.string().uuid(), receiver: z.string().trim().min(1, "Informe o nome da pessoa que retirou.").max(150) });
export function finishPickup(p: Pickup, receiver: string, handedBy: string, now: Date): Pickup {
  if (p.status !== "pendente") throw new Error("Pedido já retirado.");
  const who = receiver.trim();
  if (!who) throw new Error("Informe o nome da pessoa que retirou.");
  return { ...p, status: "finalizada", receiver: who, handedBy: handedBy.trim(), finishedAt: now.toISOString() };
}
import { z } from "zod";

export interface Pickup {
  id: string; createdAt: string; company: string; companyCode?: string; document?: string; value?: number;
  source: "conferencia" | "NO" | "SBO"; collector?: string; status: "pendente" | "finalizada";
  finishedAt?: string; handedBy?: string;
}
export const manualPickupSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("SBO"), requestId: z.string().uuid(), collector: z.string().trim().min(1, "Informe o nome do retirador.").max(150) }),
  z.object({ source: z.literal("NO"), requestId: z.string().uuid(), document: z.string().trim().regex(/^\d{1,20}$/, "Informe o documento."), companyCode: z.string().trim().regex(/^\d{1,12}$/, "Informe o código da empresa."), value: z.number().finite().min(0).max(100000000) }),
]);
export const finishPickupSchema = z.object({ id: z.string().uuid(), handedBy: z.string().trim().min(1, "Confirme o nome do operador que entregou.").max(150) });
export function finishPickup(p: Pickup, handedBy: string, now: Date): Pickup {
  if (p.status !== "pendente") throw new Error("Pedido já retirado.");
  const name = handedBy.trim(); if (!name) throw new Error("Confirme o nome do operador que entregou.");
  return { ...p, status: "finalizada", handedBy: name, finishedAt: now.toISOString() };
}
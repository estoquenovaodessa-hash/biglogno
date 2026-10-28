import { z } from "zod";
import { expeditionShiftSchema, scheduledDateSchema } from "./expedition-schedule";

export const collectionCompanySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2, "Informe a empresa de coleta.").max(180),
});
export type CollectionCompany = z.infer<typeof collectionCompanySchema>;

export const createCollectionCompanySchema = z.object({
  id: z.string().uuid(),
  name: collectionCompanySchema.shape.name,
});

export const createCollectionSchema = z.object({
  requestId: z.string().uuid(),
  companyId: z.string().uuid(),
  /** Endereço opcional: sem ele, a coleta continua operacional mas não gera marcador no mapa. */
  address: z.string().trim().max(400).optional().default(""),
  value: z.number().finite().min(0).max(100000000),
  contact: z.string().trim().max(150).optional().default(""),
  payment: z.enum(["dinheiro", "faturado"]).default("dinheiro"),
  scheduledDate: z.union([scheduledDateSchema, z.literal("")]).optional().default(""),
  shift: expeditionShiftSchema.nullable().optional().default(null),
});

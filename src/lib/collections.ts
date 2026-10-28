import { z } from "zod";

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
  address: z.string().trim().min(8, "Informe um endereço completo para a coleta.").max(400),
  value: z.number().finite().min(0).max(100000000),
  contact: z.string().trim().max(150).optional().default(""),
});

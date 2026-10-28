import { describe, expect, test } from "bun:test";
import { collectionCompanySchema, createCollectionCompanySchema, createCollectionSchema } from "./collections";

describe("cadastro de coletas da Expedição", () => {
  const requestId = "00000000-0000-4000-8000-000000000001";
  const companyId = "00000000-0000-4000-8000-000000000002";

  test("aceita valor zero, endereço completo e contato opcional", () => {
    const result = createCollectionSchema.parse({
      requestId, companyId, address: "Rua ABC, 123, Nova Odessa, SP", value: 0,
    });
    expect(result.contact).toBe("");
    expect(result.value).toBe(0);
  });
  test("recusa endereço ausente, valor negativo e IDs inválidos", () => {
    const base = { requestId, companyId, address: "Rua ABC, 123", value: 10 };
    expect(createCollectionSchema.safeParse(base).success).toBe(true);
    expect(createCollectionSchema.safeParse({ ...base, address: "rua" }).success).toBe(false);
    expect(createCollectionSchema.safeParse({ ...base, value: -1 }).success).toBe(false);
    expect(createCollectionSchema.safeParse({ ...base, value: Infinity }).success).toBe(false);
    expect(createCollectionSchema.safeParse({ ...base, companyId: "100" }).success).toBe(false);
  });
  test("cadastro de empresa independente de clientes das entregas", () => {
    expect(createCollectionCompanySchema.safeParse({ id: companyId, name: "Transportadora ABC" }).success).toBe(true);
    expect(collectionCompanySchema.safeParse({ id: companyId, name: "   " }).success).toBe(false);
  });
});

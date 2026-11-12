import { describe, expect, test } from "bun:test";
import { finishExpeditionDeliveryGroup, finishExpeditionPickup, expeditionFinishDeliverySchema, expeditionFinishPickupSchema } from "./expedition-completion";

const actor = { id: "00000000-0000-4000-8000-000000000099", name: "Responsável Expedição" };
const delivery = (id, overrides = {}) => ({
  id, position: 1, createdAt: "2026-11-12T12:00:00.000Z",
  source: "conferencia", company: "Cliente 1", document: id, value: 200,
  status: "nao_iniciada", companyCode: "123", ...overrides,
});
const date = new Date("2026-11-12T15:00:00.000Z");

describe("baixa de entrega feita pela Expedição", () => {
  test("conclui todas as notas de um grupo sem atingir outro pedido", () => {
    const rows = [
      delivery("a", { deliveryGroupId: "g1" }),
      delivery("b", { deliveryGroupId: "g1" }),
      delivery("c", { deliveryGroupId: "g2" }),
    ];
    const updated = finishExpeditionDeliveryGroup(rows, {
      id: "a", driver: "Marcelo", receiver: "Ana",
    }, actor, date, "00000000-0000-4000-8000-000000000001");
    expect(updated[0].status).toBe("finalizada");
    expect(updated[1].status).toBe("finalizada");
    expect(updated[2]).toBe(rows[2]);
    for (const row of updated.slice(0, 2)) {
      expect(row.driver).toBe("Marcelo");
      expect(row.receiver).toBe("Ana");
      expect(row.finishedAt).toBe(date.toISOString());
      expect(row.completedVia).toBe("expedicao");
      expect(row.completedBy).toBe(actor.name);
      expect(row.completedByEmployeeId).toBe(actor.id);
      expect(row.lastActionBy).toBe(actor.name);
      expect(row.driverEmployeeId).toBe("00000000-0000-4000-8000-000000000001");
    }
    expect(rows[0].status).toBe("nao_iniciada");
    expect(rows[1].status).toBe("nao_iniciada");
  });

  test("sem nome do recebedor, não inventa assinatura", () => {
    const [row] = finishExpeditionDeliveryGroup([delivery("a")], {
      id: "a", driver: "Luciano",
    }, actor, date);
    expect(row.status).toBe("finalizada");
    expect(row.driver).toBe("Luciano");
    expect(row.receiver).toBeUndefined();
    expect(row.completedBy).toBe(actor.name);
  });

  test("impede finalizar novamente, e impede concluir coleta como entrega", () => {
    expect(() => finishExpeditionDeliveryGroup([
      delivery("a", { status: "finalizada" }),
    ], { id: "a", driver: "Luciano" }, actor, date)).toThrow(/concluídas/);
    expect(() => finishExpeditionDeliveryGroup([
      delivery("a", { source: "coleta" }),
    ], { id: "a", driver: "Luciano" }, actor, date)).toThrow(/não são entregas/);
  });

  test("o motorista é restrito a Marcelo ou Luciano; recebedor tem limite", () => {
    expect(expeditionFinishDeliverySchema.safeParse({
      id: "00000000-0000-4000-8000-000000000010", driver: "Outro"
    }).success).toBe(false);
    expect(expeditionFinishDeliverySchema.safeParse({
      id: "00000000-0000-4000-8000-000000000010",
      driver: "Marcelo", receiver: "x".repeat(151),
    }).success).toBe(false);
  });
});

describe("baixa de Retira feita pela Expedição", () => {
  const pickup = {
    id: "p1", createdAt: "2026-11-12T12:00:00.000Z",
    source: "conferencia", company: "Cliente", document: "123",
    status: "pendente",
  };
  test("salva retirador e funcionário da expedição de forma independente", () => {
    const next = finishExpeditionPickup(pickup, "Maria", actor, date);
    expect(next.status).toBe("finalizada");
    expect(next.receiver).toBe("Maria");
    expect(next.handedBy).toBe(actor.name);
    expect(next.completedBy).toBe(actor.name);
    expect(next.completedByEmployeeId).toBe(actor.id);
    expect(next.completedVia).toBe("expedicao");
    expect(next.finishedAt).toBe(date.toISOString());
    expect(pickup.status).toBe("pendente");
  });

  test("não aceita nova retirada de pedido já concluído", () => {
    expect(() => finishExpeditionPickup({ ...pickup, status: "finalizada" },
      "Maria", actor, date)).toThrow(/já retirado/);
  });

  test("não permite a baixa de retirada que não veio da conferência", () => {
    expect(() => finishExpeditionPickup({ ...pickup, source: "SBO" },
      "Maria", actor, date)).toThrow(/Somente Retiras da Conferência/);
  });

  test("exige nome de retirador válido no formulário", () => {
    expect(expeditionFinishPickupSchema.safeParse({
      id: "00000000-0000-4000-8000-000000000010",receiver:"   ",
    }).success).toBe(false);
  });
});

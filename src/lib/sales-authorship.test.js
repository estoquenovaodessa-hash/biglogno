import { describe, expect, test } from "bun:test";
import {
  EXPEDITION_AUTHORSHIP_PREFIX, changeExpeditionAuthorshipSchema,
  creditedExpeditionRecords, expeditionAuthorshipSchema,
  isExpeditionAuthorshipEligible, sellerPerformanceWithAuthorship,
} from "./sales-authorship";
import { salesMetrics } from "./sales-verification";

const expedition = (id, more = {}) => ({
  id, createdAt: "2026-11-13T12:00:00.000Z",
  requestId: "00000000-0000-4000-8000-000000000001",
  seller: "EXPEDIÇÃO", channel: "expedicao",
  document: id, clientName: "Cliente", clientCode: "12",
  verifierCode: "102", verifierName: "Giovana", items: 3,
  value: 180, correct: true, durationSeconds: 90,
  ...more,
});
const balc = (id, more = {}) => ({
  ...expedition(id), seller: "Carlos", channel: "balcao", verifierCode: "101",
  items: 1, value: 55, ...more,
});
const credit = (seller) => ({ seller, assignedAt: "2026-11-13T12:30:00.000Z", assignedBy: "gestor" });

describe("autoria consultiva de conferências da Expedição", () => {
  test("apenas a Expedição pode receber crédito; nunca um registro importado", () => {
    expect(isExpeditionAuthorshipEligible(expedition("a"))).toBe(true);
    expect(isExpeditionAuthorshipEligible(balc("b"))).toBe(false);
    expect(isExpeditionAuthorshipEligible(expedition("c", { source: "csv" }))).toBe(false);
    expect(isExpeditionAuthorshipEligible(expedition("d", { seller: "EXPEDIÇÃO", channel: undefined }))).toBe(true);
  });
  test("somente contagem do desempenho do vendedor recebe +1", () => {
    const all = [expedition("e"), balc("b")];
    const authored = { e: credit("Carlos") };
    const realCards = salesMetrics(all);
    const perf = sellerPerformanceWithAuthorship(all, authored, "Carlos");
    expect(perf.count).toBe(2);
    expect(perf.realCount).toBe(1);
    expect(perf.authorshipCount).toBe(1);
    expect(perf.items).toBe(1);
    expect(perf.correct).toBe(1);
    expect(perf.errors).toBe(0);
    expect(perf.value).toBe(55);
    expect(perf.accuracy).toBe(100);
    expect(realCards.count).toBe(2); // Não passa a 3!
    expect(realCards.items).toBe(4);
    expect(salesMetrics(all.filter(r => r.seller === "EXPEDIÇÃO")).count).toBe(1);
  });
  test("um mesmo registro não gera vários créditos: troca de vendedor transfere +1", () => {
    const all = [expedition("e")];
    let authorships = { e: credit("Carlos") };
    expect(sellerPerformanceWithAuthorship(all, authorships, "Carlos").count).toBe(1);
    authorships = { e: credit("José") };
    expect(sellerPerformanceWithAuthorship(all, authorships, "Carlos").count).toBe(0);
    expect(sellerPerformanceWithAuthorship(all, authorships, "José").count).toBe(1);
  });
  test("autoria apagada ou registro original excluído não contam mais", () => {
    const all = [expedition("e")];
    const authorships = { e: credit("Carlos") };
    expect(creditedExpeditionRecords([], authorships, "Carlos")).toHaveLength(0);
    expect(creditedExpeditionRecords(all, {}, "Carlos")).toHaveLength(0);
    expect(sellerPerformanceWithAuthorship([], authorships, "Carlos").count).toBe(0);
  });
  test("validação de gestor aceita apenas vendedor real e UUID", () => {
    expect(changeExpeditionAuthorshipSchema.safeParse({
      recordId: "00000000-0000-4000-8000-000000000020", seller: "Carlos",
    }).success).toBe(true);
    expect(changeExpeditionAuthorshipSchema.safeParse({
      recordId: "00000000-0000-4000-8000-000000000020", seller: null,
    }).success).toBe(true);
    expect(changeExpeditionAuthorshipSchema.safeParse({
      recordId: "00000000-0000-4000-8000-000000000020", seller: "EXPEDIÇÃO",
    }).success).toBe(false);
    expect(changeExpeditionAuthorshipSchema.safeParse({
      recordId: "invalid", seller: "Carlos",
    }).success).toBe(false);
    expect(expeditionAuthorshipSchema.safeParse(credit("Carlos")).success).toBe(true);
    expect(EXPEDITION_AUTHORSHIP_PREFIX).toMatch(/^sales-expedition-/);
  });
  test("vários pedidos da Expedição contam +N no vendedor sem somar valores", () => {
    const rows = [expedition("one"), expedition("two"), expedition("three"), balc("real")];
    const map = { one: credit("Carlos"), two: credit("Carlos"), three: credit("Helton") };
    expect(sellerPerformanceWithAuthorship(rows, map, "Carlos").count).toBe(3);
    expect(sellerPerformanceWithAuthorship(rows, map, "Carlos").value).toBe(55);
    expect(sellerPerformanceWithAuthorship(rows, map, "Helton").count).toBe(1);
    expect(sellerPerformanceWithAuthorship(rows, map, "EXPEDIÇÃO").count).toBe(3);
  });
});

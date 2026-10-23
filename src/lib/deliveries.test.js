import { describe, expect, test } from "bun:test";
import { applyDeliveryAction, applyDeliveryGroupAction, deliveryGroups, manualDeliverySchema, canOperateLogistics, isLocked, statusLabel, travelMs, waitMs } from "./deliveries";

const base = (id, extra = {}) => ({ id, position: 1, createdAt: "", document: "1", company: "X", value: 1, source: "manual", status: "nao_iniciada", ...extra });
const t = (min) => new Date(Date.UTC(2026, 9, 21, 12, min));

describe("entregas", () => {
  test("iniciar exige entregador", () => {
    const d = base("a");
    const r = applyDeliveryAction(d, [d], { action: "start", id: "a", driver: "João" }, t(0));
    expect(r.status).toBe("em_rota");
    expect(r.driver).toBe("João");
  });
  test("permite duas entregas simultâneas, bloqueia a terceira", () => {
    const a = base("a", { company: "A", status: "em_rota" }), b = base("b", { company: "B" }), c = base("c", { company: "C" });
    expect(isLocked(b, [a, b, c])).toBe(false);
    const started = applyDeliveryAction(b, [a, b, c], { action: "start", id: "b", driver: "X" }, t(0));
    expect(started.status).toBe("em_rota");
    expect(isLocked(c, [a, started, c])).toBe(true);
    expect(statusLabel(c, [a, started, c])).toBe("Pendente");
    expect(() => applyDeliveryAction(c, [a, started, c], { action: "start", id: "c", driver: "X" }, t(0))).toThrow();
  });
  test("mesma empresa unifica manual e conferência e finaliza juntos", () => {
    let all = [base("a", { company: " Empresa ", source: "conferencia" }), base("b", { company: "EMPRESA", onlyDelivery: true })];
    expect(deliveryGroups(all)).toHaveLength(1);
    all = applyDeliveryGroupAction(all, { action: "start", id: "a", driver: "João" }, t(0));
    expect(all.map(d => d.driver)).toEqual(["João", "João"]);
    all = applyDeliveryGroupAction(all, { action: "arrive", id: "a" }, t(10));
    all = applyDeliveryGroupAction(all, { action: "finish", id: "a", receiver: "Maria" }, t(12));
    expect(all.map(d => d.status)).toEqual(["finalizada", "finalizada"]);
    expect(all.map(d => d.receiver)).toEqual(["Maria", "Maria"]);
  });
  test("desunificação persiste e pode ser revertida antes de iniciar", () => {
    const all = [base("a"), base("b")];
    const split = applyDeliveryGroupAction(all, { action: "separate", id: "a" }, t(0));
    expect(deliveryGroups(split)).toHaveLength(2);
    expect(deliveryGroups(applyDeliveryGroupAction(split, { action: "unify", id: "a" }, t(0)))).toHaveLength(1);
  });
  test("novo pedido não entra em entrega já iniciada", () => {
    expect(deliveryGroups([base("a", { status: "em_rota", startedAt: t(0).toISOString() }), base("b")])).toHaveLength(2);
  });
  test("Somente entrega dispensa valor e documento", () => {
    const data = { requestId: "00000000-0000-4000-8000-000000000001", companyCode: "1", onlyDelivery: true };
    expect(manualDeliverySchema.safeParse(data).success).toBe(true);
    expect(manualDeliverySchema.safeParse({ ...data, onlyDelivery: false }).success).toBe(false);
  });
  test("gestor não realiza ações operacionais", () => {
    expect(canOperateLogistics("gestor")).toBe(false);
    expect(canOperateLogistics("operador")).toBe(true);
  });
  test("trajeto vai do início ao Cheguei (sem pausas) e espera até o recebedor", () => {
    let d = base("a");
    d = applyDeliveryAction(d, [d], { action: "start", id: "a", driver: "J" }, t(0));
    d = applyDeliveryAction(d, [d], { action: "pause", id: "a" }, t(10));
    d = applyDeliveryAction(d, [d], { action: "resume", id: "a" }, t(15));
    d = applyDeliveryAction(d, [d], { action: "arrive", id: "a" }, t(30));
    d = applyDeliveryAction(d, [d], { action: "finish", id: "a", receiver: "Maria" }, t(34));
    expect(d.status).toBe("finalizada");
    expect(travelMs(d)).toBe(25 * 60000);
    expect(waitMs(d)).toBe(4 * 60000);
  });
  test("cancelar início volta para não iniciada", () => {
    const d = base("a", { status: "em_rota", driver: "J", startedAt: t(0).toISOString() });
    const r = applyDeliveryAction(d, [d], { action: "cancel", id: "a" }, t(1));
    expect(r.status).toBe("nao_iniciada");
    expect(r.driver).toBeUndefined();
  });
});

import { describe, expect, test } from "bun:test";
import { applyDeliveryAction, applyDeliveryGroupAction, deliveryGroups, isConsumerDelivery, manualDeliverySchema, canOperateLogistics, isLocked, statusLabel, travelMs, waitMs } from "./deliveries";

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
  test("CONSUMIDOR código 100 nunca unifica notas, inclusive com zeros à esquerda e mesma origem", () => {
    const all = [
      base("nota-a", { company: "CONSUMIDOR", companyCode: "100", document: "123" }),
      base("nota-b", { company: "Consumidor", companyCode: "00100", document: "124", source: "conferencia" }),
      base("nota-c", { company: "CONSUMIDOR", companyCode: "0100", document: "125", separate: false }),
    ];
    expect(deliveryGroups(all).map(group => group.map(note => note.document)))
      .toEqual([["123"], ["124"], ["125"]]);
    expect(isConsumerDelivery(all[0])).toBe(true);
    expect(isConsumerDelivery(all[1])).toBe(true);
    expect(isConsumerDelivery({ companyCode: "1000" })).toBe(false);
    expect(isConsumerDelivery({ companyCode: undefined })).toBe(false);
  });

  test("a ação de entrega do CONSUMIDOR movimenta somente a nota selecionada", () => {
    const all = [
      base("n1", { company: "CONSUMIDOR", companyCode: "100", document: "222" }),
      base("n2", { company: "CONSUMIDOR", companyCode: "100", document: "223" }),
    ];
    const started = applyDeliveryGroupAction(all, { action: "start", id: "n1", driver: "Ana" }, t(0));
    expect(started.map(row => row.status)).toEqual(["em_rota", "nao_iniciada"]);
    const arrived = applyDeliveryGroupAction(started, { action: "arrive", id: "n1" }, t(10));
    expect(arrived.map(row => row.status)).toEqual(["no_destino", "nao_iniciada"]);
    const finished = applyDeliveryGroupAction(arrived, { action: "finish", id: "n1", receiver: "José" }, t(12));
    expect(finished.map(row => row.status)).toEqual(["finalizada", "nao_iniciada"]);
    expect(finished[1].receiver).toBeUndefined();
  });

  test("CONSUMIDOR não pode ser unificado manualmente, mas outros clientes conservam a regra", () => {
    const consumer = base("n1", { company: "CONSUMIDOR", companyCode: "100", separate: true });
    expect(() => applyDeliveryGroupAction([consumer], { action: "unify", id: "n1" }, t(0))).toThrow(/devem permanecer separadas/);
    expect(() => applyDeliveryGroupAction([consumer], { action: "separate", id: "n1" }, t(0))).toThrow(/devem permanecer separadas/);
    const other = [
      base("a", { company: "LOJA A", companyCode: "101", document: "400" }),
      base("b", { company: "LOJA A", companyCode: "101", document: "401" }),
    ];
    expect(deliveryGroups(other).map(group => group.length)).toEqual([2]);
  });

  test("desunificação persiste e pode ser revertida antes de iniciar", () => {
    const all = [base("a"), base("b")];
    const split = applyDeliveryGroupAction(all, { action: "separate", id: "a" }, t(0));
    expect(deliveryGroups(split)).toHaveLength(2);
    expect(deliveryGroups(applyDeliveryGroupAction(split, { action: "unify", id: "a" }, t(0)))).toHaveLength(1);
  });
  test("turno marcado isola novas conferências que continuam indefinidas", () => {
    const loaded = base("antigo", { company: "EMPRESA X", source: "conferencia",
      document: "100", expeditionShift: "manha", expeditionBatchId: "lote-1" });
    const newNote = base("nova", { company: "EMPRESA X", source: "conferencia",
      document: "101" });
    const groups = deliveryGroups([loaded, newNote]);
    expect(groups.map(group => group.map(d => d.id))).toEqual([["antigo"], ["nova"]]);
    expect(newNote.expeditionShift).toBeUndefined();
    expect(newNote.expeditionBatchId).toBeUndefined();
    const started = applyDeliveryGroupAction([loaded, newNote],
      { action: "start", id: "antigo", driver: "Ana" }, t(0));
    expect(started.map(d => d.status)).toEqual(["em_rota", "nao_iniciada"]);
    const arrived = applyDeliveryGroupAction(started, { action: "arrive", id: "antigo" }, t(3));
    const finished = applyDeliveryGroupAction(arrived,
      { action: "finish", id: "antigo", receiver: "Maria" }, t(5));
    expect(finished.map(d => d.status)).toEqual(["finalizada", "nao_iniciada"]);
    expect(finished[1].receiver).toBeUndefined();
  });
  test("mesma empresa e mesmo turno, porém lotes distintos, nunca se unificam", () => {
    const old = base("saiu", { company: "EMPRESA X",
      expeditionShift: "tarde", expeditionBatchId: "lote-antigo" });
    const newer = base("novo", { company: "EMPRESA X",
      expeditionShift: "tarde", expeditionBatchId: "lote-novo" });
    expect(deliveryGroups([old, newer])).toHaveLength(2);
    const unmarkedOld = { ...old, expeditionShift: undefined };
    const pending = base("conferencia-posterior", { company: "EMPRESA X" });
    expect(deliveryGroups([unmarkedOld, pending])).toHaveLength(2);
  });
  test("várias notas marcadas juntas compartilham um lote de uma única visita", () => {
    const group = [
      base("a", { company: "EMPRESA X", expeditionShift: "manha", expeditionBatchId: "grupo-1" }),
      base("b", { company: "EMPRESA X", expeditionShift: "manha", expeditionBatchId: "grupo-1" }),
    ];
    expect(deliveryGroups(group)).toHaveLength(1);
    expect(applyDeliveryGroupAction(group, { action: "start", id: "a", driver: "Ana" }, t(0))
      .map(d => d.status)).toEqual(["em_rota", "em_rota"]);
  });
  test("novo pedido não entra em entrega já iniciada", () => {
    expect(deliveryGroups([base("a", { status: "em_rota", startedAt: t(0).toISOString() }), base("b")])).toHaveLength(2);
  });
  test("coleta é individual e não unifica com entrega nem com outra coleta do mesmo nome", () => {
    const a = base("coleta-1", { company: "Fornecedor X", source: "coleta", collectionAddress: "Rua 1, 100", document: "" });
    const b = base("coleta-2", { company: "Fornecedor X", source: "coleta", collectionAddress: "Rua 1, 100", document: "" });
    const c = base("entrega", { company: "Fornecedor X" });
    expect(deliveryGroups([a, b, c]).map(rows => rows.map(item => item.id)))
      .toEqual([["coleta-1"], ["coleta-2"], ["entrega"]]);
    expect(() => applyDeliveryGroupAction([a], { action: "unify", id: "coleta-1" }, t(0)))
      .toThrow(/Coletas não podem ser unificadas/);
  });
  test("coleta mede trajeto e espera, finaliza sem recebedor e não altera outra nota", () => {
    const a = base("coleta-1", { company: "Fornecedor X", source: "coleta", collectionAddress: "Rua Teste 55", document: "" });
    const b = base("coleta-2", { company: "Fornecedor X", source: "coleta", collectionAddress: "Rua Teste 55", document: "" });
    let all = applyDeliveryGroupAction([a, b], { action: "start", id: "coleta-1", driver: "Ana" }, t(0));
    all = applyDeliveryGroupAction(all, { action: "arrive", id: "coleta-1" }, t(15));
    expect(() => applyDeliveryGroupAction(all, { action: "finish", id: "coleta-1", receiver: "Fulano" }, t(20)))
      .toThrow(/Coleta não exige recebedor/);
    all = applyDeliveryGroupAction(all, { action: "finish_collection", id: "coleta-1" }, t(25));
    expect(all.map(item => item.status)).toEqual(["finalizada", "nao_iniciada"]);
    expect(all[0].receiver).toBeUndefined();
    expect(travelMs(all[0])).toBe(15 * 60 * 1000);
    expect(waitMs(all[0])).toBe(10 * 60 * 1000);
    expect(() => applyDeliveryGroupAction([b], { action: "finish_collection", id: "coleta-2" }, t(30)))
      .toThrow(/Cheguei ao destino/);
    expect(() => applyDeliveryGroupAction([base("normal")], { action: "finish_collection", id: "normal" }, t(30)))
      .toThrow(/somente para coletas/);
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

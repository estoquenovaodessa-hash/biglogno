import { describe, expect, test } from "bun:test";
import { managerDeliveryRows } from "./manager-delivery-rows";

const note = (id, extra = {}) => ({
  id, position: Number(id.slice(1)),
  createdAt: "2026-10-29T10:00:00Z", document: "NF-" + id,
  company: "EMPRESA A", companyCode: "104",
  value: 50, status: "nao_iniciada", source: "conferencia", ...extra,
});

describe("grid do gestor: entrega unificada", () => {
  test("notas da mesma operação ficam em uma linha, mantendo os dados originais", () => {
    const a = note("n1", { position: 2 });
    const b = note("n2", { position: 1, source: "manual" });
    const c = note("n3", { company: "OUTRA" });
    const records = [a, c, b];
    const rows = managerDeliveryRows(records, "open");
    expect(rows.map(g => g.map(d => d.id))).toEqual([["n2", "n1"], ["n3"]]);
    expect(rows[0].reduce((sum,d) => sum + d.value, 0)).toBe(100);
    expect(records.map(d => d.id)).toEqual(["n1", "n3", "n2"]);
  });
  test("coletas, CONSUMIDOR código 100 e notas desunificadas ficam separados", () => {
    const records = [note("n1", { separate: true }), note("n2"),
      note("n3", { source: "coleta" }),
      note("n4", { company: "CONSUMIDOR", companyCode: "100" }),
      note("n5", { company: "Consumidor", companyCode: "00100" })];
    expect(managerDeliveryRows(records, "open").map(g => g.map(d => d.id)))
      .toEqual([["n1"], ["n2"], ["n3"], ["n4"], ["n5"]]);
  });
  test("lotes, turnos, situação e viagens diferentes nunca se misturam", () => {
    const records = [note("n1", { expeditionShift: "manha", expeditionBatchId: "A" }),
      note("n2", { expeditionShift: "manha", expeditionBatchId: "B" }),
      note("n3", { expeditionShift: "tarde", expeditionBatchId: "A" }),
      note("n4", { expeditionShift: "manha", expeditionBatchId: "A", status: "em_rota", startedAt: "2026-10-29T12:00:00Z" }),
      note("n5", { expeditionShift: "manha", expeditionBatchId: "A", status: "em_rota", startedAt: "2026-10-29T13:00:00Z" }),
      note("n6", { expeditionShift: "manha", expeditionBatchId: "A" })];
    expect(managerDeliveryRows(records, "open").map(g => g.map(d => d.id)))
      .toEqual([["n1", "n6"], ["n2"], ["n3"], ["n4"], ["n5"]]);
  });
  test("finalizadas continuam individualizadas e na ordem do fim", () => {
    const records = [note("n1", { status: "finalizada", finishedAt: "2026-10-29T12:00:00Z" }),
      note("n2", { status: "finalizada", finishedAt: "2026-10-29T13:00:00Z" })];
    expect(managerDeliveryRows(records, "finished").map(g => g.map(d => d.id)))
      .toEqual([["n2"], ["n1"]]);
  });
});

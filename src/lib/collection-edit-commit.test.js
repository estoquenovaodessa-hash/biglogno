import { describe, expect, test } from "bun:test";
import { collectionEditCommitPayload } from "./collection-edit-commit";

describe("edição de coleta no RPC atômico de logística", () => {
  const rows = [
    { id: "entrega-1", position: 1, payload: { status: "nao_iniciada", company: "Loja A" } },
    { id: "coleta-2", position: 2, payload: { status: "nao_iniciada", source: "coleta", company: "Fornecedor" } },
    { id: "entrega-3", position: 3, payload: { status: "em_rota", company: "Loja B" } },
  ];

  test("expected inclui todos os pedidos mesmo ao editar só uma coleta", () => {
    const payload = { status: "nao_iniciada", source: "coleta", company: "Fornecedor editado" };
    const result = collectionEditCommitPayload(rows, "coleta-2", payload);
    expect(result.kind).toBe("deliveries");
    expect(result.expected).toEqual(rows.map(row => ({ id: row.id, payload: row.payload })));
    expect(result.expected).toHaveLength(3);
    expect(result.changes).toEqual([{ id: "coleta-2", position: 2, payload }]);
    expect(rows[1].payload.company).toBe("Fornecedor");
  });

  test("não escreve ou cria pedidos inexistentes", () => {
    expect(() => collectionEditCommitPayload(rows, "nao-existe", { company: "X" }))
      .toThrow("Coleta não encontrada");
  });

  test("preserva os outros pedidos e serializa somente payload da coleta", () => {
    const editPayload = { company: "Fornecedor", scheduledDate: undefined, expeditionShift: "tarde" };
    const result = collectionEditCommitPayload(rows, "coleta-2", editPayload);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].payload).toEqual({ company: "Fornecedor", expeditionShift: "tarde" });
    expect(result.expected[0].payload).toEqual(rows[0].payload);
    expect(result.expected[2].payload).toEqual(rows[2].payload);
  });
});

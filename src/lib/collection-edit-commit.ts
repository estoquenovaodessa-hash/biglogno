/** O RPC public.commit_logistics_changes verifica a fila inteira de deliveries:
 * expected precisa conter TODAS as linhas, mesmo quando só uma coleta muda.
 * Enviar somente a coleta produz erro falso de "fila alterada" em filas com 2+ pedidos.
 * Esta função mantém a comparação otimista, sem ignorar alterações concorrentes. */
export type LogisticsSnapshotRow = {
  id: string;
  position: number;
  payload: unknown;
};

export function collectionEditCommitPayload(
  rows: LogisticsSnapshotRow[], id: string, payload: Record<string, unknown>,
) {
  const target = rows.find(row => row.id === id);
  if (!target) throw new Error("Coleta não encontrada. Atualize a Expedição.");
  return {
    kind: "deliveries" as const,
    expected: rows.map(row => ({ id: row.id, payload: row.payload })),
    changes: [{
      id,
      position: target.position,
      payload: JSON.parse(JSON.stringify(payload)) as Record<string, unknown>,
    }],
  };
}

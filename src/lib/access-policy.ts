export type AccessRole = "gestor" | "operador";

export const OPERATOR_TABS = ["Contagem", "Conferência", "Entregas"] as const;
export function canAccessTab(role: AccessRole | null, tab: string): boolean {
  return role === "gestor" || (role === "operador" && OPERATOR_TABS.some((t) => t === tab));
}

const READ_KEYS = ["endereco-base", "current-movimentos", "current-meta", "zona-segura", "resolvidos-dia", "conferencia", "barcodes-base", "contagem-atual", "ciclos-contagem"];
const WRITE_KEYS = ["ciclos-contagem", "zona-segura", "conferencia", "resolvidos-dia", "contagem-atual"];
export function canAccessState(role: AccessRole | null, key: string, write = false): boolean {
  if (!role) return false;
  if (role === "gestor") return [...READ_KEYS, "import-history"].includes(key);
  return (write ? WRITE_KEYS : READ_KEYS).includes(key);
}
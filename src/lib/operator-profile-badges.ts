import type { Employee } from "./employees";

/**
 * Emblemas EXCLUSIVAMENTE visuais da seleção de perfis do operador.
 * Não alteram employee.role, autenticação ou políticas de acesso.
 *
 * A ordem de nomes em cada grupo segue o pedido operacional.
 * O restante dos funcionários é exibido como VENDEDOR ao final, em ordem alfabética.
 */
const MANAGERS = ["caique neves", "leonardo", "arthur b"] as const;
const ASSISTANTS = ["giovana nixdrof", "carlos eduardo", "ivan james", "caue"] as const;

export type OperatorBadge = "GESTOR" | "AUXILIAR LOG" | "VENDEDOR";

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Aceita sobrenomes adicionais, mas nunca identifica apelidos por trecho parcial. */
function matchingRank(name: string, names: readonly string[]): number {
  return names.findIndex(prefix => name === prefix || name.startsWith(prefix + " "));
}

export function operatorBadge(name: string): { label: OperatorBadge; group: number; rank: number } {
  const normalized = normalizeName(name);
  const manager = matchingRank(normalized, MANAGERS);
  if (manager !== -1) return { label: "GESTOR", group: 0, rank: manager };
  const assistant = matchingRank(normalized, ASSISTANTS);
  if (assistant !== -1) return { label: "AUXILIAR LOG", group: 1, rank: assistant };
  return { label: "VENDEDOR", group: 2, rank: 0 };
}

export function sortOperatorProfiles(employees: Employee[]): Employee[] {
  return [...employees].sort((a, b) => {
    const first = operatorBadge(a.name);
    const second = operatorBadge(b.name);
    return first.group - second.group
      || first.rank - second.rank
      || a.name.localeCompare(b.name, "pt-BR")
      || a.id.localeCompare(b.id);
  });
}

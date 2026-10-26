import type { Employee, EmployeeBadge } from "./employees";

const BADGE_PRIORITY: Record<EmployeeBadge, number> = {
  GESTOR: 0, "AUXILIAR LOG": 1, ENTREGADOR: 2, VENDEDOR: 3,
};

export const BADGE_COLORS: Record<EmployeeBadge, string> = {
  GESTOR: "border-orange-400/70 bg-orange-500/20 text-orange-200",
  "AUXILIAR LOG": "border-sky-400/70 bg-sky-500/20 text-sky-200",
  ENTREGADOR: "border-emerald-400/70 bg-emerald-500/20 text-emerald-200",
  VENDEDOR: "border-red-400/70 bg-red-500/20 text-red-200",
};

// Variação de alto contraste para o Cadastro de Funcionários (tema claro/escuro).
export const BADGE_COLORS_FORM: Record<EmployeeBadge, string> = {
  GESTOR: "border-orange-400 bg-orange-500/15 text-orange-800 dark:text-orange-200",
  "AUXILIAR LOG": "border-sky-400 bg-sky-500/15 text-sky-800 dark:text-sky-200",
  ENTREGADOR: "border-emerald-400 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  VENDEDOR: "border-red-400 bg-red-500/15 text-red-800 dark:text-red-200",
};

// Cadastros antigos recebem somente um emblema VISUAL provisório.
// Ao editar o funcionário, o gestor atribui o emblema permanente.
export function operatorBadge(employee: Employee): EmployeeBadge {
  return employee.badge ?? (employee.role === "GESTOR" ? "GESTOR" : "VENDEDOR");
}

export function sortOperatorProfiles(employees: Employee[]): Employee[] {
  return [...employees].sort((a, b) =>
    BADGE_PRIORITY[operatorBadge(a)] - BADGE_PRIORITY[operatorBadge(b)]
    || a.name.localeCompare(b.name, "pt-BR")
    || a.id.localeCompare(b.id));
}

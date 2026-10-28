import { describe, expect, test } from "bun:test";
import { canAccessTab, canAccessState } from "./access-policy";

describe("permissões por função", () => {
  test("gestor acessa todas as opções operacionais", () => {
    for (const tab of ["Importação", "Análises e Operações", "Contagem", "Conferência", "Entregas", "Roteiro de Apuração", "Zona Segura", "Estoque", "Endereçamento", "Histórico"]) expect(canAccessTab("gestor", tab)).toBe(true);
  });
  test("gestor pode abrir Expedição, mas operador não recebe essa página no menu do gestor", () => {
    expect(canAccessTab("gestor", "Expedição")).toBe(true);
    expect(canAccessTab("operador", "Expedição")).toBe(false);
    expect(canAccessTab(null, "Expedição")).toBe(false);
  });
  test("operador acessa somente Contagem, Conferência e Entregas", () => {
    expect(canAccessTab("operador", "Contagem")).toBe(true);
    expect(canAccessTab("operador", "Conferência")).toBe(true);
    expect(canAccessTab("operador", "Entregas")).toBe(true);
    for (const tab of ["Importação", "Análises e Operações", "Roteiro de Apuração", "Zona Segura", "Estoque", "Endereçamento", "Histórico"]) expect(canAccessTab("operador", tab)).toBe(false);
  });
  test("sem senha validada não há acesso aos dados", () => {
    expect(canAccessTab(null, "Contagem")).toBe(false);
    expect(canAccessState(null, "ciclos-contagem")).toBe(false);
    expect(canAccessState(null, "zona-segura", true)).toBe(false);
  });
  test("operador pode registrar ciclos mas não modificar importações", () => {
    expect(canAccessState("operador", "ciclos-contagem", true)).toBe(true);
    expect(canAccessState("operador", "current-movimentos", true)).toBe(false);
    expect(canAccessState("operador", "import-history")).toBe(false);
  });
});
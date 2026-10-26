import { describe, expect, test } from "bun:test";
import {
  employeeSchema, employeeListSchema, effectiveEmployeePermissions,
  EMPTY_EMPLOYEE_PERMISSIONS,
} from "./employees";
import { operatorBadge, sortOperatorProfiles } from "./operator-profile-badges";

const mk = (name, extras = {}) => employeeSchema.parse({
  id: crypto.randomUUID(), name, job: "Funcionário", role: "OPERADOR",
  photo: null, active: true, ...extras,
});

describe("emblemas e direitos por funcionário", () => {
  test("direitos são independentes do emblema/cargo de login", () => {
    const e = mk("Exemplo", { badge: "GESTOR", permissions: {
      expedicao: false, entregas: false, contagem: true, conferencia: false,
    } });
    expect(operatorBadge(e)).toBe("GESTOR");
    expect(e.role).toBe("OPERADOR");
    expect(effectiveEmployeePermissions(e).contagem).toBe(true);
    expect(effectiveEmployeePermissions(e).expedicao).toBe(false);
  });
  test("funcionário novo inicia sem direitos", () => {
    const e = mk("Novo", { badge: "VENDEDOR", permissions: { ...EMPTY_EMPLOYEE_PERMISSIONS } });
    expect(Object.values(effectiveEmployeePermissions(e)).some(Boolean)).toBe(false);
  });
  test("cadastros antigos continuam operando até edição, sem inventar emblemas por nome", () => {
    const old = mk("Pessoa Antiga");
    expect(effectiveEmployeePermissions(old).entregas).toBe(true);
    expect(effectiveEmployeePermissions(old).conferencia).toBe(true);
    expect(operatorBadge(old)).toBe("VENDEDOR");
  });
  test("direito explícito revoga acesso previamente permitido", () => {
    const old = mk("Cauê", { permissions: { ...EMPTY_EMPLOYEE_PERMISSIONS } });
    expect(effectiveEmployeePermissions(old).expedicao).toBe(false);
    const granted = { ...old, permissions: { ...EMPTY_EMPLOYEE_PERMISSIONS, expedicao: true } };
    expect(effectiveEmployeePermissions(granted).expedicao).toBe(true);
  });
  test("a ordem decorre dos emblemas cadastrados, não do nome", () => {
    const list = [
      mk("Arthur", { badge: "VENDEDOR" }),
      mk("Zoe", { badge: "GESTOR" }),
      mk("Abel", { badge: "ENTREGADOR" }),
      mk("Cauê", { badge: "AUXILIAR LOG" }),
    ];
    expect(sortOperatorProfiles(list).map(e => e.name)).toEqual(["Zoe", "Cauê", "Abel", "Arthur"]);
    expect(employeeListSchema.parse(list)).toHaveLength(4);
  });
});

import { describe, expect, test } from "bun:test";
import { effectiveEmployeePermissions, employeeSchema, EMPTY_EMPLOYEE_PERMISSIONS } from "./employees";

const base = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Funcionário Teste",
  job: "Operador",
  role: "OPERADOR",
  photo: null,
  active: true,
};

describe("direitos individuais", () => {
  test("cadastros antigos sem permissões ficam somente em consulta", () => {
    const employee = employeeSchema.parse(base);
    expect(effectiveEmployeePermissions(employee)).toEqual(EMPTY_EMPLOYEE_PERMISSIONS);
  });
  test("nome do funcionário não concede privilégios", () => {
    const employee = employeeSchema.parse({ ...base, name: "Cauê" });
    expect(effectiveEmployeePermissions(employee).expedicao).toBe(false);
  });
  test("emblemas são independentes dos direitos", () => {
    const employee = employeeSchema.parse({ ...base, badge: "GESTOR" });
    expect(effectiveEmployeePermissions(employee)).toEqual(EMPTY_EMPLOYEE_PERMISSIONS);
  });
  test("cada direito é concedido separadamente", () => {
    const employee = employeeSchema.parse({
      ...base, permissions: { expedicao: true, entregas: false, contagem: true, conferencia: false },
    });
    expect(effectiveEmployeePermissions(employee)).toEqual({
      expedicao: true, entregas: false, contagem: true, conferencia: false,
    });
  });
});

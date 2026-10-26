import { z } from "zod";

export const employeeBadgeSchema = z.enum(["GESTOR", "VENDEDOR", "AUXILIAR LOG", "ENTREGADOR"]);
export type EmployeeBadge = z.infer<typeof employeeBadgeSchema>;

export const employeePermissionsSchema = z.object({
  expedicao: z.boolean(),
  entregas: z.boolean(),
  contagem: z.boolean(),
  conferencia: z.boolean(),
});
export type EmployeePermissions = z.infer<typeof employeePermissionsSchema>;
export type EmployeePermission = keyof EmployeePermissions;

export const EMPTY_EMPLOYEE_PERMISSIONS: EmployeePermissions = {
  expedicao: false, entregas: false, contagem: false, conferencia: false,
};

// Funcionários sem direitos explicitamente atribuídos permanecem em modo consulta.
// O emblema, o nome e o perfil de login não concedem permissões operacionais.
export function effectiveEmployeePermissions(employee: Employee): EmployeePermissions {
  return employee.permissions ?? { ...EMPTY_EMPLOYEE_PERMISSIONS };
}

export const employeeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2, "Informe o nome do funcionário.").max(120),
  job: z.string().trim().min(2, "Informe a função.").max(100),
  // Categoria visual, independente do cargo de login (role).
  badge: employeeBadgeSchema.optional(),
  // Opcional apenas para aceitar cadastros anteriores à implantação.
  permissions: employeePermissionsSchema.optional(),
  role: z.enum(["OPERADOR", "GESTOR"]),
  photo: z.string().regex(/^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/).max(140000).nullable().default(null),
  active: z.boolean().default(true),
});
export type Employee = z.infer<typeof employeeSchema>;
export const employeeListSchema = z.array(employeeSchema).max(300);
export const employeeRoleName = (role: Employee["role"]) => role === "GESTOR" ? "Gestor" : "Operador";

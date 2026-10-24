import { z } from "zod";

export const employeeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2, "Informe o nome do funcionário.").max(120),
  job: z.string().trim().min(2, "Informe a função.").max(100),
  role: z.enum(["OPERADOR", "GESTOR"]),
  photo: z.string().regex(/^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/).max(140000).nullable().default(null),
  active: z.boolean().default(true),
});
export type Employee = z.infer<typeof employeeSchema>;
export const employeeListSchema = z.array(employeeSchema).max(300);
export const employeeRoleName = (role: Employee["role"]) => role === "GESTOR" ? "Gestor" : "Operador";

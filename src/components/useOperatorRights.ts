import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { currentOperatorPermissions } from "@/lib/employees.functions";
import { EMPTY_EMPLOYEE_PERMISSIONS, type EmployeePermissions } from "@/lib/employees";
import { useActiveEmployee } from "./EmployeeGate";

/** A interface consulta permissões atuais do servidor e nega ações enquanto carrega.
 * Nenhuma segurança depende deste hook: os endpoints validam novamente a sessão. */
export function useOperatorRights(): EmployeePermissions {
  const { employee } = useActiveEmployee();
  const check = useServerFn(currentOperatorPermissions);
  const query = useQuery({
    queryKey: ["operator-rights", employee?.id],
    queryFn: () => check(),
    enabled: !!employee?.id,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  return employee?.id && query.data ? query.data : EMPTY_EMPLOYEE_PERMISSIONS;
}

import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LogOut, ShieldCheck, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AccessRole } from "@/lib/access-policy";
import type { Employee } from "@/lib/employees";
import { clearSelectedEmployee, currentEmployee, listEmployees, selectEmployee } from "@/lib/employees.functions";
import { lockAccess } from "@/lib/access.functions";

type EmployeeContextValue = { employee: Employee | null; switchProfile: () => Promise<void> };
const Context = createContext<EmployeeContextValue>({ employee: null, switchProfile: async () => {} });
export const useActiveEmployee = () => useContext(Context);

export function EmployeeAvatar({ employee, size = "md" }: { employee: Employee; size?: "md" | "lg" }) {
  return <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#75aaff] bg-[#163960] text-[#c0dfff] ${size === "lg" ? "h-16 w-16" : "h-10 w-10"}`}>
    {employee.photo ? <img src={employee.photo} alt={`Foto de ${employee.name}`} className="h-full w-full object-cover" /> : <UserRound className={size === "lg" ? "h-8 w-8" : "h-5 w-5"} aria-hidden="true" />}
  </span>;
}
export function EmployeeTag() {
  const { employee, switchProfile } = useActiveEmployee();
  if (!employee) return null;
  return <button type="button" title="Trocar perfil de funcionário" onClick={() => { void switchProfile(); }}
    className="inline-flex max-w-[165px] items-center gap-2 rounded-lg sm:max-w-[220px] border border-[#3e679b] bg-[#102842] px-2 py-1 text-left text-[#eef6ff] hover:bg-[#1c3c61]">
    <EmployeeAvatar employee={employee} />
    <span className="min-w-0"><span className="block truncate text-xs font-bold sm:text-sm">{employee.name}</span>
      <span className="block truncate text-[11px] text-[#b4cee8]">{employee.job}</span></span>
  </button>;
}
export function EmployeeGate({ role, onExit, children }: { role: AccessRole; onExit: () => void; children: ReactNode }) {
  const client = useQueryClient();
  const fetchActive = useServerFn(currentEmployee);
  const fetchList = useServerFn(listEmployees);
  const select = useServerFn(selectEmployee);
  const clear = useServerFn(clearSelectedEmployee);
  const lock = useServerFn(lockAccess);
  const active = useQuery({ queryKey: ["active-employee", role], queryFn: () => fetchActive(), enabled: true, refetchOnWindowFocus: false });
  const list = useQuery({ queryKey: ["employees-available", role], queryFn: () => fetchList(), enabled: true, refetchOnWindowFocus: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const switchProfile = async () => {
    setBusy(true); setError("");
    try {
      await clear();
      client.setQueryData(["active-employee", role], null);
      await list.refetch();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível trocar de perfil."); }
    finally { setBusy(false); }
  };
  if (active.isLoading || list.isLoading) return <p role="status" className="p-10 text-center">Carregando perfis dos funcionários…</p>;
  if (active.isError || list.isError) return <div className="mx-auto mt-16 max-w-md space-y-3 p-5 text-center"><p role="alert">Não foi possível carregar os perfis.</p><Button onClick={() => { void active.refetch(); void list.refetch(); }}>Tentar novamente</Button></div>;
  if (active.data && list.data?.some(e => e.id === active.data!.id && e.active && (role === "operador" || e.role === "GESTOR"))) return <Context.Provider value={{ employee: active.data, switchProfile }}>{children}</Context.Provider>;
  // Inicialização segura: não impedir que o primeiro gestor entre
  // para cadastrar um funcionário com cargo GESTOR.
  const noManagerProfile = role === "gestor" && list.isSuccess
    && !(list.data ?? []).some(e => e.active && e.role === "GESTOR");
  if (noManagerProfile) return <Context.Provider value={{ employee: null, switchProfile }}>
    <div className="sticky top-0 z-50 border-b border-amber-400/40 bg-[#4e3719] px-4 py-3 text-center text-sm font-semibold text-[#fff0c5]">
      Para ativar os avisos divertidos, cadastre um funcionário com cargo GESTOR em Cadastro de Funcionários.
      Depois, saia e entre novamente para selecionar o perfil.
    </div>
    {children}
  </Context.Provider>;
  async function choose(employee: Employee) {
    setBusy(true); setError("");
    try {
      const verified = await select({ data: { id: employee.id } });
      client.setQueryData(["active-employee", role], verified);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível selecionar o perfil."); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-[#071422] px-4 py-10 text-white">
    <section className="w-full max-w-xl rounded-2xl border border-[#294f7e] bg-[#101f32] p-5 shadow-xl sm:p-8">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-[#193f72] p-3 text-[#80b5fc]"><Users className="h-7 w-7" /></span><div>
        <p className="text-xs font-bold uppercase tracking-wide text-[#8bbaf0]">Bem-vindo ao BigLogno 👋</p>
        <h1 className="text-2xl font-extrabold">{role === "gestor" ? "Qual gestor está acessando?" : "Quem vai operar hoje?"}</h1>
      </div></div>
      <p className="mt-3 text-sm text-[#b3cbe7]">{role === "gestor"
        ? "Selecione seu perfil de gestor para identificar quem está acompanhando a operação."
        : "Escolha seu perfil antes de acessar Contagem, Conferência ou Entregas."}</p>
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-400/50 p-3 text-sm text-red-300">{error}</p>}
      <div className="mt-5 max-h-[58vh] space-y-2 overflow-y-auto">
        {(list.data ?? []).filter(employee => employee.active && (role === "operador" || employee.role === "GESTOR")).map(employee => <button key={employee.id} disabled={busy} onClick={() => { void choose(employee); }}
          className="flex w-full items-center gap-4 rounded-xl border border-[#345983] bg-[#162a43] p-3 text-left transition-colors hover:border-[#77b5ff] hover:bg-[#21456c] disabled:opacity-60">
          <EmployeeAvatar employee={employee} size="lg" />
          <span className="min-w-0 flex-1"><span className="block truncate text-lg font-bold">{employee.name}</span><span className="block truncate text-sm text-[#abc9eb]">{employee.job}</span></span>
          <ShieldCheck className="h-5 w-5 shrink-0 text-[#84b9ff]" />
        </button>)}
        {!list.data?.some(employee => employee.active && (role === "operador" || employee.role === "GESTOR")) &&
          <p className="rounded-xl border border-dashed border-[#345983] p-5 text-center text-sm text-[#adc6e3]">
            {role === "gestor" ? "Nenhum funcionário GESTOR cadastrado. Cadastre ou ative um perfil de gestor para identificar o acesso."
              : "Nenhum perfil ativo cadastrado. Solicite ao gestor um cadastro na aba Cadastro de Funcionários."}
          </p>}
      </div>
      <Button variant="outline" className="mt-5 w-full border-[#355982] bg-transparent text-[#b7d7f7]" disabled={busy}
        onClick={async () => { try { await lock(); client.clear(); onExit(); } catch { setError("Não foi possível sair."); } }}>
        <LogOut className="h-4 w-4" /> Sair e voltar à senha
      </Button>
    </section>
  </main>;
}

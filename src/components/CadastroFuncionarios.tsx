import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Pencil, Plus, Save, Search, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { employeeSchema, effectiveEmployeePermissions, EMPTY_EMPLOYEE_PERMISSIONS, type Employee, type EmployeeBadge, type EmployeePermissions, type EmployeePermission } from "@/lib/employees";
import { BADGE_COLORS_FORM, operatorBadge } from "@/lib/operator-profile-badges";
import { deleteEmployee, listEmployees, saveEmployees } from "@/lib/employees.functions";
import { EmployeeAvatar } from "./EmployeeGate";

async function reducePhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Selecione uma imagem válida.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Foto acima de 12 MB.");
  const blobUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = blobUrl;
    await image.decode();
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Este dispositivo não permite processar imagens.");
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    const data = canvas.toDataURL("image/jpeg", 0.66);
    if (data.length > 140000) throw new Error("Não foi possível reduzir a foto. Selecione outra imagem.");
    return data;
  } finally { URL.revokeObjectURL(blobUrl); }
}
type FormState = {
  name: string; job: string; role: Employee["role"]; photo: string | null;
  badge: EmployeeBadge; permissions: EmployeePermissions;
};
const empty = (): FormState => ({
  name: "", job: "", role: "OPERADOR", photo: null,
  badge: "VENDEDOR", permissions: { ...EMPTY_EMPLOYEE_PERMISSIONS },
});
const permissionLabels: { key: EmployeePermission; label: string; description: string }[] = [
  { key: "expedicao", label: "Expedição", description: "Transferir pedidos entre Entregas e Retira" },
  { key: "entregas", label: "Entregas", description: "Iniciar, movimentar, assinar e organizar entregas" },
  { key: "contagem", label: "Contagem", description: "Criar, finalizar e operar ciclos e contagens" },
  { key: "conferencia", label: "Conferência", description: "Registrar conferências e operar retiradas" },
];

export function CadastroFuncionarios() {
  const queryClient = useQueryClient();
  const read = useServerFn(listEmployees), write = useServerFn(saveEmployees), remove = useServerFn(deleteEmployee);
  const query = useQuery({ queryKey: ["employees-available", "gestor"], queryFn: () => read(), staleTime: 15000 });
  const [editing, setEditing] = useState<Employee | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  function edit(employee?: Employee) {
    setEditing(employee ?? null);
    setForm(employee ? {
      name: employee.name, job: employee.job, role: employee.role, photo: employee.photo,
      badge: operatorBadge(employee), permissions: { ...effectiveEmployeePermissions(employee) },
    } : empty());
    setError(""); setMessage(""); setOpen(true);
  }
  async function importPhoto(file?: File) {
    if (!file) return;
    setBusy(true); setError("");
    try { const photo = await reducePhoto(file); setForm(f => ({ ...f, photo })); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível ler a foto."); }
    finally { setBusy(false); }
  }
  async function persist(next: Employee[]) {
    await write({ data: next });
    queryClient.setQueryData(["employees-available", "gestor"], next);
    await query.refetch();
  }
  async function save() {
    const parsed = employeeSchema.safeParse({
      id: editing?.id ?? crypto.randomUUID(), name: form.name, job: form.job,
      role: form.role, photo: form.photo, badge: form.badge,
      permissions: form.permissions, active: editing?.active ?? true,
    });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Confira o cadastro."); return; }
    setBusy(true); setError("");
    try {
      const existing = query.data ?? [];
      const next = editing
        ? existing.map(e => e.id === editing.id ? parsed.data : e)
        : [...existing, parsed.data];
      await persist(next);
      setOpen(false); setMessage("Cadastro salvo com sucesso.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar o cadastro."); }
    finally { setBusy(false); }
  }
  async function toggleActive(employee: Employee) {
    setBusy(true); setError(""); setMessage("");
    try {
      await persist((query.data ?? []).map(e => e.id === employee.id ? { ...e, active: !e.active } : e));
      setMessage(employee.active ? "Funcionário desativado. Registros anteriores preservados." : "Funcionário reativado.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível atualizar."); }
    finally { setBusy(false); }
  }
  async function destroy(employee: Employee) {
    if (!window.confirm(`Excluir definitivamente o cadastro de ${employee.name}? Os registros anteriores de operações serão preservados.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await remove({ data: { id: employee.id } });
      await query.refetch();
      setMessage("Funcionário excluído. Histórico de operações preservado.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível excluir."); }
    finally { setBusy(false); }
  }
  const employees = (query.data ?? []).filter(e =>
    (e.name + " " + e.job + " " + e.role).toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));

  return <section className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3"><span className="rounded-lg bg-primary/15 p-3 text-primary"><Users className="h-6 w-6" /></span><div>
        <h2 className="text-xl font-extrabold">Cadastro de Funcionários</h2>
        <p className="text-sm text-muted-foreground">Cadastre e organize os perfis utilizados pelo operador nas três áreas.</p>
      </div></div>
      <Button onClick={() => edit()}><Plus className="h-4 w-4" /> Novo funcionário</Button>
    </header>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
      <div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar nome, função ou cargo" className="pl-9" /></div>
      <span className="text-sm text-muted-foreground">{query.data?.filter(e => e.active).length ?? 0} ativos · {query.data?.length ?? 0} cadastrados</span>
    </div>
    {message && <p role="status" className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">{message}</p>}
    {error && !open && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {query.isError && <div role="alert" className="rounded-lg border border-destructive/30 p-4">Não foi possível consultar funcionários. <Button variant="outline" onClick={() => { void query.refetch(); }}>Tentar novamente</Button></div>}
    {query.isLoading && <p role="status">Carregando funcionários…</p>}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {employees.map(employee => <article key={employee.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3"><EmployeeAvatar employee={employee} size="lg" /><div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold">{employee.name}</h3>
          <p className="truncate text-sm text-muted-foreground">{employee.job}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-extrabold ${BADGE_COLORS_FORM[operatorBadge(employee)]}`}>{operatorBadge(employee)}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Acesso: {employee.role}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Direitos: {permissionLabels.filter(p => effectiveEmployeePermissions(employee)[p.key]).map(p => p.label).join(", ") || "Somente consulta"}
          </p>
        </div></div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <span className={employee.active ? "text-sm font-semibold text-success" : "text-sm text-muted-foreground"}>{employee.active ? "Ativo" : "Inativo"}</span>
          <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => edit(employee)}><Pencil className="h-4 w-4" /> Editar</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { void toggleActive(employee); }}>{employee.active ? "Desativar" : "Reativar"}</Button><Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => { void destroy(employee); }}><Trash2 className="h-4 w-4" /> Excluir</Button>
          </div>
        </div>
      </article>)}
    </div>
    {!employees.length && !query.isLoading && !query.isError && <p className="rounded-lg border border-dashed border-border p-7 text-center text-sm text-muted-foreground">Nenhum funcionário encontrado. Clique em Novo funcionário para começar.</p>}

    <Dialog open={open} onOpenChange={v => { if (!busy) setOpen(v); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Editar funcionário" : "Novo funcionário"}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); void save(); }}>
          <div className="flex flex-wrap items-center gap-4">
            <EmployeeAvatar employee={{ id: editing?.id ?? "", name: form.name || "Funcionário", job: form.job || "", role: form.role, photo: form.photo, active: true }} size="lg" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}><Plus className="h-4 w-4" /> Escolher foto</Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => cameraInput.current?.click()}><Camera className="h-4 w-4" /> Tirar foto</Button>
              {form.photo && <Button type="button" size="sm" variant="ghost" onClick={() => setForm(f => ({ ...f, photo: null }))}><X className="h-4 w-4" /> Retirar</Button>}
            </div>
            <input ref={fileInput} type="file" accept="image/*" className="hidden" aria-label="Enviar foto" onChange={e => { const f=e.target.files?.[0]; e.target.value=""; void importPhoto(f); }} />
            <input ref={cameraInput} type="file" accept="image/*" capture="user" className="hidden" aria-label="Tirar foto com câmera" onChange={e => { const f=e.target.files?.[0]; e.target.value=""; void importPhoto(f); }} />
          </div>
          <p className="text-xs text-muted-foreground">Fotos são recortadas e compactadas automaticamente em JPEG. No celular, o botão Tirar foto utiliza a câmera, quando disponível.</p>
          <label className="block space-y-1.5 text-sm font-semibold">Nome completo <Input required maxLength={120} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome do funcionário" /></label>
          <label className="block space-y-1.5 text-sm font-semibold">Função <Input required maxLength={100} value={form.job} onChange={e => setForm(f => ({ ...f, job: e.target.value }))} placeholder="Ex.: Conferente, Estoquista, Motorista" /></label>
          <label className="block space-y-1.5 text-sm font-semibold">Cargo
            <select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as Employee["role"] }))}>
              <option value="OPERADOR">OPERADOR</option><option value="GESTOR">GESTOR</option>
            </select>
          </label>
          <fieldset className="space-y-2 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-bold">Emblema do funcionário</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["GESTOR", "AUXILIAR LOG", "ENTREGADOR", "VENDEDOR"] as const).map(badge => (
                <button key={badge} type="button" aria-pressed={form.badge === badge}
                  onClick={() => setForm(current => ({ ...current, badge }))}
                  className={`rounded-lg border px-2 py-2 text-sm font-extrabold transition-opacity ${BADGE_COLORS_FORM[badge]} ${form.badge === badge ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-70 hover:opacity-100"}`}>
                  {badge}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">O emblema é visual e organiza a lista dos operadores. Não altera o cargo de login.</p>
          </fieldset>
          <fieldset className="space-y-2 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-bold">Direitos de operação</legend>
            {permissionLabels.map(permission => (
              <label key={permission.key} className="flex cursor-pointer items-center gap-3 rounded-md border border-border/70 p-2.5">
                <input type="checkbox" className="h-5 w-5 shrink-0 accent-primary"
                  checked={form.permissions[permission.key]}
                  onChange={event => {
                    const checked = event.currentTarget.checked;
                    setForm(previous => ({
                      ...previous,
                      permissions: { ...previous.permissions, [permission.key]: checked },
                    }));
                  }}/>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{permission.label}</span>
                  <span className="block text-xs text-muted-foreground">{permission.description}</span>
                </span>
              </label>
            ))}
            <p className="text-xs text-muted-foreground">Sem um direito, o funcionário abre o grid para consulta, mas não pode executar suas ações.</p>
          </fieldset>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy || query.isLoading}><Save className="h-4 w-4" /> {busy ? "Salvando…" : "Salvar cadastro"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </section>;
}

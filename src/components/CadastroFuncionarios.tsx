import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Pencil, Plus, Save, Search, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { employeeSchema, type Employee } from "@/lib/employees";
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
type FormState = { name: string; job: string; role: Employee["role"]; photo: string | null };
const empty: FormState = { name: "", job: "", role: "OPERADOR", photo: null };

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
    setForm(employee ? { name: employee.name, job: employee.job, role: employee.role, photo: employee.photo } : empty);
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
      role: form.role, photo: form.photo, active: editing?.active ?? true,
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
          <span className={`mt-1 inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${employee.role === "GESTOR" ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`}>{employee.role}</span>
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
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy || query.isLoading}><Save className="h-4 w-4" /> {busy ? "Salvando…" : "Salvar cadastro"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </section>;
}

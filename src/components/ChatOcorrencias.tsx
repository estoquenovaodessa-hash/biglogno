import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock3, MapPin, MessageCircle, PackageSearch, RefreshCw, Send, ShieldAlert, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActiveEmployee } from "./EmployeeGate";
import { createItemOccurrence, listItemOccurrences, resolveItemOccurrence } from "@/lib/item-chat.functions";
import type { ItemOccurrence } from "@/lib/item-chat";
import { cloudRefreshNow } from "@/lib/cloudState";

function dateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}
function OccurrenceCard({ item, onResolve, busy }: { item: ItemOccurrence; onResolve: (id: string) => Promise<void>; busy: boolean }) {
  const solved = Boolean(item.resolvido_em);
  return <article className={`overflow-hidden rounded-xl border p-4 shadow-sm transition-colors sm:p-5 ${solved ? "border-emerald-500/35 bg-card" : "border-[#3d78b8]/65 bg-card"}`}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
        <MessageCircle className="h-4 w-4 text-primary" /> Ocorrência de estoque
        <span className="font-mono">#{item.codigo}</span>
      </div>
      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${solved ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-amber-500/40 bg-amber-500/10 text-amber-500"}`}>
        {solved ? "✓ Resolvido" : "● Em aberto"}
      </span>
    </div>
    <p className="text-base leading-relaxed text-foreground">
      👋 Olá! <strong>{item.criado_por_nome}</strong> acaba de informar uma ocorrência no estoque.
    </p>
    <div className="my-3 rounded-lg border border-border bg-background/65 p-3">
      <p className="flex flex-wrap items-center gap-2 text-sm font-extrabold"><PackageSearch className="h-4 w-4 text-primary" /> Código <span className="font-mono text-lg text-primary">{item.codigo}</span></p>
      <p className="mt-2 break-words text-sm font-semibold">📦 {item.descricao}</p>
      <p className="mt-1 flex flex-wrap items-start gap-1.5 break-words text-sm text-muted-foreground"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {item.endereco || "Endereço não cadastrado"}</p>
      <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm font-bold text-amber-600 dark:text-amber-300">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> Ocorrência: {item.motivo}
      </p>
    </div>
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /> Informado em {dateTime(item.criado_em)}</p>
    {solved ? <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
      <p className="flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-300"><CheckCircle2 className="h-5 w-5" /> ✅ {item.resolvido_por_nome} resolveu esta ocorrência!</p>
      <p className="mt-1 text-xs text-muted-foreground">✅ Registrado na Zona Segura · Divergente · Observação: Chat · {dateTime(item.resolvido_em!)}</p>
    </div> : <Button type="button" className="mt-4 h-11 w-full gap-2 rounded-lg bg-emerald-600 font-bold text-white hover:bg-emerald-700" disabled={busy} onClick={() => { void onResolve(item.id); }}>
      <CheckCircle2 className="h-5 w-5" /> {busy ? "Registrando…" : "Resolvido"}
    </Button>}
  </article>;
}

export function ChatOcorrencias() {
  const { employee } = useActiveEmployee();
  const client = useQueryClient();
  const list = useServerFn(listItemOccurrences);
  const send = useServerFn(createItemOccurrence);
  const resolve = useServerFn(resolveItemOccurrence);
  const query = useQuery({
    queryKey: ["item-chat-ocorrencias"],
    queryFn: () => list(),
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });
  const [command, setCommand] = useState("");
  const [filter, setFilter] = useState<"open" | "all" | "closed">("open");
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const items = (query.data ?? []).filter(x => filter === "all" || (filter === "closed" ? !!x.resolvido_em : !x.resolvido_em));
  const open = (query.data ?? []).filter(x => !x.resolvido_em).length;

  async function submit() {
    if (!command.trim()) return;
    setBusy(true); setError(""); setFeedback("");
    try {
      await send({ data: { command: command.trim() } });
      setCommand("");
      await query.refetch();
      setFeedback("Ocorrência registrada e compartilhada com a equipe.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível enviar."); }
    finally { setBusy(false); }
  }
  async function solve(id: string) {
    setResolving(id); setError(""); setFeedback("");
    try {
      await resolve({ data: { id } });
      await query.refetch();
      await cloudRefreshNow().catch(() => {});
      await client.invalidateQueries({ queryKey: ["item-chat-ocorrencias"] });
      setFeedback("Ocorrência resolvida e enviada à Zona Segura como Divergente.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível resolver."); }
    finally { setResolving(null); }
  }

  return <section className="mx-auto w-full max-w-3xl space-y-4">
    <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/15 to-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="flex items-center gap-2 text-xl font-extrabold"><MessageCircle className="h-6 w-6 text-primary" /> Chat de Ocorrências 💬</h2>
          <p className="mt-1 text-sm text-muted-foreground">Compartilhe problemas de estoque e ajude a equipe a resolvê-los.</p></div>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-300">{open} em aberto</span>
      </div>
    </div>

    <form className="rounded-xl border border-border bg-card p-4 shadow-sm" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><UserRound className="h-4 w-4 text-primary" /> {employee?.name || "Selecione seu perfil"}</p>
      <label htmlFor="chat-command" className="mb-2 block text-sm font-semibold">Qual item apresenta ocorrência?</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id="chat-command" aria-label="Código e motivo da ocorrência" placeholder="Ex.: 519 - furo" value={command}
          maxLength={140} autoComplete="off" disabled={busy} onChange={e => setCommand(e.target.value)} className="h-12 flex-1 text-base" />
        <Button type="submit" className="h-12 gap-2 px-5 font-bold" disabled={!employee || busy || !command.trim()}><Send className="h-4 w-4" /> {busy ? "Enviando…" : "Enviar ocorrência"}</Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Digite código - motivo. Por exemplo: 519 - furo, 00519 - endereço errado ou 519 - estoque errado. O código será exibido com 5 dígitos.</p>
    </form>

    {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {feedback && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-300">{feedback}</p>}
    {query.isError && <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm">Não foi possível consultar as ocorrências. Verifique se a migração SQL do Chat foi instalada no Supabase. <Button variant="outline" className="ml-2" onClick={() => { void query.refetch(); }}>Tentar novamente</Button></div>}

    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar ocorrências">
        {([{ key:"open", label:"Em aberto" },{ key:"all", label:"Todas" },{ key:"closed", label:"Resolvidas" }] as const).map(v =>
          <Button key={v.key} size="sm" variant={filter === v.key ? "default" : "outline"} onClick={() => setFilter(v.key)}>{v.label}</Button>)}
      </div>
      <Button size="sm" variant="ghost" disabled={query.isFetching} onClick={() => { void query.refetch(); }}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> Atualizar</Button>
    </div>
    <div className="space-y-3">
      {items.map(item => <OccurrenceCard key={item.id} item={item} onResolve={solve} busy={!!resolving || busy} />)}
      {!items.length && !query.isLoading && !query.isError && <div className="rounded-xl border border-dashed border-border bg-card px-5 py-12 text-center">
        <CheckCircle2 className="mx-auto h-9 w-9 text-primary" /><p className="mt-3 text-sm font-semibold">Nenhuma ocorrência nesta visualização.</p>
      </div>}
      {query.isLoading && <p role="status" className="p-6 text-center text-sm text-muted-foreground">Carregando ocorrências…</p>}
    </div>
  </section>;
}

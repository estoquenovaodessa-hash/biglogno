import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle, CheckCircle2, Clock3, MessageCircle, PackageSearch,
  Send, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActiveEmployee } from "./EmployeeGate";
import { createItemOccurrence, listItemOccurrences, resolveItemOccurrence } from "@/lib/item-chat.functions";
import { listEmployees } from "@/lib/employees.functions";
import type { Employee } from "@/lib/employees";
import type { ItemOccurrence } from "@/lib/item-chat";
import { cloudRefreshNow } from "@/lib/cloudState";

type TimelineEvent = { kind: "issue" | "resolution"; item: ItemOccurrence; at: string };

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit",
  });
}
function calendarDay(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric",
  });
}
function dayLabel(iso: string) {
  const day = calendarDay(iso);
  const today = calendarDay(new Date().toISOString());
  const yesterday = calendarDay(new Date(Date.now() - 86400000).toISOString());
  return day === today ? "Hoje" : day === yesterday ? "Ontem" : day;
}
function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";
}
function ChatAvatar({ name, employee, small = false }: { name: string; employee?: Employee; small?: boolean }) {
  const size = small ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-xs";
  return <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-[#287a89] font-extrabold text-white ${size}`}
    title={name} aria-label={name}>
    {employee?.photo
      ? <img src={employee.photo} alt={`Foto de ${name}`} className="h-full w-full object-cover" />
      : initials(name)}
  </span>;
}

function OccurrenceBubble({
  item, mine, sender, onResolve, busy,
}: {
  item: ItemOccurrence;
  mine: boolean;
  sender?: Employee;
  onResolve: (item: ItemOccurrence) => void;
  busy: boolean;
}) {
  const completed = Boolean(item.resolvido_em);
  return <div className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
    {!mine && <ChatAvatar name={item.criado_por_nome} employee={sender} small />}
    <article className={`w-fit min-w-0 max-w-[85%] rounded-2xl border px-3.5 py-3 shadow-sm sm:max-w-[76%] sm:px-4 ${mine
      ? "rounded-br-sm border-[#80cdb4]/35 bg-[#d9f9df] text-[#183b32] dark:bg-[#194e44] dark:text-[#eafff3]"
      : "rounded-bl-sm border-[#426990]/65 bg-[#f7fbff] text-[#1a344e] dark:bg-[#19334d] dark:text-[#f1f8ff]"}`}>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className={`min-w-0 break-words text-xs font-extrabold ${mine ? "text-[#21765b] dark:text-[#90f6cb]" : "text-[#24719e] dark:text-[#8dceff]"}`}>
          {item.criado_por_nome}
        </span>
        <span className="text-[10px] opacity-65">{clock(item.criado_em)}</span>
      </div>
      <p className="break-words text-sm leading-relaxed sm:text-[15px]">
        👋 Olá! <strong>{item.criado_por_nome}</strong> acaba de informar uma ocorrência de estoque:
      </p>
      <div className={`my-2.5 space-y-1.5 rounded-lg border p-3 text-sm leading-snug ${mine
        ? "border-[#6eb495]/35 bg-white/45 dark:bg-black/10"
        : "border-[#8fb2d6]/40 bg-[#e8f2fc]/70 dark:bg-black/10"}`}>
        <p className="flex items-center gap-1.5 font-bold"><PackageSearch className="h-4 w-4 shrink-0" /> Código <span className="font-mono text-base">{item.codigo}</span></p>
        <p className="break-words">📦 <strong>{item.descricao}</strong></p>
        <p className="flex items-start gap-1.5 break-words"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {item.endereco || "Endereço não cadastrado"}</p>
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-400/10 px-2.5 py-2 text-sm font-semibold">
        <span aria-hidden="true">🚨</span><span className="break-words">Ocorrência: {item.motivo}</span>
      </div>
      {completed
        ? <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Ocorrência resolvida</p>
        : <Button type="button" size="sm" disabled={busy} onClick={() => onResolve(item)}
            className="mt-3 h-10 w-full gap-2 rounded-lg bg-[#178b6b] font-bold text-white hover:bg-[#0e745a] disabled:opacity-65">
            <CheckCircle2 className="h-4 w-4" /> {busy ? "Registrando…" : "Resolvido"}
          </Button>}
    </article>
  </div>;
}

function ResolutionBubble({ item, mine, employee }: { item: ItemOccurrence; mine: boolean; employee?: Employee }) {
  if (!item.resolvido_em) return null;
  const name = item.resolvido_por_nome || "Funcionário";
  return <div className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
    {!mine && <ChatAvatar name={name} employee={employee} small />}
    <div className={`min-w-0 max-w-[85%] rounded-2xl border px-3.5 py-3 shadow-sm sm:max-w-[76%] ${mine
      ? "rounded-br-sm border-emerald-500/30 bg-[#d9f9df] text-[#184935] dark:bg-[#194e44] dark:text-[#eafff3]"
      : "rounded-bl-sm border-emerald-500/30 bg-[#f3fbf6] text-[#194d39] dark:bg-[#183d38] dark:text-[#eafff3]"}`}>
      <p className="break-words text-sm leading-relaxed">✅ <strong>{name}</strong> resolveu esta ocorrência!</p>
      <p className="mt-1 text-xs opacity-80">{item.enviado_zona_segura === false
        ? `📌 Item ${item.codigo} resolvido apenas no Chat · Sem envio à Zona Segura`
        : `📋 Item ${item.codigo} enviado à Zona Segura · Divergente · Chat`}</p>
      <p className="mt-1 text-right text-[10px] opacity-65">{clock(item.resolvido_em)}</p>
    </div>
  </div>;
}

export function ChatOcorrencias() {
  const { employee } = useActiveEmployee();
  const client = useQueryClient();
  const list = useServerFn(listItemOccurrences);
  const send = useServerFn(createItemOccurrence);
  const resolve = useServerFn(resolveItemOccurrence);
  const readEmployees = useServerFn(listEmployees);

  const query = useQuery({
    queryKey: ["item-chat-ocorrencias"],
    queryFn: () => list(),
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });
  const employees = useQuery({
    queryKey: ["chat-fotos-funcionarios"],
    queryFn: () => readEmployees(),
    staleTime: 5 * 60000,
    refetchOnWindowFocus: false,
  });

  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [pendingResolution, setPendingResolution] = useState<ItemOccurrence | null>(null);
  const [resolutionError, setResolutionError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const feedRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const firstLoad = useRef(true);

  const profileMap = useMemo(() =>
    new Map((employees.data ?? []).map(person => [person.id, person])),
  [employees.data]);
  const timeline = useMemo<TimelineEvent[]>(() => (query.data ?? [])
    .flatMap(item => [
      { kind: "issue" as const, item, at: item.criado_em },
      ...(item.resolvido_em ? [{ kind: "resolution" as const, item, at: item.resolvido_em }] : []),
    ])
    .sort((a, b) => a.at.localeCompare(b.at) || a.item.id.localeCompare(b.item.id)),
  [query.data]);
  // Quando a resolução muda, surge uma segunda mensagem na conversa.
  const feedVersion = timeline.map(x => x.item.id + ":" + x.kind + ":" + x.at).join("|");

  useEffect(() => {
    const view = feedRef.current;
    if (!view) return;
    if (firstLoad.current || nearBottom.current) {
      view.scrollTo({ top: view.scrollHeight, behavior: firstLoad.current ? "auto" : "smooth" });
      firstLoad.current = false;
    }
  }, [feedVersion]);
  function trackScroll() {
    const view = feedRef.current;
    if (!view) return;
    nearBottom.current = view.scrollHeight - view.scrollTop - view.clientHeight < 160;
  }
  async function submit() {
    if (!command.trim() || busy) return;
    setBusy(true); setError(""); setFeedback("");
    try {
      await send({ data: { command: command.trim() } });
      setCommand("");
      nearBottom.current = true;
      await query.refetch();
      setFeedback("Ocorrência enviada para a equipe.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível enviar."); }
    finally { setBusy(false); }
  }
  async function solve(enviarZonaSegura: boolean) {
    const selected = pendingResolution;
    if (!selected || resolving) return;
    setResolving(selected.id); setResolutionError(""); setError(""); setFeedback("");
    try {
      await resolve({ data: { id: selected.id, enviarZonaSegura } });
      setPendingResolution(null);
      nearBottom.current = true;
      await query.refetch();
      if (enviarZonaSegura) await cloudRefreshNow().catch(() => {});
      await client.invalidateQueries({ queryKey: ["item-chat-ocorrencias"] });
      setFeedback(enviarZonaSegura
        ? "✅ Ocorrência resolvida e enviada à Zona Segura como Divergente."
        : "✅ Ocorrência resolvida no Chat, sem envio à Zona Segura.");
    } catch (e) {
      setResolutionError(e instanceof Error ? e.message : "Não foi possível resolver a ocorrência.");
    } finally { setResolving(null); }
  }

  let previousDay = "";
  return <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#0b1b2e]" aria-label="Chat de ocorrências">
    {/* Somente as mensagens rolam; a caixa de envio permanece sempre acessível. */}
    <div ref={feedRef} onScroll={trackScroll} role="log" aria-label="Mensagens da equipe"
      className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5"
      style={{ backgroundColor: "#10243a", backgroundImage: "radial-gradient(rgba(141,184,215,.09) 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
      {query.isLoading && <p role="status" className="py-10 text-center text-sm text-[#c6d7e8]">Carregando conversa…</p>}
      {query.isError && <div role="alert" className="mx-auto max-w-md rounded-xl border border-red-400/40 bg-[#422332] p-4 text-center text-sm text-red-100">
        <AlertCircle className="mx-auto mb-2 h-6 w-6" />
        Não foi possível consultar as ocorrências. Confira se o SQL do Chat e a atualização Sim/Não foram executados no Supabase.
        <Button type="button" size="sm" variant="outline" className="mt-3 border-red-200/50 bg-transparent text-white" onClick={() => { void query.refetch(); }}>Tentar novamente</Button>
      </div>}
      {!query.isLoading && !query.isError && !timeline.length && <div className="mx-auto max-w-xs rounded-xl bg-[#234562]/90 p-4 text-center text-sm text-[#e7f5ff]">
        <MessageCircle className="mx-auto mb-2 h-8 w-8 text-[#9de0c4]" />
        Ainda não há mensagens nesta visualização. Compartilhe uma ocorrência para começar! 💬
      </div>}
      {timeline.map(event => {
        const { item } = event;
        const day = calendarDay(event.at);
        const showDay = day !== previousDay;
        previousDay = day;
        return <div key={item.id + "-" + event.kind} className="space-y-2.5">
          {showDay && <div className="flex justify-center py-1"><span className="rounded-lg bg-[#294864]/90 px-3 py-1 text-xs font-semibold text-[#d4e8f7] shadow-sm">{dayLabel(event.at)}</span></div>}
          {event.kind === "issue"
            ? <OccurrenceBubble item={item} mine={item.criado_por_id === employee?.id}
                sender={profileMap.get(item.criado_por_id)} onResolve={item => { setResolutionError(""); setPendingResolution(item); }} busy={busy || Boolean(resolving)} />
            : <ResolutionBubble item={item} mine={item.resolvido_por_id === employee?.id}
                employee={item.resolvido_por_id ? profileMap.get(item.resolvido_por_id) : undefined} />}
        </div>;
      })}
    </div>

    <div className="shrink-0 border-t border-[#365f83] bg-[#122d47] px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-4">
      {(error || feedback) && <p role={error ? "alert" : "status"} className={`mb-2 rounded-lg px-3 py-2 text-xs font-semibold ${error ? "bg-red-500/15 text-red-200" : "bg-emerald-500/15 text-emerald-200"}`}>{error || feedback}</p>}
      <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <label htmlFor="chat-command" className="sr-only">Código e motivo da ocorrência</label>
        <Input id="chat-command" value={command} onChange={e => setCommand(e.target.value)}
          placeholder="Ex.: 519-furo ou 00519 - furo" maxLength={140} autoComplete="off" disabled={busy}
          className="h-12 min-w-0 flex-1 rounded-full border-[#486e8c] bg-[#f7fbff] px-4 text-base text-[#1a354b] placeholder:text-[#6b8294] focus-visible:ring-[#55bfa3] dark:bg-[#e9f4fa] dark:text-[#1a354b]" />
        <Button type="submit" size="icon" aria-label={busy ? "Enviando" : "Enviar ocorrência"}
          title="Enviar ocorrência" disabled={!employee || busy || !command.trim()}
          className="h-12 w-12 shrink-0 rounded-full bg-[#208b79] text-white hover:bg-[#136f61]">
          {busy ? <Clock3 className="h-5 w-5 animate-pulse" /> : <Send className="h-5 w-5" />}
        </Button>
      </form>
      <p className="mt-1.5 pl-3 text-[11px] text-[#aac8dd]">Pode digitar de várias formas: 519-furo, 00519 - furo, 519 furo, 519: furo ou 519/furo.</p>
    </div>

    <Dialog open={Boolean(pendingResolution)} onOpenChange={open => {
      if (!open && !resolving) { setPendingResolution(null); setResolutionError(""); }
    }}>
      <DialogContent className="w-[calc(100%-24px)] max-w-md rounded-2xl border border-[#416a8b] bg-[#102840] p-5 text-white sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-extrabold text-white">
            <CheckCircle2 className="h-6 w-6 text-emerald-400" /> Resolver ocorrência?
          </DialogTitle>
          <DialogDescription className="pt-2 text-left text-sm leading-relaxed text-[#d1e3f2]">
            O item <strong className="text-white">{pendingResolution?.codigo}</strong> precisa ser enviado à <strong className="text-white">Zona Segura</strong>?
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-lg border border-[#42678b] bg-[#193650] px-3 py-2 text-sm text-[#eaf4ff]">
          📦 {pendingResolution?.descricao} <span className="block text-xs text-[#bbd2e7]">🚨 {pendingResolution?.motivo}</span>
        </p>
        <div className="space-y-2 text-xs leading-relaxed text-[#bdd3e7]">
          <p><strong className="text-emerald-300">Sim:</strong> registra o item na Zona Segura como Divergente, observação Chat.</p>
          <p><strong className="text-amber-300">Não:</strong> encerra somente a ocorrência do Chat, sem registrar o item na Zona Segura.</p>
        </div>
        {resolutionError && <p role="alert" className="rounded-lg border border-red-400/50 bg-red-500/15 px-3 py-2 text-sm text-red-100">{resolutionError}</p>}
        <DialogFooter className="mt-1 flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button type="button" disabled={Boolean(resolving)} className="h-12 w-full gap-2 bg-emerald-600 font-bold text-white hover:bg-emerald-700"
            onClick={() => { void solve(true); }}>
            <CheckCircle2 className="h-4 w-4" /> Sim, enviar à Zona Segura
          </Button>
          <Button type="button" disabled={Boolean(resolving)} className="h-12 w-full gap-2 bg-[#356388] font-bold text-white hover:bg-[#42799f]"
            onClick={() => { void solve(false); }}>
            Não, resolver apenas no Chat
          </Button>
          <Button type="button" variant="ghost" disabled={Boolean(resolving)} className="h-10 w-full text-[#d7e8f7] hover:bg-white/10 hover:text-white"
            onClick={() => { setPendingResolution(null); setResolutionError(""); }}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}

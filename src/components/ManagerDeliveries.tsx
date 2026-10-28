import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { readDeliveryAddresses, saveDeliveryAddresses, confirmDeliveryAddressLocation } from "@/lib/delivery-addresses.functions";
import { normalizeDeliveryClientCode, parseDeliveryAddressesCsv } from "@/lib/delivery-addresses";
import { DeliveryRoutePanel } from "./DeliveryRoutePanel";
import { DeliveryWhatsAppSettings } from "./DeliveryWhatsAppSettings";
import type { DeliveryClientAddress } from "@/lib/delivery-addresses";
import type { ConfirmedPoint } from "@/lib/google-maps-location";
import {
  CalendarDays, CheckCircle2, ChevronRight, Clock3, Download, FileText, Upload,
  MapPin, Package, Pause, RefreshCw, Search, Truck, UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtBrasilia, fmtDuration, travelMs, waitMs, type Delivery, type DeliveryStatus } from "@/lib/deliveries";
import { shiftLabel, shiftOf, scheduledDateLabel } from "@/lib/expedition-schedule";

type Period = "all" | "today" | "7d" | "month" | "previous";
type StatusFilter = "all" | DeliveryStatus;
type Filters = { period: Period; driver: string; status: StatusFilter; search: string };
type ListTab = "pendentes" | "finalizadas" | "todas";
const initial: Filters = { period: "all", driver: "all", status: "all", search: "" };
const currency = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const statusInfo: Record<DeliveryStatus, { label: string; className: string }> = {
  nao_iniciada: { label: "Pendente", className: "border-warning/30 bg-warning/10 text-warning" },
  em_rota: { label: "Em rota", className: "border-primary/30 bg-primary/15 text-primary" },
  pausada: { label: "Pausada", className: "border-warning/30 bg-warning/10 text-warning" },
  no_destino: { label: "No destino", className: "border-primary/30 bg-primary/15 text-primary" },
  finalizada: { label: "Finalizada", className: "border-success/30 bg-success/10 text-success" },
};

function dateBR(date: Date | string) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(date));
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function inPeriod(record: Delivery, period: Period, now: Date) {
  if (period === "all") return true;
  const created = new Date(record.createdAt);
  if (!Number.isFinite(created.getTime())) return false;
  const today = dateBR(now);
  const day = dateBR(created);
  if (period === "today") return day === today;
  if (period === "7d") return created.getTime() >= now.getTime() - 7 * 86400000;
  if (period === "month") return day.slice(0, 7) === today.slice(0, 7);
  const previous = new Date(`${today.slice(0, 7)}-15T12:00:00Z`);
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  return day.slice(0, 7) === previous.toISOString().slice(0, 7);
}
function statusBadge(d: Delivery) {
  if (d.source === "coleta") {
    const label = d.status === "finalizada" ? "Coletado" : d.status === "nao_iniciada" ? "Aguardando coleta" : d.status === "no_destino" ? "No destino" : "Coletando";
    return <span className="inline-flex items-center rounded-md border border-orange-400/45 bg-orange-500/15 px-2.5 py-1 text-xs font-bold text-orange-700 dark:text-orange-300">{label}</span>;
  }
  const status = statusInfo[d.status] ?? statusInfo.nao_iniciada;
  return <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-bold ${status.className}`}>{status.label}</span>;
}

function exportCsv(rows: Delivery[]) {
  // Exportação local, sem alterar pedidos no banco.
  const headers = ["Tipo", "Documento", "Cliente", "Código cliente", "Valor (R$)", "Entregador", "Situação", "Recebedor", "Endereço coleta", "Falar com", "Transporte", "Pagamento", "Data programada", "Turno", "Criado em", "Iniciado em", "Chegou em", "Finalizado em", "Origem"];
  const escapeCell = (value: unknown) => {
    const str = String(value ?? "");
    const safe = /^[=+@\-\t\r]/.test(str) ? "'" + str : str;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  const lines = [
    headers.map(escapeCell).join(";"),
    ...rows.map(d => [
      d.source === "coleta" ? "COLETA" : "ENTREGA",
      d.document || (d.onlyDelivery ? "SOMENTE ENTREGA" : ""),
      d.company, d.companyCode ?? "", d.source === "coleta" && d.collectionValueProvided === false ? "" : Number(d.value || 0).toFixed(2).replace(".", ","),
      d.driver ?? "", d.source === "coleta" ? (d.status === "finalizada" ? "Coletado" : "Coletando") : statusInfo[d.status]?.label ?? d.status,
      d.source === "coleta" ? "" : d.receiver ?? "", d.collectionAddress ?? "", d.collectionContact ?? "",
      d.collectionTransport ?? "", d.collectionPayment ?? "", d.scheduledDate ?? "", shiftLabel(shiftOf(d)),
      fmtBrasilia(d.createdAt), fmtBrasilia(d.startedAt), fmtBrasilia(d.arrivedAt),
      fmtBrasilia(d.finishedAt), d.source,
    ].map(escapeCell).join(";")),
  ];
  const url = URL.createObjectURL(new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `biglogno-entregas-${dateBR(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function Summary({ icon: Icon, label, value, hint, tone = "primary" }: {
  icon: typeof Truck; label: string; value: number; hint: string; tone?: "primary" | "warning" | "success";
}) {
  const style = tone === "warning" ? "bg-warning/10 text-warning" : tone === "success" ? "bg-success/10 text-success" : "bg-primary/15 text-primary";
  return <div className="rounded-xl border border-border bg-card px-4 py-4 shadow-sm">
    <div className="flex items-start gap-3">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${style}`}><Icon className="h-5 w-5" /></div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{value.toLocaleString("pt-BR")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  </div>;
}

function TimelineStep({ title, at, current = false, completed = false }: {
  title: string; at?: string; current?: boolean; completed?: boolean;
}) {
  return <div className="relative flex gap-3 pb-5 last:pb-0">
    <div className="flex flex-col items-center">
      <span className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${current ? "border-primary bg-primary" : completed ? "border-success bg-success" : "border-muted-foreground/40 bg-card"}`} />
      <div className="mt-1 h-full w-px bg-border last:hidden" />
    </div>
    <div className="min-w-0 pb-1"><p className={`text-sm font-semibold ${at || current ? "text-foreground" : "text-muted-foreground"}`}>{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{at ? fmtBrasilia(at) : current ? "Em andamento" : "Aguardando"}</p>
    </div>
  </div>;
}

export function ManagerDeliveries({ deliveries, isLoading, isError, isFetching, onRefresh }: {
  deliveries: Delivery[]; isLoading: boolean; isError: boolean; isFetching: boolean; onRefresh: () => void;
}) {
  const readAddresses = useServerFn(readDeliveryAddresses);
  const saveAddresses = useServerFn(saveDeliveryAddresses);
  const confirmLocation = useServerFn(confirmDeliveryAddressLocation);
  const addressQuery = useQuery({ queryKey: ["delivery-addresses"], queryFn: () => readAddresses(), staleTime: 60000 });
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [draft, setDraft] = useState<Filters>(initial);
  const [filters, setFilters] = useState<Filters>(initial);
  const [tab, setTab] = useState<ListTab>("pendentes");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now] = useState(() => new Date());
  const drivers = [...new Set(deliveries.map(d => d.driver?.trim()).filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const term = filters.search.trim().toLocaleLowerCase("pt-BR");
  const scoped = deliveries.filter(d =>
    inPeriod(d, filters.period, now) &&
    (filters.driver === "all" || d.driver === filters.driver) &&
    (filters.status === "all" || d.status === filters.status) &&
    (!term || [d.company, d.companyCode, d.document, d.driver, d.receiver, d.collectionAddress, d.collectionContact].some(v => String(v ?? "").toLocaleLowerCase("pt-BR").includes(term)))
  );
  const pending = scoped.filter(d => d.status !== "finalizada");
  const finished = scoped.filter(d => d.status === "finalizada");
  const visible = (tab === "pendentes" ? pending : tab === "finalizadas" ? finished : scoped)
    .slice().sort((a, b) => {
      if (tab === "finalizadas") return String(b.finishedAt ?? "").localeCompare(String(a.finishedAt ?? ""));
      if (tab === "todas" && (a.status === "finalizada") !== (b.status === "finalizada")) return a.status === "finalizada" ? 1 : -1;
      return a.position - b.position;
    });
  const selected = visible.find(d => d.id === selectedId) ?? visible[0] ?? null;
  const address = selected?.source === "coleta" && selected.collectionAddress
    ? { client_code: "", address: selected.collectionAddress, neighborhood: "", city: "", state: "" }
    : selected?.companyCode
      ? addressQuery.data?.find(a => normalizeDeliveryClientCode(a.client_code) === normalizeDeliveryClientCode(selected.companyCode ?? ""))
      : undefined;
  const addressText = address ? [address.address, address.neighborhood, address.city, address.state].filter(Boolean).join(", ") : "";
  const mapHref = addressText ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addressText + ", Brasil") : null;
  async function importAddressFile(file?: File) {
    if (!file) return;
    setImporting(true); setImportMessage("");
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Arquivo acima de 10 MB.");
      const bytes = await file.arrayBuffer();
      let text = new TextDecoder("utf-8").decode(bytes);
      if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(bytes);
      const rows = parseDeliveryAddressesCsv(text);
      const result = await saveAddresses({ data: rows });
      await queryClient.invalidateQueries({ queryKey: ["delivery-addresses"] });
      setImportMessage(`${result.imported} endereços importados. Total cadastrado: ${result.total}.`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Falha ao importar o CSV.");
    } finally { setImporting(false); }
  }
  const applied = Object.values(filters).some((v, i) => v !== Object.values(initial)[i]);
  const label = "block mb-1.5 text-xs font-semibold text-muted-foreground";

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-4">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold"><Truck className="h-5 w-5 text-primary" /> Painel de Entregas</h2>
        <p className="mt-1 text-sm text-muted-foreground">Acompanhe a operação, consulte os pedidos e confira os horários registrados.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={isFetching} onClick={onRefresh}><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar</Button>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent">
          <Upload className="h-4 w-4" /> {importing ? "Importando…" : "Importar endereços"}
          <input aria-label="Importar CSV de endereços" type="file" accept=".csv,text/csv" className="sr-only" disabled={importing} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void importAddressFile(file); }} />
        </label>
        <Button variant="outline" size="sm" disabled={!visible.length} onClick={() => exportCsv(visible)}><Download className="h-4 w-4" /> Exportar CSV</Button>
      </div>
    </div>

    <DeliveryWhatsAppSettings deliveries={deliveries.filter(d => d.source !== "coleta")} />
    {importMessage && <p role="status" className="rounded-md border border-border p-3 text-sm">{importMessage}</p>}
    {isError && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">Não foi possível atualizar as entregas. Verifique a conexão e tente novamente.</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Summary icon={Package} label="Entregas e coletas" value={scoped.length} hint="Registros no filtro" />
      <Summary icon={Clock3} label="Pendentes" value={pending.length} hint="Ainda não finalizadas" tone="warning" />
      <Summary icon={Truck} label="Em rota / destino" value={scoped.filter(d => d.status === "em_rota" || d.status === "no_destino").length} hint="Operações em andamento" />
      <Summary icon={Pause} label="Pausadas" value={scoped.filter(d => d.status === "pausada").length} hint="Aguardando retomada" tone="warning" />
      <Summary icon={CheckCircle2} label="Finalizadas" value={finished.length} hint={scoped.length ? `${(100 * finished.length / scoped.length).toFixed(1).replace(".", ",")}% do total` : "Sem entregas"} tone="success" />
    </div>

    <form className="rounded-xl border border-border bg-card p-4" onSubmit={e => { e.preventDefault(); setFilters({ ...draft }); setSelectedId(null); }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold"><CalendarDays className="h-4 w-4 text-primary" /> Filtros de entregas e coletas</h3>
        {applied && <span className="text-xs text-primary">Filtros aplicados</span>}
      </div>
      <div className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1.8fr_auto_auto]">
        <label><span className={label}>Período</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.period} onChange={e => setDraft(p => ({ ...p, period: e.target.value as Period }))}>
          <option value="all">Todo o período</option><option value="today">Hoje</option><option value="7d">Últimos 7 dias</option><option value="month">Mês atual</option><option value="previous">Mês anterior</option>
        </select></label>
        <label><span className={label}>Entregador</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.driver} onChange={e => setDraft(p => ({ ...p, driver: e.target.value }))}>
          <option value="all">Todos</option>{drivers.map(d => <option key={d} value={d}>{d}</option>)}
        </select></label>
        <label><span className={label}>Situação</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.status} onChange={e => setDraft(p => ({ ...p, status: e.target.value as StatusFilter }))}>
          <option value="all">Todas</option>{(Object.keys(statusInfo) as DeliveryStatus[]).map(k => <option key={k} value={k}>{statusInfo[k].label}</option>)}
        </select></label>
        <label><span className={label}>Busca</span><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="h-10 pl-9" value={draft.search} onChange={e => setDraft(p => ({ ...p, search: e.target.value }))} placeholder="Cliente, documento ou entregador" /></div></label>
        <Button type="submit" className="h-10">Filtrar</Button>
        <Button type="button" variant="outline" className="h-10" onClick={() => { setDraft(initial); setFilters(initial); setSelectedId(null); }}>Limpar</Button>
      </div>
    </form>

    <DeliveryRoutePanel
      deliveries={deliveries}
      addresses={addressQuery.data ?? []}
      onSaveAddress={async (address: DeliveryClientAddress) => {
        await saveAddresses({ data: [address] });
        await queryClient.invalidateQueries({ queryKey: ["delivery-addresses"] });
      }}
      onConfirmLocation={async (clientCode: string, point: ConfirmedPoint) => {
        await confirmLocation({ data: { clientCode, latitude: point.latitude, longitude: point.longitude } });
        await queryClient.invalidateQueries({ queryKey: ["delivery-addresses"] });
      }}
    />

    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <section className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
        <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-background/70 p-1" role="tablist" aria-label="Situação das entregas">
          {([
            ["pendentes", "Pendentes", pending.length],
            ["finalizadas", "Finalizadas", finished.length],
            ["todas", "Todas", scoped.length],
          ] as const).map(([key, title, count]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => { setTab(key); setSelectedId(null); }}
            className={`rounded-md px-2 py-2 text-xs font-semibold transition-colors sm:text-sm ${tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>{title} ({count})</button>)}
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{isLoading ? "Carregando entregas…" : `${visible.length} pedido(s) nesta visualização`}</p>
        <div className="max-h-[690px] space-y-2 overflow-y-auto pr-1">
          {visible.map(d => <button key={d.id} type="button" onClick={() => setSelectedId(d.id)} aria-pressed={selected?.id === d.id}
            className={`w-full rounded-lg border p-3 text-left transition-colors sm:p-4 ${d.source === "coleta" ? selected?.id === d.id ? "border-orange-500 bg-orange-400/20 ring-1 ring-orange-500/30" : "border-orange-400/35 bg-orange-500/[0.08] hover:border-orange-500" : selected?.id === d.id ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "border-border bg-background/40 hover:border-primary/60"}`}>
            <div className="flex items-start justify-between gap-2">
              <h4 className="min-w-0 break-words text-sm font-bold text-foreground sm:text-base">{d.company}</h4>
              <span className="flex shrink-0 items-center gap-1">{statusBadge(d)}<ChevronRight className="h-4 w-4 text-muted-foreground" /></span>
            </div>
            <p className="mt-2 text-xs font-bold text-muted-foreground">{d.scheduledDate && d.source === "coleta" ? scheduledDateLabel(d.scheduledDate) + " • " : ""}{shiftLabel(shiftOf(d))}</p>
            <div className="mt-3 grid gap-x-3 gap-y-1.5 text-xs text-muted-foreground sm:grid-cols-2 sm:text-sm">
              <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> {d.source === "coleta" ? "COLETA" : d.onlyDelivery ? "Somente entrega" : `Doc. ${d.document || "—"}`}</span>
              <span className="font-semibold text-foreground">{d.source === "coleta" && d.collectionValueProvided === false ? "Valor não informado" : d.onlyDelivery ? "Sem cobrança" : currency(d.value)}</span>
              <span className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" /> {d.source === "coleta" ? (d.collectionTransport === "moto" ? "🏍️ MOTO · " : d.collectionTransport === "carro" ? "🚗 CARRO · " : "Transporte não informado · ") : ""}{d.driver || "Entregador não definido"}</span>
              <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> {fmtBrasilia(d.finishedAt ?? d.startedAt ?? d.createdAt)}</span>
            </div>
          </button>)}
          {!visible.length && <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{isLoading ? "Carregando…" : "Nenhuma entrega encontrada para os filtros selecionados."}</p>}
        </div>
      </section>

      <section className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5" aria-label="Detalhes da entrega selecionada">
        {selected ? <>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
            <div className="min-w-0 flex-1"><p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{selected.source === "coleta" ? "Detalhes da coleta" : "Detalhes da entrega"}</p><h3 className="break-words text-lg font-bold">{selected.company}</h3></div>
            {statusBadge(selected)}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-xs text-muted-foreground">Documento</p><p className="mt-1 font-semibold">{selected.source === "coleta" ? "Coleta (sem documento)" : selected.onlyDelivery ? "Somente entrega" : selected.document || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Valor</p><p className="mt-1 font-semibold">{selected.source === "coleta" && selected.collectionValueProvided === false ? "Não informado" : selected.onlyDelivery ? "Sem cobrança" : currency(selected.value)}</p></div>
            <div><p className="text-xs text-muted-foreground">Entregador</p><p className="mt-1 break-words font-semibold">{selected.driver || "Não atribuído"}</p></div>
            {selected.source === "coleta" ? <div><p className="text-xs text-muted-foreground">Falar com</p><p className="mt-1 break-words font-semibold">{selected.collectionContact || "Não informado"}</p></div> : <div><p className="text-xs text-muted-foreground">Recebedor</p><p className="mt-1 break-words font-semibold">{selected.receiver || "Não informado"}</p></div>}
            {selected.source === "coleta" && <div><p className="text-xs text-muted-foreground">Meio de transporte</p><p className="mt-1 font-semibold">{selected.collectionTransport === "moto" ? "🏍️ MOTO" : selected.collectionTransport === "carro" ? "🚗 CARRO" : "Não informado"}</p></div>}
            {selected.source === "coleta" && <div><p className="text-xs text-muted-foreground">Pagamento</p><p className="mt-1 font-semibold">{selected.collectionPayment === "dinheiro" ? "Dinheiro" : selected.collectionPayment === "faturado" ? "Faturado" : "Não informado"}</p></div>}
            <div><p className="text-xs text-muted-foreground">Turno</p><p className="mt-1 font-semibold">{shiftLabel(shiftOf(selected))}</p></div>
            {selected.source === "coleta" && <div><p className="text-xs text-muted-foreground">Data programada</p><p className="mt-1 font-semibold">{selected.scheduledDate ? scheduledDateLabel(selected.scheduledDate) : "Não definida"}</p></div>}
            <div><p className="text-xs text-muted-foreground">Tempo de trajeto</p><p className="mt-1 font-semibold">{fmtDuration(travelMs(selected))}</p></div>
            <div><p className="text-xs text-muted-foreground">Tempo de espera</p><p className="mt-1 font-semibold">{fmtDuration(waitMs(selected))}</p></div>
          </div>

          <div className="mt-5 rounded-lg border border-border bg-background/40 p-4">
            <h4 className="flex items-center gap-2 text-sm font-bold"><MapPin className="h-4 w-4 text-primary" /> Endereço e localização</h4>
            {address ? <>
              <p className="mt-2 text-sm font-semibold">{address.address}</p>
              <p className="text-sm text-muted-foreground">{[address.neighborhood, address.city, address.state].filter(Boolean).join(" · ")}</p>
              {mapHref && <a href={mapHref} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-primary underline"><MapPin className="h-4 w-4" /> Abrir endereço no Google Maps</a>}
            </> : <p className="mt-2 text-sm text-muted-foreground">{selected.companyCode ? "Endereço não encontrado na base importada para este código de cliente." : "Pedido sem código do cliente. Não é possível associar um endereço com segurança."}</p>}
            <p className="mt-2 text-xs text-muted-foreground">Sem rastreamento GPS ativo — nenhuma localização é simulada.</p>
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <h4 className="mb-4 flex items-center gap-2 text-sm font-bold"><Clock3 className="h-4 w-4 text-primary" /> Linha do tempo</h4>
            <TimelineStep title="Pedido criado" at={selected.createdAt} completed />
            <TimelineStep title={selected.source === "coleta" ? "Iniciou coleta" : "Saiu para entrega"} at={selected.startedAt} completed={!!selected.startedAt} current={selected.status === "nao_iniciada"} />
            {selected.pausedAt && <TimelineStep title="Entrega pausada" at={selected.pausedAt} current={selected.status === "pausada"} />}
            <TimelineStep title="Chegou ao destino" at={selected.arrivedAt} completed={!!selected.arrivedAt} current={selected.status === "em_rota"} />
            <TimelineStep title={selected.source === "coleta" ? "Coletado" : "Recebimento confirmado"} at={selected.finishedAt} completed={!!selected.finishedAt} current={selected.status === "no_destino"} />
          </div>
        </> : <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center text-muted-foreground"><Truck className="h-9 w-9" /><p className="text-sm">Selecione uma entrega na lista para ver os detalhes.</p></div>}
      </section>
    </div>

  </div>;
}

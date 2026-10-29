import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { readDeliveryAddresses, saveDeliveryAddresses, confirmDeliveryAddressLocation } from "@/lib/delivery-addresses.functions";
import { listEmployees } from "@/lib/employees.functions";
import {
  managerDeliveryDrivers, managerDeliveryInPeriod, managerMatchesDriver,
  type ManagerDeliveryPeriod,
} from "@/lib/manager-delivery-filters";
import { normalizeDeliveryClientCode, parseDeliveryAddressesCsv } from "@/lib/delivery-addresses";
import { DeliveryRoutePanel } from "./DeliveryRoutePanel";
import { ManagerDeliveryTable } from "./ManagerDeliveryTable";
import { listDeliveryRoutes } from "@/lib/delivery-route";
import { findBignottoOrigin } from "@/lib/delivery-route";
import { DeliveryKilometersPanel } from "./DeliveryKilometersPanel";
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

type Period = ManagerDeliveryPeriod;
type StatusFilter = "all" | DeliveryStatus;
type Filters = { period: Period; driver: string; shift: "all" | "manha" | "tarde" | "indefinido"; status: StatusFilter; search: string };
const initial: Filters = { period: "all", driver: "all", shift: "all", status: "all", search: "" };
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
  icon: typeof Truck; label: string; value: number | string; hint: string; tone?: "primary" | "warning" | "success";
}) {
  const color = tone === "warning" ? "manager-kpi-amber" : tone === "success" ? "manager-kpi-green" : "manager-kpi-blue";
  return <div className={"manager-delivery-kpi " + color}>
    <div className="flex items-center gap-3">
      <span className="manager-kpi-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"><Icon className="h-6 w-6" /></span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[#bed5f2]">{label}</p>
        <p className="mt-1 text-2xl font-extrabold tabular-nums text-white">{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</p>
        <p className="mt-1 text-[11px] text-[#8fb7e5]">{hint}</p>
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
  const fetchEmployees = useServerFn(listEmployees);
  const employeesQuery = useQuery({
    queryKey: ["employees-available", "gestor"],
    queryFn: () => fetchEmployees(), staleTime: 30000,
  });
  const addressQuery = useQuery({ queryKey: ["delivery-addresses"], queryFn: () => readAddresses(), staleTime: 60000 });
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [draft, setDraft] = useState<Filters>(initial);
  const [filters, setFilters] = useState<Filters>(initial);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [kmSummary, setKmSummary] = useState<{ meters: number | null; ready: number; total: number }>({ meters: null, ready: 0, total: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Usar horário atualizado, não a data congelada da primeira abertura da aba.
  const now = new Date();
  const employees = employeesQuery.data ?? [];
  const drivers = managerDeliveryDrivers(employees);
  const term = filters.search.trim().toLocaleLowerCase("pt-BR");
  const scoped = deliveries.filter(d =>
    managerDeliveryInPeriod(d, filters.period, now) &&
    (filters.shift === "all" || shiftOf(d) === filters.shift) &&
    managerMatchesDriver(d, filters.driver, employees) &&
    (filters.status === "all" || d.status === filters.status) &&
    (!term || [d.company, d.companyCode, d.document, d.driver, d.receiver, d.collectionAddress, d.collectionContact].some(v => String(v ?? "").toLocaleLowerCase("pt-BR").includes(term)))
  );
  const pending = scoped.filter(d => d.status !== "finalizada");
  const finished = scoped.filter(d => d.status === "finalizada");
  const visible = scoped.slice().sort((a, b) =>
    (a.status === "finalizada" ? 1 : 0) - (b.status === "finalizada" ? 1 : 0) ||
    a.position - b.position);
  const finishedToday = finished.filter(d => managerDeliveryInPeriod(d, "today", now)).length;
  const completedShifts = listDeliveryRoutes(finished.filter(d => d.source !== "coleta")).length;
  const showDeliveryDetails = (id: string) => {
    setSelectedId(id);
    setDetailsOpen(true);
    window.setTimeout(() => document.getElementById("manager-selected-details")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  };
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

  return <div className="manager-deliveries-dashboard space-y-4 rounded-2xl p-3 text-[#e9f4ff] sm:p-4 2xl:p-5">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1d4066]/90 pb-4">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-black tracking-tight text-white">
          <Truck className="h-6 w-6 text-[#45bfff]" /> Entregas — Gestor
        </h2>
        <p className="mt-1 text-sm text-[#9bbde5]">Acompanhe as entregas, rotas e desempenho da equipe em tempo real.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={isFetching} onClick={onRefresh}
          className="manager-action-outline"><RefreshCw className={"h-4 w-4 " + (isFetching ? "animate-spin" : "")} /> Atualizar</Button>
        <label className="manager-action-outline inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs font-bold">
          <Upload className="h-4 w-4" /> {importing ? "Importando…" : "Importar endereços"}
          <input aria-label="Importar CSV de endereços" type="file" accept=".csv,text/csv" className="sr-only"
            disabled={importing} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void importAddressFile(file); }} />
        </label>
        <Button type="button" variant="outline" size="sm" disabled={!visible.length}
          onClick={() => exportCsv(visible)} className="manager-action-outline"><Download className="h-4 w-4" /> Exportar CSV</Button>
      </div>
    </header>

    {importMessage && <p role="status" className="rounded-lg border border-[#315780] bg-[#102b4a] p-3 text-sm">{importMessage}</p>}
    {isError && <p role="alert" className="rounded-lg border border-red-500/50 bg-red-900/20 p-3 text-sm">Não foi possível atualizar as entregas. Verifique a conexão e tente novamente.</p>}

    <form className="manager-delivery-panel rounded-xl p-3 sm:p-4"
      onSubmit={e => { e.preventDefault(); setFilters({ ...draft }); setSelectedId(null); setDetailsOpen(false); }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#e8f5ff]">
          <CalendarDays className="h-4 w-4 text-[#55baff]" /> Filtros de entregas
        </h3>
        {applied && <span className="text-xs font-semibold text-[#60bfff]">Filtros aplicados</span>}
      </div>
      <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_0.9fr_0.9fr_1.7fr_auto_auto]">
        <label><span className="manager-field-label">Período</span>
          <select className="manager-field" value={draft.period} onChange={e => setDraft(p => ({ ...p, period: e.target.value as Period }))}>
            <option value="all">Todo o período</option><option value="today">Hoje</option>
            <option value="7d">Últimos 7 dias</option><option value="month">Mês atual</option>
            <option value="previous">Mês anterior</option>
          </select></label>
        <label><span className="manager-field-label">Entregador</span>
          <select className="manager-field" value={draft.driver} onChange={e => setDraft(p => ({ ...p, driver: e.target.value }))}>
            <option value="all">Todos</option>{drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {employeesQuery.isError && <span className="mt-1 block text-xs text-red-300">Não foi possível carregar entregadores.</span>}
        </label>
        <label><span className="manager-field-label">Turno</span>
          <select className="manager-field" value={draft.shift}
            onChange={e => setDraft(p => ({ ...p, shift: e.target.value as Filters["shift"] }))}>
            <option value="all">Todos</option><option value="manha">Manhã</option>
            <option value="tarde">Tarde</option><option value="indefinido">Indefinido</option>
          </select>
        </label>
        <label><span className="manager-field-label">Situação</span>
          <select className="manager-field" value={draft.status} onChange={e => setDraft(p => ({ ...p, status: e.target.value as StatusFilter }))}>
            <option value="all">Todas</option>{(Object.keys(statusInfo) as DeliveryStatus[]).map(k =>
              <option key={k} value={k}>{statusInfo[k].label}</option>)}
          </select>
        </label>
        <label><span className="manager-field-label">Busca</span>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#89b4e1]" />
            <Input className="manager-field pl-9" value={draft.search}
              onChange={e => setDraft(p => ({ ...p, search: e.target.value }))}
              placeholder="Cliente, documento, entregador..." /></div>
        </label>
        <Button type="submit" className="h-10 bg-[#0877ed] font-bold text-white hover:bg-[#168aff]"><Search className="h-4 w-4" /> Aplicar</Button>
        <Button type="button" variant="outline" className="manager-action-outline h-10"
          onClick={() => { setDraft(initial); setFilters(initial); setSelectedId(null); setDetailsOpen(false); }}>Limpar</Button>
      </div>
    </form>

    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      <Summary icon={Truck} label="Pendentes e em rota" value={pending.length} hint="Ver no grid abaixo" />
      <Summary icon={CheckCircle2} label="Finalizadas hoje" value={finishedToday} hint="Entregas concluídas no dia" tone="success" />
      <Summary icon={CalendarDays} label="Turnos concluídos" value={completedShifts} hint="Entregador · dia · turno" />
      <Summary icon={MapPin} label="KM estimados" value={kmSummary.meters === null ? "—" :
        (kmSummary.meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km"}
        hint={kmSummary.total && kmSummary.ready < kmSummary.total ? "Total parcial — rotas sem cálculo" : "Distâncias pelas ruas"} tone="warning" />
    </div>

    <div className="grid min-w-0 items-start gap-4 2xl:grid-cols-2">
      <ManagerDeliveryTable kind="open" records={pending} isLoading={isLoading} onSelect={showDeliveryDetails} />
      <ManagerDeliveryTable kind="finished" records={finished} isLoading={isLoading} onSelect={showDeliveryDetails} />
    </div>

    <div className="manager-delivery-lower grid min-w-0 items-start gap-4 2xl:grid-cols-2">
    <DeliveryRoutePanel
      deliveries={deliveries}
      addresses={addressQuery.data ?? []}
      storeOrigin={findBignottoOrigin(addressQuery.data ?? [])}
      originError={addressQuery.isError}
      onSaveAddress={async (address: DeliveryClientAddress) => {
        await saveAddresses({ data: [address] });
        await queryClient.invalidateQueries({ queryKey: ["delivery-addresses"] });
      }}
      onConfirmLocation={async (clientCode: string, point: ConfirmedPoint) => {
        await confirmLocation({ data: { clientCode, latitude: point.latitude, longitude: point.longitude } });
        await queryClient.invalidateQueries({ queryKey: ["delivery-addresses"] });
      }}
    />
      <DeliveryKilometersPanel
        drivers={drivers} selectedDriverId={filters.driver}
        deliveries={deliveries} addresses={addressQuery.data ?? []}
        storeOrigin={findBignottoOrigin(addressQuery.data ?? [])}
        originError={addressQuery.isError}
        onTotalsChange={setKmSummary}
      />
    </div>

    {detailsOpen && <div id="manager-selected-details" className="scroll-mt-8">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-[#f2f8ff]">Informações completas da operação</h3>
        <Button type="button" variant="outline" size="sm" className="manager-action-outline"
          onClick={() => setDetailsOpen(false)}>Fechar detalhes</Button>
      </div>
      <section className="manager-delivery-panel min-w-0 rounded-2xl p-4 sm:p-5" aria-label="Detalhes da entrega selecionada">
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
    </div>}

    <details className="manager-delivery-panel rounded-xl p-4">
      <summary className="cursor-pointer text-sm font-bold text-[#a9d8ff]">Configurações de mensagens e WhatsApp</summary>
      <div className="mt-4"><DeliveryWhatsAppSettings deliveries={deliveries.filter(d => d.source !== "coleta")} /></div>
    </details>
  </div>;
}

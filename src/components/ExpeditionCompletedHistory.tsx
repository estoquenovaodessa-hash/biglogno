import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, CheckCheck, ChevronDown, ChevronRight, Clock3, PackageCheck, RotateCcw, Truck } from "lucide-react";
import type { Delivery } from "@/lib/deliveries";
import type { Pickup } from "@/lib/pickups";
import { listCompletedPickups } from "@/lib/pickups.functions";
import {
  completedDeliveryHistory, completedPickupHistory, expeditionDateTime, expeditionLocalDay,
  type ExpeditionDateRange,
} from "@/lib/expedition-history";
import { Button } from "@/components/ui/button";

type Mode = "retirados" | "entregues";
const MONEY = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const price = (value?: number, noCharge = false) =>
  noCharge ? "Somente entrega" : value == null ? "—" : MONEY.format(value);
const text = (value?: string) => value?.trim() || "—";
const origin = (record: { source: string; channel?: string }) =>
  record.channel === "balcao" ? "Balcão" :
  record.channel === "expedicao" ? "Expedição" :
  record.source === "conferencia" ? "Conferência" : record.source === "manual" ? "Manual" : record.source;
const document = (record: { document?: string; onlyDelivery?: boolean }) =>
  record.onlyDelivery ? "Somente entrega" : text(record.document);

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0">
    <dt className="text-[11px] font-semibold uppercase tracking-wide text-sky-800/75 dark:text-sky-200/70">{label}</dt>
    <dd className="mt-0.5 break-words text-xs font-semibold text-foreground sm:text-sm">{value}</dd>
  </div>;
}

function CompletedRows({ mode, deliveries, pickups }: {
  mode: Mode; deliveries: Delivery[]; pickups: Pickup[];
}) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const [limit, setLimit] = useState(100);
  const isPickup = mode === "retirados";
  const count = isPickup ? pickups.length : deliveries.length;
  const rows = isPickup ? pickups : deliveries;
  const visible = rows.slice(0, limit);
  const cols = isPickup ? 8 : 9;
  const toggle = (id: string) => setExpanded(list =>
    list.includes(id) ? list.filter(key => key !== id) : [...list, id]);

  return <>
    <div className="overflow-x-auto rounded-lg border border-sky-400/30 bg-sky-100/25 dark:bg-sky-300/[0.06]">
      <table className="w-full min-w-[970px] border-collapse text-left text-xs sm:text-sm">
        <thead className="bg-sky-700/[0.12] text-sky-950 dark:bg-sky-400/15 dark:text-sky-100">
          <tr>
            {[
              "Concluído em", "Cliente / Retirador", "Documento", "Origem", "Valor",
              ...(isPickup ? ["Quem retirou", "Entregue por"] : ["Entregador", "Recebido por", "Chegada"]),
              "Detalhes",
            ].map(column => <th key={column} scope="col" className="whitespace-nowrap border-b border-sky-500/20 px-3 py-3 text-xs font-extrabold">{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {visible.map((item, index) => {
            const open = expanded.includes(item.id);
            const pickup = isPickup ? item as Pickup : null;
            const delivery = !isPickup ? item as Delivery : null;
            return <Fragment key={item.id}>
              <tr className={`border-b border-sky-500/15 align-top transition-colors hover:bg-sky-300/15 ${index % 2 ? "bg-sky-300/[0.07]" : "bg-transparent"}`}>
                <td className="whitespace-nowrap px-3 py-3 font-bold tabular-nums">{expeditionDateTime(item.finishedAt)}</td>
                <td className="max-w-[220px] px-3 py-3 font-semibold [overflow-wrap:anywhere]">{text(item.company)}</td>
                <td className="px-3 py-3">{document(item)}</td>
                <td className="px-3 py-3">{origin(item)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums">{price(item.value, Boolean(delivery?.onlyDelivery))}</td>
                <td className="px-3 py-3">{text(pickup?.receiver ?? delivery?.driver)}</td>
                <td className="px-3 py-3">{text(pickup?.handedBy ?? delivery?.receiver)}</td>
                {!isPickup && <td className="whitespace-nowrap px-3 py-3">{expeditionDateTime(delivery?.arrivedAt)}</td>}
                <td className="px-3 py-2">
                  <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-sky-800 hover:text-sky-900 dark:text-sky-200"
                    aria-expanded={open} aria-label={`Ver detalhes de ${item.company}`} onClick={() => toggle(item.id)}>
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {open ? "Ocultar" : "Ver"}
                  </Button>
                </td>
              </tr>
              {open && <tr className="border-b border-sky-500/25 bg-sky-200/20 dark:bg-sky-400/10">
                <td colSpan={cols} className="p-3 sm:p-4">
                  <dl className="grid grid-cols-2 gap-x-5 gap-y-3 rounded-lg border border-sky-400/20 bg-background/35 p-3 md:grid-cols-4 xl:grid-cols-5">
                    <Detail label="Cliente" value={text(item.company)} />
                    <Detail label="Código cliente" value={text(item.companyCode)} />
                    <Detail label="Documento" value={document(item)} />
                    <Detail label="Tipo / origem" value={origin(item)} />
                    <Detail label="Valor" value={price(item.value, Boolean(delivery?.onlyDelivery))} />
                    <Detail label="Registro / separação" value={expeditionDateTime(item.createdAt)} />
                    <Detail label="Finalizado" value={expeditionDateTime(item.finishedAt)} />
                    {pickup ? <>
                      <Detail label="Quem retirou" value={text(pickup.receiver)} />
                      <Detail label="Funcionário que entregou" value={text(pickup.handedBy)} />
                      <Detail label="Retirador informado" value={text(pickup.collector)} />
                      <Detail label="Preparado em (legado)" value={expeditionDateTime(pickup.preparedAt)} />
                      <Detail label="Preparado por (legado)" value={text(pickup.preparedBy)} />
                    </> : delivery ? <>
                      <Detail label="Entregador" value={text(delivery.driver)} />
                      <Detail label="Recebido por" value={text(delivery.receiver)} />
                      <Detail label="Saiu para entrega" value={expeditionDateTime(delivery.startedAt)} />
                      <Detail label="Chegou ao destino" value={expeditionDateTime(delivery.arrivedAt)} />
                      <Detail label="Pausado em" value={expeditionDateTime(delivery.pausedAt)} />
                      <Detail label="Tempo de pausa" value={delivery.pausedMs != null ? Math.round(delivery.pausedMs / 1000) + " s" : "—"} />
                      <Detail label="Operador (ID)" value={text(delivery.driverEmployeeId)} />
                      <Detail label="Posição original" value={String(delivery.position)} />
                      <Detail label="Notas separadas" value={delivery.separate ? "Sim" : "Não"} />
                      <Detail label="Preparado em (legado)" value={expeditionDateTime(delivery.preparedAt)} />
                      <Detail label="Preparado por (legado)" value={text(delivery.preparedBy)} />
                    </> : null}
                    <Detail label="Canal" value={text(item.channel)} />
                    <Detail label="Origem técnica" value={item.source} />
                    <Detail label="ID do registro" value={item.id} />
                  </dl>
                </td>
              </tr>}
            </Fragment>;
          })}
          {!count && <tr><td colSpan={cols} className="px-4 py-10 text-center text-sm text-muted-foreground">
            Nenhum registro finalizado encontrado para as datas selecionadas.
          </td></tr>}
        </tbody>
      </table>
    </div>
    {count > limit && <div className="flex justify-center py-3">
      <Button type="button" variant="outline" onClick={() => setLimit(n => n + 100)}>
        Mostrar mais ({count - limit} restantes)
      </Button>
    </div>}
  </>;
}

/** Arquivos de consulta acessíveis a todos os funcionários, sem controles de
 * mutação. Os fluxos de alteração da expedição continuam protegidos à parte. */
export function ExpeditionCompletedHistory({ deliveries }: { deliveries: Delivery[] }) {
  const [view, setView] = useState<Mode | null>(null);
  const [range, setRange] = useState<ExpeditionDateRange>({ from: "", to: "" });
  const loadPickups = useServerFn(listCompletedPickups);
  const pickupsQuery = useQuery({
    queryKey: ["expedition-completed-pickups"],
    queryFn: () => loadPickups(),
    enabled: view === "retirados",
    refetchInterval: view === "retirados" ? 30000 : false,
    refetchOnWindowFocus: true,
  });
  const deliveriesFinished = completedDeliveryHistory(deliveries, { from: "", to: "" });
  const delivered = completedDeliveryHistory(deliveries, range);
  const collected = completedPickupHistory(pickupsQuery.data ?? [], range);
  const isDateInvalid = Boolean(range.from && range.to && range.from > range.to);
  const today = expeditionLocalDay(new Date().toISOString());
  const cards = [
    { key: "retirados" as const, title: "Retirados", description: "Histórico de pedidos retirados", icon: PackageCheck },
    { key: "entregues" as const, title: "Entregues", description: "Histórico de entregas concluídas", icon: Truck },
  ];
  return <section className="space-y-3" aria-label="Histórico da Expedição">
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map(({ key, title, description, icon: Icon }) => {
        const active = view === key;
        return <button key={key} type="button" aria-controls="expedition-history-grid" aria-expanded={active}
          onClick={() => { setView(active ? null : key); setRange({ from: "", to: "" }); }}
          className={`flex min-h-24 w-full items-center gap-3 rounded-xl border p-3 text-left shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-4 ${active
            ? "border-sky-500/70 bg-sky-400/15 ring-1 ring-sky-500/20"
            : "border-sky-400/30 bg-sky-500/[0.07] hover:border-sky-500/60 hover:bg-sky-500/15"}`}>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-700 dark:text-sky-300"><Icon className="h-6 w-6" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-extrabold text-foreground">{title}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
            {key === "entregues" && <span className="mt-1 block text-xs font-semibold text-sky-700 dark:text-sky-300">{deliveriesFinished.length} registros concluídos</span>}
          </span>
          {active ? <ChevronDown className="h-5 w-5 shrink-0 text-sky-700 dark:text-sky-300" /> : <ChevronRight className="h-5 w-5 shrink-0 text-sky-700 dark:text-sky-300" />}
        </button>;
      })}
    </div>
    {view && <div id="expedition-history-grid" className="min-w-0 space-y-3 rounded-xl border border-sky-400/35 bg-sky-500/[0.065] p-3 shadow-sm dark:bg-sky-400/[0.08] sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {view === "retirados" ? <PackageCheck className="h-5 w-5 text-sky-700 dark:text-sky-300" /> : <CheckCheck className="h-5 w-5 text-sky-700 dark:text-sky-300" />}
          <h3 className="text-lg font-extrabold">{view === "retirados" ? "Retirados" : "Entregues"}</h3>
          <span className="rounded-full bg-sky-600/10 px-2 py-1 text-xs font-bold text-sky-900 dark:text-sky-200">
            {view === "retirados" ? collected.length : delivered.length} registros
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /> Consulta, sem edição</span>
      </div>
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-sky-400/20 bg-background/35 p-3">
        <CalendarDays className="mb-2 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" />
        <label className="min-w-0 flex-1 text-xs font-bold text-muted-foreground sm:flex-none">Data inicial
          <input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
            className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground sm:w-40" />
        </label>
        <label className="min-w-0 flex-1 text-xs font-bold text-muted-foreground sm:flex-none">Data final
          <input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
            className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground sm:w-40" />
        </label>
        <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => setRange({ from: today, to: today })}>Hoje</Button>
        <Button type="button" size="sm" variant="ghost" className="h-9 gap-1" onClick={() => setRange({ from: "", to: "" })}><RotateCcw className="h-4 w-4" /> Limpar</Button>
      </div>
      {isDateInvalid
        ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">A data inicial não pode ser posterior à data final.</p>
        : view === "retirados" && pickupsQuery.isPending
          ? <p role="status" className="p-5 text-center text-sm text-muted-foreground">Carregando retiradas finalizadas…</p>
          : view === "retirados" && pickupsQuery.isError
            ? <div role="alert" className="space-y-2 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">
                Não foi possível consultar as retiradas. <Button type="button" size="sm" variant="outline" onClick={() => { void pickupsQuery.refetch(); }}>Tentar novamente</Button>
              </div>
            : <CompletedRows key={view + "|" + range.from + "|" + range.to} mode={view} deliveries={delivered} pickups={collected} />}
      <p className="text-xs text-muted-foreground">O filtro considera a data de conclusão no horário de Brasília. O histórico é somente para consulta e não altera os pedidos.</p>
    </div>}
  </section>;
}

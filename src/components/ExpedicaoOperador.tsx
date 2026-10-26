import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCheck, ClipboardList, Clock3, PackageCheck, Truck, ArrowLeftRight } from "lucide-react";
import { deliveryGroups, fmtBrasilia, type Delivery } from "@/lib/deliveries";
import { listDeliveries } from "@/lib/deliveries.functions";
import { listExpeditionPickups, transferExpeditionOrders } from "@/lib/pickups.functions";
import { canTransferExpedition } from "@/lib/employees.functions";
import { useActiveEmployee } from "./EmployeeGate";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Pickup } from "@/lib/pickups";

type Origin = "BALCÃO" | "EXPEDIÇÃO";
type DisplayStatus = { text: string; theme: string; detail?: string };
type TransferNote = { id: string; document: string; value: number; separatedAt: string };
type TransferTarget = {
  kind: "toPickup" | "toDelivery";
  company: string;
  orders: TransferNote[];
};

const MONEY = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const green = "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
const blue = "border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300";
const when = (iso?: string) => iso ? fmtBrasilia(iso) : "—";

function originOf(record: { source: string; channel?: string }): Origin {
  // Preserva a origem informada pela Conferência; pedidos antigos são da Expedição.
  return record.channel === "balcao" ? "BALCÃO" : "EXPEDIÇÃO";
}

function deliveryStatus(d: Delivery): DisplayStatus {
  // A conferência já representa a separação: sem confirmação manual.
  if (d.status === "nao_iniciada") return { text: "SEPARADO", theme: green };
  return {
    text: "EM ROTA", theme: blue,
    detail: d.status === "pausada" ? "Viagem pausada"
      : d.status === "no_destino" ? "No destino" : undefined,
  };
}

function pickupStatus(p: Pickup): DisplayStatus {
  return p.status === "finalizada"
    ? { text: "RETIRADO", theme: blue }
    : { text: "SEPARADO", theme: green };
}

function Status({ value }: { value: DisplayStatus }) {
  return <div className="flex shrink-0 flex-col items-end gap-1">
    <span className={["inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-extrabold", value.theme].join(" ")}>
      {value.text}
    </span>
    {value.detail && <span className="text-right text-xs text-muted-foreground">{value.detail}</span>}
  </div>;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0">
    <p className="text-xs font-medium leading-5 text-muted-foreground">{label}</p>
    <div className="mt-0.5 break-words text-sm font-semibold leading-5 [overflow-wrap:anywhere]">{children}</div>
  </div>;
}

function Summary({ title, value, icon: Icon }: {
  title: string; value: number; icon: typeof Truck;
}) {
  return <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card p-3">
    <Icon className="h-5 w-5 shrink-0 text-primary" />
    <div className="min-w-0">
      <p className="text-xs font-medium leading-5 text-muted-foreground">{title}</p>
      <p className="text-xl font-extrabold tabular-nums">{value}</p>
    </div>
  </div>;
}

function DeliveryGroupCard({ orders, canTransfer, busy, onTransfer }: {
  orders: Delivery[];
  canTransfer: boolean;
  busy: boolean;
  onTransfer: (target: TransferTarget) => void;
}) {
  const first = orders[0];
  if (!first) return null;
  const total = orders.reduce((sum, item) => sum + (item.onlyDelivery ? 0 : Number(item.value) || 0), 0);
  const onlyDelivery = orders.every(item => item.onlyDelivery);
  const origins = [...new Set(orders.map(originOf))];
  const differentOrigins = origins.length > 1;
  const driver = first.driver || orders.find(item => item.driver)?.driver;
  // Notas sem documento ("Somente entrega") não podem ir para Retira.
  const transferable = orders.filter(order =>
    order.status === "nao_iniciada" && !order.onlyDelivery && !!order.document &&
    typeof order.value === "number" && Number.isFinite(order.value));

  return <article className="min-w-0 rounded-lg border border-border bg-background/60 p-3 sm:p-3.5">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <h3 className="break-words text-base font-extrabold leading-6 [overflow-wrap:anywhere]">{first.company}</h3>
        <p className="mt-0.5 text-sm font-semibold text-muted-foreground">
          {orders.length} {orders.length === 1 ? "pedido" : "pedidos"} {orders.length > 1 ? "unificados" : ""}
        </p>
      </div>
      <Status value={deliveryStatus(first)} />
    </div>

    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border/70 pt-3 sm:grid-cols-3">
      <Detail label="Tipo / origem">ENTREGA • {origins.join(" / ")}</Detail>
      <Detail label="Valor total">{onlyDelivery ? "Somente entrega" : MONEY.format(total)}</Detail>
      <Detail label="Saiu para entrega">{when(first.startedAt)}</Detail>
      <Detail label="Entregador">{driver || "—"}</Detail>
    </div>

    <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
      <h4 className="text-sm font-extrabold">Notas e horários de separação</h4>
      {orders.map(order => <div key={order.id}
        className="grid min-w-0 grid-cols-1 gap-1 rounded-md border border-border/60 bg-card/70 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
        <div className="min-w-0">
          <p className="break-all text-sm font-bold">
            {order.onlyDelivery ? "Somente entrega" : `Nota: ${order.document || "—"}`}
          </p>
          {!order.onlyDelivery && <p className="text-xs text-muted-foreground">{MONEY.format(Number(order.value) || 0)}</p>}
          {differentOrigins && <p className="text-xs text-muted-foreground">Origem: {originOf(order)}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:flex-col sm:items-end">
          <p className="text-sm font-semibold tabular-nums sm:text-right">
            <span className="text-xs font-medium text-muted-foreground">Separado: </span>{when(order.createdAt)}
          </p>

        </div>
      </div>)}
    </div>
    {canTransfer && transferable.length > 0 && <div className="mt-3 flex justify-end border-t border-border/70 pt-3">
      <Button type="button" variant="outline" size="sm" className="h-10 gap-2 text-sm font-bold"
        disabled={busy} onClick={() => onTransfer({
          kind: "toPickup",
          company: first.company,
          orders: transferable.map(order => ({
            id: order.id, document: order.document,
            value: order.value, separatedAt: order.createdAt,
          })),
        })}>
        <ArrowLeftRight className="h-4 w-4" />
        Ir para Retira {transferable.length > 1 ? `(${transferable.length} notas)` : ""}
      </Button>
    </div>}
  </article>;
}

function PickupCard({ order, canTransfer, busy, onTransfer }: {
  order: Pickup;
  canTransfer: boolean;
  busy: boolean;
  onTransfer: (target: TransferTarget) => void;
}) {
  return <article className="min-w-0 rounded-lg border border-border bg-background/60 p-3 sm:p-3.5">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <h3 className="break-words text-base font-extrabold leading-6 [overflow-wrap:anywhere]">{order.company}</h3>
        <p className="mt-0.5 break-all text-sm text-muted-foreground">Nota: {order.document || "—"}</p>
      </div>
      <Status value={pickupStatus(order)} />
    </div>
    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border/70 pt-3 sm:grid-cols-3">
      <Detail label="Tipo / origem">RETIRA • {originOf(order)}</Detail>
      <Detail label="Valor">{order.value === undefined ? "—" : MONEY.format(order.value)}</Detail>
      <Detail label="Separado às">{when(order.createdAt)}</Detail>
      <Detail label="Retirado às">{when(order.finishedAt)}</Detail>
      <Detail label="Quem retirou">{order.receiver || "—"}</Detail>
      <Detail label="Entregue por">{order.handedBy || "—"}</Detail>
    </div>
    {canTransfer && order.status === "pendente" &&
      <div className="mt-3 flex justify-end border-t border-border/70 pt-3">
        <Button type="button" variant="outline" size="sm" disabled={busy} className="h-10 gap-2 text-sm font-bold"
          onClick={() => onTransfer({
            kind: "toDelivery", company: order.company,
            orders: [{ id: order.id, document: order.document || "—",
              value: Number(order.value) || 0, separatedAt: order.createdAt }],
          })}>
          <Truck className="h-4 w-4" /> Ir para Entrega
        </Button>
      </div>}
  </article>;
}

export function ExpedicaoOperador() {
  // A visão permanece consultiva para todos, exceto o operador Cauê.
  // Mesmo quando visível, a API verifica a permissão novamente no servidor.
  const { employee } = useActiveEmployee();
  const queryClient = useQueryClient();
  const fetchDeliveries = useServerFn(listDeliveries);
  const fetchPickups = useServerFn(listExpeditionPickups);
  const readPermission = useServerFn(canTransferExpedition);
  const transferOrders = useServerFn(transferExpeditionOrders);
  const [target, setTarget] = useState<TransferTarget | null>(null);
  const [transferMode, setTransferMode] = useState<"all" | "selected">("selected");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const permission = useQuery({
    queryKey: ["expedition-transfer-permission", employee?.id],
    queryFn: () => readPermission(),
    enabled: !!employee?.id,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const canTransfer = permission.data?.allowed === true;

  const deliveriesQuery = useQuery({
    queryKey: ["expedition-deliveries"],
    queryFn: () => fetchDeliveries(),
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });
  const pickupsQuery = useQuery({
    queryKey: ["expedition-pickups"],
    queryFn: () => fetchPickups(),
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  const deliveries = (deliveriesQuery.data ?? [])
    .filter(d => d.source === "conferencia" && d.status !== "finalizada")
    .slice().sort((a, b) => a.position - b.position);

  // Reutiliza exatamente a regra de agrupamento da tela do entregador:
  // mesma empresa, status e viagem; notas desunificadas permanecem individuais.
  const groups = deliveryGroups(deliveries);

  const pickups = (pickupsQuery.data ?? []).slice()
    .sort((a, b) => a.status === b.status
      ? b.createdAt.localeCompare(a.createdAt)
      : a.status === "pendente" ? -1 : 1);

  const deliveriesReady = deliveries.filter(d => d.status === "nao_iniciada").length;
  const deliveriesRoute = deliveries.length - deliveriesReady;
  const pickupsReady = pickups.filter(p => p.status === "pendente").length;
  const pickupsDone = pickups.filter(p => p.status === "finalizada").length;

  function openTransfer(next: TransferTarget) {
    setTarget(next);
    setTransferMode("selected");
    setSelectedIds([]);
    setError("");
    setNotice("");
  }

  // Para vários pedidos, a seleção deve ser explícita: Todos ou notas marcadas.
  const chosenOrders = !target ? [] : target.orders.length === 1 || transferMode === "all"
    ? target.orders
    : target.orders.filter(order => selectedIds.includes(order.id));

  async function confirmTransfer() {
    if (!target || !canTransfer || busy || !chosenOrders.length) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await transferOrders({ data: {
        ids: chosenOrders.map(order => order.id),
        direction: target.kind,
      } });
      const totalMoved = chosenOrders.length;
      setNotice(`${totalMoved} ${totalMoved === 1 ? "nota transferida" : "notas transferidas"} para ${target.kind === "toPickup" ? "Retira" : "Entrega"}, mantendo os horários originais.`);
      setTarget(null);
      setSelectedIds([]);
      await Promise.allSettled([
        deliveriesQuery.refetch(),
        pickupsQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ["deliveries"] }),
        queryClient.invalidateQueries({ queryKey: ["pickups"] }),
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível transferir os pedidos.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="min-w-0 space-y-4" aria-label="Central de Expedição">
    <header className="flex min-w-0 items-start gap-3 rounded-xl border border-border bg-card p-4">
      <span className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary">
        <ClipboardList className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">Central de Expedição</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pedidos da Conferência • Entregas e Retiras • Atualização automática a cada 10 segundos
        </p>
      </div>
    </header>

    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      <Summary icon={CheckCheck} title="Entregas separadas" value={deliveriesReady} />
      <Summary icon={Truck} title="Entregas em rota" value={deliveriesRoute} />
      <Summary icon={PackageCheck} title="Retiras separadas" value={pickupsReady} />
      <Summary icon={Clock3} title="Retiras realizadas" value={pickupsDone} />
    </div>

    {/* Os dois painéis crescem com os pedidos: sem largura mínima de tabela,
        rolagem horizontal ou barras de rolagem independentes. */}
    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
      <section className="min-w-0 rounded-xl border border-border bg-card shadow-sm" aria-label="Pedidos de Entrega da Conferência">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Truck className="h-5 w-5 shrink-0 text-primary" />
          <h2 className="text-lg font-extrabold sm:text-xl">ENTREGAS</h2>
          <span className="ml-auto rounded-full bg-primary/10 px-3 py-1 text-sm font-bold">
            {groups.length} {groups.length === 1 ? "grupo" : "grupos"} • {deliveries.length} {deliveries.length === 1 ? "pedido" : "pedidos"}
          </span>
        </header>
        <div className="space-y-2 p-3">
          {groups.map(orders => {
            const first = orders[0];
            return first ? <DeliveryGroupCard key={first.id} orders={orders} canTransfer={canTransfer} busy={busy} onTransfer={openTransfer} /> : null;
          })}
          {!deliveries.length && <p className="p-5 text-center text-sm text-muted-foreground">
            {deliveriesQuery.isLoading ? "Carregando entregas…" : "Nenhuma entrega ativa vinda da Conferência."}
          </p>}
        </div>
      </section>

      <section className="min-w-0 rounded-xl border border-border bg-card shadow-sm" aria-label="Pedidos de Retira da Conferência">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <PackageCheck className="h-5 w-5 shrink-0 text-primary" />
          <h2 className="text-lg font-extrabold sm:text-xl">RETIRAS</h2>
          <span className="ml-auto rounded-full bg-primary/10 px-3 py-1 text-sm font-bold">{pickups.length}</span>
        </header>
        <div className="space-y-2 p-3">
          {pickups.map(p => <PickupCard key={p.id} order={p} canTransfer={canTransfer} busy={busy} onTransfer={openTransfer} />)}
          {!pickups.length && <p className="p-5 text-center text-sm text-muted-foreground">
            {pickupsQuery.isLoading ? "Carregando retiradas…" : "Nenhuma retirada vinda da Conferência."}
          </p>}
        </div>
      </section>
    </div>

    {(deliveriesQuery.isError || pickupsQuery.isError) &&
      <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        Falha ao atualizar uma das listas. Uma nova tentativa será realizada automaticamente.
      </p>}
    {notice && <p role="status" className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm font-semibold text-success">{notice}</p>}
    {error && !target && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <Dialog open={!!target} onOpenChange={open => {
      if (!open && !busy) { setTarget(null); setSelectedIds([]); setError(""); }
    }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Transferir para {target?.kind === "toPickup" ? "Retira" : "Entrega"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="break-words text-base font-extrabold">{target?.company}</p>
          {target && target.orders.length > 1 && <>
            <p className="font-semibold">Quais notas deseja transferir?</p>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={transferMode === "all" ? "default" : "outline"}
                aria-pressed={transferMode === "all"} disabled={busy}
                onClick={() => { setTransferMode("all"); setError(""); }}>
                Todos ({target.orders.length})
              </Button>
              <Button type="button" variant={transferMode === "selected" ? "default" : "outline"}
                aria-pressed={transferMode === "selected"} disabled={busy}
                onClick={() => { setTransferMode("selected"); setError(""); }}>
                Selecionar notas
              </Button>
            </div>
          </>}
          {target && (target.orders.length === 1 || transferMode === "selected") &&
            <fieldset className="space-y-2">
              {target.orders.length > 1 && <legend className="text-xs font-semibold text-muted-foreground">
                Marque uma ou mais notas:
              </legend>}
              {target.orders.map(order =>
                <label key={order.id} className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border border-border bg-card/60 p-3">
                  {target.orders.length > 1 && <input type="checkbox"
                    aria-label={`Selecionar nota ${order.document}`}
                    className="mt-1 h-4 w-4 shrink-0 accent-primary"
                    checked={selectedIds.includes(order.id)} disabled={busy}
                    onChange={event => {
                      setSelectedIds(previous => event.target.checked
                        ? [...previous.filter(id => id !== order.id), order.id]
                        : previous.filter(id => id !== order.id));
                    }} />}
                  <span className="min-w-0 flex-1">
                    <strong className="block break-all text-sm">Nota {order.document}</strong>
                    <span className="block text-xs text-muted-foreground">
                      {MONEY.format(order.value)} • Separado: {when(order.separatedAt)}
                    </span>
                  </span>
                </label>
              )}
            </fieldset>}
          {target && target.orders.length > 1 && transferMode === "all" &&
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm font-semibold">
              Todas as {target.orders.length} notas do grupo serão transferidas juntas.
            </p>}
          <p className="text-sm font-semibold">
            {chosenOrders.length} {chosenOrders.length === 1 ? "nota selecionada" : "notas selecionadas"}
            {" · "}Total: {MONEY.format(chosenOrders.reduce((sum, order) => sum + order.value, 0))}
          </p>
          <p className="text-xs text-muted-foreground">
            Empresa, documentos, valores, conferência e horários individuais de separação serão preservados.
            Se alguma nota não puder ser transferida, nenhuma delas será movimentada.
          </p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={busy}
            onClick={() => { setTarget(null); setSelectedIds([]); setError(""); }}>Cancelar</Button>
          <Button disabled={busy || !canTransfer || chosenOrders.length === 0}
            onClick={() => { void confirmTransfer(); }}>
            <ArrowLeftRight className="h-4 w-4" />
            {busy ? "Transferindo…" : `Transferir ${chosenOrders.length} ${chosenOrders.length === 1 ? "nota" : "notas"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCheck, ClipboardList, Clock3, PackageCheck, Truck } from "lucide-react";
import { fmtBrasilia, type Delivery } from "@/lib/deliveries";
import { listDeliveries } from "@/lib/deliveries.functions";
import { listExpeditionPickups } from "@/lib/pickups.functions";
import type { Pickup } from "@/lib/pickups";

type Origin = "BALCÃO" | "EXPEDIÇÃO";
type DisplayStatus = { text: string; theme: string; detail?: string };

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

function DeliveryCard({ order }: { order: Delivery }) {
  return <article className="min-w-0 rounded-lg border border-border bg-background/60 p-3 sm:p-3.5">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <h3 className="break-words text-base font-extrabold leading-6 [overflow-wrap:anywhere]">{order.company}</h3>
        <p className="mt-0.5 break-all text-sm text-muted-foreground">Nota: {order.onlyDelivery ? "Somente entrega" : (order.document || "—")}</p>
      </div>
      <Status value={deliveryStatus(order)} />
    </div>
    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border/70 pt-3 sm:grid-cols-3">
      <Detail label="Tipo / origem">ENTREGA • {originOf(order)}</Detail>
      <Detail label="Valor">{order.onlyDelivery ? "Somente entrega" : MONEY.format(order.value ?? 0)}</Detail>
      <Detail label="Separado às">{when(order.createdAt)}</Detail>
      <Detail label="Saiu para entrega">{when(order.startedAt)}</Detail>
      <Detail label="Entregador">{order.driver || "—"}</Detail>
    </div>
  </article>;
}

function PickupCard({ order }: { order: Pickup }) {
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
  </article>;
}

export function ExpedicaoOperador() {
  // Painel somente leitura. Nenhuma operação nesta tela modifica pedidos.
  const fetchDeliveries = useServerFn(listDeliveries);
  const fetchPickups = useServerFn(listExpeditionPickups);

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

  const pickups = (pickupsQuery.data ?? []).slice()
    .sort((a, b) => a.status === b.status
      ? b.createdAt.localeCompare(a.createdAt)
      : a.status === "pendente" ? -1 : 1);

  const deliveriesReady = deliveries.filter(d => d.status === "nao_iniciada").length;
  const deliveriesRoute = deliveries.length - deliveriesReady;
  const pickupsReady = pickups.filter(p => p.status === "pendente").length;
  const pickupsDone = pickups.filter(p => p.status === "finalizada").length;

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
          <span className="ml-auto rounded-full bg-primary/10 px-3 py-1 text-sm font-bold">{deliveries.length}</span>
        </header>
        <div className="space-y-2 p-3">
          {deliveries.map(d => <DeliveryCard key={d.id} order={d} />)}
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
          {pickups.map(p => <PickupCard key={p.id} order={p} />)}
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
  </section>;
}

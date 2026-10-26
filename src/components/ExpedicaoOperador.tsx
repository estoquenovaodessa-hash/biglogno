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
  // Registros legados de conferência surgiram da Expedição; novos fluxos do
  // Balcão poderão definir channel="balcao" sem mudar a tabela ou o layout.
  return record.channel === "balcao" ? "BALCÃO" : "EXPEDIÇÃO";
}
function deliveryStatus(d: Delivery): DisplayStatus {
  // Ao registrar uma entrega na Conferência, ela já aparece como SEPARADO.
  // O status Em rota vem exclusivamente do andamento real em Entregas.
  if (d.status === "nao_iniciada") return { text: "SEPARADO", theme: green };
  const detail = d.status === "pausada" ? "Viagem pausada"
    : d.status === "no_destino" ? "No destino" : undefined;
  return { text: "EM ROTA", theme: blue, detail };
}
function pickupStatus(p: Pickup): DisplayStatus {
  return p.status === "finalizada"
    ? { text: "RETIRADO", theme: blue }
    : { text: "SEPARADO", theme: green };
}
function Status({ value }: { value: DisplayStatus }) {
  return <div className="space-y-1">
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${value.theme}`}>
      {value.text}
    </span>
    {value.detail && <p className="text-[11px] text-muted-foreground">{value.detail}</p>}
  </div>;
}
function Notes({ document, onlyDelivery }: { document?: string; onlyDelivery?: boolean }) {
  return <span className="break-all font-semibold">{onlyDelivery || !document ? "Somente entrega" : document}</span>;
}
const TH = "whitespace-nowrap border-b border-border bg-muted/40 px-3 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground";
const TD = "border-b border-border/60 px-3 py-3 align-top text-sm";

export function ExpedicaoOperador() {
  // Expedição é uma tela de consulta: não altera pedidos nem movimenta status.
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

  // Entregas finalizadas continuam disponíveis no histórico de Entregas.
  // Aqui, são exibidas somente "Separado" e "Em rota", como solicitado.
  const deliveries = (deliveriesQuery.data ?? [])
    .filter(d => d.source === "conferencia" && d.status !== "finalizada")
    .slice().sort((a, b) => a.position - b.position);
  // Retiradas finalizadas continuam visíveis, inclusive o nome de quem retirou.
  const pickups = (pickupsQuery.data ?? []).slice()
    .sort((a, b) => a.status === b.status ? b.createdAt.localeCompare(a.createdAt)
      : a.status === "pendente" ? -1 : 1);
  const deliveriesReady = deliveries.filter(d => d.status === "nao_iniciada").length;
  const deliveriesRoute = deliveries.length - deliveriesReady;
  const pickupsReady = pickups.filter(p => p.status === "pendente").length;
  const pickupsDone = pickups.filter(p => p.status === "finalizada").length;
  const loading = deliveriesQuery.isLoading || pickupsQuery.isLoading;

  return <section className="space-y-5" aria-label="Central de Expedição">
    <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-primary/10 p-3 text-primary"><ClipboardList className="h-7 w-7" /></span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Central de Expedição</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pedidos originados da Conferência, organizados por destino: Entrega ou Retira.</p>
          <p className="mt-1 text-xs text-muted-foreground">Todo pedido é exibido como separado assim que passa pela Conferência. Atualização automática a cada 10 segundos.</p>
        </div>
      </div>
    </header>
    <div className="grid gap-3 sm:grid-cols-4">
      {([
        ["Entregas separadas", deliveriesReady, CheckCheck],
        ["Entregas em rota", deliveriesRoute, Truck],
        ["Retiras separadas", pickupsReady, PackageCheck],
        ["Retiras realizadas", pickupsDone, Clock3],
      ] as const).map(([title, count, Icon]) =>
        <div key={title} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <Icon className="h-6 w-6 shrink-0 text-primary" />
          <div><p className="text-xs font-medium text-muted-foreground">{title}</p><p className="text-2xl font-extrabold tabular-nums">{count}</p></div>
        </div>
      )}
    </div>

    <div className="grid items-start gap-5 2xl:grid-cols-2">
      <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm" aria-label="Pedidos de entrega da Conferência">
        <div className="flex items-center gap-2 border-b border-border p-4">
          <Truck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-extrabold">ENTREGAS</h2>
          <span className="ml-auto rounded-full bg-primary/10 px-3 py-1 text-sm font-bold">{deliveries.length}</span>
        </div>
        <div className="max-h-[65dvh] overflow-auto">
          <table className="w-full min-w-[780px]">
            <thead className="sticky top-0 z-10"><tr>
              <th className={TH}>Cliente / Nota</th><th className={TH}>Tipo / Origem</th>
              <th className={TH}>Situação</th><th className={TH}>Horários</th>
              <th className={TH}>Entregador</th>
            </tr></thead>
            <tbody>
              {deliveries.map(d => <tr key={d.id}>
                <td className={TD}><p className="max-w-[160px] break-words font-bold">{d.company}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Nota: <Notes document={d.document} onlyDelivery={d.onlyDelivery} /></p>
                  <p className="mt-1 text-xs">{d.onlyDelivery ? "Somente entrega" : MONEY.format(d.value ?? 0)}</p></td>
                <td className={TD}><strong className="text-xs">ENTREGA</strong>
                  <p className="mt-1 text-xs text-muted-foreground">{originOf(d)}</p></td>
                <td className={TD}><Status value={deliveryStatus(d)} /></td>
                <td className={TD}><div className="space-y-1 text-xs">
                  <p><span className="text-muted-foreground">Separado: </span>{when(d.createdAt)}</p>
                  <p><span className="text-muted-foreground">Saiu: </span>{when(d.startedAt)}</p>
                </div></td>
                <td className={TD}><span className="break-words">{d.driver || "—"}</span></td>
              </tr>)}
              {!deliveries.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                {loading ? "Carregando entregas…" : "Nenhuma entrega ativa originada na Conferência."}
              </td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm" aria-label="Pedidos de retira da Conferência">
        <div className="flex items-center gap-2 border-b border-border p-4">
          <PackageCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-extrabold">RETIRAS</h2>
          <span className="ml-auto rounded-full bg-primary/10 px-3 py-1 text-sm font-bold">{pickups.length}</span>
        </div>
        <div className="max-h-[65dvh] overflow-auto">
          <table className="w-full min-w-[790px]">
            <thead className="sticky top-0 z-10"><tr>
              <th className={TH}>Cliente / Nota</th><th className={TH}>Tipo / Origem</th>
              <th className={TH}>Situação</th><th className={TH}>Horários</th>
              <th className={TH}>Quem retirou</th>
            </tr></thead>
            <tbody>
              {pickups.map(p => <tr key={p.id}>
                <td className={TD}><p className="max-w-[160px] break-words font-bold">{p.company}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Nota: {p.document || "—"}</p>
                  <p className="mt-1 text-xs">{p.value === undefined ? "—" : MONEY.format(p.value)}</p></td>
                <td className={TD}><strong className="text-xs">RETIRA</strong>
                  <p className="mt-1 text-xs text-muted-foreground">{originOf(p)}</p></td>
                <td className={TD}><Status value={pickupStatus(p)} /></td>
                <td className={TD}><div className="space-y-1 text-xs">
                  <p><span className="text-muted-foreground">Separado: </span>{when(p.createdAt)}</p>
                  <p><span className="text-muted-foreground">Retirado: </span>{when(p.finishedAt)}</p>
                </div></td>
                <td className={TD}><p className="break-words font-bold">{p.receiver || "—"}</p>
                  {p.handedBy && <p className="mt-1 text-xs text-muted-foreground">Entregue por: {p.handedBy}</p>}
                </td>
              </tr>)}
              {!pickups.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                {loading ? "Carregando retiradas…" : "Nenhuma retira originada na Conferência."}
              </td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
    {(deliveriesQuery.isError || pickupsQuery.isError) &&
      <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        Falha ao carregar uma das listas. Verifique a conexão e clique em Atualizar.
      </p>}
    <p className="text-xs text-muted-foreground">
      Os horários de separação correspondem à passagem do pedido pela Conferência. A tela de Expedição é somente de acompanhamento: as entregas são iniciadas em Entregas e as retiradas são finalizadas em Retira.
    </p>
  </section>;
}

import {
  ArrowDown, ArrowUp, Building2, CheckCircle2, CircleDollarSign,
  Clock3, FileText, Layers, MapPin, Pause, Play, Unlink, UserRound, X, PackageCheck, MapPinned, ContactRound, CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fmtBrasilia, isConsumerDelivery, isLocked, statusLabel,
  type Delivery, type DeliveryAction,
} from "@/lib/deliveries";
import { scheduledDateLabel, shiftLabel, shiftOf } from "@/lib/expedition-schedule";
import { deliveryResponsibleName } from "@/lib/delivery-accountability";

const currency = (value: number) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type OperatorDeliveryCardProps = {
  orders: Delivery[];
  all: Delivery[];
  index: number;
  totalGroups: number;
  controlsDisabled: boolean;
  driver: string;
  onMove: (direction: -1 | 1) => void;
  onAction: (action: DeliveryAction) => Promise<boolean>;
  onArrive: () => Promise<void>;
  onSign: () => void;
};

export function OperatorDeliveryCard({
  orders, all, index, totalGroups, controlsDisabled,
  driver, onMove, onAction, onArrive, onSign,
}: OperatorDeliveryCardProps) {
  const order = orders[0];
  if (!order) return null;
  const collection = order.source === "coleta";

  const inProgress = ["em_rota", "no_destino"].includes(order.status);
  const paused = order.status === "pausada";
  const statusColors = collection
    ? "border-orange-400/55 bg-orange-500/20 text-orange-200"
    : inProgress
    ? "border-[#5ca9ff]/45 bg-[#1b4e88]/65 text-[#a4d0ff]"
    : paused
      ? "border-[#ffbf31]/50 bg-[#805616]/35 text-[#ffcb52]"
      : "border-[#508fe7]/40 bg-[#193f78]/80 text-[#91bdff]";
  const allOnlyDelivery = orders.every(row => row.onlyDelivery);
  const totalValue = orders.reduce((sum, row) => sum + (Number(row.value) || 0), 0);

  const actionPrimary = "h-12 w-full gap-2 rounded-lg border border-[#9ac6ff]/50 bg-[#75aaff] px-3 text-base font-extrabold text-[#07172c] shadow-[0_3px_12px_rgba(50,119,231,0.18)] hover:bg-[#93bbff] disabled:opacity-45";
  const actionSecondary = "h-11 w-full gap-2 rounded-lg border border-[#5483bd]/65 bg-[#111f34] text-sm font-semibold text-[#a6ceff] hover:bg-[#1b3454] hover:text-white";

  return (
    <article className={`relative overflow-hidden rounded-xl border p-4 text-[#f5f8ff] shadow-[0_7px_24px_rgba(0,0,0,0.18)] sm:p-5 ${collection ? "border-orange-400/70 bg-gradient-to-br from-orange-900/95 via-[#392718]/95 to-[#101c2e] shadow-[0_0_0_1px_rgba(251,146,60,0.20)]" : inProgress ? "border-[#459bff] bg-[#101c2e] shadow-[0_0_0_1px_rgba(69,155,255,0.18)]" : "border-[#365a88] bg-[#101c2e]"}`}>
      <div className={`mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs font-extrabold ${collection ? "border-orange-400/45 bg-orange-400/15 text-orange-100" : "border-sky-400/25 bg-sky-400/10 text-sky-200"}`}>
        {collection && <CalendarDays className="h-4 w-4 shrink-0" />}
        <span>{collection ? (order.scheduledDate ? scheduledDateLabel(order.scheduledDate) + " • " : "COLETA • ") + shiftLabel(shiftOf(order)) : shiftLabel(shiftOf(order))}</span>
        {collection && <span className="ml-auto rounded-md border border-orange-400/30 px-2 py-0.5">{order.collectionPayment === "faturado" ? "FATURADO" : order.collectionPayment === "dinheiro" ? "DINHEIRO" : "PAGAMENTO NÃO INFORMADO"}</span>}
      </div>
      <div className="flex items-start gap-3">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${collection ? "border-orange-400/60 bg-orange-400/20 text-orange-300" : "border-[#3166aa] bg-[#143b72] text-[#82baff]"}`}>
          {collection ? <PackageCheck className="h-6 w-6" aria-hidden="true" /> : <Building2 className="h-6 w-6" aria-hidden="true" />}
        </span>
        <h3 className="min-w-0 flex-1 break-words pt-1 text-base font-extrabold leading-snug tracking-[0.01em] sm:text-lg">
          {order.company}
          {collection && <span className="mt-1 block text-xs font-extrabold uppercase tracking-wider text-orange-300">Coleta</span>}
        </h3>
        <div className="flex shrink-0 flex-col gap-1" aria-label="Ordem da fila">
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-lg border border-[#365a88] bg-[#172a43] text-[#b4d4ff] hover:bg-[#24466d] hover:text-white"
            aria-label={`Subir ${order.company}`} disabled={controlsDisabled || index === 0}
            onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-lg border border-[#365a88] bg-[#172a43] text-[#b4d4ff] hover:bg-[#24466d] hover:text-white"
            aria-label={`Descer ${order.company}`} disabled={controlsDisabled || index === totalGroups - 1}
            onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className={`my-3 h-px ${collection ? "bg-orange-400/30" : "bg-[#294160]"}`} />

      <div className="flex items-center gap-3">
        <CircleDollarSign className="h-7 w-7 shrink-0 text-[#ffb914]" aria-hidden="true" />
        <p className="text-[1.65rem] font-extrabold leading-tight tracking-tight tabular-nums">
          {collection && order.collectionValueProvided === false ? "VALOR NÃO INFORMADO" : allOnlyDelivery ? "SOMENTE ENTREGA" : currency(totalValue)}
        </p>
      </div>

      {collection && <div className="mt-3 space-y-1.5 rounded-lg border border-orange-400/25 bg-orange-400/10 p-3 text-sm text-orange-100">
        <p className="flex items-center gap-2 font-bold"><span className="text-xl" aria-hidden="true">{order.collectionTransport === "moto" ? "🏍️" : order.collectionTransport === "carro" ? "🚗" : "🚚"}</span>
          <span>Transporte: {order.collectionTransport === "moto" ? "MOTO" : order.collectionTransport === "carro" ? "CARRO" : "Não informado"}</span></p>
        <p className="flex items-start gap-2"><MapPinned className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" /> <span><strong>Endereço:</strong> {order.collectionAddress || "Não informado"}</span></p>
        <p className="flex items-start gap-2"><ContactRound className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" /> <span><strong>Falar com:</strong> {order.collectionContact || "Não informado"}</span></p>
      </div>}
      {!collection && <div className="mt-3 space-y-2.5">
        {orders.map(row => (
          <div key={row.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 text-sm sm:text-base">
              <FileText className="h-4 w-4 shrink-0 text-[#66b4ff]" aria-hidden="true" />
              <span className="min-w-0 break-all font-semibold">
                {row.onlyDelivery ? "Somente entrega" : <>Nº documento: <span className="text-white">{row.document}</span></>}
              </span>
            </div>
            {row.status === "nao_iniciada" && !isConsumerDelivery(row) && (orders.length > 1 || row.separate) && (
              <Button type="button" variant="outline" size="sm"
                className="h-9 shrink-0 gap-1.5 rounded-lg border-[#3a648f] bg-[#14253b] px-2.5 text-xs font-bold text-[#9ccfff] hover:bg-[#203c5c] hover:text-white"
                disabled={controlsDisabled} onClick={() => { void onAction({ action: row.separate ? "unify" : "separate", id: row.id }); }}>
                <Unlink className="h-3.5 w-3.5" /> {row.separate ? "Unificar" : "Desunificar"}
              </Button>
            )}
          </div>
        ))}
      </div>}

      <div className={`mt-3 flex flex-wrap items-center gap-2 border-t pt-3 ${collection ? "border-orange-400/30" : "border-[#294160]"}`}>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-extrabold ${statusColors}`}>
          <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
          {collection ? (order.status === "finalizada" ? "Coletado" : order.status === "no_destino" ? "No destino" : order.status === "nao_iniciada" ? "Aguardando coleta" : order.status === "pausada" ? "Coleta pausada" : "Coletando") : statusLabel(order, all)}
        </span>
        {orders.length > 1 && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#c3d1e6]">
            <Layers className="h-4 w-4 text-[#6faafa]" aria-hidden="true" />
            {orders.length} pedidos unificados
          </span>
        )}
      </div>

      {order.driver && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-[#172b45] px-3 py-2 text-xs text-[#c6dcfa]">
          <span className="inline-flex items-center gap-1.5"><UserRound className="h-4 w-4 text-[#6faafa]" /> {deliveryResponsibleName(order)}</span>
          {order.startedAt && <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-[#6faafa]" /> Início: {fmtBrasilia(order.startedAt)}</span>}
        </div>
      )}

      <div className="mt-3 grid gap-2">
        {order.status === "nao_iniciada" && (
          <Button type="button" className={actionPrimary} disabled={controlsDisabled || isLocked(order, all)}
            onClick={() => { void onAction({ action: "start", id: order.id, driver }); }}>
            <Play className="h-5 w-5" /> {collection ? "Iniciar coleta" : "Iniciar entrega"}
          </Button>
        )}
        {order.status === "em_rota" && (
          <>
            <Button type="button" className={actionPrimary} disabled={controlsDisabled} onClick={() => { void onArrive(); }}>
              <MapPin className="h-5 w-5" /> Cheguei ao destino
            </Button>
            <Button type="button" className={actionSecondary} disabled={controlsDisabled}
              onClick={() => { void onAction({ action: "pause", id: order.id }); }}><Pause className="h-4 w-4" /> {collection ? "Pausar coleta" : "Pausar entrega"}</Button>
          </>
        )}
        {order.status === "pausada" && (
          <Button type="button" className={actionPrimary} disabled={controlsDisabled || isLocked(order, all)}
            onClick={() => { void onAction({ action: "resume", id: order.id }); }}><Play className="h-5 w-5" /> {collection ? "Retomar coleta" : "Retomar entrega"}</Button>
        )}
        {(order.status === "em_rota" || order.status === "pausada") && (
          <Button type="button" variant="ghost" className="h-10 w-full gap-2 text-xs font-bold text-[#ff9191] hover:bg-[#512d38] hover:text-[#ffbaba]"
            disabled={controlsDisabled} onClick={() => { void onAction({ action: "cancel", id: order.id }); }}><X className="h-4 w-4" /> Cancelar início</Button>
        )}
        {order.status === "no_destino" && (
          <Button type="button" className={actionPrimary} disabled={controlsDisabled}
            onClick={collection ? () => { void onAction({ action: "finish_collection", id: order.id }); } : onSign}>
            <CheckCircle2 className="h-5 w-5" /> {collection ? "Coletado" : "Assinar notinhas"}
          </Button>
        )}
      </div>
    </article>
  );
}

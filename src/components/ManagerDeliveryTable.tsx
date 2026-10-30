import { CheckCircle2, Truck, ChevronRight, Clock3, FileText } from "lucide-react";
import type { Delivery, DeliveryStatus } from "@/lib/deliveries";
import { fmtBrasilia } from "@/lib/deliveries";
import { shiftLabel, shiftOf, scheduledDateLabel } from "@/lib/expedition-schedule";
import { finishedDeliveryTransport } from "@/lib/delivery-transport";
import { managerDeliveryRows } from "@/lib/manager-delivery-rows";

type Kind = "open" | "finished";
type Props = {
  kind: Kind;
  records: Delivery[];
  isLoading: boolean;
  onSelect: (id: string) => void;
};

/** Cards do layout aprovado. Linhas são pedidos reais; nunca simulam contagens,
 * entregadores, datas, situação ou recibos. As coletas existentes são preservadas. */
const statusColors: Record<DeliveryStatus, string> = {
  nao_iniciada: "border-[#576f8f] bg-[#253752] text-[#c8d5eb]",
  em_rota: "border-[#2358da] bg-[#0a337f] text-[#a9caff]",
  no_destino: "border-[#aa6f11] bg-[#694307]/65 text-[#ffd17a]",
  pausada: "border-[#bb7d16] bg-[#653905]/70 text-[#ffd17a]",
  finalizada: "border-[#106c59] bg-[#075244]/65 text-[#7ff2d0]",
};
const statusText: Record<DeliveryStatus, string> = {
  nao_iniciada: "Pendente", em_rota: "Em rota", no_destino: "No destino",
  pausada: "Pausada", finalizada: "Entregue",
};
const timeOf = (date?: string) => date ? fmtBrasilia(date) : "—";

export function ManagerDeliveryTable({ kind, records, isLoading, onSelect }: Props) {
  const finished = kind === "finished";
  const rows = managerDeliveryRows(records, kind);
  const label = finished ? "Entregas finalizadas" : "Entregas pendentes e em rota";
  return <section id={finished ? "manager-finished-grid" : "manager-open-grid"}
    className="manager-delivery-panel min-w-0 overflow-hidden rounded-2xl p-3 sm:p-4"
    aria-label={label}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        {finished
          ? <CheckCircle2 className="h-5 w-5 shrink-0 text-[#43ebbd]" />
          : <Truck className="h-5 w-5 shrink-0 text-[#40c9ff]" />}
        <h3 className="text-sm font-extrabold text-[#edf5ff] sm:text-base">{label}</h3>
        <span className="rounded-full border border-[#1455a8]/60 bg-[#07376f] px-2.5 py-0.5 text-[11px] font-bold text-[#81c7ff]">
          {rows.length.toLocaleString("pt-BR")} {finished ? (rows.length === 1 ? "nota" : "notas") : (rows.length === 1 ? "operação" : "operações")}
        </span>
        {!finished && rows.length !== records.length && <span className="text-[11px] font-semibold text-[#9fc8f5]">{records.length} notas/coletas</span>}
      </div>
      <span className="text-[11px] font-medium text-[#84aad5]">Clique no cliente para abrir detalhes</span>
    </div>
    <div className="max-h-[450px] overflow-auto rounded-xl border border-[#163656]">
      <table className={`manager-delivery-table w-full text-left text-xs ${finished ? "min-w-[780px]" : "min-w-[680px]"}`}>
        <thead>
          <tr>
            <th className="w-8">#</th>
            <th>Cliente</th>
            {!finished && <th>Documento</th>}
            <th>{finished ? "Recebedor" : "Entregador"}</th>
            <th>Turno</th>
            {finished && <th>Transporte</th>}
            <th>Status</th>
            <th>{finished ? "Finalizada às" : "Saída às"}</th>
            <th className="w-8"><span className="sr-only">Abrir</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((group, index) => { const d = group[0]; return <tr key={d.id}>
            <td className="text-[#84a9cf] tabular-nums">{index + 1}</td>
            <td className="max-w-[230px]">
              <button type="button" onClick={() => onSelect(d.id)}
                aria-label={"Ver detalhes de " + d.company}
                className="flex w-full items-center gap-1.5 break-words text-left font-semibold text-[#ecf5ff] hover:text-[#59d5ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#56cfff]">
                <span className="break-words">{d.company}</span><ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
              </button>
              {d.source === "coleta" && <span className="mt-1 inline-flex rounded border border-orange-400/35 bg-orange-500/15 px-1.5 text-[10px] font-bold text-orange-200">COLETA</span>}
              {group.length > 1 && <span className="mt-1 inline-flex rounded border border-sky-400/45 bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-200">{group.length} notas · unificada</span>}
            </td>
            {!finished && <td className="max-w-[230px] break-words">{group.map(row => row.source === "coleta" ? "Coleta" : row.onlyDelivery ? "Somente entrega" : row.document || "—").join(" · ")}</td>}
            <td className="max-w-[125px] break-words">
              {finished && d.source !== "coleta" ? d.receiver || "—" : d.driver || "—"}
            </td>
            <td className="whitespace-nowrap">{shiftLabel(shiftOf(d))}
              {!finished && (d.expeditionShiftDate || (d.source === "coleta" && d.scheduledDate)) && <span className="block text-[10px] text-[#9fb6d8]">{scheduledDateLabel((d.source === "coleta" && d.scheduledDate) || d.expeditionShiftDate)}</span>}
            </td>
            {finished && <td>
              {(() => {
                const transport = finishedDeliveryTransport(d);
                return transport
                  ? <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2 py-1 text-xs font-bold ${transport === "moto"
                    ? "border-[#447abe] bg-[#163b6a] text-[#d4ecff]"
                    : "border-[#237c77] bg-[#124c4d] text-[#b9f8e6]"}`}>
                      <span role="img" aria-label={transport === "moto" ? "Moto" : "Carro"}
                        className="text-lg leading-none">{transport === "moto" ? "🏍️" : "🚗"}</span>
                      {transport === "moto" ? "Moto" : "Carro"}
                    </span>
                  : <span className="text-[#91a9c9]" title="Transporte não informado">—</span>;
              })()}
            </td>}
            <td><span className={"inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-bold " + (d.source === "coleta"
              ? "border-orange-500/45 bg-orange-500/15 text-orange-200"
              : statusColors[d.status])}>
              {d.source === "coleta" ? d.status === "finalizada" ? "Coletado" : d.status === "nao_iniciada" ? "Aguardando coleta" : "Coletando" : statusText[d.status]}
            </span></td>
            <td className="whitespace-nowrap tabular-nums text-[#b1c9e7]">
              {timeOf(finished ? d.finishedAt : d.startedAt)}
            </td>
            <td><button type="button" onClick={() => onSelect(d.id)}
              className="rounded p-1.5 text-[#86c8ff] hover:bg-[#163b6b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#56cfff]" aria-label={"Abrir " + (d.document || d.company)}>
              <FileText className="h-4 w-4" /></button></td>
          </tr>; })}
          {!rows.length && <tr><td colSpan={8} className="py-12 text-center text-[#9ab4d4]">
            {isLoading ? <><Clock3 className="mx-auto mb-2 h-5 w-5 animate-pulse" />Carregando…</>
              : "Nenhuma entrega encontrada neste filtro."}
          </td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}

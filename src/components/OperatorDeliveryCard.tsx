import { Building2, Truck, FileText, Layers, MapPin, PackageCheck, UserRound, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Delivery } from "@/lib/deliveries";
import { assignedDriverForVehicle, vehicleForDelivery } from "@/lib/delivery-dispatch";

const currency = (value:number) => Number(value || 0).toLocaleString("pt-BR", { style:"currency",currency:"BRL" });

type Props = {
  orders:Delivery[];
  controlsDisabled:boolean;
  onDeliver:()=>void;
  onCollect:()=>void;
  accentColor?:string;
};

/** Card compacto do operador. A Expedição define o veículo e os grupos.
 * A entrega é encerrada numa assinatura; sem iniciar, pausar, chegar,
 * unificar ou desunificar neste painel. */
export function OperatorDeliveryCard({ orders, controlsDisabled, onDeliver, onCollect, accentColor }: Props) {
  const order = orders[0];
  if(!order)return null;
  const collection = order.source === "coleta";
  const vehicle = vehicleForDelivery(order);
  const responsible = assignedDriverForVehicle(vehicle);
  const total = orders.reduce((sum,row)=>sum+(row.onlyDelivery?0:Number(row.value)||0),0);
  const onlyDelivery = orders.every(row=>row.onlyDelivery);
  const label = collection ? "Coleta" : "Entrega";
  return <article
    className="overflow-hidden rounded-xl border border-[#365a88] bg-[#101c2e] p-3 text-[#f5f8ff] shadow-[0_5px_16px_rgba(0,0,0,0.14)] sm:p-4"
    style={accentColor?{borderLeft:`4px solid ${accentColor}`}:undefined}>
    <div className="flex min-w-0 items-start justify-between gap-2">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#183d6d] text-[#82baff]">
          {collection?<PackageCheck className="h-5 w-5"/>:<Building2 className="h-5 w-5"/>}
        </span>
        <div className="min-w-0">
          <h3 className="break-words text-sm font-extrabold leading-snug sm:text-base">{order.company}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-[#a7bfe2]">
            <span>{collection?"COLETA":vehicle==="moto"?"MOTO":vehicle==="carro"?"CARRO":"SEM VEÍCULO"}</span>
            <span>· {responsible??"Aguardando Expedição"}</span>
            {orders.length>1&&<span className="font-bold text-[#a8d2ff]">· {orders.length} notas unificadas</span>}
          </p>
        </div>
      </div>
      <span className="shrink-0 rounded-full border border-sky-400/35 bg-[#1a3a61] px-2.5 py-1 text-[10px] font-extrabold uppercase text-sky-200">Pendente</span>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[#294160] pt-3">
      <p className="min-w-0 text-[12px] font-semibold text-sky-100">
        <FileText className="mr-1 inline h-4 w-4 align-[-3px] text-[#78b8ff]"/>
        {collection?"Coleta":onlyDelivery?"Somente entrega":orders.slice(0,2).map(row=>row.document).filter(Boolean).join(" · ")}
        {!collection&&orders.length>2&&` +${orders.length-2}`}
      </p>
      <strong className="whitespace-nowrap text-base font-black text-white sm:text-lg">
        {collection&&order.collectionValueProvided===false?"Valor não informado":onlyDelivery?"Somente entrega":currency(total)}
      </strong>
    </div>
    {orders.length>2&&<details className="mt-2 text-xs text-sky-200">
      <summary className="cursor-pointer font-bold">Ver todas as {orders.length} notas</summary>
      <ul className="mt-2 space-y-1 pl-2">{orders.map(row=><li key={row.id}>{row.document||"Somente entrega"}</li>)}</ul>
    </details>}
    {collection&&(order.collectionAddress||order.collectionContact)&&
      <details className="mt-2 text-xs text-sky-200">
        <summary className="cursor-pointer font-bold">Endereço e contato da coleta</summary>
        <div className="mt-2 space-y-1">
          {order.collectionAddress&&<p className="flex gap-2"><MapPin className="h-4 w-4 shrink-0"/>{order.collectionAddress}</p>}
          {order.collectionContact&&<p className="flex gap-2"><UserRound className="h-4 w-4 shrink-0"/>{order.collectionContact}</p>}
        </div>
      </details>}
    <Button type="button"
      className="mt-3 h-10 w-full gap-2 rounded-lg border border-[#9ac6ff]/50 bg-[#75aaff] text-sm font-extrabold text-[#07172c] hover:bg-[#93bbff]"
      disabled={controlsDisabled||!vehicle}
      title={!vehicle?"Aguardando atribuição de MOTO ou CARRO pela Expedição":controlsDisabled?"Operação disponível apenas para o responsável":undefined}
      onClick={collection?onCollect:onDeliver}>
      {collection?<PackageCheck className="h-4 w-4"/>:<Truck className="h-4 w-4"/>}
      {collection?"Coletar":"Entregar"}
    </Button>
  </article>;
}

import {useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {
  CalendarDays,ChevronDown,ClipboardList,Clock3,Package,PackageCheck,
  Search,Truck,ArrowLeftRight,Sun,Sunset,Pencil,RotateCcw,
} from "lucide-react";
import {deliveryGroups,fmtBrasilia,type Delivery} from "@/lib/deliveries";
import {listDeliveries,setExpeditionSchedule} from "@/lib/deliveries.functions";
import {shiftOf,type ExpeditionShift,type ShiftSection} from "@/lib/expedition-schedule";
import {expeditionLocalDay} from "@/lib/expedition-history";
import {ExpeditionShiftPicker} from "./ExpeditionShiftPicker";
import {ExpeditionRowShift} from "./ExpeditionRowShift";
import {
  listExpeditionPickups,transferExpeditionOrders,setExpeditionPickupShift,
} from "@/lib/pickups.functions";
import {canTransferExpedition} from "@/lib/employees.functions";
import {useActiveEmployee} from "./EmployeeGate";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Dialog,DialogContent,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {
  DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger,DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type {Pickup} from "@/lib/pickups";
import {ExpeditionCompletedHistory} from "./ExpeditionCompletedHistory";
import {ExpeditionCollections} from "./ExpeditionCollections";
import {pendingExpeditionPickups} from "@/lib/expedition-history";
import "./expedition-operator.css";

type Origin="BALCÃO"|"EXPEDIÇÃO";
type TransferNote={id:string;document:string;value:number;separatedAt:string};
type EditTarget={kind:"delivery";ids:string[]}|{kind:"pickup";id:string};
type TransferTarget={
  kind:"toPickup"|"toDelivery";company:string;orders:TransferNote[];
};
type TypeFilter="all"|"delivery"|"pickup"|"collection";
type PeriodFilter="all"|"today"|"yesterday";
const MONEY=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const when=(s?:string)=>s?fmtBrasilia(s):"—";
const PAGE_SIZE=40;
function originOf(row:{source:string;channel?:string}):Origin{
  return row.channel==="balcao"?"BALCÃO":"EXPEDIÇÃO";
}
function filteredByText(text:string,raw:string):boolean{
  return !raw.trim()||text.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("pt-BR").includes(raw.trim().normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR"));
}
function ShiftFilterIcon({value}:{value:ShiftSection|"all"}){
  return value==="manha"?<Sun className="h-4 w-4"/>:
    value==="tarde"?<Sunset className="h-4 w-4"/>:<Clock3 className="h-4 w-4"/>;
}
function TransferActions({kind,busy,canTransfer,eligible,onTransfer,onEdit}:{
  kind:"delivery"|"pickup";busy:boolean;canTransfer:boolean;eligible:boolean;
  onTransfer:()=>void;onEdit:()=>void;
}){
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="outline" size="sm" className="exp-action h-9 gap-1.5 px-3"
        disabled={busy||!canTransfer} aria-label={"Ações de "+(kind==="delivery"?"Entrega":"Retira")}>
        Ações <ChevronDown className="h-4 w-4"/>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="z-[80] min-w-[225px] border border-sky-600/50 bg-[#0a2543] p-1.5 text-white shadow-xl">
      <DropdownMenuItem disabled={!eligible} onSelect={onTransfer}
        className="cursor-pointer gap-2 rounded-md py-2.5 text-sky-100 focus:bg-sky-700 focus:text-white">
        <ArrowLeftRight className="h-4 w-4"/>
        {kind==="delivery"?"Transferir p/ Retira":"Transferir p/ Entrega"}
      </DropdownMenuItem>
      <DropdownMenuSeparator className="bg-sky-700/40"/>
      <DropdownMenuItem onSelect={onEdit}
        className="cursor-pointer gap-2 rounded-md py-2.5 text-sky-100 focus:bg-sky-700 focus:text-white">
        <Pencil className="h-4 w-4"/> Editar / detalhes
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
function DeliveryLine({orders,readOnly,busy,canTransfer,onSetShift,onEdit,onTransfer}:{
  orders:Delivery[];readOnly:boolean;busy:boolean;canTransfer:boolean;
  onSetShift:(ids:string[],shift:ExpeditionShift|null)=>Promise<void>;
  onEdit:(orders:Delivery[])=>void;
  onTransfer:(company:string,orders:Delivery[])=>void;
}){
  const first=orders[0];if(!first)return null;
  const eligible=orders.filter(o=>o.source==="conferencia"&&o.status==="nao_iniciada"&&
    !o.onlyDelivery&&!!o.document&&Number.isFinite(o.value));
  const hasStarted=orders.some(o=>o.status!=="nao_iniciada");
  const total=orders.reduce((sum,o)=>sum+(o.onlyDelivery?0:Number(o.value)||0),0);
  return <tr className="exp-order-row">
    <td className="px-3 py-2"><ExpeditionRowShift shift={shiftOf(first)} readOnly={readOnly}
      disabled={busy||!canTransfer||hasStarted}
      onChange={shift=>onSetShift(orders.map(o=>o.id),shift)}/></td>
    <td className="max-w-[330px] px-3 py-2 font-extrabold text-white">
      {first.company}
      {orders.length>1&&<span className="mt-0.5 block text-[11px] font-semibold text-sky-200">
        {orders.length} notas unificadas</span>}
    </td>
    <td className="max-w-[200px] break-words px-3 py-2 text-sky-100">
      {orders.every(o=>o.onlyDelivery)?"Somente entrega":
        orders.map(o=>o.document||"—").join(" · ")}
    </td>
    <td className="px-3 py-2"><span className="exp-type exp-type-delivery">
      <Truck className="h-4 w-4"/> Entrega <span className="opacity-70">· {originOf(first)}</span>
    </span></td>
    <td className="whitespace-nowrap px-3 py-2 font-bold">
      {orders.every(o=>o.onlyDelivery)?"Somente entrega":MONEY.format(total)}</td>
    <td className="px-3 py-2"><span className={"exp-status "+(hasStarted?"exp-status-route":"exp-status-success")}>
      {hasStarted?"EM ROTA":"SEPARADO"}</span></td>
    <td className="whitespace-nowrap px-3 py-2 text-sky-100">{when(first.createdAt)}</td>
    {!readOnly&&<td className="px-3 py-2"><TransferActions kind="delivery" busy={busy}
      canTransfer={canTransfer} eligible={eligible.length>0&&!hasStarted}
      onEdit={()=>onEdit(orders)} onTransfer={()=>onTransfer(first.company,eligible)}/></td>}
  </tr>;
}
function PickupLine({order,readOnly,busy,canTransfer,onSetShift,onEdit,onTransfer}:{
  order:Pickup;readOnly:boolean;busy:boolean;canTransfer:boolean;
  onSetShift:(id:string,shift:ExpeditionShift|null)=>Promise<void>;
  onEdit:(order:Pickup)=>void;
  onTransfer:(order:Pickup)=>void;
}){
  return <tr className="exp-order-row">
    <td className="px-3 py-2"><ExpeditionRowShift shift={shiftOf(order)} readOnly={readOnly}
      disabled={busy||!canTransfer||order.status!=="pendente"||order.source!=="conferencia"}
      onChange={shift=>onSetShift(order.id,shift)}/></td>
    <td className="max-w-[330px] px-3 py-2 font-extrabold text-white">{order.company}</td>
    <td className="px-3 py-2 text-sky-100">{order.document||"—"}</td>
    <td className="px-3 py-2"><span className="exp-type exp-type-pickup">
      <PackageCheck className="h-4 w-4"/> Retira <span className="opacity-70">· {originOf(order)}</span>
    </span></td>
    <td className="whitespace-nowrap px-3 py-2 font-bold">{order.value==null?"—":MONEY.format(order.value)}</td>
    <td className="px-3 py-2"><span className="exp-status exp-status-success">SEPARADO</span></td>
    <td className="whitespace-nowrap px-3 py-2 text-sky-100">{when(order.createdAt)}</td>
    {!readOnly&&<td className="px-3 py-2"><TransferActions kind="pickup" busy={busy}
      canTransfer={canTransfer} eligible={order.source==="conferencia"&&order.status==="pendente"&&
        !!order.document&&Number.isFinite(order.value)}
      onEdit={()=>onEdit(order)} onTransfer={()=>onTransfer(order)}/></td>}
  </tr>;
}
export function ExpedicaoOperador({ readOnly = false }: { readOnly?: boolean } = {}) {
  // A mesma tela atende operador e gestor; no gestor, somente consulta.
  // A transferência exige direito individual e permanece protegida no servidor.
  // Mesmo quando visível, a API verifica a permissão novamente no servidor.
  const { employee } = useActiveEmployee();
  const queryClient = useQueryClient();
  const fetchDeliveries = useServerFn(listDeliveries);
  const fetchPickups = useServerFn(listExpeditionPickups);
  const readPermission = useServerFn(canTransferExpedition);
  const transferOrders = useServerFn(transferExpeditionOrders);
  const assignSchedule = useServerFn(setExpeditionSchedule);
  const assignPickupShift = useServerFn(setExpeditionPickupShift);
  const [target, setTarget] = useState<TransferTarget | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [transferMode, setTransferMode] = useState<"all" | "selected">("selected");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search,setSearch]=useState("");
  const [shiftFilter,setShiftFilter]=useState<ShiftSection|"all">("all");
  const [periodFilter,setPeriodFilter]=useState<PeriodFilter>("all");
  const [typeFilter,setTypeFilter]=useState<TypeFilter>("all");
  const [listLimit,setListLimit]=useState(PAGE_SIZE);
  const permission = useQuery({
    queryKey: ["expedition-transfer-permission", employee?.id],
    queryFn: () => readPermission(),
    enabled: !readOnly && !!employee?.id,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
  });
  const canTransfer = !readOnly && permission.data?.allowed === true;

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
    .filter(d => d.source !== "coleta" && d.status !== "finalizada")
    .slice().sort((a, b) => a.position - b.position);

  // Reutiliza exatamente a regra de agrupamento da tela do entregador:
  // mesma empresa, status e viagem; notas desunificadas permanecem individuais.
  const groups = deliveryGroups(deliveries);

  // O grid principal contém SOMENTE retiradas pendentes.
  // Pedidos já retirados permanecem no botão "Retirados" (histórico consultivo).
  const allPickups = pickupsQuery.data ?? [];
  const pickups = pendingExpeditionPickups(allPickups);

  const deliveriesReady = deliveries.filter(d => d.status === "nao_iniciada").length;
  const deliveriesRoute = deliveries.length - deliveriesReady;
  const pickupsReady = pickups.length;
  const pickupsDone = allPickups.filter(p => p.status === "finalizada").length;
  const today=expeditionLocalDay(new Date().toISOString());
  const yesterday=(()=>{const d=new Date(today+"T12:00:00Z");d.setUTCDate(d.getUTCDate()-1);
    return d.toISOString().slice(0,10);})();
  const matchesPeriod=(date:string)=>periodFilter==="all"||
    expeditionLocalDay(date)===(periodFilter==="today"?today:yesterday);
  const visibleGroups=groups.filter(group=>{
    const first=group[0];
    return first && (shiftFilter==="all"||shiftOf(first)===shiftFilter)
      && group.some(order=>matchesPeriod(order.createdAt))
      && filteredByText(group.flatMap(o=>[o.company,o.document,o.companyCode]).join(" "),search);
  });
  const visiblePickups=pickups.filter(order=>
    (shiftFilter==="all"||shiftOf(order)===shiftFilter)
    && matchesPeriod(order.createdAt)
    && filteredByText([order.company,order.document,order.companyCode].join(" "),search));
  // A edição sempre consulta a versão mais recente, inclusive após atualizar a fila.
  const editingDeliveries = editing?.kind === "delivery"
    ? editing.ids.map(id => deliveriesQuery.data?.find(row => row.id === id)).filter((item): item is Delivery => !!item)
    : [];
  const editingPickup = editing?.kind === "pickup" ? pickups.find(row => row.id === editing.id) : undefined;
  const editTransferable = editingDeliveries.filter(order =>
    order.source === "conferencia" && order.status === "nao_iniciada"
    && !order.onlyDelivery && !!order.document && Number.isFinite(order.value));


  function openTransfer(next: TransferTarget) {
    if (readOnly || !canTransfer || busy) return;
    setEditing(null);
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

  async function updateSchedule(ids: string[], shift: ExpeditionShift | null, scheduledDate?: string | null) {
    if (readOnly || !canTransfer || busy || !ids.length) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await assignSchedule({ data: { ids, shift, ...(scheduledDate === undefined ? {} : { scheduledDate }) } });
      await deliveriesQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      setEditing(null);
      setNotice("Programação atualizada na Expedição e na fila do entregador.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a programação.");
    } finally { setBusy(false); }
  }

  async function updatePickupSchedule(id:string,shift:ExpeditionShift|null){
    if(readOnly||!canTransfer||busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      await assignPickupShift({data:{id,shift}});
      await pickupsQuery.refetch();
      await queryClient.invalidateQueries({queryKey:["pickups"]});
      setNotice("Turno da Retira atualizado com sucesso.");
    }catch(e){
      setError(e instanceof Error?e.message:"Não foi possível definir o turno da Retira.");
    }finally{setBusy(false);}
  }

  async function confirmTransfer() {
    if (readOnly || !target || !canTransfer || busy || !chosenOrders.length) return;
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

  return <section className="expedition-operator min-w-0 space-y-3 rounded-2xl p-3 pb-8 sm:p-5"
    aria-label="Central de Expedição">
    <header className="exp-hero flex flex-wrap items-center justify-between gap-4 rounded-xl px-4 py-5 sm:px-6">
      <div className="flex min-w-0 items-center gap-4">
        <span className="exp-hero-icon"><Truck className="h-9 w-9 sm:h-11 sm:w-11"/></span>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Expedição</h1>
          <p className="mt-1 text-xs text-sky-200 sm:text-sm">
            Gestão de expedições, entregas, retiradas e coletas
          </p>
        </div>
      </div>
      <span className="flex items-center gap-2 text-xs font-semibold text-sky-200">
        <RotateCcw className="h-4 w-4"/> Atualização automática
      </span>
    </header>

    {readOnly
      ? <p role="status" className="exp-readonly-note px-3 py-2 text-xs font-bold">
          Visualização do gestor — somente consulta; sem ações de transferência ou mudança de turno.
        </p>
      : !canTransfer&&<p role="status" className="exp-readonly-note px-3 py-2 text-xs font-bold">
          Perfil sem direito de Expedição — botões de turno e transferência desabilitados.
        </p>}

    <ExpeditionCompletedHistory deliveries={deliveriesQuery.data??[]} compact/>

    <div className="exp-toolbar flex flex-wrap items-end gap-2 rounded-xl p-3">
      <label className="min-w-[190px] flex-[2] text-[11px] font-bold text-sky-200">
        Buscar
        <span className="relative mt-1 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"/>
          <Input value={search} onChange={e=>{setSearch(e.target.value);setListLimit(PAGE_SIZE);}}
            className="exp-input h-9 pl-9 text-sm" placeholder="Cliente, nota ou código…"/>
        </span>
      </label>
      <label className="min-w-[130px] flex-1 text-[11px] font-bold text-sky-200">Período
        <select className="exp-input mt-1 h-9 w-full rounded-md px-3 text-sm" value={periodFilter}
          onChange={e=>{setPeriodFilter(e.target.value as PeriodFilter);setListLimit(PAGE_SIZE);}}
          aria-label="Filtrar período da Expedição">
          <option value="all">Todos os dias</option>
          <option value="today">Hoje</option>
          <option value="yesterday">Ontem</option>
        </select>
      </label>
      <label className="min-w-[145px] flex-1 text-[11px] font-bold text-sky-200">Tipo
        <select className="exp-input mt-1 h-9 w-full rounded-md px-3 text-sm" value={typeFilter}
          onChange={e=>setTypeFilter(e.target.value as TypeFilter)}
          aria-label="Filtrar tipo de operação">
          <option value="all">Todos os tipos</option>
          <option value="collection">Coletas</option>
          <option value="delivery">Entregas</option>
          <option value="pickup">Retiras</option>
        </select>
      </label>
      <label className="min-w-[130px] flex-1 text-[11px] font-bold text-sky-200">
        <span className="inline-flex items-center gap-1"><ShiftFilterIcon value={shiftFilter}/> Turno</span>
        <select className="exp-input mt-1 h-9 w-full rounded-md px-3 text-sm"
          value={shiftFilter}
          onChange={e=>{setShiftFilter(e.target.value as ShiftSection|"all");setListLimit(PAGE_SIZE);}}
          aria-label="Filtrar turno da Expedição">
          <option value="all">Todos os turnos</option>
          <option value="indefinido">N/D</option>
          <option value="manha">Manhã</option>
          <option value="tarde">Tarde</option>
        </select>
      </label>
      <Button type="button" variant="outline" size="sm" className="exp-clear h-9 gap-1.5 px-3"
        disabled={!search&&shiftFilter==="all"&&periodFilter==="all"&&typeFilter==="all"}
        onClick={()=>{setSearch("");setShiftFilter("all");setPeriodFilter("all");setTypeFilter("all");setListLimit(PAGE_SIZE);}}>
        Limpar
      </Button>
    </div>

    {/* Coletas ficam no topo, antes de Entregas e Retiras. */}
    {(typeFilter==="all"||typeFilter==="collection")&&
      <ExpeditionCollections records={deliveriesQuery.data??[]} canManage={canTransfer} readOnly={readOnly}
        compact searchQuery={search} shiftFilter={shiftFilter} periodFilter={periodFilter}
        scheduleBusy={busy} onSetShift={updateSchedule}
        onCreated={async()=>{
          await deliveriesQuery.refetch();
          await queryClient.invalidateQueries({queryKey:["deliveries"]});
        }}/>}
    {(typeFilter==="all"||typeFilter==="delivery")&&<section className="exp-panel overflow-hidden rounded-xl"
      aria-label="Pedidos de Entrega da Expedição">
      <header className="exp-panel-heading flex flex-wrap items-center gap-2 px-4 py-3">
        <Truck className="h-5 w-5 text-sky-300"/>
        <h2 className="text-base font-black tracking-wide text-white">ENTREGAS</h2>
        <span className="exp-count ml-1">{visibleGroups.length} grupos · {visibleGroups.reduce((sum,g)=>sum+g.length,0)} pedidos</span>
      </header>
      <div className="overflow-x-auto">
        <table className="exp-data-table w-full min-w-[1020px] text-left text-xs sm:text-sm">
          <thead><tr>
            {["Turno","Cliente / empresa","Nota","Tipo / origem","Valor total","Status","Separado às",...(!readOnly?["Ações"]:[])].map(col=>
              <th key={col} className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide">{col}</th>)}
          </tr></thead>
          <tbody>
            {visibleGroups.slice(0,listLimit).map(orders=><DeliveryLine key={orders[0].id}
              orders={orders} readOnly={readOnly} busy={busy} canTransfer={canTransfer}
              onSetShift={updateSchedule}
              onEdit={list=>{setError("");setEditing({kind:"delivery",ids:list.map(row=>row.id)});}}
              onTransfer={(company,eligible)=>openTransfer({
                kind:"toPickup",company,orders:eligible.map(row=>({
                  id:row.id,document:row.document,value:row.value,separatedAt:row.createdAt,
                })),
              })}/>)}
            {!visibleGroups.length&&<tr><td colSpan={readOnly?7:8} className="px-4 py-5 text-center text-sky-200">
              {deliveriesQuery.isLoading?"Carregando entregas…":"Nenhuma entrega encontrada para esses filtros."}
            </td></tr>}
          </tbody>
        </table>
      </div>
      {visibleGroups.length>listLimit&&<div className="exp-list-more p-2 text-center">
        <Button size="sm" variant="ghost" onClick={()=>setListLimit(n=>n+PAGE_SIZE)}
          className="text-sky-200">Mostrar mais entregas ({visibleGroups.length-listLimit})</Button>
      </div>}
    </section>}
    {(typeFilter==="all"||typeFilter==="pickup")&&<section className="exp-panel overflow-hidden rounded-xl"
      aria-label="Pedidos de Retira da Conferência">
      <header className="exp-panel-heading flex flex-wrap items-center gap-2 px-4 py-3">
        <PackageCheck className="h-5 w-5 text-violet-300"/>
        <h2 className="text-base font-black tracking-wide text-white">RETIRAS</h2>
        <span className="exp-count ml-1">{visiblePickups.length} pedidos</span>
      </header>
      <div className="overflow-x-auto">
        <table className="exp-data-table w-full min-w-[1020px] text-left text-xs sm:text-sm">
          <thead><tr>
            {["Turno","Cliente / empresa","Nota","Tipo / origem","Valor total","Status","Separado às",...(!readOnly?["Ações"]:[])].map(col=>
              <th key={col} className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide">{col}</th>)}
          </tr></thead>
          <tbody>
            {visiblePickups.slice(0,listLimit).map(order=><PickupLine key={order.id}
              order={order} readOnly={readOnly} busy={busy} canTransfer={canTransfer}
              onSetShift={updatePickupSchedule}
              onEdit={row=>{setError("");setEditing({kind:"pickup",id:row.id});}}
              onTransfer={row=>openTransfer({kind:"toDelivery",company:row.company,
                orders:[{id:row.id,document:row.document||"—",value:Number(row.value)||0,
                  separatedAt:row.createdAt}]})}/>)}
            {!visiblePickups.length&&<tr><td colSpan={readOnly?7:8} className="px-4 py-5 text-center text-sky-200">
              {pickupsQuery.isLoading?"Carregando retiradas…":"Nenhuma retirada encontrada para esses filtros."}
            </td></tr>}
          </tbody>
        </table>
      </div>
      {visiblePickups.length>listLimit&&<div className="exp-list-more p-2 text-center">
        <Button size="sm" variant="ghost" onClick={()=>setListLimit(n=>n+PAGE_SIZE)}
          className="text-sky-200">Mostrar mais retiras ({visiblePickups.length-listLimit})</Button>
      </div>}
    </section>}

    {(deliveriesQuery.isError || pickupsQuery.isError) &&
      <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        Falha ao atualizar uma das listas. Uma nova tentativa será realizada automaticamente.
      </p>}
    {notice && <p role="status" className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm font-semibold text-success">{notice}</p>}
    {error && !target && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {!readOnly && <Dialog open={!!editing} onOpenChange={open => {
      if (!open && !busy) { setEditing(null); setError(""); }
    }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar {editing?.kind === "delivery" ? "entrega" : "retira"}</DialogTitle>
        </DialogHeader>
        {editing?.kind === "delivery" && editingDeliveries.length > 0 && <>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="font-extrabold">{editingDeliveries[0].company}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {editingDeliveries.map(row => row.document || "Somente entrega").join(" · ")}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Escolha o turno da entrega. A alteração será aplicada às notas deste grupo.
          </p>
          <ExpeditionShiftPicker ids={editingDeliveries.map(row => row.id)}
            shift={shiftOf(editingDeliveries[0])} date={editingDeliveries[0].expeditionShiftDate} readOnly={false}
            disabled={busy || !canTransfer || editingDeliveries.some(row => row.status !== "nao_iniciada")}
            onSetShift={updateSchedule} />
          {editTransferable.length > 0 && <div className="border-t border-border pt-3">
            <Button type="button" variant="outline" className="w-full gap-2" disabled={busy || !canTransfer}
              onClick={() => openTransfer({
                kind: "toPickup",
                company: editingDeliveries[0].company,
                orders: editTransferable.map(row => ({
                  id: row.id, document: row.document,
                  value: row.value, separatedAt: row.createdAt,
                })),
              })}>
              <ArrowLeftRight className="h-4 w-4" />
              Transferir para Retira {editTransferable.length > 1 ? `(${editTransferable.length} notas)` : ""}
            </Button>
          </div>}
        </>}
        {editing?.kind === "pickup" && editingPickup && <>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="font-extrabold">{editingPickup.company}</p>
            <p className="text-xs text-muted-foreground">Nota: {editingPickup.document || "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Situação: {pickupStatus(editingPickup).text}</p>
          </div>
          <Button type="button" variant="outline" className="w-full gap-2"
            disabled={busy || !canTransfer || editingPickup.status !== "pendente"}
            onClick={() => openTransfer({
              kind: "toDelivery", company: editingPickup.company,
              orders: [{
                id: editingPickup.id, document: editingPickup.document || "—",
                value: Number(editingPickup.value) || 0, separatedAt: editingPickup.createdAt,
              }],
            })}>
            <Truck className="h-4 w-4" /> Transferir para Entrega
          </Button>
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end">
          <Button type="button" variant="outline" disabled={busy} onClick={() => { setEditing(null); setError(""); }}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>}
    {!readOnly && <Dialog open={!!target} onOpenChange={open => {
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
          {target &&
            <fieldset className="space-y-2">
              {target.orders.length > 1 && transferMode === "selected" && <legend className="text-xs font-semibold text-muted-foreground">
                Marque uma ou mais notas:
              </legend>}
              {target.orders.map(order =>
                <label key={order.id} className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border border-border bg-card/60 p-3">
                  {target.orders.length > 1 && transferMode === "selected" && <input type="checkbox"
                    aria-label={`Selecionar nota ${order.document}`}
                    className="mt-1 h-4 w-4 shrink-0 accent-primary"
                    checked={selectedIds.includes(order.id)} disabled={busy}
                    onChange={event => {
                      const checked = event.currentTarget.checked;
                      setSelectedIds(previous => checked
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
    </Dialog>}
  </section>;
}

import {useDeferredValue,useMemo,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {
  ArrowLeft,Building2,CheckCircle2,ChevronDown,ChevronLeft,ChevronRight,
  ClipboardList,Download,FileDown,Layers3,LayoutGrid,List,Clock3,
  Minus,Plus,RotateCcw,Search,Trash2,Pencil,Save,PackagePlus,Printer,FilterX,
  Boxes,Box,CalendarDays,Package,PackageCheck,MessageSquare,UserRound,SlidersHorizontal,Truck,
} from "lucide-react";
import {toast} from "sonner";
import {useStore} from "@/lib/store";
import {
  reverseGroups,reverseGroupSearchIndex,reverseIncluded,reverseTotal,
  reverseNormalizeSearch,reverseStatusLabel,reverseWorkflowStage,
  type ReverseCycle,type ReverseSupplier,
} from "@/lib/reverse-logistics";
import {ReverseGroupPicker} from "@/components/ReverseGroupPicker";
import {ReverseSupplierRegistry} from "@/components/ReverseSupplierRegistry";
import {ReverseTreatmentGuide} from "@/components/ReverseTreatmentGuide";
import {
  listReverseCycles,createReverseCycle,saveReverseQuantities,finishReverseCycle,
  listReverseSuppliers,assignReverseSupplier,deleteReverseCycle,
} from "@/lib/reverse-logistics.functions";
import {reverseDownloadCsv,reverseExportPdf} from "@/lib/reverse-logistics-export";
import {createReverseVolumeLabelsPdf,reverseVolumeLabelFilename} from "@/lib/reverse-volume-labels";
import {
  filterReverseCycles,reverseCycleSummary,reverseCycleAmounts,
  type ReversePeriod,type ReverseStatusFilter,
} from "@/lib/reverse-logistics-view";
import {
  DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,
  DropdownMenuItem,DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import "./reverse-logistics-operator.css";

const dateText=(s?:string)=>s?new Date(s).toLocaleString("pt-BR",{
  timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short",
}):"—";
const cycleTitle=(n:number)=>"LOG. REV. Nº "+n;
const field="border-sky-400/40 bg-[#071b34] text-white";
const outline="border-sky-400/40 bg-[#14385f] text-sky-50 hover:bg-[#20517c]";
const stageHelp=(c:ReverseCycle)=>{
  const stage=reverseWorkflowStage(c);
  if(stage==="em_contagem")return "Separe os produtos, confira as quantidades e finalize para iniciar as tratativas.";
  if(stage==="em_tratativa")return "Contate o fornecedor. O orientador virtual mostra o que perguntar e os quatro passos obrigatórios.";
  if(stage==="aguardando_coleta")return 'Quando o material for retirado, clique em "Editar → Status: Coletado". Acompanhe se haverá abatimento ou envio de material novo.';
  if(stage==="coletado")return 'Depois que o fornecedor resolver a situação, clique em "Editar → Status: Finalizado" e informe Abatimento ou Material novo.';
  return "Tratativa finalizada. Consulte os dados ou edite para corrigir informações quando necessário.";
};

const PAGE_SIZE=6;
const selectClass="reverse-filter-control h-11 w-full rounded-lg px-3 text-sm font-medium outline-none transition";
const statusOptions=[
  {value:"all",label:"Todos os status"},
  {value:"em_contagem",label:"Em contagem"},
  {value:"em_tratativa",label:"Em tratativas"},
  {value:"aguardando_coleta",label:"Aguardando coleta"},
  {value:"coletado",label:"Coletado"},
  {value:"resolvido",label:"Finalizado"},
] as const;

function StageBadge({cycle}:{cycle:ReverseCycle}){
  const stage=reverseWorkflowStage(cycle);
  const Icon=stage==="resolvido"?CheckCircle2
    :stage==="coletado"?PackageCheck
    :stage==="aguardando_coleta"?Clock3
    :stage==="em_tratativa"?MessageSquare:Package;
  return <span className={"reverse-stage reverse-stage-"+stage}>
    <Icon className="h-4 w-4 shrink-0"/>{reverseStatusLabel(cycle)}
  </span>;
}

/** Um só ponto de acesso às ações do ciclo, com menu acessível por teclado.
 * Não altera as regras, permissões ou transições do orientador. */
function ReverseCycleActions({cycle,busy,onEdit,onPdf,onCsv,onSupplier,onGuide,onLabels,onDelete}:{
  cycle:ReverseCycle;busy:boolean;
  onEdit?:()=>void;onPdf:()=>void;onCsv:()=>void;onSupplier:()=>void;
  onGuide:()=>void;onLabels:()=>void;onDelete:()=>void;
}){
  const hasItems=reverseIncluded(cycle.items).length>0;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="outline" size="sm" disabled={busy}
        aria-label={"Abrir ações da Logística Reversa nº "+cycle.number}
        className="reverse-action-trigger h-9 gap-2 px-3 font-bold shadow-none">
        Ações <ChevronDown className="h-4 w-4"/>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={5} className="reverse-action-menu z-[80] min-w-[235px] border border-[#2775a7] bg-[#092641] p-1.5 text-white shadow-2xl">
      {onEdit&&<DropdownMenuItem className="reverse-action-item cursor-pointer gap-2" onSelect={onEdit}>
        <Pencil className="h-4 w-4"/> Editar ciclo e quantidades
      </DropdownMenuItem>}
      <DropdownMenuItem className="reverse-action-item cursor-pointer gap-2"
        disabled={!hasItems} onSelect={onPdf}><FileDown className="h-4 w-4"/> Gerar PDF</DropdownMenuItem>
      <DropdownMenuItem className="reverse-action-item cursor-pointer gap-2"
        disabled={!hasItems} onSelect={onCsv}><Download className="h-4 w-4"/> Exportar CSV</DropdownMenuItem>
      <DropdownMenuSeparator/>
      <DropdownMenuItem className="reverse-action-item cursor-pointer gap-2"
        onSelect={onSupplier}><Building2 className="h-4 w-4"/> Fornecedor e marca</DropdownMenuItem>
      <DropdownMenuItem className="reverse-action-item cursor-pointer gap-2"
        disabled={cycle.status!=="finalizado"} onSelect={onGuide}>
        <ClipboardList className="h-4 w-4"/>
        {cycle.contactStartedAt?"Continuar tratativas":"Iniciar tratativas"}
      </DropdownMenuItem>
      {Boolean(cycle.nfd&&cycle.volumes)&&<DropdownMenuItem className="reverse-action-item cursor-pointer gap-2" onSelect={onLabels}>
        <Printer className="h-4 w-4"/> Etiquetas dos volumes
      </DropdownMenuItem>}
      <DropdownMenuSeparator/>
      <DropdownMenuItem className="reverse-action-item reverse-action-danger cursor-pointer gap-2 font-semibold text-red-400 focus:bg-red-950/40 focus:text-red-200"
        onSelect={onDelete}><Trash2 className="h-4 w-4"/> Excluir ciclo</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function ReverseLogisticsOperator(){
  const {enderecoBase,ready:baseReady}=useStore();
  const list=useServerFn(listReverseCycles);
  const listSuppliers=useServerFn(listReverseSuppliers);
  const create=useServerFn(createReverseCycle);
  const save=useServerFn(saveReverseQuantities);
  const finish=useServerFn(finishReverseCycle);
  const assign=useServerFn(assignReverseSupplier);
  const remove=useServerFn(deleteReverseCycle);
  const q=useQuery({queryKey:["reverse-logistics-cycles"],queryFn:()=>list(),refetchInterval:15000});
  const suppliersQuery=useQuery({queryKey:["reverse-logistics-suppliers"],queryFn:()=>listSuppliers(),refetchInterval:30000});
  const cycles=q.data??[];
  const suppliers=suppliersQuery.data??[];
  const groups=useMemo(()=>reverseGroups(enderecoBase),[enderecoBase]);
  const groupSearchIndex=useMemo(()=>reverseGroupSearchIndex(enderecoBase),[enderecoBase]);

  const [groupDialog,setGroupDialog]=useState(false);
  const [suppliersOpen,setSuppliersOpen]=useState(false);
  const [supplierCycleId,setSupplierCycleId]=useState<string|null>(null);
  const [chosenSupplierId,setChosenSupplierId]=useState("");
  const [chosenBrand,setChosenBrand]=useState("");
  const [activeId,setActiveId]=useState<string|null>(null);
  const [guideId,setGuideId]=useState<string|null>(null);
  const [itemQuery,setItemQuery]=useState("");
  const [counts,setCounts]=useState<Record<string,number>>({});
  const [dirty,setDirty]=useState(false);
  const [itemLimit,setItemLimit]=useState(100);
  const deferredItemQuery=useDeferredValue(itemQuery);
  const [finishDialog,setFinishDialog]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const deferredSearch=useDeferredValue(search);
  const [statusFilter,setStatusFilter]=useState<ReverseStatusFilter>("all");
  const [supplierFilter,setSupplierFilter]=useState("all");
  const [periodFilter,setPeriodFilter]=useState<ReversePeriod>("all");
  const [viewMode,setViewMode]=useState<"list"|"cards">("list");
  const [page,setPage]=useState(1);
  const summary=useMemo(()=>reverseCycleSummary(cycles),[cycles]);
  const supplierNames=useMemo(()=>[...new Set(cycles.map(c=>c.supplier?.trim()).filter((v):v is string=>!!v))]
    .sort((a,b)=>a.localeCompare(b,"pt-BR")),[cycles]);
  const filteredCycles=useMemo(()=>filterReverseCycles(cycles,{
    query:deferredSearch,status:statusFilter,supplier:supplierFilter,period:periodFilter,
  }),[cycles,deferredSearch,statusFilter,supplierFilter,periodFilter]);
  const pages=Math.max(1,Math.ceil(filteredCycles.length/PAGE_SIZE));
  const safePage=Math.min(page,pages);
  const pageCycles=filteredCycles.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE);
  const filterActive=Boolean(search||statusFilter!=="all"||supplierFilter!=="all"||periodFilter!=="all");
  const clearFilters=()=>{
    setSearch("");setStatusFilter("all");setSupplierFilter("all");setPeriodFilter("all");setPage(1);
  };

  const active=cycles.find(c=>c.id===activeId)??null;
  const guideCycle=cycles.find(c=>c.id===guideId)??null;
  const supplierCycle=cycles.find(c=>c.id===supplierCycleId)??null;
  const pickedSupplier=suppliers.find(s=>s.id===chosenSupplierId);
  const edited=useMemo(()=>active?.items.map(i=>({...i,quantidade:counts[i.codigo]??i.quantidade}))??[],
    [active,counts]);
  const itemSearchIndex=useMemo(()=>new Map(active?.items.map(i=>[i.codigo,
    reverseNormalizeSearch(i.codigo+" "+i.descricao+" "+i.linha+" "+i.grupo)])??[]),[active]);
  const visible=useMemo(()=>{
    const query=reverseNormalizeSearch(deferredItemQuery);
    return query?edited.filter(i=>itemSearchIndex.get(i.codigo)?.includes(query)):edited;
  },[edited,itemSearchIndex,deferredItemQuery]);

  const selectCycle=(c:ReverseCycle)=>{
    setActiveId(c.id);
    setCounts(Object.fromEntries(c.items.map(i=>[i.codigo,i.quantidade])));
    setDirty(false);setItemQuery("");setItemLimit(100);setError("");
  };
  async function operation(task:()=>Promise<void>){
    if(busy)return;
    setBusy(true);setError("");
    try{await task();await q.refetch();}
    catch(e){const message=e instanceof Error?e.message:"Não foi possível concluir a operação.";
      setError(message);toast.error(message);}
    finally{setBusy(false);}
  }
  const change=(code:string,n:number)=>{
    if(!Number.isSafeInteger(n)||n<0||n>10000000)return;
    setCounts(previous=>({...previous,[code]:n}));setDirty(true);
  };
  async function saveCounts(c:ReverseCycle){
    const updated=await save({data:{id:c.id,version:c.version,
      items:edited.map(i=>({codigo:i.codigo,quantidade:i.quantidade}))}});
    setCounts(Object.fromEntries(updated.items.map(i=>[i.codigo,i.quantidade])));
    setDirty(false);toast.success("Quantidades salvas.");
  }
  function exportCycle(c:ReverseCycle,format:"csv"|"pdf"){
    if(dirty&&activeId===c.id){toast.error("Salve as quantidades antes de exportar.");return;}
    if(!reverseIncluded(c.items).length){toast.error("Não há itens com quantidade para exportar.");return;}
    if(format==="csv")reverseDownloadCsv(c);
    else void reverseExportPdf(c).catch(()=>toast.error("Não foi possível gerar o PDF."));
  }
  function printVolumes(c:ReverseCycle){
    try{createReverseVolumeLabelsPdf(c).save(reverseVolumeLabelFilename(c));
      toast.success((c.volumes??0)+" etiqueta(s) de volume em um PDF único.");}
    catch(e){toast.error(e instanceof Error?e.message:"Não foi possível gerar as etiquetas.");}
  }
  function openGuide(c:ReverseCycle){
    if(dirty&&activeId===c.id){toast.error("Salve as quantidades antes de abrir as tratativas.");return;}
    if(c.status!=="finalizado"){toast.error("Finalize a separação dos itens primeiro.");return;}
    setGuideId(c.id);
  }
  function openSupplierLink(c:ReverseCycle){
    setSupplierCycleId(c.id);setChosenSupplierId(c.supplierId??"");setChosenBrand(c.brand??"");
  }
  async function linkSupplier(){
    if(!supplierCycle||!chosenSupplierId||!chosenBrand)return;
    await operation(async()=>{
      await assign({data:{id:supplierCycle.id,version:supplierCycle.version,
        supplierId:chosenSupplierId,brand:chosenBrand}});
      setSupplierCycleId(null);toast.success("Fornecedor e marca vinculados ao ciclo.");
    });
  }
  function deleteCycle(c:ReverseCycle){
    if(!window.confirm("Excluir "+cycleTitle(c.number)+" permanentemente?"))return;
    void operation(async()=>{
      await remove({data:{id:c.id,version:c.version}});
      if(activeId===c.id)setActiveId(null);
      if(guideId===c.id)setGuideId(null);
      toast.success("Ciclo excluído.");
    });
  }
  const cycleActions=(c:ReverseCycle,showEdit=true)=><ReverseCycleActions
    cycle={c} busy={busy}
    onEdit={showEdit?()=>selectCycle(c):undefined}
    onPdf={()=>exportCycle(c,"pdf")} onCsv={()=>exportCycle(c,"csv")}
    onSupplier={()=>openSupplierLink(c)}
    onGuide={()=>openGuide(c)} onLabels={()=>printVolumes(c)}
    onDelete={()=>deleteCycle(c)}
  />;
  const linkMark=(s:ReverseSupplier|undefined)=>s?.brands??[];
  return <section className="reverse-ops mx-auto max-w-[1680px] space-y-5 pb-8" aria-label="Logística Reversa do operador">
    <div className="reverse-masthead">
      <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-5">
        <span className="flex items-center gap-2">
          <Box className="h-8 w-8 text-[#00d9ff] sm:h-10 sm:w-10" strokeWidth={2.2}/>
          <strong className="text-xl font-black tracking-tight text-white sm:text-2xl">BigLogno</strong>
        </span>
        <span aria-hidden="true" className="hidden h-8 w-px bg-[#399cc7]/70 sm:block"/>
        <span className="flex items-center gap-2 text-sm font-bold text-white sm:text-base">
          <Boxes className="h-6 w-6 text-sky-200"/> Logística Reversa
          <small className="rounded-md border border-sky-500/25 bg-sky-900/35 px-2 py-1 text-[10px] font-semibold text-sky-200">Operador</small>
        </span>
      </div>
      <span className="reverse-operator-chip"><UserRound className="h-5 w-5"/> Operador <ChevronDown className="h-4 w-4"/></span>
    </div>
    <header className="reverse-hero relative isolate overflow-hidden rounded-2xl"
      style={{
        backgroundImage:'linear-gradient(90deg,rgba(2,16,34,.97) 0%,rgba(2,21,43,.86) 37%,rgba(3,23,45,.52) 65%,rgba(2,17,34,.90) 100%),url("/images/reverse-shelves.svg")',
        backgroundPosition:"center,center right",backgroundSize:"cover,cover",backgroundRepeat:"no-repeat",
      }}>
      <div className="relative z-10 flex flex-col justify-between gap-6 xl:flex-row xl:items-center">
        <div className="max-w-2xl">
          <div className="flex items-center gap-4">
            <span className="reverse-hero-icon flex h-20 w-20 shrink-0 items-center justify-center sm:h-24 sm:w-24">
              <Boxes className="h-14 w-14 sm:h-16 sm:w-16" strokeWidth={1.8}/>
            </span>
            <span aria-hidden="true" className="h-16 w-px shrink-0 bg-cyan-300/75 sm:h-20"/>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-white drop-shadow-md sm:text-4xl">Logística Reversa</h1>
              <p className="mt-2 text-sm leading-relaxed text-sky-100 sm:text-base">
                Fluxo guiado de garantia, devolução e tratativas com fornecedores.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" className="reverse-hero-outline h-11 gap-2 px-5 font-extrabold"
              onClick={()=>setSuppliersOpen(true)}>
              <Truck className="h-5 w-5"/> Cadastro de fornecedores
            </Button>
            <Button type="button" className="reverse-hero-primary h-11 gap-2 px-6 font-extrabold"
              disabled={!baseReady||!groups.length||busy||suppliersQuery.isError||!suppliers.length}
              onClick={()=>setGroupDialog(true)}>
              <PackagePlus className="h-5 w-5"/> Novo ciclo
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3 xl:min-w-[570px]">
          {[
            {label:"Ciclos ativos",value:summary.active,Icon:Layers3,tone:"cyan"},
            {label:"Finalizados",value:summary.resolved,Icon:CheckCircle2,tone:"green"},
            {label:"Aguardando coleta",value:summary.awaiting,Icon:Clock3,tone:"amber"},
          ].map(k=><div key={k.label} className={"reverse-kpi reverse-kpi-"+k.tone}>
            <div className="flex items-center justify-center gap-2.5 sm:justify-start">
              <k.Icon className="reverse-kpi-icon h-6 w-6 shrink-0 sm:h-8 sm:w-8" strokeWidth={2.2}/>
              <strong className="text-2xl font-black leading-none sm:text-3xl">{k.value}</strong>
            </div>
            <p className="mt-2 text-[10px] font-semibold leading-snug text-white sm:text-xs">{k.label}</p>
          </div>)}
        </div>
      </div>
    </header>
    {error&&<p role="alert" className="rounded-lg border border-red-400/50 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}
    {q.isError&&<p role="alert" className="rounded-lg border border-amber-400/40 bg-amber-950/20 p-3 text-amber-100">
      Não foi possível carregar os ciclos. Verifique a instalação SQL da Logística Reversa no Supabase.</p>}
    {suppliersQuery.isError&&<p role="alert" className="rounded-lg border border-amber-400/40 bg-amber-950/20 p-3 text-amber-100">
      O cadastro de fornecedores ainda não foi ativado no banco. Execute <strong>sql/2026-11-04-reverse-logistics-suppliers.sql</strong>
      {" "}no SQL Editor do Supabase e atualize a página.</p>}

    {active&&<div className="space-y-4 rounded-2xl border border-sky-500/40 bg-[#0d2a4a] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-xs font-bold uppercase text-sky-300">
          {reverseStatusLabel(active)} · {active.status==="aberto"?"Fase 1: separação":"Separação registrada · edição permitida"}
        </p><h2 className="text-xl font-extrabold text-white">{cycleTitle(active.number)}</h2>
          <p className="text-xs text-sky-200">{active.groups.length} grupo(s) · {active.items.length} códigos · {dateText(active.createdAt)}</p>
          <p className="mt-1 text-sm font-bold">{active.supplier||"Fornecedor pendente"} ·
            <strong className="ml-1 text-lg text-cyan-300">{active.brand||"Marca pendente"}</strong></p>
        </div>
        <Button variant="outline" className={outline} onClick={()=>{
          if(dirty&&!window.confirm("Quantidades não salvas. Deseja sair?"))return;
          setActiveId(null);setDirty(false);
        }}><ArrowLeft className="mr-2 h-4 w-4"/> Voltar aos ciclos</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          ["Códigos separados",reverseIncluded(edited).length],
          ["Quantidade de unidades",reverseTotal(edited)],
          ["Fornecedor",active.supplier||"A informar"],
        ].map(([label,v])=><div key={label} className="rounded-xl border border-sky-400/25 bg-[#153d63] p-3">
          <span className="block text-xs text-sky-200">{label}</span><strong className="block break-words text-xl">{v}</strong></div>)}
      </div>
      <label className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-sky-300"/>
        <Input className={field+" pl-10"} value={itemQuery} onChange={e=>{setItemQuery(e.target.value);setItemLimit(100);}}
          placeholder="Pesquisar código, descrição, linha ou grupo..."/></label>
      <div className="max-h-[470px] overflow-auto rounded-xl border border-[#2b537b]">
        <table className="w-full min-w-[570px] text-left text-sm">
          <thead className="sticky top-0 bg-[#175080] text-white">
            <tr>{["Linha / Grupo","Código","Descrição","Quantidade"].map(h=><th key={h} className="p-3">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-sky-600/20">
            {visible.slice(0,itemLimit).map(i=><tr key={i.codigo} className={i.quantidade>0?"bg-sky-500/15":"bg-[#0b2441]"}>
              <td className="p-3 text-xs text-sky-200">{i.linha}<span className="block opacity-70">{i.grupo}</span></td>
              <td className="p-3 font-extrabold">{i.codigo}</td><td className="p-3">{i.descricao}</td>
              <td className="p-2"><div className="flex min-w-[150px] items-center gap-1">
                <Button size="icon" variant="outline" className={outline} disabled={busy||!i.quantidade}
                  aria-label={"Retirar "+i.codigo} onClick={()=>change(i.codigo,i.quantidade-1)}><Minus size={15}/></Button>
                <Input type="number" inputMode="numeric" min="0" max="10000000" step="1" className={field+" w-[75px] text-center font-bold"}
                  value={i.quantidade} disabled={busy} aria-label={"Quantidade "+i.codigo}
                  onChange={e=>change(i.codigo,Number(e.target.value))}/>
                <Button size="icon" variant="outline" className={outline} disabled={busy||i.quantidade>=10000000}
                  aria-label={"Adicionar "+i.codigo} onClick={()=>change(i.codigo,i.quantidade+1)}><Plus size={15}/></Button>
              </div></td>
            </tr>)}
          </tbody>
        </table>
        {!visible.length&&<p className="p-5 text-center">Nenhum item encontrado.</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-sky-200">
        <span>{Math.min(visible.length,itemLimit)} de {visible.length} itens exibidos</span>
        {visible.length>itemLimit&&<Button variant="outline" size="sm" className={outline}
          onClick={()=>setItemLimit(v=>v+100)}>Mostrar mais itens</Button>}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-400/20 bg-[#071e38]/60 p-3">
        <Button disabled={busy||!dirty} className="gap-2 bg-sky-600 font-bold text-white"
          onClick={()=>void operation(()=>saveCounts(active))}>
          <Save size={16}/>{dirty?"Salvar quantidades *":"Quantidades salvas"}
        </Button>
        {active.status==="aberto"?<Button
          disabled={busy||dirty||!active.supplierId||!active.brand||!reverseIncluded(active.items).length}
          className="gap-2 bg-emerald-600 font-bold text-white hover:bg-emerald-500"
          onClick={()=>setFinishDialog(true)}>
          <CheckCircle2 size={16}/> Finalizar separação
        </Button>:<Button disabled={busy||dirty} className="gap-2 bg-indigo-600 font-bold text-white"
          onClick={()=>openGuide(active)}>
          <ClipboardList size={16}/> {active.contactStartedAt?"Continuar tratativas":"Iniciar tratativas"}
        </Button>}
        <span className="ml-auto text-xs font-semibold text-sky-200">Mais opções:</span>
        {cycleActions(active,false)}
      </div>
      {dirty&&<p className="text-xs text-amber-300">* Salve as quantidades antes de finalizar ou exportar.</p>}
    </div>}

    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      aria-label="Ferramentas e filtros da Logística Reversa">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-4">
        <Button type="button" className="h-10 gap-2 bg-blue-700 font-bold text-white hover:bg-blue-600"
          disabled={!baseReady||!groups.length||busy||suppliersQuery.isError||!suppliers.length}
          onClick={()=>setGroupDialog(true)}>
          <PackagePlus className="h-4 w-4"/> Novo ciclo
        </Button>
        <Button type="button" variant="outline" className="h-10 gap-2 border-blue-300 bg-blue-50 font-bold text-blue-900 hover:bg-blue-100"
          onClick={()=>setSuppliersOpen(true)}>
          <Building2 className="h-4 w-4"/> Cadastro de fornecedores
        </Button>
        <span className="ml-auto text-xs text-slate-500">
          {baseReady?groups.length.toLocaleString("pt-BR")+" grupos na base":"Base de contagem carregando"}
          {" · "}{suppliers.length} fornecedor(es)
        </span>
      </div>
      {!suppliers.length&&!suppliersQuery.isError&&baseReady&&<p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
        Cadastre um fornecedor e suas marcas antes de criar o primeiro ciclo.
      </p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.55fr)_minmax(145px,1fr)_minmax(145px,1fr)_minmax(150px,1fr)_auto] xl:items-end">
        <label className="space-y-1.5 text-xs font-bold text-slate-600">Buscar ciclo, fornecedor ou produto
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500"/>
            <Input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}
              className="h-10 border-slate-300 bg-white pl-9 text-sm text-slate-900 placeholder:text-slate-400"
              placeholder="Nº, fornecedor, marca, código..."/>
          </span>
        </label>
        <label className="space-y-1.5 text-xs font-bold text-slate-600">Status
          <select className={selectClass} value={statusFilter}
            onChange={e=>{setStatusFilter(e.target.value as ReverseStatusFilter);setPage(1);}}
            aria-label="Filtrar Logística Reversa por status">
            {statusOptions.map(st=><option key={st.value} value={st.value}>{st.label}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-bold text-slate-600">Fornecedor
          <select className={selectClass} value={supplierFilter}
            onChange={e=>{setSupplierFilter(e.target.value);setPage(1);}}
            aria-label="Filtrar Logística Reversa por fornecedor">
            <option value="all">Todos os fornecedores</option>
            {supplierNames.map(name=><option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-bold text-slate-600">Período
          <select className={selectClass} value={periodFilter}
            onChange={e=>{setPeriodFilter(e.target.value as ReversePeriod);setPage(1);}}
            aria-label="Filtrar período da Logística Reversa">
            <option value="all">Todo o período</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </select>
        </label>
        <Button variant="outline" type="button" className="h-10 gap-2 border-slate-300 bg-slate-50 font-semibold text-slate-700 hover:bg-slate-100"
          disabled={!filterActive} onClick={clearFilters}>
          <FilterX className="h-4 w-4"/> Limpar filtros
        </Button>
      </div>
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      aria-label="Lista de ciclos de Logística Reversa">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 sm:px-5">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <Layers3 className="h-5 w-5 text-blue-700"/> Ciclos de Logística Reversa
            <span className="text-slate-500">({filteredCycles.length})</span>
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">Acompanhamento e gestão das solicitações por fornecedor.</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          <Button type="button" size="sm" variant="ghost"
            className={"h-8 gap-1.5 px-3 "+(viewMode==="list"?"bg-blue-700 text-white hover:bg-blue-700 hover:text-white":"text-slate-600")}
            onClick={()=>setViewMode("list")} aria-pressed={viewMode==="list"}>
            <List className="h-4 w-4"/> Lista
          </Button>
          <Button type="button" size="sm" variant="ghost"
            className={"h-8 gap-1.5 px-3 "+(viewMode==="cards"?"bg-blue-700 text-white hover:bg-blue-700 hover:text-white":"text-slate-600")}
            onClick={()=>setViewMode("cards")} aria-pressed={viewMode==="cards"}>
            <LayoutGrid className="h-4 w-4"/> Cards
          </Button>
        </div>
      </div>
      {q.isLoading&&<p role="status" className="p-6 text-sm text-slate-500">Carregando os ciclos...</p>}
      {viewMode==="list"&&<div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[940px] border-collapse text-left text-sm">
          <thead className="bg-[#eef3f9] text-[11px] font-bold uppercase tracking-wide text-slate-600">
            <tr>{["Ciclo","Fornecedor / marca","Itens","Status","Abertura","Ações"].map(h=>
              <th scope="col" key={h} className="border-b border-slate-200 px-5 py-3">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {pageCycles.map(c=>{
              const qty=reverseCycleAmounts(c);
              return <tr key={c.id} className="transition-colors hover:bg-blue-50/50">
                <td className="px-5 py-3">
                  <button type="button" disabled={busy} onClick={()=>selectCycle(c)}
                    className="text-left font-extrabold text-slate-900 hover:text-blue-700 hover:underline">
                    {cycleTitle(c.number)}
                  </button>
                  <p className="mt-1 text-xs text-slate-500">{c.groups.length} grupo(s)</p>
                </td>
                <td className="max-w-[260px] px-5 py-3">
                  <p className="break-words font-bold text-slate-800">{c.supplier||"Fornecedor pendente"}</p>
                  <p className="mt-1 break-words text-xs font-semibold text-blue-700">{c.brand||"Marca não informada"}</p>
                </td>
                <td className="px-5 py-3 text-slate-700">
                  <span className="font-semibold">{qty.codes} códigos</span>
                  <span className="block text-xs text-slate-500">{qty.units} unidades</span>
                </td>
                <td className="px-5 py-3"><StageBadge cycle={c}/></td>
                <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-600">{dateText(c.createdAt)}</td>
                <td className="px-5 py-3">{cycleActions(c)}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>}
      <div className={(viewMode==="cards"?"grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3":"grid gap-3 p-4 sm:grid-cols-2 lg:hidden")}>
        {pageCycles.map(c=>{
          const qty=reverseCycleAmounts(c);
          return <article key={c.id} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <button type="button" onClick={()=>selectCycle(c)} disabled={busy}
                className="text-left text-base font-extrabold text-slate-900 hover:text-blue-700">
                {cycleTitle(c.number)}
              </button>
              <StageBadge cycle={c}/>
            </div>
            <p className="mt-1 text-xs text-slate-500">{dateText(c.createdAt)}</p>
            <p className="mt-4 break-words font-extrabold text-slate-900">{c.supplier||"Fornecedor pendente"}</p>
            <p className="mt-0.5 break-words text-sm font-bold text-blue-700">{c.brand||"Marca não informada"}</p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
              <p className="text-xs text-slate-600"><strong>{qty.codes}</strong> códigos · <strong>{qty.units}</strong> unidades</p>
              {cycleActions(c)}
            </div>
          </article>;
        })}
      </div>
      {!q.isLoading&&!filteredCycles.length&&<p className="border-t border-slate-100 px-5 py-10 text-center text-sm text-slate-500">
        Nenhum ciclo encontrado para esses filtros. Experimente limpar os filtros.
      </p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600 sm:px-5">
        <span>{filteredCycles.length===0?"Nenhum ciclo encontrado":
          "Mostrando "+((safePage-1)*PAGE_SIZE+1)+" a "+Math.min(safePage*PAGE_SIZE,filteredCycles.length)+
          " de "+filteredCycles.length+" ciclos"}</span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" aria-label="Página anterior"
            className="h-9 border-slate-300 text-slate-700" disabled={safePage<=1}
            onClick={()=>setPage(p=>Math.max(1,p-1))}>
            <ChevronLeft className="h-4 w-4"/>
          </Button>
          <span className="min-w-12 text-center text-xs font-bold">{safePage} / {pages}</span>
          <Button type="button" variant="outline" size="sm" aria-label="Próxima página"
            className="h-9 border-slate-300 text-slate-700" disabled={safePage>=pages}
            onClick={()=>setPage(p=>Math.min(pages,p+1))}>
            <ChevronRight className="h-4 w-4"/>
          </Button>
        </div>
      </div>
    </section>
    {groupDialog&&<ReverseGroupPicker groups={groups} index={groupSearchIndex}
      suppliers={suppliers} busy={busy||q.isError||suppliersQuery.isError}
      onOpenSuppliers={()=>{setGroupDialog(false);setSuppliersOpen(true);}}
      onClose={()=>setGroupDialog(false)}
      onCreate={(selected,supplierId,brand)=>void operation(async()=>{
        const c=await create({data:{groups:selected,supplierId,brand}});
        setGroupDialog(false);selectCycle(c);
        toast.success(cycleTitle(c.number)+" criado para "+c.supplier+" · "+c.brand);
      })}/>}

    <ReverseSupplierRegistry open={suppliersOpen} onClose={()=>setSuppliersOpen(false)}
      suppliers={suppliers} onSaved={async()=>{await suppliersQuery.refetch();}}/>

    <Dialog open={!!supplierCycleId} onOpenChange={o=>{if(!o&&!busy)setSupplierCycleId(null);}}>
      <DialogContent className="border-sky-400/40 bg-[#0b2949] text-white">
        <DialogHeader><DialogTitle>Fornecedor e marca · {supplierCycle?cycleTitle(supplierCycle.number):""}</DialogTitle>
          <DialogDescription className="text-sky-200">Selecione o fornecedor cadastrado e a marca que será tratada neste ciclo.</DialogDescription></DialogHeader>
        <label className="space-y-1 text-sm font-bold">Fornecedor
          <select className={"h-10 w-full rounded-lg border px-3 "+field} value={chosenSupplierId}
            onChange={e=>{setChosenSupplierId(e.target.value);setChosenBrand("");}}>
            <option value="">Selecione...</option>
            {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
        <label className="space-y-1 text-sm font-bold">Marca comercializada
          <select className={"h-10 w-full rounded-lg border px-3 "+field} value={chosenBrand}
            disabled={!chosenSupplierId} onChange={e=>setChosenBrand(e.target.value)}>
            <option value="">Selecione...</option>
            {linkMark(pickedSupplier).map(mark=><option key={mark} value={mark}>{mark}</option>)}
          </select></label>
        <Button className="bg-sky-600 text-white" disabled={busy||!chosenSupplierId||!chosenBrand}
          onClick={()=>void linkSupplier()}><Save className="mr-2 h-4 w-4"/> Salvar fornecedor e marca</Button>
      </DialogContent>
    </Dialog>

    <Dialog open={finishDialog} onOpenChange={o=>{if(!o&&!busy)setFinishDialog(false);}}>
      <DialogContent className="border-sky-400/40 bg-[#0b2949] text-white">
        <DialogHeader><DialogTitle>Finalizar a separação dos itens</DialogTitle>
          <DialogDescription className="text-sky-200">Confira os dados antes de iniciar o contato com o fornecedor.</DialogDescription></DialogHeader>
        {active&&<div className="space-y-2 rounded-lg border border-sky-400/25 bg-[#133b62] p-4">
          <p><strong>{cycleTitle(active.number)}</strong></p>
          <p>Fornecedor: <strong>{active.supplier}</strong></p>
          <p>Marca: <strong className="text-cyan-300">{active.brand}</strong></p>
          <p>Produtos: {reverseIncluded(active.items).length} códigos · {reverseTotal(active.items)} unidades</p>
        </div>}
        <Button disabled={busy||!active||active.status!=="aberto"} className="bg-emerald-600 text-white"
          onClick={()=>{
            if(!active)return;
            void operation(async()=>{
              await finish({data:{id:active.id,version:active.version,supplier:active.supplier??""}});
              setFinishDialog(false);
              setGuideId(active.id);
              toast.success("Separação concluída. Inicie o contato com o fornecedor pelo orientador.");
            });
          }}><CheckCircle2 className="mr-2 h-4 w-4"/> Confirmar e abrir tratativas</Button>
      </DialogContent>
    </Dialog>

    {guideCycle&&<ReverseTreatmentGuide key={guideCycle.id}
      cycle={guideCycle} supplier={suppliers.find(s=>s.id===guideCycle.supplierId)}
      onClose={()=>setGuideId(null)} onUpdated={async()=>{await q.refetch();}}/>}
  </section>;
}

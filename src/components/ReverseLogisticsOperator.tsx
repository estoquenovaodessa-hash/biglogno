import {useDeferredValue,useMemo,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {ArrowLeft,Building2,CheckCircle2,ClipboardList,Download,FileDown,
  Minus,Plus,RotateCcw,Search,Trash2,Pencil,Save,PackagePlus,Printer} from "lucide-react";
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
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

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
  const linkMark=(s:ReverseSupplier|undefined)=>s?.brands??[];
  return <section className="mx-auto max-w-[1440px] space-y-5 text-[#e9f5ff]" aria-label="Logística Reversa do operador">
    <header className="rounded-2xl border border-sky-500/40 bg-gradient-to-r from-[#123f76] to-[#071c37] p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <RotateCcw className="h-9 w-9 text-sky-300"/>
          <div><h1 className="text-2xl font-extrabold text-white">Logística Reversa</h1>
            <p className="text-sm text-[#bed7f2]">Fluxo guiado de garantia, devolução e tratativas com fornecedores</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className={outline} onClick={()=>setSuppliersOpen(true)}>
            <Building2 className="mr-2 h-4 w-4"/> Cadastro de fornecedores</Button>
          <Button className="bg-sky-600 text-white hover:bg-sky-500"
            disabled={!baseReady||!groups.length||busy||!!suppliersQuery.isError||!suppliers.length}
            onClick={()=>setGroupDialog(true)}>
            <PackagePlus className="mr-2 h-4 w-4"/> Abrir grupo(s) / Novo ciclo</Button>
        </div>
      </div>
      <p className="mt-3 text-xs text-[#a4c5e6]">
        {baseReady?groups.length+" linhas/grupos no relatório da Contagem.":"Carregando base da Contagem..."}
        {" · "}{suppliers.length} fornecedor(es) cadastrado(s).</p>
      {!suppliers.length&&!suppliersQuery.isError&&baseReady&&<p className="mt-2 text-xs font-semibold text-amber-200">
        Antes de abrir o primeiro ciclo, cadastre o fornecedor e suas marcas no botão acima.</p>}
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
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy||!dirty} className="bg-sky-600 text-white"
          onClick={()=>void operation(()=>saveCounts(active))}>
          <Save size={16} className="mr-2"/>{dirty?"Salvar quantidades *":"Quantidades salvas"}</Button>
        <Button variant="outline" className={outline} disabled={dirty||busy||!reverseIncluded(active.items).length}
          onClick={()=>exportCycle(active,"pdf")}><FileDown size={16} className="mr-1"/> PDF</Button>
        <Button variant="outline" className={outline} disabled={dirty||busy||!reverseIncluded(active.items).length}
          onClick={()=>exportCycle(active,"csv")}><Download size={16} className="mr-1"/> CSV</Button>
        <Button variant="outline" className={outline} disabled={busy||dirty}
          onClick={()=>openSupplierLink(active)}><Building2 size={16} className="mr-1"/> Editar fornecedor / marca</Button>
        {active.status==="aberto"?<Button disabled={busy||dirty||!active.supplierId||!active.brand||!reverseIncluded(active.items).length}
          className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={()=>setFinishDialog(true)}>
          <CheckCircle2 size={16} className="mr-1"/> Finalizar separação e iniciar tratativas</Button>:
          <Button disabled={busy||dirty} className="bg-indigo-600 text-white" onClick={()=>openGuide(active)}>
            <ClipboardList size={16} className="mr-1"/> {active.contactStartedAt?"Continuar tratativas":"Iniciar tratativas"}</Button>}
        {active.nfd&&active.volumes&&<Button variant="outline" className={outline} onClick={()=>printVolumes(active)}>
          <Printer size={16} className="mr-1"/> Etiquetas de volumes</Button>}
      </div>
      {dirty&&<p className="text-xs text-amber-300">* Salve as quantidades antes de finalizar ou exportar.</p>}
    </div>}

    <div className="space-y-3">
      <h2 className="text-lg font-extrabold">Ciclos de Logística Reversa ({cycles.length})</h2>
      {q.isLoading&&<p>Carregando ciclos...</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {cycles.map(c=><article key={c.id} className="rounded-xl border border-[#35618b] bg-[#112c4b] p-4 shadow-md">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h3 className="text-lg font-extrabold">{cycleTitle(c.number)}</h3>
              <p className="text-xs text-sky-200">{dateText(c.createdAt)}</p>
              <p className="mt-2 text-sm font-bold text-sky-200">{c.supplier||"Fornecedor pendente"}</p>
              <strong className="mt-1 block break-words text-2xl font-black tracking-tight text-cyan-300">
                {c.brand||"Marca não informada"}</strong></div>
            <span className={"h-fit rounded-full border px-2 py-1 text-xs font-bold "+
              (reverseWorkflowStage(c)==="resolvido"?"border-emerald-400/40 bg-emerald-600/20 text-emerald-200":
              "border-sky-400/30 bg-sky-800/30 text-sky-100")}>{reverseStatusLabel(c)}</span>
          </div>
          <p className="mt-3 text-xs text-sky-200">{reverseIncluded(c.items).length} códigos · {reverseTotal(c.items)} unidades · {c.groups.length} grupos</p>
          <p className="my-3 rounded-lg border border-sky-500/25 bg-[#0b213d] p-3 text-xs text-sky-100">
            {stageHelp(c)}</p>
          {c.nfd&&<p className="mb-3 text-xs text-sky-200">NFDev: <strong>{c.nfd}</strong> · Volumes: {c.volumes??"—"}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className={outline} onClick={()=>selectCycle(c)} disabled={busy}>
              <Pencil size={15} className="mr-1"/> Editar</Button>
            <Button variant="outline" className={outline} disabled={busy||!reverseIncluded(c.items).length}
              onClick={()=>exportCycle(c,"pdf")}><FileDown size={15} className="mr-1"/> PDF</Button>
            <Button variant="outline" className={outline} disabled={busy||!reverseIncluded(c.items).length}
              onClick={()=>exportCycle(c,"csv")}><Download size={15} className="mr-1"/> CSV</Button>
            {c.status==="finalizado"&&<Button variant="outline" className={outline} disabled={busy}
              onClick={()=>openGuide(c)}><ClipboardList size={15} className="mr-1"/>
              {c.contactStartedAt?"Continuar tratativas":"Tratativas (não iniciado)"}</Button>}
            {c.nfd&&c.volumes&&<Button variant="outline" className={outline} onClick={()=>printVolumes(c)}>
              <Printer size={15} className="mr-1"/> Etiquetas</Button>}
            <Button variant="outline" className="border-red-500/40 bg-red-950/30 text-red-200"
              disabled={busy} onClick={()=>{
                if(!window.confirm("Excluir "+cycleTitle(c.number)+" permanentemente?"))return;
                void operation(async()=>{
                  await remove({data:{id:c.id,version:c.version}});
                  if(activeId===c.id)setActiveId(null);
                  if(guideId===c.id)setGuideId(null);
                  toast.success("Ciclo excluído.");
                });
              }}><Trash2 size={15} className="mr-1"/> Excluir</Button>
          </div>
        </article>)}
      </div>
      {!cycles.length&&!q.isLoading&&!q.isError&&<p className="rounded-xl border border-dashed border-sky-400/30 bg-[#0d2948] p-5 text-center">
        Nenhum ciclo aberto. Cadastre um fornecedor, escolha sua marca e selecione os grupos para iniciar.</p>}
    </div>

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

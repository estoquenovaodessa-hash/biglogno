import {useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import {AlertTriangle,ArrowLeft,Barcode,CheckCircle2,ClipboardCheck,
  Lock,Minus,Package,Plus,RotateCcw,ScanLine,Search,ShieldAlert,Trash2,Unlock} from "lucide-react";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import type {BarcodesBase} from "@/lib/types";
import type {Ciclo} from "@/lib/ciclos";
import {
  collectorCounts,collectorProgress,createCollectorState,finalizeCollector,
  scanCollector,adjustCollectorCount,setCollectorCount,
  type CollectorState,type CollectorMode,
} from "@/lib/counting-collector";

const nf=(n:number)=>new Intl.NumberFormat("pt-BR").format(n);
type Blocked={raw:string;message:string};
const sortCycles=(cycles:Ciclo[])=>[...cycles].sort((a,b)=>b.criadoEm.localeCompare(a.criadoEm));
export function CountingCollector({
  cycles,activeId,onChoose,onBack,onSave,barcodeBase,canOperate,
}:{
  cycles:Ciclo[];activeId:string|null;
  onChoose:(id:string)=>void;onBack:()=>void;
  onSave:(id:string,state:CollectorState)=>void;
  barcodeBase:BarcodesBase;canOperate:boolean;
}){
  const openCycles=useMemo(()=>sortCycles(cycles.filter(c=>c.status==="aberto")),[cycles]);
  const cycle=openCycles.find(c=>c.id===activeId)??null;
  const state=cycle?createCollectorState(cycle.coletor):null;
  const [raw,setRaw]=useState("");
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState<string|null>(null);
  const [blocked,setBlocked]=useState<Blocked|null>(null);
  const [last,setLast]=useState<{code:string;name:string;count:number}|null>(null);
  const [modeOverride,setModeOverride]=useState<CollectorMode|null>(null);
  const inputRef=useRef<HTMLInputElement>(null);
  const lastSubmit=useRef<{value:string;at:number}|null>(null);
  const progress=cycle?collectorProgress(cycle):{products:0,units:0,total:0};
  const quantities=cycle?collectorCounts(cycle):{};
  const mode=modeOverride??state?.modo??"livre";
  const editable=!!cycle&&canOperate&&state?.status!=="finalizado"&&!blocked;
  const barcodeTotal=Object.keys(barcodeBase.porBarcode??{}).length;

  useEffect(()=>{
    setRaw("");setQuery("");setSelected(null);setBlocked(null);
    setLast(null);setModeOverride(null);
  },[activeId]);
  useEffect(()=>{if(cycle&&!blocked&&editable)inputRef.current?.focus();},[cycle?.id,blocked,editable]);

  const shown=useMemo(()=>{
    if(!cycle)return [];
    const normalized=query.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").trim();
    return cycle.itens.filter(i=>!normalized||
      [i.codigo,i.descricao,i.endereco].some(t=>
        String(t??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").includes(normalized)))
      .sort((a,b)=>(quantities[b.codigo]??0)-(quantities[a.codigo]??0));
  },[cycle,query,quantities]);

  function changeMode(next:CollectorMode){
    if(!cycle||!state||!editable)return;
    const updated={...state,modo:next,atualizadoEm:new Date().toISOString()};
    onSave(cycle.id,updated);
    setModeOverride(next);
    setSelected(null);setBlocked(null);setRaw("");
    inputRef.current?.focus();
  }
  function register(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!cycle||!state||!editable)return;
    const scan=raw.trim();
    if(!scan)return;
    // Evita alguns leitores que enviam dois ENTERs em milissegundos.
    const now=performance.now();
    if(lastSubmit.current?.value===scan && now-lastSubmit.current.at<90){
      setRaw("");return;
    }
    lastSubmit.current={value:scan,at:now};
    const result=scanCollector({...state,modo},scan,barcodeBase,cycle.itens,selected);
    setRaw("");
    if(!result.result.ok){
      let message=result.result.reason==="desconhecido"
        ?"Código de barras não localizado na planilha."
        :result.result.reason==="fora_do_ciclo"
        ?"Este produto não pertence ao ciclo selecionado."
        :result.result.reason==="restrito_sem_selecao"
        ?"Selecione um item marcado antes da bipagem restrita."
        :result.result.reason==="restrito_diferente"
        ?"Código incorreto: o produto bipado é diferente do item marcado."
        :"Limite de quantidade atingido.";
      if(result.result.bloquear){
        setBlocked({raw:scan,message});
        if(typeof navigator!=="undefined"&&"vibrate" in navigator)navigator.vibrate?.([180,90,180]);
      }else toast.error(message);
      return;
    }
    onSave(cycle.id,result.state);
    const item=cycle.itens.find(i=>i.codigo===result.result.codigo);
    setLast({code:result.result.codigo,name:item?.descricao??"",count:result.result.quantidade});
    inputRef.current?.focus();
  }
  function adjust(code:string,delta:number,remove=false){
    if(!cycle||!state||!editable)return;
    const next=remove?setCollectorCount(state,code,0):adjustCollectorCount(state,code,delta);
    onSave(cycle.id,next);
    inputRef.current?.focus();
  }
  function finish(){
    if(!cycle||!state||!editable||progress.units===0){
      toast.error("Registre ao menos uma unidade antes de finalizar a bipagem.");return;
    }
    if(!window.confirm("Finalizar a bipagem de "+cycle.titulo+"? O ciclo permanecerá aberto para o fechamento padrão."))return;
    onSave(cycle.id,finalizeCollector({...state,modo}));
    toast.success("Bipagem finalizada! O botão PDF de bipagem foi liberado no grid do ciclo.");
    onBack();
  }
  function reopen(){
    if(!cycle||!state||!canOperate||state.status!=="finalizado")return;
    if(!window.confirm("Reabrir a bipagem? As quantidades registradas serão preservadas para correção."))return;
    onSave(cycle.id,{...state,status:"em_andamento",finalizadoEm:undefined,atualizadoEm:new Date().toISOString()});
  }

  return <div className="fixed inset-0 z-[90] flex flex-col overflow-hidden bg-[#061b33] text-white"
    aria-label="Coletor de Contagem no celular">
    <header className="shrink-0 border-b border-sky-400/30 bg-[#103b68] px-3 pt-3 pb-3 shadow-md">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onBack}
          className="border-sky-300/35 bg-[#082747] text-white hover:bg-[#174b77]">
          <ArrowLeft className="mr-1.5 h-4 w-4"/> Contagem
        </Button>
        <div className="text-center">
          <h1 className="flex items-center justify-center gap-2 text-lg font-black">
            <ScanLine className="h-5 w-5 text-sky-300"/> COLETOR
          </h1>
          <p className="text-[11px] text-sky-200">Contagem por código de barras</p>
        </div>
        <span className="rounded-full border border-sky-400/40 px-2 py-1 text-[10px] font-bold">
          {cycle?"ATIVO":"SELEÇÃO"}
        </span>
      </div>
    </header>
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 pb-7">
      {!openCycles.length&&<div className="rounded-xl border border-amber-400/40 bg-amber-950/30 p-5 text-sm text-amber-100">
        Não há ciclos abertos. Volte à Contagem e abra um ciclo padrão ou de apuração.
      </div>}
      {openCycles.length>0&&<section className="rounded-xl border border-sky-400/30 bg-[#102e52] p-3">
        <label className="block space-y-1.5 text-xs font-bold uppercase tracking-wide text-sky-200">
          Ciclo que será bipado
          <select value={cycle?.id??""} onChange={e=>onChoose(e.target.value)}
            className="h-12 w-full rounded-lg border border-sky-300/45 bg-[#061b34] px-3 text-base font-bold text-white"
            aria-label="Escolher ciclo aberto para bipagem">
            {!cycle&&<option value="">Escolha um ciclo...</option>}
            {openCycles.map(c=><option key={c.id} value={c.id}>
              {c.titulo} · {c.itens.length} itens
            </option>)}
          </select>
        </label>
        {cycle&&<div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-[#071d37] p-2"><span className="block text-[10px] text-sky-200">Itens no ciclo</span>
            <strong className="text-xl">{nf(progress.total)}</strong></div>
          <div className="rounded-lg bg-[#071d37] p-2"><span className="block text-[10px] text-sky-200">Itens bipados</span>
            <strong className="text-xl">{nf(progress.products)}</strong></div>
          <div className="rounded-lg bg-[#071d37] p-2"><span className="block text-[10px] text-sky-200">Unidades</span>
            <strong className="text-xl text-sky-200">{nf(progress.units)}</strong></div>
        </div>}
      </section>}

      {cycle&&<div className="space-y-3">
        <section className="rounded-xl border border-sky-400/30 bg-[#102e52] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-sky-200">Tipo de bipagem</p>
            <span className="text-[11px] text-sky-200">Selecione o modo</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={!editable} onClick={()=>changeMode("livre")}
              className={"min-h-12 rounded-lg border px-2 py-2 text-sm font-extrabold "+
                (mode==="livre"?"border-emerald-300 bg-emerald-700/50":"border-sky-400/30 bg-[#071d37]")}>
              Bipagem livre</button>
            <button type="button" disabled={!editable} onClick={()=>changeMode("restrita")}
              className={"min-h-12 rounded-lg border px-2 py-2 text-sm font-extrabold "+
                (mode==="restrita"?"border-amber-300 bg-amber-600/40":"border-sky-400/30 bg-[#071d37]")}>
              <Lock className="mr-1 inline h-3.5 w-3.5"/> Bipagem restrita</button>
          </div>
          <p className="mt-2 text-xs text-sky-200">{mode==="livre"
            ?"Bipe os produtos em qualquer ordem. Cada leitura acrescenta uma unidade."
            :"Marque um item na lista abaixo. Qualquer código diferente bloqueia a contagem em vermelho."}</p>
        </section>
        <section className="rounded-xl border border-sky-400/30 bg-[#102e52] p-3">
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-sky-200">
            <Barcode className="h-4 w-4"/> Bipagem (ENTER automático do leitor)</p>
          <form onSubmit={register} className="space-y-2">
            <Input ref={inputRef} type="text" autoComplete="off" autoCapitalize="off"
              placeholder={mode==="restrita"&&!selected?"Marque o item abaixo antes de bipar":"Bipe o código de barras"}
              aria-label="Campo de bipagem de código de barras" disabled={!editable||(mode==="restrita"&&!selected)}
              className="h-14 border-sky-300/50 bg-[#061b34] text-lg font-bold text-white placeholder:text-sky-300/60"
              value={raw} onChange={e=>setRaw(e.target.value)}/>
            <Button type="submit" disabled={!editable||!raw.trim()||(mode==="restrita"&&!selected)}
              className="h-11 w-full bg-sky-600 text-white hover:bg-sky-500">
              <ScanLine className="mr-2 h-5 w-5"/> Registrar bipagem</Button>
          </form>
          {!barcodeTotal&&<p className="mt-2 rounded-lg border border-amber-400/35 p-2 text-xs text-amber-200">
            Nenhuma base de códigos importada. Volte à Contagem e anexe a planilha de produtos (colunas A e M).
          </p>}
          {!!barcodeTotal&&<p className="mt-2 text-[11px] text-sky-200">
            Base ativa: {barcodeBase.nomeArquivo} · {nf(barcodeTotal)} códigos de barras
          </p>}
        </section>
        {last&&<div role="status" className="rounded-xl border border-emerald-400/40 bg-emerald-800/30 p-3">
          <p className="flex items-center gap-1 text-sm font-bold text-emerald-200">
            <CheckCircle2 className="h-4 w-4"/> Bipagem registrada · {last.code} · Qtde. {last.count}</p>
          <p className="mt-1 text-xs text-emerald-100">{last.name}</p>
        </div>}

        <section className="space-y-2 rounded-xl border border-sky-400/30 bg-[#102e52] p-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-sky-300"/>
            <Input value={query} onChange={e=>setQuery(e.target.value)}
              className="h-11 border-sky-400/35 bg-[#071d37] pl-10 text-white"
              placeholder="Buscar item por código, descrição ou endereço" aria-label="Buscar itens do ciclo"/>
          </label>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold">Itens do ciclo ({shown.length})</h2>
            {mode==="restrita"&&<span className="text-[11px] font-bold text-amber-200">Marque somente um item</span>}
          </div>
          <div className="space-y-2">
            {shown.map(item=>{
              const count=quantities[item.codigo]??0,active=selected===item.codigo;
              return <article key={item.codigo}
                className={"rounded-xl border p-3 "+(active&&mode==="restrita"?
                  "border-amber-300 bg-amber-800/25":"border-sky-400/25 bg-[#071c37]")}>
                <div className="flex items-start gap-3">
                  {mode==="restrita"&&<label className="flex min-h-10 shrink-0 items-center gap-2"
                    title={"Selecionar "+item.codigo}>
                    <input type="checkbox" aria-label={"Selecionar item "+item.codigo}
                      checked={active} disabled={!canOperate||state?.status==="finalizado"||!!blocked}
                      className="h-6 w-6 accent-amber-400"
                      onChange={e=>{setSelected(e.target.checked?item.codigo:null);setRaw("");inputRef.current?.focus();}}/>
                  </label>}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-lg font-black tracking-wide text-white">{item.codigo}</span>
                      <span className="rounded-lg border border-sky-300/25 bg-[#174976] px-2 py-1 text-xs font-bold">
                        {item.endereco||"Sem endereço"}</span>
                    </p>
                    <p className="mt-1 break-words text-sm leading-snug text-sky-100">{item.descricao}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2 border-t border-sky-400/20 pt-2">
                  <span className="mr-auto text-xs font-bold text-sky-200">Bipado: <strong className="text-xl text-white">{count}</strong></span>
                  <Button type="button" size="icon" variant="outline" aria-label={"Diminuir "+item.codigo}
                    className="h-11 w-11 border-sky-400/35 bg-[#133d67] text-white"
                    disabled={!editable||count===0} onClick={()=>adjust(item.codigo,-1)}>
                    <Minus className="h-5 w-5"/></Button>
                  <Button type="button" size="icon" variant="outline" aria-label={"Aumentar "+item.codigo}
                    className="h-11 w-11 border-sky-400/35 bg-[#133d67] text-white"
                    disabled={!editable||count>=10000000} onClick={()=>adjust(item.codigo,1)}>
                    <Plus className="h-5 w-5"/></Button>
                  <Button type="button" size="icon" variant="outline" aria-label={"Excluir bipagem "+item.codigo}
                    className="h-11 w-11 border-rose-400/50 bg-rose-950/50 text-rose-200"
                    disabled={!editable||count===0} onClick={()=>{
                      if(window.confirm("Zerar todas as bipagens do item "+item.codigo+"?"))adjust(item.codigo,0,true);
                    }}>
                    <Trash2 className="h-5 w-5"/></Button>
                </div>
              </article>;
            })}
            {!shown.length&&<p className="p-5 text-center text-xs text-sky-200">Nenhum item corresponde à busca.</p>}
          </div>
        </section>
        {state?.status==="finalizado"?<section className="rounded-xl border border-emerald-400/40 bg-emerald-800/20 p-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-emerald-200"><CheckCircle2/> Bipagem finalizada</h2>
          <p className="mt-2 text-sm text-sky-100">
            O PDF de bipagem está disponível no grid da Contagem. Feche o ciclo normalmente na tela principal.</p>
          <Button type="button" className="mt-3 w-full bg-[#185487] text-white"
            disabled={!canOperate} onClick={reopen}>
            <RotateCcw className="mr-2 h-4 w-4"/> Reabrir bipagem para correção</Button>
        </section>:<div className="sticky bottom-0 rounded-xl border border-emerald-400/40 bg-[#0c3458] p-3 shadow-xl">
          <Button type="button" className="h-14 w-full bg-emerald-600 text-lg font-extrabold text-white hover:bg-emerald-500"
            disabled={!editable||progress.units===0} onClick={finish}>
            <ClipboardCheck className="mr-2 h-6 w-6"/> Finalizar bipagem
          </Button>
          <p className="mt-2 text-center text-[11px] text-sky-200">Finaliza apenas a bipagem. O ciclo segue aberto para o fechamento padrão.</p>
        </div>}
      </div>}
    </main>

    {blocked&&<div role="alertdialog" aria-modal="true" aria-labelledby="collector-blocked-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-red-700 p-5 text-center text-white">
      <div className="w-full max-w-md space-y-5">
        <ShieldAlert className="mx-auto h-24 w-24 animate-pulse" strokeWidth={2.5}/>
        <h2 id="collector-blocked-title" className="text-3xl font-black uppercase">BIPAGEM BLOQUEADA!</h2>
        <p className="text-lg font-bold">{blocked.message}</p>
        <p className="rounded-lg border border-white/50 bg-red-900/35 p-3 text-sm">
          Código bipado: <strong>{blocked.raw}</strong>
          {selected&&<><br/>Item selecionado: <strong>{selected}</strong></>}
        </p>
        <p className="text-sm">Nenhuma unidade foi somada. Verifique o produto e confirme para liberar a tela.</p>
        <Button type="button" autoFocus size="lg"
          className="h-14 w-full bg-white text-lg font-black text-red-700 hover:bg-red-100"
          onClick={()=>{setBlocked(null);setRaw("");setTimeout(()=>inputRef.current?.focus(),30);}}>
          <Unlock className="mr-2 h-5 w-5"/> Entendi, desbloquear
        </Button>
      </div>
    </div>}
  </div>;
}

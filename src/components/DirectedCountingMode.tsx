import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft, ArrowRight, Barcode, CheckCircle2, ClipboardCheck,
  LockKeyhole, MapPin, ScanLine, ShieldAlert, Unlock,
} from "lucide-react";
import type { Ciclo } from "@/lib/ciclos";
import type { BarcodesBase } from "@/lib/types";
import {
  collectorCount, directedCollectorItems, scanDirectedCollector,
  type CollectorState,
} from "@/lib/counting-collector";
import "./directed-counting.css";

type Props = {
  cycle:Ciclo;
  state:CollectorState;
  barcodeBase:BarcodesBase;
  canOperate:boolean;
  onSave:(id:string,state:CollectorState)=>void;
  onFreeMode:()=>void;
  onBack:()=>void;
  onFinish:()=>void;
};

function getLandscapeOrientation() {
  return typeof screen!=="undefined"
    ? (screen.orientation as {lock?:(mode:string)=>Promise<void>;unlock?:()=>void}|undefined)
    : undefined;
}

/** A orientação física depende do navegador. CSS faz rotação visual de
 * 90 graus quando o bloqueio nativo não está disponível (incluindo iOS). */
export function requestDirectedLandscape() {
  if(typeof window==="undefined"||!window.matchMedia("(pointer: coarse)").matches)return;
  const lock=()=>{try{void getLandscapeOrientation()?.lock?.("landscape")?.catch(()=>{});}catch{/* CSS fallback */}};
  try {
    if(!document.fullscreenElement&&document.documentElement.requestFullscreen){
      void document.documentElement.requestFullscreen().then(lock).catch(lock);
    }else lock();
  }catch{lock();}
}

export function releaseDirectedLandscape() {
  try{getLandscapeOrientation()?.unlock?.();}catch{/* browser unsupported */}
  if(typeof document!=="undefined"&&document.fullscreenElement===document.documentElement){
    void document.exitFullscreen().catch(()=>{});
  }
}

const format=(value:number)=>new Intl.NumberFormat("pt-BR").format(value);

export function DirectedCountingMode({
  cycle,state,barcodeBase,canOperate,onSave,onFreeMode,onBack,onFinish,
}:Props) {
  const items=useMemo(()=>directedCollectorItems(cycle.itens),[cycle.itens]);
  const cursor=items.findIndex(item=>item.codigo===state.directedCode);
  const index=cursor<0?0:cursor;
  const target=items[index];
  const total=collectorCount(state);
  const count=target?state.quantidades[target.codigo]??0:0;
  const editable=canOperate&&cycle.status==="aberto"&&state.status!=="finalizado";
  const [raw,setRaw]=useState("");
  const [blocked,setBlocked]=useState<string|null>(null);
  const [success,setSuccess]=useState(false);
  const inputRef=useRef<HTMLInputElement>(null);
  const okRef=useRef<HTMLButtonElement>(null);
  const recentRef=useRef<{raw:string;time:number}|null>(null);
  const latest=useRef(state);

  useEffect(()=>{latest.current=state;},[state]);
  useEffect(()=>{
    setRaw("");setBlocked(null);setSuccess(false);
  },[cycle.id]);
  useEffect(()=>{
    if(!blocked&&target&&editable){
      const id=requestAnimationFrame(()=>inputRef.current?.focus({preventScroll:true}));
      return ()=>cancelAnimationFrame(id);
    }
  },[target?.codigo,blocked,editable]);
  useEffect(()=>{
    if(blocked){
      const id=requestAnimationFrame(()=>okRef.current?.focus({preventScroll:true}));
      return ()=>cancelAnimationFrame(id);
    }
  },[blocked]);

  function register(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if(!target||!editable||blocked)return;
    const entered=(inputRef.current?.value??raw).replace(/[\r\n\t ]/g,"").trim();
    if(!entered)return;
    // Certains leitores enviam dois ENTERs na mesma rajada: não duplicar.
    const now=performance.now();
    if(recentRef.current?.raw===entered&&now-recentRef.current.time<90){
      setRaw("");
      if(inputRef.current)inputRef.current.value="";
      return;
    }
    recentRef.current={raw:entered,time:now};
    setRaw("");
    if(inputRef.current)inputRef.current.value="";
    const current=latest.current;
    const result=scanDirectedCollector(
      {...current,modo:"restrita",directedCode:target.codigo},
      entered,barcodeBase,cycle.itens,target.codigo,
    );
    if(!result.result.ok){
      if(result.result.bloquear){
        setSuccess(false);
        setBlocked(entered);
        try{navigator.vibrate?.([180,90,180]);}catch{/* no vibration */}
      }
      return;
    }
    latest.current=result.state;
    onSave(cycle.id,result.state);
    setSuccess(true);
    requestAnimationFrame(()=>inputRef.current?.focus({preventScroll:true}));
  }

  function nextItem(){
    if(!target||index>=items.length-1||!editable||blocked)return;
    const next=items[index+1];
    const updated={...latest.current,modo:"restrita" as const,
      directedCode:next.codigo,atualizadoEm:new Date().toISOString()};
    latest.current=updated;
    onSave(cycle.id,updated);
    setRaw("");setSuccess(false);
    recentRef.current=null;
    if(inputRef.current)inputRef.current.value="";
    requestAnimationFrame(()=>inputRef.current?.focus({preventScroll:true}));
  }

  function acknowledge(){
    setBlocked(null);
    setRaw("");
    recentRef.current=null;
    if(inputRef.current)inputRef.current.value="";
    requestAnimationFrame(()=>inputRef.current?.focus({preventScroll:true}));
  }

  function back(){
    releaseDirectedLandscape();
    onBack();
  }
  function free(){
    releaseDirectedLandscape();
    onFreeMode();
  }

  return <div className="biglog-directed" aria-label="Coletor de Contagem — Bipagem restrita direcionada">
    <header className="biglog-directed__topbar">
      <div className="biglog-directed__brand">
        <span className="biglog-directed__brand-symbol">B</span>
        <div><strong>BIGLOG <em>/ COLETOR</em></strong>
          <small>CONTAGEM DIRECIONADA</small></div>
      </div>
      <div className="biglog-directed__cycle" aria-label="Informações do ciclo">
        <span>{cycle.titulo}</span>
        <span className="biglog-directed__sep" aria-hidden="true" />
        <span>ITEM <strong>{String(items.length?index+1:0).padStart(2,"0")} / {String(items.length).padStart(2,"0")}</strong></span>
      </div>
      <div className="biglog-directed__header-actions">
        <span className="biglog-directed__mode"><LockKeyhole size={14} /> RESTRITA</span>
        <button type="button" onClick={free} className="biglog-directed__minor-button"
          aria-label="Voltar ao modo de bipagem livre">Bipagem livre</button>
        <button type="button" onClick={back} className="biglog-directed__minor-button"
          aria-label="Voltar ao grid de Contagem"><ArrowLeft size={15}/> Voltar</button>
      </div>
    </header>

    {!target ? <div className="biglog-directed__empty">
      <strong>Nenhum item direcionado neste ciclo.</strong>
      <p>Volte à Contagem e verifique a lista de itens do ciclo.</p>
      <button type="button" onClick={back}>Voltar à Contagem</button>
    </div>:<>
      <main className="biglog-directed__main">
        <div className="biglog-directed__guide">
          <div className="biglog-directed__target">
            <section className="biglog-directed__address" aria-label="Endereço para onde o operador deve ir">
              <h2><MapPin size={24}/> VÁ ATÉ O ENDEREÇO</h2>
              <strong>{target.endereco||"SEM ENDEREÇO"}</strong>
              <span className="biglog-directed__address-arrow" aria-hidden="true">→</span>
            </section>
            <div className="biglog-directed__item-row">
              <section className="biglog-directed__item-code">
                <h2><Barcode size={19}/> CÓDIGO DO ITEM</h2>
                <strong>{target.codigo}</strong>
              </section>
              <section className="biglog-directed__item-description">
                <h2>DESCRIÇÃO DO PRODUTO</h2>
                <strong>{target.descricao||"Descrição não disponível"}</strong>
              </section>
            </div>
          </div>

          <section className="biglog-directed__scanner" aria-label="Leitor de código de barras">
            <div className="biglog-directed__scanner-head">
              <span className="biglog-directed__scanner-icon"><ScanLine size={26}/></span>
              <div><h2>BIPE SOMENTE ESTE ITEM</h2>
                <p>Leitor de código de barras · ENTER automático</p></div>
            </div>
            <form onSubmit={register} className="biglog-directed__scan-form">
              <label htmlFor="guided-barcode" className="sr-only">Bipar código de barras do item direcionado</label>
              <input id="guided-barcode" ref={inputRef} type="text" inputMode="none"
                autoComplete="off" autoCapitalize="off" spellCheck={false}
                placeholder="Aguardando bipagem..."
                aria-label="Bipar código de barras somente do item direcionado"
                disabled={!editable||!!blocked}
                value={raw} onChange={e=>setRaw(e.target.value)}/>
            </form>
            <div className="biglog-directed__scanner-hints">
              <span>Somente código de barras deste produto</span>
              <strong>● LEITOR ATIVO</strong>
            </div>
            <div className="biglog-directed__quantity">
              <span>UNIDADES BIPADAS DESTE ITEM</span>
              <strong aria-live="polite">{String(count).padStart(2,"0")}</strong>
            </div>
            <p role="status" aria-live="polite"
              className={"biglog-directed__status"+(success?" biglog-directed__status--ok":"")}>
              {success?<><CheckCircle2 size={17}/> BIPAGEM CORRETA — +1 UNIDADE</>
                :<>● Pronto para receber a leitura</>}
            </p>
          </section>
        </div>
      </main>
      <footer className="biglog-directed__footer">
        <p>Bipe as unidades encontradas. Em seguida, avance para o próximo endereço.</p>
        <div className="biglog-directed__footer-actions">
          <button type="button" className="biglog-directed__next" disabled={!editable||index===items.length-1}
            onClick={nextItem}>
            {index===items.length-1?"ÚLTIMO ITEM":<>PRÓXIMO ITEM <ArrowRight size={23}/></>}
          </button>
          <button type="button" className="biglog-directed__finish"
            disabled={!editable||total===0} onClick={onFinish}>
            <ClipboardCheck size={21}/> FINALIZAR CONTAGEM
          </button>
        </div>
      </footer>
      <div className="biglog-directed__footnote">
        Leituras incorretas não são contabilizadas · O ciclo continua aberto após finalizar a bipagem
      </div>
    </>}

    {blocked!==null&&<div className="biglog-directed__rupture" role="alertdialog"
      aria-modal="true" aria-labelledby="directed-rupture-title">
      <ShieldAlert className="biglog-directed__rupture-icon" strokeWidth={2.7} aria-hidden="true"/>
      <h2 id="directed-rupture-title">RUPTURA</h2>
      <p>CÓDIGO DE BARRAS DIFERENTE DO ITEM DIRECIONADO!</p>
      <div className="biglog-directed__rupture-details">
        <div><span>BIPADO</span><strong>{blocked}</strong></div>
        <div><span>ITEM ESPERADO</span><strong>{target?.codigo}</strong></div>
      </div>
      <button type="button" ref={okRef} onClick={acknowledge} autoFocus>OK</button>
      <small>Nenhuma unidade foi somada. Confira o produto antes de continuar.</small>
    </div>}
  </div>;
}

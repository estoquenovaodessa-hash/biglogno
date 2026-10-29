import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BarChart3, ClipboardCheck, Minus, RefreshCw, Sparkles, TrendingDown, TrendingUp, Truck } from "lucide-react";
import { useCiclos } from "@/lib/ciclos";
import { readSalesVerification } from "@/lib/sales-verification.functions";
import { listDeliveries } from "@/lib/deliveries.functions";
import {
  managerWelcomeSummary, managerWelcomeGreeting, welcomeChange, welcomeMotivation,
  type WelcomeCount, type WelcomeAccuracy,
} from "@/lib/manager-welcome-data";

const phaseDuration = [2900, 2600, 3400, 3400, 3400, 5200];
const pt = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number) => n.toFixed(1).replace(".", ",") + "%";

function WelcomeRobot() {
  // Mascote vetorial exclusivo BigLogno, com luzes e materiais 3D.
  return <svg viewBox="0 0 240 245" className="welcome-robot" role="img" aria-label="Assistente virtual sorridente">
    <defs>
      <linearGradient id="warmor" x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#f1fcff"/><stop offset=".4" stopColor="#85ceff"/><stop offset="1" stopColor="#1261cf"/>
      </linearGradient>
      <radialGradient id="wface"><stop stopColor="#174ca8"/><stop offset="1" stopColor="#020d39"/></radialGradient>
      <filter id="wshadow"><feDropShadow dx="0" dy="8" stdDeviation="9" floodColor="#000e44" floodOpacity=".6"/></filter>
    </defs>
    <g filter="url(#wshadow)">
      <path d="M70 166 Q120 146 170 166 L188 230 Q120 258 53 230Z" fill="url(#warmor)" stroke="#a9f3ff" strokeWidth="3"/>
      <path d="M97 181 Q120 173 142 181 L144 233 L97 233Z" fill="#19489c"/>
      <circle cx="121" cy="211" r="22" fill="#082e70" stroke="#42dfff" strokeWidth="4"/>
      <path d="M109 211q12-14 23 0q-12 14-23 0" fill="none" stroke="#76faff" strokeWidth="4"/>
      <path d="M66 184Q30 182 26 215L54 226L75 207Z" fill="url(#warmor)" stroke="#a9f3ff" strokeWidth="3"/>
      <path d="M173 186Q199 175 202 146L217 153Q214 205 181 217Z" fill="url(#warmor)" stroke="#a9f3ff" strokeWidth="3"/>
      <path d="M203 150Q211 117 219 123Q227 108 233 126Q237 147 220 160Z" fill="url(#warmor)" stroke="#a9f3ff" strokeWidth="3"/>
      <rect x="40" y="19" width="160" height="154" rx="68" fill="url(#warmor)" stroke="#e0ffff" strokeWidth="4"/>
      <path d="M57 72Q118 38 184 72Q193 122 179 138Q118 160 59 136Q43 107 57 72Z" fill="url(#wface)" stroke="#1669e0" strokeWidth="5"/>
      <path d="M78 103q13-17 27 0M135 103q14-17 27 0" fill="none" stroke="#4bdfff" strokeWidth="8" strokeLinecap="round"/>
      <path d="M108 128q12 12 24 0" fill="none" stroke="#8afbff" strokeWidth="5" strokeLinecap="round"/>
      <ellipse cx="42" cy="103" rx="12" ry="26" fill="url(#warmor)" stroke="#9cffff" strokeWidth="3"/>
      <ellipse cx="199" cy="103" rx="12" ry="26" fill="url(#warmor)" stroke="#9cffff" strokeWidth="3"/>
      <path d="M78 44Q118 23 149 40" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="5" strokeLinecap="round"/>
    </g>
    <path d="M202 26l5-10 5 10 10 5-10 5-5 10-5-10-10-5z" fill="#aafcff"/>
  </svg>;
}
function WelcomeNumber({ label, icon: Icon, data, visible, art }: {
  label: string; icon: typeof Truck; data: WelcomeCount | null; visible: boolean; art: string;
}) {
  if (!visible) return null;
  return <article className="welcome-card welcome-appear" aria-label={label}>
    <div className="welcome-card-heading"><span className="welcome-card-icon"><Icon size={27}/></span><h3>{label}</h3></div>
    <p className="welcome-big-number">{data ? pt(data.today) : "—"}</p>
    <p className={"welcome-count-delta " + (data?.difference && data.difference < 0 ? "welcome-delta-down" : "welcome-delta-up")}>
      {data ? <>{data.difference > 0 ? <TrendingUp size={16}/> : data.difference < 0 ? <TrendingDown size={16}/> : <Minus size={16}/>}
        {welcomeChange(data)}</> : "Dados indisponíveis"}
    </p>
    <span className="welcome-art" aria-hidden="true">{art}</span>
    <div className="welcome-wave" aria-hidden="true"/>
  </article>;
}
function WelcomeAccuracyCard({ points, difference, loaded, visible }: {
  points: WelcomeAccuracy[]; difference: number | null; loaded: boolean; visible: boolean;
}) {
  if (!visible) return null;
  const vals = points.map(p=>p.percent);
  const lo = vals.length ? Math.max(0,Math.floor((Math.min(...vals)-6)/10)*10) : 0;
  const hi = vals.length ? Math.min(100,Math.ceil((Math.max(...vals)+6)/10)*10) : 100;
  const span = Math.max(1,hi-lo);
  const dots = points.map((p,i)=>({
    x: 32 + (i/Math.max(points.length-1,1))*294,
    y: 129 - ((p.percent-lo)/span)*94, p,
  }));
  const poly = dots.map(p=>p.x+","+p.y).join(" ");
  const area = dots.length > 1 ? "M "+dots[0].x+" 132 L "+dots.map(p=>p.x+" "+p.y).join(" L ")+" L "+dots.at(-1)!.x+" 132 Z" : "";
  const last = points.at(-1);
  const differenceText = difference === null ? "Sem comparação" :
    (difference < 0 ? "−" : difference > 0 ? "+" : "") + Math.abs(difference).toFixed(1).replace(".",",")+" p.p.";
  return <article className="welcome-card welcome-accuracy welcome-appear" aria-label="Evolução da acuracidade">
    <div className="welcome-card-heading"><span className="welcome-card-icon"><BarChart3 size={27}/></span>
      <h3>Acuracidade<small>Últimos ciclos concluídos</small></h3></div>
    {loaded && dots.length ? <svg className="welcome-chart" viewBox="0 0 354 154" role="img" aria-label={points.map(p=>p.label+": "+pct(p.percent)).join("; ")}>
      <defs><linearGradient id="welcomeFill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#48ddff" stopOpacity=".35"/><stop offset="1" stopColor="#48ddff" stopOpacity="0"/></linearGradient></defs>
      {[34,80,129].map(y=><line key={y} x1="32" x2="326" y1={y} y2={y} stroke="#a8d2ff" strokeOpacity=".24" strokeDasharray="3 5"/>)}
      <text x="0" y="37" fill="#cae9ff" fontSize="10">{hi}%</text>
      <text x="0" y="133" fill="#cae9ff" fontSize="10">{lo}%</text>
      {area && <path d={area} fill="url(#welcomeFill)" className="welcome-graph-area"/>}
      {dots.length > 1 && <polyline points={poly} fill="none" stroke="#69f5ff" strokeWidth="4"
        strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="welcome-graph-line"/>}
      {dots.map((d,i)=><g key={d.p.at}><circle cx={d.x} cy={d.y} r={i===dots.length-1?5.5:4}
        fill="#edffff" stroke="#0b92e7" strokeWidth="2"/><title>{d.p.label+" · "+pct(d.p.percent)}</title></g>)}
    </svg> : <div className="welcome-empty-chart">{loaded ? "Ainda não há ciclos com itens para desenhar a evolução." : "Dados indisponíveis no momento."}</div>}
    <div className="welcome-graph-bottom">
      <div><span>Atual</span><strong>{last ? pct(last.percent) : "—"}</strong></div>
      <div><span>Diferença para o ciclo anterior</span><strong className={difference!==null&&difference<0?"welcome-negative":""}>{differenceText}</strong></div>
    </div>
  </article>;
}

export function ManagerWelcome({ firstName, onDone }: { firstName: string; onDone: () => void }) {
  const [step,setStep] = useState(0);
  const [timeout,setTimeoutReached] = useState(false);
  const when = useMemo(()=>new Date(),[]);
  const {ciclos,ready:cyclesReady} = useCiclos();
  const readSales = useServerFn(readSalesVerification), readDeliveries = useServerFn(listDeliveries);
  const sales = useQuery({queryKey:["apuração-geral","conferencias"],queryFn:()=>readSales(),staleTime:60000,retry:1});
  const deliveries = useQuery({queryKey:["apuração-geral","entregas"],queryFn:()=>readDeliveries(),staleTime:60000,retry:1});
  const ready = cyclesReady && !!sales.data && !!deliveries.data;
  const failed = sales.isError || deliveries.isError || timeout;
  const summary = useMemo(()=>ready ? managerWelcomeSummary(deliveries.data!,sales.data!.records,ciclos,when) : null,
    [ready,deliveries.data,sales.data,ciclos,when]);
  useEffect(()=>{const id=window.setTimeout(()=>setTimeoutReached(true),8500);return()=>window.clearTimeout(id);},[]);
  useEffect(()=>{
    if(step>=6 || (step===1 && !ready && !failed))return;
    const id=window.setTimeout(()=>setStep(s=>Math.min(6,s+1)),[2900,2600,3400,3400,3400,5200][step]);
    return()=>window.clearTimeout(id);
  },[step,ready,failed]);
  useEffect(()=>{const f=(event:KeyboardEvent)=>{if(event.key==="Escape")onDone();};
    window.addEventListener("keydown",f);return()=>window.removeEventListener("keydown",f);},[onDone]);
  const lines=[
    "Olá, "+(firstName?"Gestor(a) "+firstName:"gestor(a)")+"! "+managerWelcomeGreeting(when)+"! 👋 Tudo bem?",
    ready||failed?"Vou te apresentar os resultados de hoje. Vamos conferir juntos? ✨":"Estou organizando os números do dia para você...",
    summary?"Começando pelas entregas! Já finalizamos "+pt(summary.deliveries.today)+" hoje. Cada entrega faz diferença! 🚚":"Vamos acompanhar o andamento das entregas. 🚚",
    summary?"Agora as conferências! Já registramos "+pt(summary.checks.today)+" hoje. Ótimo trabalho em equipe! 📋":"Vamos conferir o trabalho da equipe. 📋",
    summary?"E os ciclos de contagem! São "+pt(summary.cycles.today)+" concluídos hoje. Seguimos em busca da precisão! 🔄":"A contagem fortalece nossa precisão. 🔄",
    "Veja a mudança da acuracidade nos últimos ciclos concluídos. 📈",
    welcomeMotivation(summary?.accuracyDifference??null),
  ];
  return <main className="welcome-screen" aria-label="Apresentação animada do gestor">
    <div className="welcome-grid" aria-hidden="true"/>
    <div className="welcome-shell">
      <header className="welcome-topbar">
        <div className="welcome-brand"><span><Sparkles size={20}/></span> BIGLOGNO <small> / PAINEL DO GESTOR</small></div>
        <button className="welcome-skip" type="button" onClick={onDone}>PULAR <ArrowRight size={16}/></button>
      </header>
      <section className="welcome-dialogue">
        <div className="welcome-mascot"><WelcomeRobot /></div>
        <div className="welcome-dialogue-text">
          <p className="welcome-kicker"><span className="welcome-live"/> ASSISTENTE BIGLOGNO · {summary?.day.split("-").reverse().join("/")??"HOJE"}</p>
          <div key={step} className="welcome-speech" role="status" aria-live="polite"><span className="welcome-speech-icon"><Sparkles size={23}/></span>
            <h1>{lines[step]}</h1>
          </div>
          <p className="welcome-subtitle">{step<2?"Uma apresentação rápida e especial, preparada para você.":step<6?
            "Os indicadores permanecem visíveis enquanto seguimos a apresentação.":"Apresentação concluída. Seu painel está pronto."}</p>
          <div className="welcome-steps" aria-label={"Etapa "+(step+1)+" de 7"}>{Array.from({length:7},(_,i)=>
            <span key={i} className={i<=step?"active":""}/>)}</div>
        </div>
      </section>
      <section className="welcome-cards" aria-label="Indicadores do dia">
        <WelcomeNumber label="Quantidade de entregas" icon={Truck} data={summary?.deliveries??null} visible={step>=2} art="🚚"/>
        <WelcomeNumber label="Quantidade de conferências" icon={ClipboardCheck} data={summary?.checks??null} visible={step>=3} art="📋"/>
        <WelcomeNumber label="Quantidade de ciclos" icon={RefreshCw} data={summary?.cycles??null} visible={step>=4} art="🔄"/>
        <WelcomeAccuracyCard points={summary?.accuracy??[]} difference={summary?.accuracyDifference??null} loaded={!!summary} visible={step>=5}/>
      </section>
      <footer className="welcome-footer">
        {step>=6?<button type="button" className="welcome-ok" onClick={onDone}>OK <ArrowRight size={22}/></button>:
          <p><span className="welcome-live"/> Apresentação automática em andamento</p>}
        <small>Dados reais do BigLogno · Hoje x ontem · Acuracidade por ciclo concluído</small>
      </footer>
    </div>
  </main>;
}

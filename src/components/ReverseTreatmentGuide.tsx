import {useEffect,useState} from "react";
import {useServerFn} from "@tanstack/react-start";
import {toast} from "sonner";
import {BookOpen,CheckCircle2,ClipboardCheck,Download,ExternalLink,FileDown,
  FileText,Mail,MessageCircle,PackageCheck,Phone,Save,Truck,Video} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {
  REVERSE_CONTACT_STEP_LABELS, REVERSE_TUTORIAL_MIRROR_URL,REVERSE_TUTORIAL_FINAL_INVOICE_URL,
  allReverseContactStepsDone,emptyReverseChecklist,reverseWorkflowStage,reverseWhatsAppLink,
  type ReverseCycle,type ReverseSupplier,type ReverseReturnMode,type ReverseContactChecklist,
} from "@/lib/reverse-logistics";
import {saveReverseContactProgress,updateReverseStage} from "@/lib/reverse-logistics.functions";
import {reverseExportPdf} from "@/lib/reverse-logistics-export";
import {createReverseVolumeLabelsPdf,reverseVolumeLabelFilename} from "@/lib/reverse-volume-labels";

const inputStyle="border-sky-400/35 bg-[#061a31] text-white";
const outline="border-sky-400/40 bg-[#153b63] text-white hover:bg-[#235986]";

export function ReverseTreatmentGuide({cycle,supplier,onClose,onUpdated}:{
  cycle:ReverseCycle;
  supplier?:ReverseSupplier;
  onClose:()=>void;
  onUpdated:()=>Promise<void>;
}){
  const saveProgress=useServerFn(saveReverseContactProgress);
  const move=useServerFn(updateReverseStage);
  const stage=reverseWorkflowStage(cycle);
  const [steps,setSteps]=useState<ReverseContactChecklist>(cycle.contactSteps??emptyReverseChecklist());
  const [nfOpen,setNfOpen]=useState(false);
  const [nfd,setNfd]=useState(cycle.nfd??"");
  const [volumes,setVolumes]=useState(String(cycle.volumes??1));
  const [mode,setMode]=useState<ReverseReturnMode|undefined>(cycle.returnMode);
  const [returnNfe,setReturnNfe]=useState(cycle.returnNfe??"");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    setSteps(cycle.contactSteps??emptyReverseChecklist());
    setNfd(cycle.nfd??"");setVolumes(String(cycle.volumes??1));
    setMode(cycle.returnMode);setReturnNfe(cycle.returnNfe??"");
  },[cycle.id,cycle.version]);

  const allChecked=allReverseContactStepsDone(steps);
  const allSaved=allReverseContactStepsDone(cycle.contactSteps);
  const contact=String(supplier?.contactName||cycle.supplier||"Fornecedor");
  const phone=String(supplier?.phone||"");
  const link=phone?reverseWhatsAppLink(phone):null;
  const whatsapp=link?link+"?text="+encodeURIComponent(
    "Olá, "+contact+"! Aqui é da Bignotto Ferramentas. Estamos com uma relação de itens para garantia/devolução da marca "+
    (cycle.brand||"")+". Poderia orientar o procedimento, a análise do espelho da NFDev e o agendamento da coleta?"):null;
  async function run(fn:()=>Promise<void>){
    if(busy)return;
    setBusy(true);setError("");
    try{await fn();await onUpdated();}
    catch(e){const message=e instanceof Error?e.message:"Não foi possível concluir a operação.";setError(message);toast.error(message);}
    finally{setBusy(false);}
  }
  async function saveChecklist(advance:boolean){
    await run(async()=>{
      await saveProgress({data:{id:cycle.id,version:cycle.version,steps}});
      toast.success(advance?"Passos registrados. Informe NF de devolução e volumes.":"Progresso salvo. Você pode continuar depois.");
      if(advance)setNfOpen(true);
    });
  }
  async function changeAwaiting(){
    const count=Number(volumes);
    if(!nfd.trim()||!Number.isSafeInteger(count)||count<1||count>500){
      setError("Informe a NF de devolução e a quantidade de volumes entre 1 e 500.");return;
    }
    await run(async()=>{
      const updated=await move({data:{id:cycle.id,version:cycle.version,
        status:"aguardando_coleta",nfd:nfd.trim(),volumes:count}});
      setNfOpen(false);
      try{
        createReverseVolumeLabelsPdf(updated).save(reverseVolumeLabelFilename(updated));
        toast.success("Aguardando coleta. As etiquetas de volumes foram geradas em um PDF único.");
      }catch(e){
        console.error("Erro gerando etiquetas após salvar a NFD",e);
        toast.error("Status salvo, mas o PDF de volumes não foi baixado. Use Reimprimir etiquetas no card.");
      }
    });
  }
  async function changeCollected(){
    await run(async()=>{
      await move({data:{id:cycle.id,version:cycle.version,status:"coletado"}});
      toast.success("Material marcado como coletado. Acompanhe a resolução com o fornecedor.");
    });
  }
  async function changeResolved(){
    if(!mode||(mode==="devolucao_material"&&!returnNfe.trim())){
      setError("Escolha Abatimento ou Material novo e informe a NF-e de retorno quando necessário.");return;
    }
    await run(async()=>{
      await move({data:{id:cycle.id,version:cycle.version,status:"resolvido",
        returnMode:mode,returnNfe:mode==="devolucao_material"?returnNfe.trim():undefined}});
      toast.success("Tratativa finalizada. Os dados permanecem disponíveis para consulta.");
    });
  }
  const flow=[
    {step:1,label:"Separação dos itens",done:cycle.status==="finalizado"},
    {step:2,label:"Contato e NFDev",done:stage==="aguardando_coleta"||stage==="coletado"||stage==="resolvido"},
    {step:3,label:"Coleta do material",done:stage==="coletado"||stage==="resolvido"},
    {step:4,label:"Resolução",done:stage==="resolvido"},
  ];
  return <Dialog open onOpenChange={o=>{if(!o&&!busy)onClose();}}>
    <DialogContent className="flex max-h-[92dvh] w-[calc(100%-1rem)] max-w-4xl flex-col gap-3 overflow-hidden border-sky-300/45 bg-[#092749]/95 p-4 text-white shadow-2xl backdrop-blur-xl sm:p-6">
      <DialogHeader><DialogTitle className="flex items-center gap-2 text-xl"><BookOpen className="text-sky-300"/>
        Orientador virtual · Log. Rev. nº {cycle.number}</DialogTitle>
        <DialogDescription className="text-sky-200">Fornecedor: <strong>{cycle.supplier||"A informar"}</strong> · Marca: <strong>{cycle.brand||"A informar"}</strong></DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {flow.map(part=><div key={part.step} className={"rounded-lg border p-2 text-xs "+
          (part.done?"border-emerald-400/40 bg-emerald-600/15 text-emerald-200":
          "border-sky-400/35 bg-[#153b61] text-sky-100")}>
          <div className="flex items-center gap-2 font-bold">
            {part.done?<CheckCircle2 size={15}/>:<span className="rounded-full bg-sky-300/15 px-2 py-0.5">{part.step}</span>}
            {part.label}
          </div>
        </div>)}
      </div>
      <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
        {error&&<p role="alert" className="rounded-lg border border-rose-400/40 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p>}
        {!cycle.supplierId||!cycle.brand?<div className="rounded-xl border border-amber-400/35 bg-amber-950/25 p-4 text-amber-100">
          <strong>Fornecedor e marca ainda não vinculados.</strong> Feche este guia e utilize o botão Editar fornecedor/marca do card.
        </div>:null}
        {stage==="em_contagem"&&<p className="rounded-xl bg-[#153c64] p-4 text-sky-200">
          Primeiro finalize a separação dos itens e confirme as quantidades. Depois poderá iniciar as tratativas.</p>}
        {stage==="em_tratativa"&&<>
          <div className="rounded-xl border border-sky-400/35 bg-gradient-to-r from-[#144777] to-[#102d50] p-4">
            <h3 className="flex items-center gap-2 text-lg font-extrabold"><MessageCircle className="text-cyan-300"/> Fase 2 · Contato com o fornecedor</h3>
            <p className="mt-2 text-sm text-sky-100">Olá, operador! 👋 Você já tem a relação de itens. Converse preferencialmente pelo WhatsApp e pergunte
              qual é o procedimento de garantia/devolução da marca <strong>{cycle.brand}</strong>.
              Explique que o espelho da <strong>NFDev (Nota Fiscal de Devolução)</strong> será emitido após a orientação do fornecedor.</p>
            <p className="mt-2 text-sm text-sky-200">Contato: <strong>{supplier?.contactName||"Não cadastrado"}</strong> · {supplier?.phone||"WhatsApp não cadastrado"} · {supplier?.email||"E-mail não cadastrado"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {whatsapp?<a href={whatsapp} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-500">
                <MessageCircle size={17}/> Abrir WhatsApp Web <ExternalLink size={13}/></a>:
                <span className="rounded-lg border border-amber-400/25 px-3 py-2 text-xs text-amber-200">Cadastre um celular para usar WhatsApp</span>}
              {supplier?.email&&<a href={"mailto:"+supplier.email+"?subject="+encodeURIComponent("Logística Reversa - Bignotto - Marca "+cycle.brand)}
                className={"inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm "+outline}>
                <Mail size={16}/> Enviar e-mail</a>}
              {supplier?.phone&&<a href={"tel:"+supplier.phone.replace(/[^\d+]/g,"")}
                className={"inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm "+outline}>
                <Phone size={16}/> Ligar</a>}
            </div>
          </div>
          <div className="rounded-xl border border-sky-400/30 bg-[#102d4b] p-4">
            <h4 className="flex items-center gap-2 text-base font-bold"><FileText size={18} className="text-sky-300"/> Materiais de apoio</h4>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Button variant="outline" className={"h-auto min-h-14 gap-2 whitespace-normal text-left "+outline}
                disabled={busy}
                onClick={()=>void reverseExportPdf(cycle).then(()=>toast.success("PDF baixado. Envie a relação de itens ao fornecedor.")).catch(()=>toast.error("Não foi possível gerar a relação de itens."))}>
                <Download size={18}/> Relação de itens
              </Button>
              <Button variant="outline" className={"h-auto min-h-14 gap-2 whitespace-normal text-left "+outline}
                disabled={busy||!REVERSE_TUTORIAL_MIRROR_URL}
                onClick={()=>{if(REVERSE_TUTORIAL_MIRROR_URL)window.open(REVERSE_TUTORIAL_MIRROR_URL,"_blank","noopener,noreferrer");toast.info("Veja o vídeo que ensina como gerar o espelho de NFDev.");}}>
                <Video size={18}/> Como gerar espelho NFDev
              </Button>
              <Button variant="outline" className={"h-auto min-h-14 gap-2 whitespace-normal text-left "+outline}
                disabled={busy||!REVERSE_TUTORIAL_FINAL_INVOICE_URL}
                onClick={()=>{if(REVERSE_TUTORIAL_FINAL_INVOICE_URL)window.open(REVERSE_TUTORIAL_FINAL_INVOICE_URL,"_blank","noopener,noreferrer");toast.info("Veja o vídeo de emissão da NF-e definitiva de devolução.");}}>
                <Video size={18}/> Como gerar NF-e de devolução
              </Button>
            </div>
            <p className="mt-2 text-xs text-sky-200">Após baixar a Relação de itens, envie o PDF ao fornecedor. Os links dos vídeos serão habilitados quando forem fornecidos.</p>
          </div>
          <div className="rounded-xl border border-sky-400/30 bg-[#102d4b] p-4">
            <h4 className="flex items-center gap-2 text-base font-extrabold"><ClipboardCheck size={19} className="text-sky-300"/> Consegui te ajudar? Vamos verificar! ✅</h4>
            <p className="mt-1 text-xs text-sky-200">Marque cada etapa realmente concluída. É possível salvar e voltar depois.</p>
            <div className="mt-3 space-y-2">
              {REVERSE_CONTACT_STEP_LABELS.map(({key,label})=><label key={key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-sky-500/25 bg-[#09233e] p-3 text-sm">
                <input type="checkbox" className="h-5 w-5 shrink-0 accent-sky-500" disabled={busy} checked={steps[key]}
                  onChange={e=>setSteps(previous=>({...previous,[key]:e.target.checked}))}/>
                {label}</label>)}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" className={outline} disabled={busy||!cycle.supplierId}
                onClick={()=>void saveChecklist(false)}><Save size={16} className="mr-2"/> Salvar progresso</Button>
              <Button className="bg-emerald-600 text-white hover:bg-emerald-500" disabled={busy||!allChecked||!cycle.supplierId}
                onClick={()=>void saveChecklist(true)}>
                <CheckCircle2 size={16} className="mr-2"/> Próximo passo</Button>
            </div>
            {!allChecked&&<p className="mt-2 text-xs font-medium text-amber-300">O próximo passo é liberado somente após marcar as quatro confirmações.</p>}
          </div>
        </>}
        {stage==="em_tratativa"&&(nfOpen||allSaved)&&<div className="rounded-xl border border-emerald-400/40 bg-emerald-900/20 p-4">
          <h4 className="text-base font-extrabold">Fase 3 · Aguardando coleta</h4>
          <p className="mt-1 text-sm text-sky-200">Para mudar o status, informe a NF definitiva de devolução e quantos volumes estão preparados.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold">Nº NF de devolução *
              <Input className={inputStyle} maxLength={80} value={nfd} onChange={e=>setNfd(e.target.value)} placeholder="Nº da NFD"/></label>
            <label className="space-y-1 text-sm font-semibold">Quantidade de volumes *
              <Input className={inputStyle} min={1} max={500} type="number" value={volumes} onChange={e=>setVolumes(e.target.value)}/></label>
          </div>
          <Button className="mt-3 bg-emerald-600 text-white hover:bg-emerald-500" disabled={busy||!allSaved||!nfd.trim()||!volumes}
            onClick={()=>void changeAwaiting()}><Truck size={17} className="mr-2"/> Salvar: Aguardando coleta + gerar etiquetas</Button>
        </div>}
        {stage==="aguardando_coleta"&&<div className="space-y-3 rounded-xl border border-amber-400/35 bg-amber-950/20 p-4">
          <h3 className="flex items-center gap-2 text-lg font-bold"><Truck className="text-amber-300"/> Aguardando coleta</h3>
          <p className="text-sm text-sky-100">Quando o fornecedor retirar o material, clique em <strong>Editar → Status: Coletado</strong>.
            Continue acompanhando se a solução será abatimento em boleto ou material novo.</p>
          <p className="text-sm text-sky-200">NFDev: <strong>{cycle.nfd}</strong> · Volumes: <strong>{cycle.volumes}</strong></p>
          <Button variant="outline" className={outline} disabled={busy} onClick={()=>setNfOpen(o=>!o)}>
            <FileText size={16} className="mr-2"/> {nfOpen?"Ocultar edição de NF / volumes":"Editar NF e volumes"}</Button>
          {nfOpen&&<div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-bold">Nº da NFDev<Input className={inputStyle} value={nfd} onChange={e=>setNfd(e.target.value)}/></label>
            <label className="text-xs font-bold">Volumes<Input className={inputStyle} type="number" min={1} max={500} value={volumes} onChange={e=>setVolumes(e.target.value)}/></label>
            <Button disabled={busy||!nfd.trim()} onClick={()=>void changeAwaiting()} className="bg-sky-600 text-white sm:col-span-2">
              Salvar alterações e gerar etiquetas</Button>
          </div>}
          <Button className="bg-sky-600 text-white" disabled={busy} onClick={()=>void changeCollected()}>
            <PackageCheck size={17} className="mr-2"/> Editar status → Coletado</Button>
        </div>}
        {(stage==="coletado"||stage==="resolvido")&&<div className="space-y-3 rounded-xl border border-sky-400/35 bg-[#102f52] p-4">
          <h3 className="flex items-center gap-2 text-lg font-extrabold"><PackageCheck size={20} className="text-sky-300"/>
            {stage==="coletado"?"Material coletado · Aguardando resolução":"Tratativa finalizada"}</h3>
          <p className="text-sm text-sky-200">{stage==="coletado"
            ?"Acompanhe o fornecedor. Após receber a solução, clique em Editar → Finalizado e informe qual tratativa foi realizada."
            :"O ciclo está resolvido e permanece disponível para consulta e eventuais correções."}</p>
          <p className="text-sm">NFDev: <strong>{cycle.nfd}</strong> · Volumes: <strong>{cycle.volumes}</strong></p>
          <h4 className="text-sm font-extrabold">Qual foi a tratativa?</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" disabled={busy} onClick={()=>setMode("abatimento_boleto")}
              className={"rounded-xl border p-4 text-left text-sm font-bold "+(mode==="abatimento_boleto"?
                "border-emerald-300 bg-emerald-700/25 text-white":"border-sky-400/35 bg-[#0b2545]")}>
              <CheckCircle2 size={18} className="mb-2"/> Abatimento em boleto
            </button>
            <button type="button" disabled={busy} onClick={()=>setMode("devolucao_material")}
              className={"rounded-xl border p-4 text-left text-sm font-bold "+(mode==="devolucao_material"?
                "border-emerald-300 bg-emerald-700/25 text-white":"border-sky-400/35 bg-[#0b2545]")}>
              <PackageCheck size={18} className="mb-2"/> Material novo
            </button>
          </div>
          {mode==="devolucao_material"&&<label className="block space-y-1 text-sm font-bold">Nº da NF-e de Retorno de Remessa *
            <Input className={inputStyle} maxLength={80} value={returnNfe} onChange={e=>setReturnNfe(e.target.value)} placeholder="NF-e de retorno do material"/></label>}
          <Button className="bg-emerald-600 text-white" disabled={busy||!mode||(mode==="devolucao_material"&&!returnNfe.trim())}
            onClick={()=>void changeResolved()}><CheckCircle2 className="mr-2 h-4 w-4"/>
            {stage==="resolvido"?"Salvar correção da tratativa":"Editar status → Finalizado"}</Button>
        </div>}
      </div>
      <div className="flex justify-end border-t border-sky-400/25 pt-3">
        <Button variant="outline" className={outline} disabled={busy} onClick={onClose}>Fechar orientador</Button>
      </div>
    </DialogContent>
  </Dialog>;
}

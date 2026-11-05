import { useDeferredValue, useMemo, useState } from "react";
import { CheckCircle2, CheckSquare2, FileDown, Printer, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  conferencePrintSummary,filterConferencePrintStatus,isConferenceLabelPrinted,
  type ConferencePrintEntry,type ConferencePrintFilter,
} from "@/lib/conference-label-print-state";
import {
  eligibleConferenceLabelRecords, conferenceLabelsForDay,
  conferenceLabelKind, filterConferenceLabelRecords,
  type ConferenceLabelKind,
} from "@/lib/conference-label-selection";
import { createConferenceLabelsPdf, conferenceLabelsBatchFilename } from "@/lib/conference-label";
import { salesDay } from "@/lib/sales-weekly";

const PAGE_SIZE=80;
const fieldStyle="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground";
const dateText=(s:string)=>new Date(s).toLocaleDateString("pt-BR",{
  timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric",
});

/** Impressão independente dos filtros do painel, inclusive para dias antigos.
 * PDF com um documento por página de 60x30mm. */
export function ConferenceLabelBatchActions({records,onGenerated}:{
  records:ConferencePrintEntry[];
  onGenerated:(ids:string[])=>Promise<void>;
}){
  const [open,setOpen]=useState(false);
  const [search,setSearch]=useState("");
  const deferredSearch=useDeferredValue(search);
  const [from,setFrom]=useState("");
  const [to,setTo]=useState("");
  const [kind,setKind]=useState<"all"|ConferenceLabelKind>("all");
  const [printFilter,setPrintFilter]=useState<ConferencePrintFilter>("all");
  const [selected,setSelected]=useState<Set<string>>(()=>new Set());
  const [limit,setLimit]=useState(PAGE_SIZE);
  const [printing,setPrinting]=useState(false);

  const eligible=useMemo(()=>eligibleConferenceLabelRecords(records),[records]);
  const today=salesDay(new Date());
  const todayRecords=useMemo(()=>conferenceLabelsForDay(eligible,today),[eligible,today]);
  const todayPending=useMemo(()=>filterConferencePrintStatus(todayRecords,"pending"),[todayRecords]);
  const summary=useMemo(()=>conferencePrintSummary(eligible),[eligible]);
  const invalidDate=Boolean(from&&to&&from>to);
  const filtered=useMemo(()=>invalidDate?[]:filterConferencePrintStatus(
    filterConferenceLabelRecords(eligible,{from,to,kind,query:deferredSearch}),printFilter,
  ),[eligible,from,to,kind,deferredSearch,printFilter,invalidDate]);
  const visible=filtered.slice(0,limit);
  const selectedRecords=eligible.filter(r=>selected.has(r.id));
  const allFilteredSelected=Boolean(filtered.length)&&filtered.every(r=>selected.has(r.id));

  function beginSelection(){
    setSelected(new Set());setSearch("");setFrom("");setTo("");
    setKind("all");setPrintFilter("all");setLimit(PAGE_SIZE);setOpen(true);
  }
  function toggle(id:string,checked:boolean){
    setSelected(previous=>{
      const next=new Set(previous);
      if(checked)next.add(id);else next.delete(id);
      return next;
    });
  }
  function selectFiltered(){
    setSelected(previous=>{
      const next=new Set(previous);
      if(allFilteredSelected)filtered.forEach(r=>next.delete(r.id));
      else filtered.forEach(r=>next.add(r.id));
      return next;
    });
  }
  async function download(rows:ConferencePrintEntry[],mode:"hoje"|"selecionadas"){
    if(!rows.length){toast.error("Não há pedidos de Entrega ou Retira selecionados.");return;}
    if(rows.length>600&&!window.confirm("O PDF terá "+rows.length+" etiquetas. Deseja continuar?"))return;
    const already=rows.filter(isConferenceLabelPrinted).length;
    if(already && !window.confirm(already+" etiqueta(s) selecionada(s) já têm PDF gerado. Deseja GERAR NOVAMENTE mesmo assim?"))return;
    setPrinting(true);
    let pdfGenerated=false;
    try{
      createConferenceLabelsPdf(rows).save(conferenceLabelsBatchFilename(mode,today));
      pdfGenerated=true;
      await onGenerated(rows.map(r=>r.id));
      toast.success("PDF gerado com "+rows.length+" etiqueta(s). Todas foram marcadas em verde.");
    }catch(error){
      console.error("Erro ao gerar / registrar etiquetas da Conferência",error);
      toast.error(pdfGenerated
        ?"PDF baixado, mas não foi possível salvar todas as marcações verdes. Atualize a lista e confira os status."
        :error instanceof Error?error.message:"Não foi possível gerar o PDF.");
    }finally{setPrinting(false);}
  }

  return <>
    <Button type="button" size="sm" variant="outline" className="gap-1.5"
      title="Um único PDF com os pedidos de Entrega e Retira de hoje, independente dos filtros do painel"
      disabled={printing||!todayRecords.length} onClick={()=>void download(todayRecords,"hoje")}>
      <Printer className="h-4 w-4"/> Etiquetas de hoje
      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-bold">{todayRecords.length}</span>
    </Button>
    <Button type="button" size="sm" variant="outline" className="gap-1.5"
      title="Gerar somente etiquetas de hoje que ainda não têm PDF gerado"
      disabled={printing||!todayPending.length} onClick={()=>void download(todayPending,"hoje")}>
      <Printer className="h-4 w-4"/> Pendentes de hoje
      <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs font-bold">{todayPending.length}</span>
    </Button>
    <Button type="button" size="sm" variant="outline" className="gap-1.5"
      title="Selecionar conferências de dias anteriores para PDF único"
      disabled={printing||!eligible.length} onClick={beginSelection}>
      <CheckSquare2 className="h-4 w-4"/> Selecionar etiquetas
    </Button>

    <Dialog open={open} onOpenChange={value=>{if(!value&&!printing)setOpen(false);}}>
      <DialogContent className="flex max-h-[91dvh] w-[calc(100%-1rem)] max-w-5xl flex-col gap-3 overflow-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Printer className="h-5 w-5 text-primary"/> Selecionar etiquetas de conferência</DialogTitle>
          <DialogDescription>
            Marque pedidos de Entrega ou Retira de qualquer data. Cada página do PDF único mede 60 × 30 mm, no padrão da Argox.
            Os que já tiveram PDF gerado aparecem em verde; você pode selecionar apenas os pendentes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_1.4fr]">
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">De
            <input type="date" className={fieldStyle} value={from} onChange={e=>{setFrom(e.target.value);setLimit(PAGE_SIZE);}} aria-label="Data inicial das etiquetas"/>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">Até
            <input type="date" className={fieldStyle} value={to} onChange={e=>{setTo(e.target.value);setLimit(PAGE_SIZE);}} aria-label="Data final das etiquetas"/>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">Tipo
            <select className={fieldStyle} value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setLimit(PAGE_SIZE);}} aria-label="Filtrar tipo de pedido">
              <option value="all">Entrega e Retira</option>
              <option value="entrega">Somente Entrega</option>
              <option value="retira">Somente Retira</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">Impressão
            <select className={fieldStyle} value={printFilter}
              onChange={e=>{setPrintFilter(e.target.value as ConferencePrintFilter);setLimit(PAGE_SIZE);}}
              aria-label="Filtrar etiquetas já geradas ou pendentes">
              <option value="all">Todas</option>
              <option value="pending">Pendentes</option>
              <option value="printed">PDFs gerados</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">Buscar
            <span className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
              <Input className="h-9 pl-9" value={search} onChange={e=>{setSearch(e.target.value);setLimit(PAGE_SIZE);}}
                placeholder="Documento, cliente, conferente..." aria-label="Buscar conferências para etiquetas"/></span>
          </label>
        </div>
        {invalidDate&&<p role="alert" className="text-sm font-semibold text-destructive">Data inicial posterior à final.</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
          <span>{filtered.length} encontrado(s) · {selectedRecords.length} marcado(s) ·
            <strong className="ml-1 text-emerald-700 dark:text-emerald-300">{summary.printed} gerada(s)</strong> /
            <strong className="ml-1 text-amber-700 dark:text-amber-300">{summary.pending} pendente(s)</strong>
          </span>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={!filtered.length||printing||invalidDate}
              onClick={selectFiltered}>{allFilteredSelected?"Desmarcar resultados":"Marcar todos os resultados"}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={!selected.size||printing}
              onClick={()=>setSelected(new Set())}><X className="mr-1 h-3.5 w-3.5"/> Limpar seleção</Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
          <table className="w-full min-w-[690px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-foreground">
              <tr>{["Marcar","Data","Documento","Cliente","Tipo","Itens","Conferente","Situação"].map(h=>
                <th key={h} scope="col" className="border-b border-border px-3 py-2 text-xs font-bold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {visible.map(r=><tr key={r.id}
                className={isConferenceLabelPrinted(r)
                  ?"bg-emerald-100/85 text-emerald-950 hover:bg-emerald-200/85 dark:bg-emerald-950/55 dark:text-emerald-100 dark:hover:bg-emerald-900/65"
                  :"hover:bg-muted/40"}>
                <td className="px-3 py-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={selected.has(r.id)}
                  aria-label={"Selecionar documento "+r.document} onChange={e=>toggle(r.id,e.target.checked)}/></td>
                <td className="whitespace-nowrap px-3 py-2">{dateText(r.createdAt)}</td>
                <td className="px-3 py-2 font-bold tabular-nums">{r.document}</td>
                <td className="max-w-[300px] break-words px-3 py-2">{r.clientName}</td>
                <td className="px-3 py-2">{conferenceLabelKind(r)==="entrega"?"Entrega":"Retira"}</td>
                <td className="px-3 py-2 tabular-nums">{r.items}</td>
                <td className="px-3 py-2">{r.verifierName}</td>
                <td className="px-3 py-2">
                  {isConferenceLabelPrinted(r)
                    ?<span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 dark:text-emerald-200">
                      <CheckCircle2 className="h-4 w-4"/> PDF gerado
                    </span>
                    :<span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Pendente</span>}
                </td>
              </tr>)}
            </tbody>
          </table>
          {!filtered.length&&<p className="p-6 text-center text-sm text-muted-foreground">
            {invalidDate?"Corrija as datas.":"Nenhum pedido de Entrega ou Retira encontrado."}
          </p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Exibindo {visible.length} de {filtered.length}. A seleção permanece marcada ao mudar os filtros.</span>
          {filtered.length>limit&&<Button type="button" size="sm" variant="outline"
            onClick={()=>setLimit(n=>n+PAGE_SIZE)}>Mostrar mais ({filtered.length-limit})</Button>}
        </div>
        <DialogFooter className="border-t border-border pt-3">
          <Button type="button" variant="outline" disabled={printing} onClick={()=>setOpen(false)}>Cancelar</Button>
          <Button type="button" className="gap-2" disabled={!selectedRecords.length||printing}
            onClick={()=>void download(selectedRecords,"selecionadas")}>
            <FileDown className="h-4 w-4"/> Gerar PDF único ({selectedRecords.length} etiquetas)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

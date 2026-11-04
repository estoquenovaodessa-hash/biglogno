import {useDeferredValue,useMemo,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {ClipboardCheck,FileDown,Printer,RefreshCw,Search} from "lucide-react";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {ConferenceLabelBatchActions} from "./ConferenceLabelBatchActions";
import {useActiveEmployee} from "./EmployeeGate";
import {readOperatorConferenceLabels} from "@/lib/conference-labels.functions";
import {conferenceLabelKind,conferenceLabelsForDay,filterConferenceLabelRecords} from "@/lib/conference-label-selection";
import {createConferenceLabelPdf,conferenceLabelFilename} from "@/lib/conference-label";
import {salesDay} from "@/lib/sales-weekly";

const PAGE_SIZE=100;
const dateText=(s:string)=>new Date(s).toLocaleDateString("pt-BR",{
  timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric",
});

/** Central de impressão transferida da Conferência do gestor.
 * Não há criação, edição ou exclusão de conferências nesta tela.
 */
export function OperatorConferenceLabels(){
  const read=useServerFn(readOperatorConferenceLabels);
  const {employee}=useActiveEmployee();
  const query=useQuery({
    queryKey:["operator-conference-labels",employee?.id],
    queryFn:()=>read(),
    enabled:!!employee?.id,
    refetchOnWindowFocus:true,
    staleTime:60000,
  });
  const records=query.data??[];
  const [search,setSearch]=useState("");
  const deferredSearch=useDeferredValue(search);
  const [from,setFrom]=useState("");
  const [to,setTo]=useState("");
  const [kind,setKind]=useState<"all"|"entrega"|"retira">("all");
  const [limit,setLimit]=useState(PAGE_SIZE);
  const [printingId,setPrintingId]=useState<string|null>(null);
  const today=salesDay(new Date());
  const todayCount=useMemo(()=>conferenceLabelsForDay(records,today).length,[records,today]);
  const invalidDate=Boolean(from&&to&&from>to);
  const filtered=useMemo(()=>invalidDate?[]:filterConferenceLabelRecords(records,{
    from,to,kind,query:deferredSearch,
  }),[records,from,to,kind,deferredSearch,invalidDate]);
  const visible=filtered.slice(0,limit);

  function printOne(record:(typeof records)[number]){
    setPrintingId(record.id);
    try{
      createConferenceLabelPdf(record).save(conferenceLabelFilename(record));
      toast.success("Etiqueta do documento "+record.document+" gerada em 60 × 30 mm.");
    }catch(error){
      console.error("Erro gerando etiqueta da Conferência",error);
      toast.error("Não foi possível gerar esta etiqueta.");
    }finally{
      setPrintingId(null);
    }
  }
  return <section id="conference-labeling" className="space-y-5" aria-label="Etiquetagem da Conferência">
    <header className="rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-card to-card p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Módulo Conferência</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-extrabold sm:text-2xl">
            <ClipboardCheck className="h-6 w-6 text-primary"/> Etiquetas de conferência
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Etiquetas de pedidos classificados como <strong>Entrega</strong> ou <strong>Retira</strong>.
            Gere uma etiqueta individual ou reúna várias em um único PDF de 60 × 30 mm.
          </p>
        </div>
        <Button type="button" variant="outline" className="gap-2" disabled={query.isFetching}
          onClick={()=>void query.refetch()}>
          <RefreshCw className={"h-4 w-4 "+(query.isFetching?"animate-spin":"")}/>
          Atualizar conferências
        </Button>
      </div>
    </header>

    {query.isLoading&&<div role="status" className="rounded-xl border bg-card p-5 text-sm">
      Carregando conferências para impressão…
    </div>}
    {query.isError&&<div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
      <p className="text-sm font-semibold text-destructive">
        {query.error instanceof Error?query.error.message:"Não foi possível consultar as conferências."}
      </p>
      <Button type="button" size="sm" variant="outline" className="mt-3" onClick={()=>void query.refetch()}>Tentar novamente</Button>
    </div>}
    {query.isSuccess&&<>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mr-auto">
          <p className="text-sm font-extrabold">Impressão em lote</p>
          <p className="text-xs text-muted-foreground">{todayCount} etiqueta(s) de hoje · {records.length} pedidos elegíveis no histórico</p>
        </div>
        <ConferenceLabelBatchActions records={records}/>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold">Impressão individual</h3>
            <p className="text-xs text-muted-foreground">
              Busque por documento ou cliente, inclusive de datas anteriores.
            </p>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">{filtered.length} resultado(s)</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <label className="space-y-1 text-xs font-semibold text-muted-foreground">Pesquisar
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
              <Input className="pl-9" placeholder="Documento, cliente, conferente..."
                aria-label="Buscar etiqueta por documento ou cliente"
                value={search} onChange={e=>{setSearch(e.target.value);setLimit(PAGE_SIZE);}}/>
            </span>
          </label>
          <label className="space-y-1 text-xs font-semibold text-muted-foreground">De
            <input type="date" aria-label="Data inicial das conferências" value={from}
              onChange={e=>{setFrom(e.target.value);setLimit(PAGE_SIZE);}}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"/>
          </label>
          <label className="space-y-1 text-xs font-semibold text-muted-foreground">Até
            <input type="date" aria-label="Data final das conferências" value={to}
              onChange={e=>{setTo(e.target.value);setLimit(PAGE_SIZE);}}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"/>
          </label>
          <label className="space-y-1 text-xs font-semibold text-muted-foreground">Tipo de pedido
            <select aria-label="Tipo de pedido da etiqueta" value={kind}
              onChange={e=>{setKind(e.target.value as typeof kind);setLimit(PAGE_SIZE);}}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
              <option value="all">Entrega e Retira</option>
              <option value="entrega">Somente Entrega</option>
              <option value="retira">Somente Retira</option>
            </select>
          </label>
        </div>
        {invalidDate&&<p role="alert" className="mt-3 text-sm font-semibold text-destructive">
          A data inicial não pode ser posterior à data final.</p>}
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-muted/80 text-foreground">
              <tr>{["Data","Documento","Cliente","Tipo","Qtd. itens","Conferente","Etiqueta"].map(h=>
                <th key={h} scope="col" className="px-3 py-3 text-xs font-bold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {visible.map(r=><tr key={r.id} className="hover:bg-muted/40">
                <td className="whitespace-nowrap px-3 py-2">{dateText(r.createdAt)}</td>
                <td className="px-3 py-2 font-mono font-extrabold">{r.document}</td>
                <td className="max-w-[320px] break-words px-3 py-2">{r.clientName}</td>
                <td className="px-3 py-2 font-semibold">{conferenceLabelKind(r)==="entrega"?"Entrega":"Retira"}</td>
                <td className="px-3 py-2 tabular-nums">{r.items}</td>
                <td className="px-3 py-2">{r.verifierName}</td>
                <td className="px-3 py-2">
                  <Button type="button" size="sm" variant="outline" className="gap-1.5"
                    aria-label={"Gerar etiqueta da conferência "+r.document}
                    disabled={printingId===r.id} onClick={()=>printOne(r)}>
                    <FileDown className="h-4 w-4"/> PDF
                  </Button>
                </td>
              </tr>)}
            </tbody>
          </table>
          {!filtered.length&&<p className="p-6 text-center text-sm text-muted-foreground">
            {invalidDate?"Corrija o intervalo de datas.":"Não foram encontradas conferências de Entrega ou Retira."}
          </p>}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>Mostrando {visible.length} de {filtered.length} registros.</span>
          {filtered.length>limit&&<Button type="button" size="sm" variant="outline"
            onClick={()=>setLimit(n=>n+PAGE_SIZE)}>Carregar mais ({filtered.length-limit})</Button>}
        </div>
      </div>
    </>}
  </section>;
}

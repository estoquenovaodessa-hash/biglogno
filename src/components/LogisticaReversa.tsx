import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {RotateCcw,Eye,PackageCheck,ClipboardList,Search,X} from "lucide-react";
import {listReverseCycles} from "@/lib/reverse-logistics.functions";
import {reverseIncluded,reverseTotal,reverseStatusLabel,reverseNormalizeSearch,type ReverseCycle} from "@/lib/reverse-logistics";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

const when=(iso?:string)=>iso?new Date(iso).toLocaleString("pt-BR",{
  timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short",
}):"—";
export function LogisticaReversa(){
 const read=useServerFn(listReverseCycles);
 const q=useQuery({queryKey:["reverse-logistics-cycles"],queryFn:()=>read(),refetchInterval:15000});
 const [selectedId,setSelectedId]=useState<string|null>(null),[query,setQuery]=useState("");
 const records=q.data??[],active=records.find(c=>c.id===selectedId)??null;
 const filtered=records.filter(c=>reverseNormalizeSearch(c.number+" "+(c.supplier??"")+" "+reverseStatusLabel(c))
   .includes(reverseNormalizeSearch(query)));
 return <section className="mx-auto max-w-[1600px] space-y-4" aria-label="Logística Reversa">
  <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-500/40 bg-gradient-to-r from-[#123d72] to-[#081b37] p-5 text-white">
   <div className="flex items-center gap-3"><span className="rounded-xl bg-sky-400/15 p-3 text-sky-300"><RotateCcw size={29}/></span>
    <div><h2 className="text-xl font-extrabold sm:text-2xl">Logística Reversa</h2><p className="text-sm text-sky-200">Acompanhamento gerencial de devoluções por fornecedor · somente consulta</p></div></div>
   <span className="rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-200">{records.length} ciclos</span>
  </header>
  {q.isError&&<p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-3 text-sm">Não foi possível carregar a Logística Reversa. Execute o SQL do módulo no Supabase e atualize a página.</p>}
  <div className="rounded-xl border border-[#27537d] bg-[#0d2744] p-4 text-white">
   <label className="relative mb-4 block"><Search size={17} className="absolute left-3 top-3 text-sky-300"/><Input value={query} onChange={e=>setQuery(e.target.value)}
     className="border-sky-500/40 bg-[#091f3b] pl-10 text-white" placeholder="Pesquisar fornecedor, ciclo ou status..."/></label>
   <div className="overflow-x-auto rounded-lg border border-[#2b577d]">
    <table className="min-w-[800px] w-full text-left text-sm">
     <thead className="bg-[#174673] text-sky-100"><tr>{["Ciclo","Nome do fornecedor","Status","Data da criação","Data da mudança de status","Ver mais"].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead>
     <tbody className="divide-y divide-sky-400/15">{filtered.map(c=><tr key={c.id} className="bg-[#102e4e] text-sky-50 hover:bg-[#19446e]">
      <td className="p-3 font-bold">Nº {c.number}</td><td className="max-w-[250px] break-words p-3 font-semibold">{c.supplier||"Ainda não informado"}</td>
      <td className="p-3"><span className={"rounded-lg border px-2 py-1 text-xs font-bold "+(c.treatmentStatus==="devolvido"?"border-emerald-400/40 bg-emerald-500/15 text-emerald-200":"border-sky-400/40 bg-sky-500/15 text-sky-200")}>{reverseStatusLabel(c)}</span></td>
      <td className="whitespace-nowrap p-3">{when(c.createdAt)}</td><td className="whitespace-nowrap p-3">{when(c.statusChangedAt)}</td>
      <td className="p-3"><Button variant="outline" size="sm" className="gap-1 border-sky-400/45 bg-[#143f70] text-white" onClick={()=>setSelectedId(c.id)}><Eye size={16}/> Ver mais</Button></td>
     </tr>)}</tbody>
    </table>
    {!filtered.length&&!q.isLoading&&<p className="p-7 text-center text-sky-200">Nenhum ciclo localizado.</p>}
    {q.isLoading&&<p className="p-7 text-center text-sky-200">Carregando ciclos...</p>}
   </div>
  </div>
  <DialogPrimitive.Root open={!!active} onOpenChange={o=>{if(!o)setSelectedId(null);}}>
   <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-[3000] bg-[#0b3565]/75 backdrop-blur-md"/>
    <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[3010] max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-sky-300/55 bg-[#0c2c51]/95 p-4 text-sky-50 shadow-[0_24px_80px_rgba(1,12,35,.8)] outline-none sm:p-6" aria-describedby="reverse-manager-description">
      <div className="flex items-start justify-between gap-2"><div><DialogPrimitive.Title className="text-xl font-extrabold">Logística Reversa nº {active?.number}</DialogPrimitive.Title><DialogPrimitive.Description id="reverse-manager-description" className="mt-1 text-sm text-sky-200">Fornecedor: {active?.supplier||"A informar"} · Consulta dos itens separados</DialogPrimitive.Description></div>
       <DialogPrimitive.Close asChild><button className="rounded-lg p-2 text-white hover:bg-sky-500/20" aria-label="Fechar detalhes"><X size={20}/></button></DialogPrimitive.Close></div>
      {active&&<div className="mt-5 space-y-4">
       <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Status",reverseStatusLabel(active)],["Quantidade total",String(reverseTotal(active.items))],["Nº NFD",active.nfd||"—"],["NF-e retorno",active.returnNfe||"—"]].map(([label,value])=><div key={label} className="rounded-xl border border-sky-500/30 bg-[#17416a] p-3"><p className="text-xs text-sky-200">{label}</p><p className="mt-1 break-words font-bold">{value}</p></div>)}
       </div>
       <div className="grid gap-2 text-xs text-sky-200 sm:grid-cols-3"><p>Criado: {when(active.createdAt)}</p><p>Finalizado: {when(active.finishedAt)}</p><p>Alteração de status: {when(active.statusChangedAt)}</p></div>
       {active.returnMode&&<p className="rounded-lg border border-sky-400/25 bg-[#173b62] p-3 text-sm">Tratativa: <strong>{active.returnMode==="abatimento_boleto"?"Abatimento em boleto":"Devolução em material"}</strong></p>}
       <div className="max-h-[370px] overflow-auto rounded-xl border border-sky-500/30"><table className="w-full min-w-[550px] text-left text-sm"><thead className="sticky top-0 bg-[#174d7c]"><tr><th className="p-3">Código</th><th className="p-3">Descrição</th><th className="p-3">Linha</th><th className="p-3">Grupo</th><th className="p-3 text-right">Quantidade</th></tr></thead><tbody className="divide-y divide-sky-400/15">{reverseIncluded(active.items).map(i=><tr key={i.codigo}><td className="p-3 font-bold">{i.codigo}</td><td className="p-3">{i.descricao}</td><td className="p-3">{i.linha}</td><td className="p-3">{i.grupo}</td><td className="p-3 text-right font-extrabold">{i.quantidade}</td></tr>)}</tbody></table>{!reverseIncluded(active.items).length&&<p className="p-4 text-center text-sm text-sky-200">Nenhum item contabilizado.</p>}</div>
       <p className="text-right text-sm font-bold text-sky-100">{reverseIncluded(active.items).length} códigos · {reverseTotal(active.items)} unidades para devolução</p>
      </div>}
    </DialogPrimitive.Content>
   </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
 </section>;
}

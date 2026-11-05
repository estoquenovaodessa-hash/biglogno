import {
  reverseNormalizeSearch,reverseWorkflowStage,reverseTotal,reverseIncluded,
  type ReverseCycle,type ReverseWorkflowStage,
} from "./reverse-logistics";

export type ReversePeriod="all"|"7"|"30"|"90";
export type ReverseStatusFilter="all"|ReverseWorkflowStage;
export type ReverseCycleFilter={query:string;status:ReverseStatusFilter;supplier:string;period:ReversePeriod};

export function reverseCycleSummary(records:ReverseCycle[]){
  const stages=records.map(reverseWorkflowStage);
  return {
    total:records.length,
    active:stages.filter(s=>s!=="resolvido").length,
    resolved:stages.filter(s=>s==="resolvido").length,
    awaiting:stages.filter(s=>s==="aguardando_coleta").length,
  };
}

/** Busca por código, grupo, marca, fornecedor e ciclo.
 * Resultados calculados a partir dos registros reais do Supabase. */
export function filterReverseCycles(
  records:ReverseCycle[],filters:ReverseCycleFilter,now=new Date(),
):ReverseCycle[]{
  const query=reverseNormalizeSearch(filters.query??"");
  const cutoff=filters.period==="all"?0:now.getTime()-Number(filters.period)*86400000;
  return records.filter(c=>{
    if(filters.status!=="all"&&reverseWorkflowStage(c)!==filters.status)return false;
    if(filters.supplier!=="all"&&(c.supplier??"")!==filters.supplier)return false;
    if(cutoff>0&&(!(Date.parse(c.createdAt)>=cutoff)))return false;
    if(!query)return true;
    const haystack=reverseNormalizeSearch([
      c.number,"LOG REV",c.supplier??"",c.brand??"",c.nfd??"",
      c.returnNfe??"",...c.groups,...c.items.map(item=>item.codigo+" "+item.descricao),
    ].join(" "));
    return haystack.includes(query);
  }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.number-a.number);
}
export function reverseCycleAmounts(c:ReverseCycle){
  return {codes:reverseIncluded(c.items).length,units:reverseTotal(c.items)};
}

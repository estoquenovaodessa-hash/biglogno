import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { BarcodesBase } from "./types";
import type { Ciclo, CicloItem } from "./ciclos";

export type CollectorMode = "livre" | "restrita";
export type CollectorState = {
  status:"em_andamento"|"finalizado";
  modo:CollectorMode;
  quantidades:Record<string,number>;
  iniciadoEm:string;
  atualizadoEm:string;
  finalizadoEm?:string;
};
export type CollectorResult =
  | {ok:true;codigo:string;quantidade:number}
  | {ok:false;reason:"desconhecido"|"fora_do_ciclo"|"restrito_sem_selecao"|"restrito_diferente"|"limite";codigo?:string;bloquear:boolean};

const normalizeCode=(raw:string)=>String(raw??"").trim().replace(/^0+(?=\d)/,"");
export const countCollectorItems=(cycle:Pick<Ciclo,"itens">)=>cycle.itens.length;
export function collectorCounts(cycle:Ciclo):Record<string,number>{
  return cycle.coletor?.quantidades??{};
}
export const collectorCount=(state:Pick<CollectorState,"quantidades">)=>Object.values(state.quantidades)
  .reduce((sum,value)=>sum+(Number.isFinite(value)&&value>0?value:0),0);
export function collectorProgress(cycle:Ciclo){
  const quantities=collectorCounts(cycle);
  return {
    products:cycle.itens.filter(item=>(quantities[item.codigo]??0)>0).length,
    units:Object.values(quantities).reduce((sum,n)=>sum+(n>0&&Number.isFinite(n)?n:0),0),
    total:cycle.itens.length,
  };
}
export function resolveCollectorBarcode(
  raw:string,
  base:Pick<BarcodesBase,"porBarcode"|"registros">,
  items:Pick<CicloItem,"codigo">[],
):{code:string|null;reason?:"desconhecido"|"fora_do_ciclo"}{
  const input=String(raw??"").replace(/[\r\n\t ]/g,"").trim();
  if(!input)return {code:null,reason:"desconhecido"};
  const barcode=input.replace(/\D/g,"");
  const found=base.porBarcode[input]??(barcode?base.porBarcode[barcode]:undefined);
  const byCode=new Map(items.map(item=>[normalizeCode(item.codigo),item.codigo]));
  if(found){
    const code=byCode.get(normalizeCode(found));
    return code?{code}:{code:null,reason:"fora_do_ciclo"};
  }
  // Leitores podem ser usados para informar o código interno de 5 dígitos.
  if(/^\d{1,5}$/.test(input)){
    const code=byCode.get(normalizeCode(input));
    return code?{code}:{code:null,reason:"fora_do_ciclo"};
  }
  return {code:null,reason:"desconhecido"};
}

export function scanCollector(
  state:CollectorState,raw:string,base:Pick<BarcodesBase,"porBarcode"|"registros">,
  items:Pick<CicloItem,"codigo">[],selected:string|null,
):{state:CollectorState;result:CollectorResult}{
  const match=resolveCollectorBarcode(raw,base,items);
  if(!match.code)return {state,result:{
    ok:false,reason:match.reason??"desconhecido",bloquear:state.modo==="restrita",
  }};
  if(state.modo==="restrita"&&!selected)return {state,result:{
    ok:false,reason:"restrito_sem_selecao",codigo:match.code,bloquear:true,
  }};
  if(state.modo==="restrita"&&normalizeCode(match.code)!==normalizeCode(selected!))
    return {state,result:{ok:false,reason:"restrito_diferente",codigo:match.code,bloquear:true}};
  const current=state.quantidades[match.code]??0;
  if(current>=10000000)return {state,result:{ok:false,reason:"limite",codigo:match.code,bloquear:false}};
  const next={...state,quantidades:{...state.quantidades,[match.code]:current+1},atualizadoEm:new Date().toISOString()};
  return {state:next,result:{ok:true,codigo:match.code,quantidade:current+1}};
}

export function adjustCollectorCount(state:CollectorState,code:string,delta:number):CollectorState{
  if(!Number.isSafeInteger(delta))throw new Error("Alteração de contagem inválida.");
  const amount=state.quantidades[code]??0;
  const next=Math.max(0,Math.min(10000000,amount+delta));
  return setCollectorCount(state,code,next);
}
export function setCollectorCount(state:CollectorState,code:string,value:number):CollectorState{
  if(!Number.isSafeInteger(value)||value<0||value>10000000)throw new Error("Quantidade inválida.");
  const quantities={...state.quantidades};
  if(value===0)delete quantities[code];else quantities[code]=value;
  return {...state,quantidades:quantities,atualizadoEm:new Date().toISOString()};
}
export function createCollectorState(previous?:CollectorState):CollectorState{
  // Um ciclo com bipagem finalizada permanece somente leitura até o operador
  // usar explicitamente "Reabrir bipagem para correção".
  return previous??{
    status:"em_andamento",modo:"livre",
    quantidades:{},iniciadoEm:new Date().toISOString(),
    atualizadoEm:new Date().toISOString(),
  };
}
export function finalizeCollector(state:CollectorState):CollectorState{
  const when=new Date().toISOString();
  return {...state,status:"finalizado",finalizadoEm:when,atualizadoEm:when};
}
export function collectorPdfFilename(c:Ciclo){
  return "pdf-bipagem-"+c.tipo+"-"+c.numero+".pdf";
}

/** PDF de conferência física: espelho do que o coletor registrou.
 * Não finaliza o ciclo nem modifica a lógica tradicional de divergências.
 */
export function createCollectorPdf(c:Ciclo):jsPDF{
  if(c.coletor?.status!=="finalizado")throw new Error("Finalize a bipagem antes de gerar o PDF.");
  const pdf=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
  const progress=collectorProgress(c);
  pdf.setFont("helvetica","bold");pdf.setFontSize(16);pdf.text("BIGNOTTO FERRAMENTAS",14,18);
  pdf.setFontSize(13);pdf.text("RELATÓRIO DE BIPAGEM",14,26);
  pdf.setFont("helvetica","normal");pdf.setFontSize(10);
  pdf.text("Ciclo: "+c.titulo,14,33);
  pdf.text("Criado: "+new Date(c.criadoEm).toLocaleString("pt-BR"),14,39);
  pdf.text("Bipagem finalizada: "+new Date(c.coletor.finalizadoEm??c.coletor.atualizadoEm).toLocaleString("pt-BR"),14,45);
  pdf.text("Modo: "+(c.coletor.modo==="restrita"?"Restrita":"Livre"),14,51);
  pdf.text("Itens bipados: "+progress.products+" / "+progress.total+"  |  Unidades bipadas: "+progress.units,14,57);
  autoTable(pdf,{
    startY:64,
    head:[["Código","Descrição","Endereço","Qtde. bipada"]],
    body:c.itens.map(item=>[
      item.codigo,item.descricao,item.endereco||"-",
      String(c.coletor?.quantidades[item.codigo]??0),
    ]),
    theme:"grid",
    headStyles:{fillColor:[22,48,77]},
    styles:{fontSize:8,cellPadding:2.3,overflow:"linebreak"},
    columnStyles:{0:{cellWidth:26},2:{cellWidth:30},3:{cellWidth:30,halign:"right"}},
    margin:{left:14,right:14},
  });
  return pdf;
}

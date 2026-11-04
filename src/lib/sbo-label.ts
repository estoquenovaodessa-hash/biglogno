import jsPDF from "jspdf";
import { LOGO_MONO_PNG } from "./conference-label";
import type { AnalyzedItem, BarcodesBase, EnderecoBase } from "./types";

export const SBO_LABEL_WIDTH_MM = 60;
export const SBO_LABEL_HEIGHT_MM = 30;
export const SBO_UNITS = ["Metros", "UN", "KG", "G"] as const;
export type SboUnit = typeof SBO_UNITS[number];
export type SboCatalogItem = { code:string; description:string; unit:SboUnit };
export type SboLabel = SboCatalogItem & { quantity:number };

/** Mesmo padrão de código da base de itens: 3610 = 03610. */
export function normalizeSboCode(raw:string):string {
  const value=String(raw??"").trim();
  return /^\d{1,4}$/.test(value)?value.padStart(5,"0"):value;
}

export function sboUnit(raw?:string):SboUnit {
  const u=String(raw??"").trim().toUpperCase();
  if(["M","MT","MTS","METRO","METROS"].includes(u))return "Metros";
  if(["KG","KGS","QUILO","QUILOS","KILO"].includes(u))return "KG";
  if(["G","GR","GRAMAS","GRAMA"].includes(u))return "G";
  return "UN";
}

/** Monta um índice único ao atualizar as bases, sem pesquisa pesada por tecla.
 * Base de itens (barcodes), endereços e movimentos são fontes já existentes,
 * sem tabela nova no Supabase.
 */
export function createSboCatalog(
  barcodeBase:Pick<BarcodesBase,"registros"|"porBarcode">,
  addressBase:Pick<EnderecoBase,"registros">,
  movements:Pick<AnalyzedItem,"codigo"|"descricao"|"unidade">[],
): {items:ReadonlyMap<string,SboCatalogItem>;barcodes:ReadonlyMap<string,string>} {
  const catalog=new Map<string,SboCatalogItem>();
  const aliases=new Map<string,string>();
  const add=(raw:string,description?:string,unit?:string,preferDescription=false)=>{
    const code=normalizeSboCode(raw);
    if(!code||!description?.trim())return;
    const existing=catalog.get(code);
    if(!existing){
      catalog.set(code,{code,description:description.trim(),unit:sboUnit(unit)});
    }else if(preferDescription){
      catalog.set(code,{code,description:description.trim(),unit:unit?sboUnit(unit):existing.unit});
    }else if(unit && existing.unit==="UN"){
      catalog.set(code,{...existing,unit:sboUnit(unit)});
    }
  };
  for(const record of Object.values(addressBase.registros??{}))
    add(record.codigo,record.descricao);
  for(const record of Object.values(barcodeBase.registros??{}))
    add(record.codigo,record.descricao,undefined,true);
  // Unidade da planilha de movimentos: se existir, respeitar.
  for(const record of movements??[])
    add(record.codigo,record.descricao,record.unidade);
  for(const [barcode,code] of Object.entries(barcodeBase.porBarcode??{})){
    if(catalog.has(normalizeSboCode(code)))aliases.set(barcode.trim(),normalizeSboCode(code));
  }
  return {items:catalog,barcodes:aliases};
}
export function findSboItem(
  catalog:ReturnType<typeof createSboCatalog>,rawCode:string,
):SboCatalogItem|null {
  const entered=String(rawCode??"").trim();
  const normalized=normalizeSboCode(entered);
  return catalog.items.get(normalized)??catalog.items.get(catalog.barcodes.get(entered)??"")??null;
}

export function parseSboQuantity(raw:string,unit:SboUnit):number|null {
  const value=String(raw??"").trim();
  if(!/^\d+(?:[.,]\d{1,3})?$/.test(value))return null;
  const number=Number(value.replace(",","."));
  if(!Number.isFinite(number)||number<=0||number>999999)return null;
  if(unit==="UN"&&!Number.isInteger(number))return null;
  return number;
}
export const sboQuantityText=(quantity:number,unit:SboUnit)=>{
  const amount=new Intl.NumberFormat("pt-BR",{maximumFractionDigits:3}).format(quantity);
  return amount+" "+unit.toUpperCase();
};

export function sboLabelFilename(labels:SboLabel[]):string{
  const single=labels.length===1?labels[0].code.replace(/[^a-zA-Z0-9_-]/g,"-"):"lote-"+labels.length;
  return "etiqueta-sbo-"+single+"-argox-60x30mm.pdf";
}

function fitText(pdf:jsPDF,raw:string,x:number,y:number,maxWidth:number,size:number,min=5.2){
  let pt=size;
  pdf.setFontSize(pt);
  while(pt>min&&pdf.getTextWidth(raw)>maxWidth){
    pt=Math.max(min,pt-0.25);
    pdf.setFontSize(pt);
  }
  let txt=raw;
  if(pdf.getTextWidth(txt)>maxWidth){
    while(txt.length>1&&pdf.getTextWidth(txt+"...")>maxWidth)txt=txt.slice(0,-1);
    txt+="...";
  }
  pdf.text(txt,x,y);
}

/** Descrição ocupa toda a faixa inferior. Em descrições maiores, duas
 * linhas preservam mais informação do que cortar tudo na primeira. */
function drawSboDescription(pdf:jsPDF,raw:string){
  const description=raw.replace(/\s+/g," ").trim();
  pdf.setFont("helvetica","bold");
  for(let size=11.8;size>=9.7;size-=0.3){
    pdf.setFontSize(size);
    if(pdf.getTextWidth(description)<=55.2){
      pdf.text(description,2.2,27.1);
      return;
    }
  }
  pdf.setFontSize(9.25);
  const lines=pdf.splitTextToSize(description,55.0) as string[];
  if(lines.length<=1){
    fitText(pdf,description,2.2,27.1,55,9.25,7.2);
    return;
  }
  pdf.text(lines[0],2.2,25.15);
  fitText(pdf,lines.slice(1).join(" "),2.2,28.15,55,9.25,7.2);
}

/** Etiqueta monocromática, sem margens de papel A4.
 * Cada item adicionado é uma página física 60x30mm da Argox.
 */
export function createSboLabelsPdf(labels:SboLabel[]):jsPDF {
  if(!labels.length)throw new Error("Adicione pelo menos um item.");
  if(labels.length>500)throw new Error("Limite de 500 etiquetas por PDF.");
  for(const item of labels){
    if(!item.code.trim()||!item.description.trim())
      throw new Error("Um item está sem código ou descrição.");
    if(!SBO_UNITS.includes(item.unit)||parseSboQuantity(String(item.quantity),item.unit)===null)
      throw new Error("Confira a quantidade e a unidade de todos os itens.");
  }
  const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:[60,30],compress:true});
  pdf.setProperties({title:"Etiquetagem S.B.O - Bignotto Ferramentas",subject:"Argox 60 x 30 mm, preto e branco",author:"Bignotto Ferramentas"});
  labels.forEach((record,index)=>{
    if(index>0)pdf.addPage([60,30],"landscape");
    pdf.setTextColor(0);pdf.setDrawColor(0);pdf.setLineWidth(0.17);
    pdf.roundedRect(0.55,0.55,58.9,28.9,1.4,1.4,"S");
    pdf.addImage(LOGO_MONO_PNG,"PNG",1.7,1.35,5.2,6.1);
    pdf.line(8.3,1.6,8.3,7.65);
    pdf.setFont("helvetica","bold");
    fitText(pdf,"BIGNOTTO",9.55,5.55,48,17.4,14);
    pdf.setFont("helvetica","normal");
    fitText(pdf,"F E R R A M E N T A S",10,7.4,44,6.1,5.5);
    pdf.setLineWidth(0.18);pdf.line(1.8,8.5,58.2,8.5);

    // Código e quantidade lado a lado, com hierarquia visual clara.
    pdf.setFont("helvetica","bold");
    pdf.setFontSize(7.0);
    pdf.text("CÓDIGO",2.2,11.3);
    pdf.text("QTD:",40.0,11.3);
    pdf.setLineWidth(0.18);
    pdf.line(37.75,9.7,37.75,18.75);
    fitText(pdf,record.code,2.2,17.1,34.2,22.4,10.5);

    const quantityLabel=sboQuantityText(record.quantity,record.unit);
    pdf.setFont("helvetica","bold");
    pdf.setFontSize(15.5);
    if(pdf.getTextWidth(quantityLabel)<=17.6){
      pdf.text(quantityLabel,39.6,17.1);
    }else{
      pdf.setFontSize(10.4);
      if(pdf.getTextWidth(quantityLabel)<=17.6){
        pdf.text(quantityLabel,39.6,17.1);
      }else{
        // Para "Metros" ou números extensos, manter a unidade completa.
        fitText(pdf,new Intl.NumberFormat("pt-BR",{maximumFractionDigits:3}).format(record.quantity),
          39.6,15.4,17.6,14.8,9);
        fitText(pdf,record.unit.toUpperCase(),39.6,18.1,17.6,8.6,7.0);
      }
    }
    pdf.line(1.8,19.2,58.2,19.2);

    // Descrição isolada na faixa inferior, maior e sem a quantidade embaixo.
    pdf.setFont("helvetica","bold");
    pdf.setFontSize(7.0);
    pdf.text("DESCRIÇÃO",2.2,21.8);
    drawSboDescription(pdf,record.description);
  });
  return pdf;
}

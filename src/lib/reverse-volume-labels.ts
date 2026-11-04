import jsPDF from "jspdf";
import { LOGO_MONO_PNG } from "./conference-label";
import type { ReverseCycle } from "./reverse-logistics";

export const REVERSE_VOLUME_WIDTH_MM=60;
export const REVERSE_VOLUME_HEIGHT_MM=30;
export type ReverseVolumeLabelData=Pick<ReverseCycle,"number"|"supplier"|"brand"|"nfd"|"volumes">;

export function reverseVolumeLabelFilename(c:ReverseVolumeLabelData):string{
  return "logistica-reversa-"+c.number+"-volumes-argox.pdf";
}

function fit(pdf:jsPDF,text:string,x:number,y:number,maxWidth:number,start:number,min=5){
  let font=start;
  pdf.setFontSize(font);
  while(font>min&&pdf.getTextWidth(text)>maxWidth){
    font=Math.max(min,font-0.25);pdf.setFontSize(font);
  }
  let visible=text;
  if(pdf.getTextWidth(visible)>maxWidth){
    while(visible.length>1&&pdf.getTextWidth(visible+"...")>maxWidth)visible=visible.slice(0,-1);
    visible+="...";
  }
  pdf.text(visible,x,y);
}

/** Uma etiqueta física de 60x30mm por volume, sem folhas A4 ou preenchimentos escuros. */
export function createReverseVolumeLabelsPdf(c:ReverseVolumeLabelData):jsPDF {
  if(!c.nfd?.trim())throw new Error("Informe o número da NF de devolução.");
  if(!c.supplier?.trim())throw new Error("Fornecedor não informado.");
  if(!c.brand?.trim())throw new Error("Marca não informada.");
  if(!Number.isSafeInteger(c.volumes)||!c.volumes||c.volumes<1||c.volumes>500)
    throw new Error("Informe entre 1 e 500 volumes.");
  const pdf=new jsPDF({unit:"mm",format:[REVERSE_VOLUME_WIDTH_MM,REVERSE_VOLUME_HEIGHT_MM],
    orientation:"landscape",compress:true});
  pdf.setProperties({title:"Etiquetas Logística Reversa "+c.number,author:"Bignotto Ferramentas"});
  for(let volume=1;volume<=c.volumes;volume++){
    if(volume>1)pdf.addPage([60,30],"landscape");
    pdf.setDrawColor(0);pdf.setTextColor(0);pdf.setLineWidth(0.18);
    pdf.roundedRect(0.6,0.6,58.8,28.8,1.5,1.5,"S");
    pdf.addImage(LOGO_MONO_PNG,"PNG",1.7,1.55,5.4,6.1);
    pdf.line(8.1,1.7,8.1,8.1);
    pdf.setFont("helvetica","bold");fit(pdf,"BIGNOTTO",9.4,5.4,46,16.4,14.0);
    pdf.setFont("helvetica","normal");pdf.setFontSize(6.1);pdf.text("F E R R A M E N T A S",9.5,7.7);
    pdf.line(1.7,8.7,58.3,8.7);
    pdf.setFont("helvetica","bold");pdf.setFontSize(6.6);pdf.text("Nº NF DE DEVOLUÇÃO",2.4,11.2);
    fit(pdf,c.nfd!,2.3,17.4,34.5,17,8.5);
    pdf.line(39,9.4,39,19);
    pdf.setFontSize(6.6);pdf.text("VOLUME",41.0,11.5);
    fit(pdf,volume+" / "+c.volumes,42.1,17.0,15.1,16,10);
    pdf.line(1.8,19.5,58.3,19.5);
    pdf.setFontSize(6.2);pdf.text("FORNECEDOR",2.2,22.2);
    fit(pdf,c.supplier!,21.0,22.2,36.2,8.7,5.5);
    pdf.line(1.8,23.4,58.3,23.4);
    pdf.setFont("helvetica","bold");pdf.setFontSize(6.2);pdf.text("MARCA",2.2,26.4);
    fit(pdf,c.brand!,11.0,26.4,46.0,9.2,5.4);
    pdf.setFontSize(4.3);pdf.text("LOG. REV Nº "+c.number,2.3,28.7);
  }
  return pdf;
}

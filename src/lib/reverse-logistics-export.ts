import type { ReverseCycle } from "./reverse-logistics";
import { reverseIncluded,reverseTotal,reverseCsv } from "./reverse-logistics";
export function reverseDownloadCsv(c:ReverseCycle) {
  const blob=new Blob([reverseCsv(c)],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="logistica-reversa-"+c.number+".csv";document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function reverseExportPdf(c:ReverseCycle) {
  const [{default:jsPDF},{default:autoTable}]=await Promise.all([import("jspdf"),import("jspdf-autotable")]);
  const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
  pdf.setProperties({title:"Logistica Reversa n "+c.number});
  pdf.setFillColor(12,46,88);pdf.rect(0,0,297,34,"F");pdf.setTextColor(255);pdf.setFont("helvetica","bold");pdf.setFontSize(18);
  pdf.text("BIGLOGNO - LOGISTICA REVERSA N "+c.number,14,14);
  pdf.setFontSize(10);pdf.text("Fornecedor: "+(c.supplier||"A informar"),14,22);
  pdf.text("NFD: "+(c.nfd||"-")+" | Status: "+(c.treatmentStatus||"Em contagem")+(c.returnMode?" | "+(c.returnMode==="abatimento_boleto"?"Abatimento em boleto":"Devolucao em material"):"")+(c.returnNfe?" | NF-e: "+c.returnNfe:""),14,29);
  const rows=reverseIncluded(c.items);
  autoTable(pdf,{startY:41,head:[["Codigo","Descricao","Linha","Grupo","Quantidade"]],
    body:rows.map(i=>[i.codigo,i.descricao,i.linha,i.grupo,String(i.quantidade)]),
    headStyles:{fillColor:[18,82,150]},styles:{fontSize:9,cellPadding:3,overflow:"linebreak"},
    alternateRowStyles:{fillColor:[237,245,255]},margin:{left:14,right:14,bottom:18}});
  pdf.setFontSize(10);pdf.setTextColor(35,70,110);pdf.text("Codigos: "+rows.length+" | Quantidade total: "+reverseTotal(c.items),14,201);
  pdf.save("logistica-reversa-"+c.number+".pdf");
}

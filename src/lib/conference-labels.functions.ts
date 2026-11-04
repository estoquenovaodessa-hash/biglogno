import { createServerFn } from "@tanstack/react-start";
import { conferenceLabelKind, type ConferenceLabelEntry } from "./conference-label-selection";
import type { VerificationRecord } from "./sales-verification";

/** Consulta própria do operador: somente dados para etiquetas, sem valores, vendedor,
 * observações, erros, nem dados de outros cadastros. Não modifica registros.
 * Exige sessão válida e perfil de funcionário ativo no servidor.
 */
export const readOperatorConferenceLabels=createServerFn({method:"GET"}).handler(async()=>{
  const {requireSelectedOperator}=await import("./employees.functions");
  await requireSelectedOperator();
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const labels:ConferenceLabelEntry[]=[];
  for(let offset=0;;offset+=1000){
    const {data,error}=await supabaseAdmin.from("sales_verification_records")
      .select("id,created_at,payload").order("created_at",{ascending:false})
      .order("id").range(offset,offset+999);
    if(error)throw new Error("Não foi possível carregar as etiquetas da Conferência.");
    for(const row of data??[]){
      const record=row.payload as unknown as VerificationRecord;
      if(!record || !conferenceLabelKind(record))continue;
      labels.push({
        id:row.id,
        createdAt:row.created_at,
        document:record.document,
        clientName:record.clientName,
        clientCode:record.clientCode,
        items:record.items,
        verifierCode:record.verifierCode,
        verifierName:record.verifierName,
        forDelivery:record.forDelivery,
        balcaoDestination:record.balcaoDestination,
        source:record.source,
      });
    }
    if(!data||data.length<1000)break;
  }
  return labels;
});

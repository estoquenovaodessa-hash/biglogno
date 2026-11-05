import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { conferenceLabelKind, type ConferenceLabelEntry } from "./conference-label-selection";
import {
  conferencePrintStateKey, CONFERENCE_PRINT_KEY_PREFIX, type ConferencePrintEntry,
} from "./conference-label-print-state";
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
  // Cada conferência usa uma chave própria em app_state, para que a geração
  // simultânea por operadores diferentes não sobrescreva o estado das demais.
  const printedById = new Map<string,{printedAt:string;printedBy:string}>();
  for(let offset=0;;offset+=1000){
    const {data,error}=await supabaseAdmin.from("app_state")
      .select("key,value")
      .like("key",CONFERENCE_PRINT_KEY_PREFIX+"%")
      .order("key")
      .range(offset,offset+999);
    if(error)throw new Error("Não foi possível consultar o controle de etiquetas geradas.");
    for(const row of data??[]){
      const id=row.key.slice(CONFERENCE_PRINT_KEY_PREFIX.length);
      const value=row.value as {printedAt?:unknown;printedBy?:unknown}|null;
      if(typeof value?.printedAt==="string" && Number.isFinite(Date.parse(value.printedAt))){
        printedById.set(id,{printedAt:value.printedAt,printedBy:typeof value.printedBy==="string"?value.printedBy:""});
      }
    }
    if(!data||data.length<1000)break;
  }
  return labels.map((record):ConferencePrintEntry=>({
    ...record,
    labelPrintedAt:printedById.get(record.id)?.printedAt??null,
    labelPrintedBy:printedById.get(record.id)?.printedBy??null,
  }));
});

/** Controle de PDF gerado, não confirmação da impressora física.
 * A gravação individual por id evita perda de status em impressões simultâneas.
 * Permite desfazer um registro se o PDF não tiver sido realmente impresso.
 */
export const setOperatorConferencePrintStatus=createServerFn({method:"POST"})
  .inputValidator(z.object({
    ids:z.array(z.string().uuid()).min(1).max(500)
      .refine(ids=>new Set(ids).size===ids.length,"Há conferências repetidas."),
    printed:z.boolean(),
  }))
  .handler(async({data})=>{
    const {requireSelectedOperator}=await import("./employees.functions");
    const operator=await requireSelectedOperator();
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");

    // Confere no servidor cada registro e seu destino. O cliente não pode
    // marcar CSV, somente Conferência, nem ids que não existem.
    const {data:found,error:findError}=await supabaseAdmin.from("sales_verification_records")
      .select("id,payload").in("id",data.ids);
    if(findError)throw new Error("Não foi possível validar as conferências selecionadas.");
    const valid=new Set((found??[]).filter(row=>conferenceLabelKind(row.payload as unknown as VerificationRecord))
      .map(row=>row.id));
    if(valid.size!==data.ids.length || data.ids.some(id=>!valid.has(id)))
      throw new Error("Uma das conferências não é de Entrega ou Retira ou não existe.");

    const keys=data.ids.map(conferencePrintStateKey);
    if(!data.printed){
      const {error}=await supabaseAdmin.from("app_state").delete().in("key",keys);
      if(error)throw new Error("Não foi possível reabrir as etiquetas como pendentes.");
      return {printedAt:null as string|null,printedBy:null as string|null,count:data.ids.length};
    }
    const printedAt=new Date().toISOString();
    const printedBy=operator.name;
    const rows=keys.map(key=>({key,value:{printedAt,printedBy},updated_at:printedAt}));
    const {error}=await supabaseAdmin.from("app_state").upsert(rows,{onConflict:"key"});
    if(error)throw new Error("O PDF foi gerado, mas não foi possível registrar as etiquetas. Tente atualizar o status.");
    return {printedAt,printedBy,count:data.ids.length};
  });

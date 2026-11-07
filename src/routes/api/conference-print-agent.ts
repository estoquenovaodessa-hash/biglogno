import {createFileRoute} from "@tanstack/react-router";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {conferencePrintStateKey} from "@/lib/conference-label-print-state";

const noCache={"cache-control":"no-store","x-content-type-options":"nosniff"};
function json(data:unknown,status=200):Response{
  return Response.json(data,{status,headers:noCache});
}
/** Token de 256 bits, guardado SOMENTE no secret do Cloudflare e no Windows
 * (DPAPI). O tablet e o navegador nunca recebem essa credencial.
 */
async function verifyAgent(request:Request):Promise<Response|null>{
  const expected=process.env.PRINT_AGENT_TOKEN?.trim()??"";
  if(!/^[a-f0-9]{64}$/i.test(expected))
    return json({error:"Agente ainda não configurado no Worker."},503);
  const header=request.headers.get("authorization")??"";
  const supplied=header.startsWith("Bearer ")?header.slice(7).trim():"";
  if(!/^[a-f0-9]{64}$/i.test(supplied))return json({error:"Não autorizado."},401);
  const enc=new TextEncoder();
  const [a,b]=await Promise.all([
    crypto.subtle.digest("SHA-256",enc.encode(expected)),
    crypto.subtle.digest("SHA-256",enc.encode(supplied)),
  ]);
  const first=new Uint8Array(a),second=new Uint8Array(b);
  let diff=0;for(let i=0;i<first.length;i++)diff|=first[i]^second[i];
  return diff===0?null:json({error:"Não autorizado."},401);
}

const ackSchema=z.object({
  id:z.string().uuid(),
  leaseId:z.string().uuid(),
  status:z.enum(["spooled","error"]),
  message:z.string().max(400).optional(),
});

export const Route=createFileRoute("/api/conference-print-agent")({
  server:{handlers:{
    GET:async({request})=>{
      const denied=await verifyAgent(request);if(denied)return denied;
      // Diagnóstico autenticado, sem tocar no Supabase nem reivindicar trabalhos.
      // Útil para verificar a conexão ANTES de habilitar impressão automática.
      if(new URL(request.url).searchParams.get("health")==="1")
        return json({ok:true,printingEnabled:process.env.AUTO_CONFERENCE_PRINT_ENABLED==="true"});
      if(process.env.AUTO_CONFERENCE_PRINT_ENABLED!=="true")
        return json({error:"Impressão automática desativada."},503);
      try{
        const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
        const db=supabaseAdmin as unknown as SupabaseClient;
        const {data,error}=await db.rpc("claim_next_conference_label_print_job",{
          p_lease_id:crypto.randomUUID(),
        });
        if(error){
          console.error("[BigLogno Print] Falha ao reivindicar trabalho:",error.code,error.message);
          return json({error:"Fila indisponível. Verifique a instalação do SQL."},503);
        }
        const item=(data as unknown as Array<{
          job_id:string;document:string;pdf_base64:string;lease_id:string;
        }> | null)?.[0];
        return json(item?{
          job:{id:item.job_id,document:item.document,
            pdfBase64:item.pdf_base64,leaseId:item.lease_id},
        }:{job:null});
      }catch(e){
        console.error("[BigLogno Print] Erro no atendimento:",e);
        return json({error:"Não foi possível consultar a fila."},503);
      }
    },
    POST:async({request})=>{
      const denied=await verifyAgent(request);if(denied)return denied;
      if(process.env.AUTO_CONFERENCE_PRINT_ENABLED!=="true")
        return json({error:"Impressão automática desativada."},503);
      let body:z.infer<typeof ackSchema>;
      try{body=ackSchema.parse(await request.json());}
      catch{return json({error:"Confirmação inválida."},400);}
      try{
        const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
        const db=supabaseAdmin as unknown as SupabaseClient;
        const updatedAt=new Date().toISOString();
        const {data,error}=await db.from("conference_label_print_jobs")
          .update({
            status:body.status,
            last_error:body.status==="error"?(body.message||"Falha no envio ao driver."):null,
            spooled_at:body.status==="spooled"?updatedAt:null,
            updated_at:updatedAt,
          })
          .eq("id",body.id).eq("lease_id",body.leaseId).eq("status","claimed")
          .select("id,verification_id").maybeSingle();
        if(error){
          console.error("[BigLogno Print] Falha no ACK",error.code);
          return json({error:"Não foi possível registrar confirmação."},503);
        }
        if(!data)return json({error:"Trabalho já concluído ou confirmação expirada."},409);

        // Mesma marcação verde da Etiquetagem, deixando explícito no campo
        // printedBy que a confirmação foi do spooler, não da saída de papel.
        if(body.status==="spooled"){
          const recordId=(data as unknown as {verification_id:string}).verification_id;
          const {error:markerError}=await supabaseAdmin.from("app_state")
            .upsert({
              key:conferencePrintStateKey(recordId),
              value:{printedAt:updatedAt,printedBy:"BigLogno Print (fila Windows)",mode:"automatica"},
              updated_at:updatedAt,
            },{onConflict:"key"});
          if(markerError)console.error("[BigLogno Print] Marcador visual falhou:",markerError.code);
        }
        return json({ok:true});
      }catch(e){
        console.error("[BigLogno Print] Falha geral de confirmação:",e);
        return json({error:"Não foi possível registrar confirmação."},503);
      }
    },
  }},
});

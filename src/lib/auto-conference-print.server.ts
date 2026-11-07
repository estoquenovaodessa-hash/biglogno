import type { VerificationRecord } from "./sales-verification";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isAutoConferencePrintEnabled,isConferenceEligibleForAutoPrint,
} from "./auto-conference-print";

/** Chamado SOMENTE depois de a Conferência ter sido salva com sucesso
 * na transação já existente. Falhas da impressora não desfazem a conferência.
 * O job carrega o mesmo PDF exato que a opção manual já gera.
 */
export async function enqueueRegisteredConferenceLabel(recordId:string):Promise<void>{
  if(!isAutoConferencePrintEnabled())return;
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const {data:row,error:readError}=await supabaseAdmin.from("sales_verification_records")
    .select("id,created_at,payload").eq("id",recordId).maybeSingle();
  if(readError||!row)throw new Error("Conferência salva, mas não foi localizada para impressão.");
  const record={...(row.payload as unknown as VerificationRecord),id:row.id,createdAt:row.created_at};
  if(!isConferenceEligibleForAutoPrint(record))return;

  const {createConferenceLabelPdf}=await import("./conference-label");
  // jsPDF datauri contém os bytes do mesmo PDF Argox 60 x 30 mm.
  const dataUri=createConferenceLabelPdf(record).output("datauristring");
  const pdfBase64=dataUri.slice(dataUri.indexOf(",")+1);
  if(!pdfBase64||pdfBase64.length>550000)
    throw new Error("Etiqueta PDF fora do limite da fila de impressão.");

  // A unicidade verification_id impede etiquetas duplicadas por reenvio do
  // formulário/retentativa do navegador.
  const db=supabaseAdmin as unknown as SupabaseClient;
  const {error}=await db.from("conference_label_print_jobs").insert({
    verification_id:recordId,
    document:record.document,
    pdf_base64:pdfBase64,
    status:"pending",
  });
  if(error&&error.code!=="23505")throw new Error("A fila de impressão não pôde receber a etiqueta.");
}

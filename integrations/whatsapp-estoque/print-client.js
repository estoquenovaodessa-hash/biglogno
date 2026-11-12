"use strict";
const crypto = require("node:crypto");

const DEFAULT_API_URL = "https://biglogno.estoquenovaodessa.workers.dev/api/whatsapp-stock-print";

/** Mesmo WhatsApp msg.id => mesmo UUID. Reentregas e reconexões NÃO
 * recriam os jobs graças à unicidade do requestId no Supabase. */
function idPedidoDaMensagem(serializedMessageId) {
  if (typeof serializedMessageId !== "string" || !serializedMessageId.trim())
    throw new Error("Mensagem do WhatsApp sem identificador estável; impressão ignorada.");
  const digest = crypto.createHash("sha256")
    .update("BIGNOTTO-STOCK-PRINT-V1\0" + serializedMessageId, "utf8").digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // UUID v4 determinístico
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [hex.slice(0,8), hex.slice(8,12), hex.slice(12,16),
    hex.slice(16,20), hex.slice(20,32)].join("-");
}

/** Envia apenas empresa/código/descrição; a quantidade recebida do grupo
 * NUNCA é enviada e a etiqueta fica com campo de quantidade vazio. */
async function solicitarEtiquetasDoBot({messageId,company,items}, opts={}) {
  const token = opts.token === undefined ? process.env.BIGLOG_BOT_PRINT_TOKEN : opts.token;
  if (!token) {
    return {ok:false,skipped:true,reason:"Token de integração ainda não configurado."};
  }
  if (!/^[a-f0-9]{64}$/i.test(token))
    throw new Error("BIGLOG_BOT_PRINT_TOKEN deve ter 64 caracteres hexadecimais.");
  const filtered = items.filter(item=>String(item.code??"").trim() && String(item.description??"").trim());
  if (!filtered.length) return {ok:false,skipped:true,reason:"Nenhum item encontrado no estoque."};
  if (filtered.length>500)throw new Error("Uma mensagem pode solicitar no máximo 500 etiquetas.");

  const endpoint=opts.url ?? process.env.BIGLOG_BOT_PRINT_URL ?? DEFAULT_API_URL;
  if (!endpoint.startsWith("https://"))
    throw new Error("O endereço de impressão deve usar HTTPS.");
  const payload={
    requestId:idPedidoDaMensagem(messageId),
    company:String(company??"").trim().slice(0,100)||"Não informada",
    items:filtered.map(item=>({
      code:String(item.code).trim().slice(0,60),
      description:String(item.description).trim().slice(0,360),
    })),
  };
  const fetcher=opts.fetch ?? globalThis.fetch;
  if (typeof fetcher !== "function")
    throw new Error("É necessário Node.js 18+ (com suporte a fetch).");
  let lastError;
  // Retry seguro: o requestId continua o mesmo e o servidor ignora duplicatas.
  for(let attempt=0; attempt<2;attempt++){
    try{
      const response=await fetcher(endpoint,{
        method:"POST",
        headers:{"content-type":"application/json","accept":"application/json",
          "authorization":"Bearer "+token},
        body:JSON.stringify(payload),
        signal:typeof AbortSignal!=="undefined"&&typeof AbortSignal.timeout==="function"
          ?AbortSignal.timeout(15000):undefined,
      });
      if(!response.ok){
        const info=await response.json().catch(()=>({}));
        const message=info?.error||("HTTP "+response.status);
        if(response.status<500)throw new Error("BigLog recusou a solicitação: "+message);
        throw new Error("Serviço de impressão indisponível: "+message);
      }
      const receipt=await response.json();
      if(!receipt?.ok)throw new Error("BigLog não confirmou o enfileiramento.");
      return {ok:true,skipped:false,requestId:payload.requestId,
        labels:receipt.labels,batches:receipt.batches};
    }catch(error){
      lastError=error;
      if(attempt===0){
        await new Promise(resolve=>setTimeout(resolve,800));
      }
    }
  }
  throw lastError;
}
module.exports={idPedidoDaMensagem,solicitarEtiquetasDoBot,DEFAULT_API_URL};

"use strict";
const crypto = require("node:crypto");

const DEFAULT_API_URL = "https://biglogno.estoquenovaodessa.workers.dev/api/whatsapp-stock-print";

/**
 * Identifica a mensagem independentemente do formato da versao do
 * whatsapp-web.js: o ID pode vir como _serialized, id.id ou rawData.id.
 * Se a versao nao fornecer nenhum ID, combina grupo, autor, timestamp
 * e texto. A chave e um hash estavel (nao expomos dados do WhatsApp).
 *
 * Nunca usar UUID aleatorio aqui: isso permitiria reimpressao do mesmo
 * pedido em uma reconexao do bot.
 */
function identificarMensagemWhatsApp(msg) {
  const original = msg?.id;
  const rawId = msg?.rawData?.id ?? msg?._data?.id;
  const choose = [
    typeof original === "string" ? original : null,
    original?._serialized,
    original?.id,
    original?.key?.id,
    typeof rawId === "string" ? rawId : null,
    rawId?._serialized,
    rawId?.id,
  ].find(value => typeof value === "string" && value.trim().length > 0);

  const group = String(msg?.from ?? msg?.rawData?.from ?? "").trim();
  if (choose) {
    // Incluir grupo impede colisao quando a biblioteca retorna apenas o ID.
    return "whatsapp-id:" + group + ":" + choose.trim();
  }

  const timestamp = Number(msg?.timestamp ?? msg?.rawData?.t ?? msg?._data?.t);
  const sender = String(msg?.author ?? msg?.rawData?.author ?? msg?._data?.author ?? "").trim();
  const body = String(msg?.body ?? msg?.rawData?.body ?? "").trim();
  if (!group || !Number.isSafeInteger(timestamp) || timestamp <= 0 || !body) {
    throw new Error(
      "Mensagem do WhatsApp sem ID e sem dados suficientes para criar chave estavel; impressao ignorada."
    );
  }
  const digest = crypto.createHash("sha256")
    .update(JSON.stringify(["fallback-msg-v1", group, sender, timestamp, body]), "utf8")
    .digest("hex");
  return "whatsapp-fallback:" + digest;
}

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
module.exports={identificarMensagemWhatsApp,idPedidoDaMensagem,solicitarEtiquetasDoBot,DEFAULT_API_URL};

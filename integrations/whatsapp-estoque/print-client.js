"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

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

/** Fila local duravel para pedidos que nao chegam ao BigLog por instabilidade
 * da internet. Nao grava token, sessao WhatsApp ou quantidade das mercadorias. */
const OUTBOX_NAME = ".argox-pendentes";
const inFlight = new Set();
let reenvioAtivo = false;
let reenvioEmExecucao = false;
const avisosRecentes = new Map();
const RETRY_MS = 30000;

function pastaPendentes(opts = {}) {
  return opts.outboxDir || path.join(process.cwd(), OUTBOX_NAME);
}

function gravarPendente(payload, opts = {}) {
  if (opts.persist === false) return null;
  const dir = pastaPendentes(opts);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, payload.requestId + ".json");
  if (fs.existsSync(file)) return file;
  const tmp = path.join(dir, payload.requestId + "." + process.pid + "." +
    crypto.randomBytes(4).toString("hex") + ".tmp");
  try {
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, payload }), { encoding: "utf8", flag: "wx" });
    fs.renameSync(tmp, file);
  } finally {
    try { fs.unlinkSync(tmp); } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return file;
}

function textoErro(error) {
  const code = error?.cause?.code || error?.code;
  const base = String(error?.message || error);
  return code && !base.includes(code) ? base + " (" + code + ")" : base;
}

function validarToken(token) {
  if (!/^[a-f0-9]{64}$/i.test(token || ""))
    throw new Error("BIGLOG_BOT_PRINT_TOKEN ausente ou invalido.");
}

function obterTransporte(opts = {}) {
  const token = opts.token === undefined ? process.env.BIGLOG_BOT_PRINT_TOKEN : opts.token;
  validarToken(token);
  const endpoint = opts.url ?? process.env.BIGLOG_BOT_PRINT_URL ?? DEFAULT_API_URL;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://"))
    throw new Error("O endereço de impressão deve usar HTTPS.");
  const fetcher = opts.fetch ?? globalThis.fetch;
  if (typeof fetcher !== "function")
    throw new Error("É necessário Node.js 18+ (com suporte a fetch).");
  return { token, endpoint, fetcher };
}

async function enviarHTTP(payload, transporte) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await transporte.fetcher(transporte.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json", "accept": "application/json",
          authorization: "Bearer " + transporte.token
        },
        body: JSON.stringify(payload),
        signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(15000) : undefined
      });
      if (!response.ok) {
        const info = await response.json().catch(() => ({}));
        const message = info?.error || ("HTTP " + response.status);
        const error = new Error(response.status < 500
          ? "BigLog recusou a solicitação: " + message
          : "Serviço de impressão indisponível: " + message);
        error.permanent = response.status >= 400 && response.status < 500;
        throw error;
      }
      const receipt = await response.json();
      if (!receipt?.ok) throw new Error("BigLog não confirmou o enfileiramento.");
      return receipt;
    } catch (error) {
      lastError = error;
      if (error.permanent) break; // Ex.: token errado. Preserva pedido localmente.
      if (attempt < 2)
        await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 800 : 2000));
    }
  }
  throw lastError;
}

async function entregarPendente(payload, opts = {}) {
  if (inFlight.has(payload.requestId))
    return { ok: false, pending: true, requestId: payload.requestId,
      reason: "Este pedido ja esta em envio." };
  inFlight.add(payload.requestId);
  try {
    const receipt = await enviarHTTP(payload, obterTransporte(opts));
    if (opts.persist !== false) {
      const file = path.join(pastaPendentes(opts), payload.requestId + ".json");
      try { fs.unlinkSync(file); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    return { ok: true, pending: false, requestId: payload.requestId,
      labels: receipt.labels, batches: receipt.batches };
  } finally {
    inFlight.delete(payload.requestId);
  }
}

/** Envia apenas empresa/codigo/descricao; quantidade fica em branco.
 * Grava ANTES da requisicao. Falha de rede nao perde o pedido: o processo
 * tenta novamente a cada 30 segundos e apos reiniciar o bot. */
async function solicitarEtiquetasDoBot({ messageId, company, items }, opts = {}) {
  const token = opts.token === undefined ? process.env.BIGLOG_BOT_PRINT_TOKEN : opts.token;
  if (!token) {
    return { ok: false, skipped: true, reason: "Token de integração ainda não configurado." };
  }
  validarToken(token);
  const filtered = items.filter(item =>
    String(item.code ?? "").trim() && String(item.description ?? "").trim());
  if (!filtered.length)
    return { ok: false, skipped: true, reason: "Nenhum item encontrado no estoque." };
  if (filtered.length > 500)
    throw new Error("Uma mensagem pode solicitar no máximo 500 etiquetas.");

  const payload = {
    requestId: idPedidoDaMensagem(messageId),
    company: String(company ?? "").trim().slice(0, 100) || "Não informada",
    items: filtered.map(item => ({
      code: String(item.code).trim().slice(0, 60),
      description: String(item.description).trim().slice(0, 360)
    }))
  };
  gravarPendente(payload, opts); // Durabilidade antes do envio.
  try {
    return await entregarPendente(payload, opts);
  } catch (error) {
    if (opts.persist === false) throw error;
    return { ok: false, pending: true, requestId: payload.requestId,
      labels: filtered.length, reason: textoErro(error) };
  }
}

async function processarPedidosPendentes(opts = {}) {
  if (reenvioEmExecucao) return 0;
  reenvioEmExecucao = true;
  let enviados = 0;
  try {
    const dir = pastaPendentes(opts);
    if (!fs.existsSync(dir)) return 0;
    const files = fs.readdirSync(dir).filter(name =>
      /^[0-9a-f-]{36}\.json$/i.test(name)).sort().slice(0, 20);
    if (!files.length) return 0;
    const transporte = obterTransporte(opts);
    for (const name of files) {
      let payload;
      try {
        const registro = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
        payload = registro.payload;
        if (registro.version !== 1 || !payload ||
            name !== payload.requestId + ".json" || !Array.isArray(payload.items))
          throw new Error("Arquivo pendente invalido");
      } catch (error) {
        console.error("[Argox] Pedido pendente local corrompido:", name, textoErro(error));
        continue;
      }
      try {
        const result = await entregarPendente(payload, {
          ...opts, token: transporte.token, url: transporte.endpoint, fetch: transporte.fetcher
        });
        if (result.ok) {
          enviados++;
          avisosRecentes.delete(name);
          console.log("[Argox] Pedido salvo enviado ao BigLog: " +
            result.labels + " etiqueta(s), " + result.batches + " lote(s).");
        }
      } catch (error) {
        const detail = textoErro(error);
        const aviso = avisosRecentes.get(name);
        if (!aviso || aviso.detail !== detail || Date.now() - aviso.at > 300000) {
          console.warn("[Argox] Pedido continua salvo para reenvio:", detail);
          avisosRecentes.set(name, { detail, at: Date.now() });
        }
      }
    }
  } finally {
    reenvioEmExecucao = false;
  }
  return enviados;
}

function iniciarReenvioAutomatico() {
  if (reenvioAtivo) return;
  reenvioAtivo = true;
  const executar = () => {
    void processarPedidosPendentes().catch(error =>
      console.error("[Argox] Erro ao verificar pedidos pendentes:", textoErro(error)));
  };
  const inicial = setTimeout(executar, 2000);
  if (typeof inicial.unref === "function") inicial.unref();
  const timer = setInterval(executar, RETRY_MS);
  if (typeof timer.unref === "function") timer.unref();
}

module.exports = {
  identificarMensagemWhatsApp, idPedidoDaMensagem, solicitarEtiquetasDoBot,
  processarPedidosPendentes, iniciarReenvioAutomatico, DEFAULT_API_URL
};

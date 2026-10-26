// Conector local opcional. Requer Node 20+ e WhatsApp Web vinculado por QR.
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import whatsapp from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

const root = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(root, ".env")); }
catch { /* Sem .env local: pode receber variáveis do gerenciador de processos. */ }

const { Client, LocalAuth } = whatsapp;
const baseUrl = (process.env.BIGLOGNO_URL ?? "").replace(/\/+$/, "");
const token = process.env.WHATSAPP_BRIDGE_TOKEN ?? "";
const enabled = process.env.WHATSAPP_SEND_ENABLED === "true";
const pollMs = Math.max(5000, Number(process.env.POLL_INTERVAL_MS) || 10000);

if (!baseUrl.startsWith("https://") || token.length < 32) {
  console.error("Configure BIGLOGNO_URL (https) e WHATSAPP_BRIDGE_TOKEN (>=32 caracteres) no .env.");
  process.exit(1);
}
if (!enabled) {
  console.log("Modo seguro: envio DESATIVADO (WHATSAPP_SEND_ENABLED=false).");
  console.log("Cadastre telefones e consentimentos no BigLogno antes de ativar.");
}

let ready = false;
let working = false;
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(root, ".session") }),
  puppeteer: { headless: true },
});
client.on("qr", code => {
  console.log("\nVincule o WhatsApp em Aparelhos conectados → Conectar aparelho:");
  qrcode.generate(code, { small: true });
});
client.on("ready", () => { ready = true; console.log("WhatsApp Web conectado."); });
client.on("disconnected", reason => {
  ready = false;
  console.error("WhatsApp desconectado:", reason);
});
client.on("auth_failure", () => {
  ready = false;
  console.error("Falha na autenticação do WhatsApp. Verifique a sessão local.");
});

async function api(method, body) {
  const response = await fetch(baseUrl + "/api/whatsapp-bridge", {
    method,
    headers: {
      Authorization: "Bearer " + token,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Conector/API: HTTP " + response.status + " - " + (result.error ?? "Resposta inválida"));
  return result;
}

async function checkOne() {
  if (!ready || !enabled || working) return;
  working = true;
  try {
    const job = await api("GET");
    if (!job.messageId) return;
    // A fila já exige autorização do cliente. Não existe envio sem opt-in.
    const digits = String(job.phone ?? "").replace(/\D/g, "");
    if (!/^55\d{10,11}$/.test(digits)) {
      await api("POST", {
        messageId: job.messageId, attemptToken: job.attemptToken,
        sent: false, error: "Número inválido para WhatsApp.",
      });
      return;
    }
    let sent = false, externalMessageId, error;
    try {
      const result = await client.sendMessage(digits + "@c.us", String(job.message ?? ""));
      externalMessageId = result?.id?._serialized;
      sent = true;
    } catch (e) {
      error = e instanceof Error ? e.message : "Falha desconhecida do WhatsApp Web.";
    }
    // Sem confirmação do servidor, a fila permanece EM_ENVIO. Não há retry
    // automático para evitar notificações duplicadas em falhas ambíguas.
    await api("POST", {
      messageId: job.messageId, attemptToken: job.attemptToken,
      sent, ...(sent ? { externalMessageId } : { error: String(error).slice(0, 400) }),
    });
    if (sent) console.log("Aviso enviado via WhatsApp Web, referência:", job.messageId);
    else console.warn("Aviso não enviado:", error);
  } catch (e) {
    console.error("Fila de avisos indisponível:", e instanceof Error ? e.message : e);
  } finally {
    working = false;
  }
}

client.initialize().catch(e => console.error("Não foi possível iniciar WhatsApp Web:", e));
setInterval(() => { void checkOne(); }, pollMs);

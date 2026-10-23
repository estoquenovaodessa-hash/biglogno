// Camada de estado compartilhado online (Supabase).
import { readProtectedState, writeProtectedState } from "./access.functions";
import { toast } from "sonner";

// Chaves compartilhadas (o tema fica só local, é preferência individual).
export const CLOUD_KEYS = [
  "endereco-base",
  "import-history",
  "current-movimentos",
  "current-meta",
  "zona-segura",
  "resolvidos-dia",
  "conferencia",
  "barcodes-base",
  "contagem-atual",
  "ciclos-contagem",
] as const;

export type CloudKey = (typeof CLOUD_KEYS)[number];

const CLEARED_VALUE = { __monitorAbcCleared: true } as const;

function encodeCloudValue(value: unknown): unknown {
  return value === null || value === undefined ? CLEARED_VALUE : value;
}

function decodeCloudValue(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    "__monitorAbcCleared" in value &&
    (value as { __monitorAbcCleared?: unknown }).__monitorAbcCleared === true
  ) {
    return null;
  }
  return value;
}

// Busca todos os registros compartilhados de uma vez.
export async function cloudGetAll(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const data = await readProtectedState();
  for (const row of data ?? []) {
    out[(row as { key: string }).key] = decodeCloudValue((row as { value: unknown }).value);
  }
  return out;
}

// Grava (upsert) um valor compartilhado. Fire-and-forget.
export function cloudSet(key: CloudKey, value: unknown): void {
  void writeProtectedState({ data: { key, value: encodeCloudValue(value) } }).catch(() => {
    toast.error("Não foi possível salvar. Verifique seu acesso e tente novamente.");
  });
}

// Assina mudanças em tempo real. Retorna função de limpeza.
export function subscribeCloud(
  onChange: (key: string, value: unknown) => void,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  let previous = "";
  async function refresh() {
    if (stopped) return;
    try {
      const data = await readProtectedState();
      const signature = JSON.stringify(data);
      if (!stopped && signature !== previous) {
        previous = signature;
        for (const row of data) onChange(row.key, decodeCloudValue(row.value));
      }
    } catch { /* Sessão encerrada: não publicar dados locais. */ }
    if (!stopped) timer = setTimeout(refresh, 30000);
  }
  timer = setTimeout(refresh, 30000);
  return () => { stopped = true; clearTimeout(timer); };
}

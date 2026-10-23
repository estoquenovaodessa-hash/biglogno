// Estado compartilhado no Supabase: leitura incremental de baixo uso de CPU.
// Documentos grandes passam como stream pelo Worker sem desserialização no servidor.
import { readProtectedStateVersions, writeProtectedState } from "./access.functions";
import { toast } from "sonner";

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

type StateVersion = { key: string; updated_at: string };
type Snapshot = { version: string; value: unknown };
const CLEARED_VALUE = { __monitorAbcCleared: true } as const;
const cache = new Map<string, Snapshot>();
const listeners = new Set<(key: string, value: unknown) => void>();
let initialRequest: Promise<Record<string, unknown>> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshing = false;
const POLL_INTERVAL_MS = 60_000;

function encodeCloudValue(value: unknown): unknown {
  return value === null || value === undefined ? CLEARED_VALUE : value;
}

function decodeCloudValue(value: unknown): unknown {
  return value && typeof value === "object" &&
    "__monitorAbcCleared" in value &&
    (value as { __monitorAbcCleared?: unknown }).__monitorAbcCleared === true
    ? null : value;
}

async function versions(): Promise<StateVersion[]> {
  const result = await readProtectedStateVersions();
  if (!Array.isArray(result)) throw new Error("Não foi possível consultar as versões dos dados.");
  return result as StateVersion[];
}

async function loadValue(key: string): Promise<unknown> {
  const response = await fetch(`/api/biglogno-state/${encodeURIComponent(key)}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Falha ao carregar ${key} (HTTP ${response.status}).`);
  const rows = await response.json() as Array<{ value: unknown }>;
  if (!Array.isArray(rows)) throw new Error(`Formato de dados inválido: ${key}.`);
  if (rows.length === 0) throw new Error(`Registro ${key} ausente durante a leitura.`);
  return decodeCloudValue(rows[0].value);
}

// As versões são leves e não carregam o JSON. Um valor só é obtido
// quando ainda não foi visto ou sua coluna updated_at mudou.
async function changes(): Promise<Array<[string, unknown]>> {
  const current = await versions();
  const remaining = new Set(current.map((r) => r.key));
  const changed: Array<[string, unknown]> = [];

  // Lê um arquivo de cada vez; evita estourar simultaneamente os Workers.
  for (const row of current) {
    const old = cache.get(row.key);
    if (old && old.version === row.updated_at) continue;
    const value = await loadValue(row.key);
    cache.set(row.key, { version: row.updated_at, value });
    changed.push([row.key, value]);
  }

  // Uma remoção não deve ressuscitar dados antigos do cache local.
  for (const key of cache.keys()) {
    if (!remaining.has(key)) {
      cache.delete(key);
      changed.push([key, null]);
    }
  }
  return changed;
}

async function currentState(): Promise<Record<string, unknown>> {
  await changes();
  return Object.fromEntries(Array.from(cache, ([key, entry]) => [key, entry.value]));
}

// Evita duas cargas simultâneas de 1,4 MB: StoreProvider e useCiclos
// compartilham a MESMA operação durante o carregamento inicial.
export function cloudGetAll(): Promise<Record<string, unknown>> {
  if (!initialRequest) {
    initialRequest = currentState().finally(() => { initialRequest = null; });
  }
  return initialRequest;
}

// Gravações existentes são mantidas; nenhum dado é eliminado na otimização.
export function cloudSet(key: CloudKey, value: unknown): void {
  void writeProtectedState({ data: { key, value: encodeCloudValue(value) } }).catch(() => {
    toast.error("Não foi possível salvar. Verifique seu acesso e tente novamente.");
  });
}

// Um único temporizador atende TODOS os componentes inscritos.
// Se nada foi alterado no Supabase, processa apenas metadados pequenos.
async function refresh(): Promise<void> {
  if (refreshing || listeners.size === 0) return;
  refreshing = true;
  try {
    const changed = await changes();
    for (const [key, value] of changed) {
      for (const listener of listeners) listener(key, value);
    }
  } catch {
    // Erro transitório: nunca publicar dados locais na nuvem nem limpar o cache.
  } finally {
    refreshing = false;
    if (listeners.size) refreshTimer = setTimeout(() => { void refresh(); }, POLL_INTERVAL_MS);
  }
}

export function subscribeCloud(onChange: (key: string, value: unknown) => void): () => void {
  listeners.add(onChange);
  if (listeners.size === 1 && refreshTimer === null) {
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refresh();
    }, POLL_INTERVAL_MS);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && refreshTimer !== null) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  };
}

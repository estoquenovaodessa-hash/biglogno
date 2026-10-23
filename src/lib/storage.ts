import type {
  EnderecoBase,
  ImportRecord,
  ZonaSeguraRecord,
  ResolvidoNoDia,
  ConferenciaState,
  RawMovimento,
  BarcodesBase,
  ContagemAtual,
} from "./types";
import { cloudSet, CLOUD_KEYS } from "./cloudState";

const PREFIX = "monitor-abc-bignotto:";

const CLOUD_KEY_SET = new Set<string>(CLOUD_KEYS);

const KEYS = {
  theme: PREFIX + "theme",
  enderecoBase: PREFIX + "endereco-base",
  importHistory: PREFIX + "import-history",
  currentMovimentos: PREFIX + "current-movimentos",
  currentMeta: PREFIX + "current-meta",
  zonaSegura: PREFIX + "zona-segura",
  resolvidos: PREFIX + "resolvidos-dia",
  conferencia: PREFIX + "conferencia",
  barcodesBase: PREFIX + "barcodes-base",
  contagemAtual: PREFIX + "contagem-atual",
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  // Espelha no armazenamento compartilhado online (exceto tema).
  const shortKey = key.startsWith(PREFIX) ? key.slice(PREFIX.length) : key;
  if (CLOUD_KEY_SET.has(shortKey)) {
    cloudSet(shortKey as never, value);
  }
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

export interface CurrentMeta {
  importacaoId: string;
  nomeArquivo: string;
  data: string; // ISO datetime (momento da importação)
  dataImportacao: string; // YYYY-MM-DD — data de referência da planilha (do nome do arquivo)
  dataReferenciaOrigem: "arquivo" | "importacao"; // de onde veio a data de referência
}

export const storage = {
  getTheme: () => read<"light" | "dark">(KEYS.theme, "light"),
  setTheme: (t: "light" | "dark") => write(KEYS.theme, t),

  getEnderecoBase: () =>
    read<EnderecoBase>(KEYS.enderecoBase, { registros: {}, atualizadoEm: "" }),
  setEnderecoBase: (b: EnderecoBase) => write(KEYS.enderecoBase, b),

  getImportHistory: () => read<ImportRecord[]>(KEYS.importHistory, []),
  setImportHistory: (h: ImportRecord[]) => write(KEYS.importHistory, h),

  getCurrentMovimentos: () => read<RawMovimento[]>(KEYS.currentMovimentos, []),
  setCurrentMovimentos: (m: RawMovimento[]) => write(KEYS.currentMovimentos, m),

  getCurrentMeta: () => read<CurrentMeta | null>(KEYS.currentMeta, null),
  setCurrentMeta: (m: CurrentMeta | null) => write(KEYS.currentMeta, m),

  getZonaSegura: () => read<ZonaSeguraRecord[]>(KEYS.zonaSegura, []),
  setZonaSegura: (z: ZonaSeguraRecord[]) => write(KEYS.zonaSegura, z),

  getResolvidos: () => read<ResolvidoNoDia[]>(KEYS.resolvidos, []),
  setResolvidos: (r: ResolvidoNoDia[]) => write(KEYS.resolvidos, r),

  getConferencia: () =>
    read<Record<string, ConferenciaState>>(KEYS.conferencia, {}),
  setConferencia: (c: Record<string, ConferenciaState>) =>
    write(KEYS.conferencia, c),

  getBarcodesBase: () =>
    read<BarcodesBase>(KEYS.barcodesBase, {
      registros: {},
      porBarcode: {},
      nomeArquivo: "",
      atualizadoEm: "",
    }),
  setBarcodesBase: (b: BarcodesBase) => write(KEYS.barcodesBase, b),

  getContagemAtual: () =>
    read<ContagemAtual | null>(KEYS.contagemAtual, null),
  setContagemAtual: (c: ContagemAtual | null) => write(KEYS.contagemAtual, c),
};

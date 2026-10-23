import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { storage, type CurrentMeta } from "./storage";
import { cloudGetAll, cloudSet, subscribeCloud, CLOUD_KEYS } from "./cloudState";
import {
  readFileSmart,
  parseMovimento,
  parseEnderecos,
  parseBarcodes,
  parseContagem,
} from "./csv";
import { analyze, dailyKey, entraNoRoteiro } from "./analysis";
import { parseAddress } from "./address";
import { nowParts, extractDateFromFilename } from "./format";
import type {
  EnderecoBase,
  RawMovimento,
  ImportRecord,
  ZonaSeguraRecord,
  ResolvidoNoDia,
  ConferenciaState,
  AnalyzedItem,
  StatusConferencia,
  MotivoAcuracidade,
  BarcodesBase,
  ContagemAtual,
  ContagemItem,
} from "./types";
import { isNegativo, isZerado, isBaixo, isDevolucao, isCritico } from "./analysis";

function sortContagemItems(
  itens: ContagemItem[],
  destaque?: string,
): ContagemItem[] {
  return [...itens].sort((a, b) => {
    if (destaque) {
      if (a.codigo === destaque && b.codigo !== destaque) return -1;
      if (b.codigo === destaque && a.codigo !== destaque) return 1;
    }
    if (a.bipado === b.bipado) return 0;
    return a.bipado ? -1 : 1;
  });
}

const TREATED_STATUSES: StatusConferencia[] = [

  "Conferido",
  "Corrigido no ERP",
  "Aguardando compra",
  "Aguardando devolução",
];

interface StoreValue {
  theme: "light" | "dark";
  toggleTheme: () => void;
  enderecoBase: EnderecoBase;
  movimentos: RawMovimento[];
  meta: CurrentMeta | null;
  history: ImportRecord[];
  zonaSegura: ZonaSeguraRecord[];
  resolvidos: ResolvidoNoDia[];
  conferencia: Record<string, ConferenciaState>;
  items: AnalyzedItem[];
  importEnderecos: (file: File) => Promise<void>;
  importMovimento: (file: File) => Promise<void>;
  clearCurrent: () => void;
  clearZonaSegura: () => void;
  adicionarConferidos: (
    entradas: { codigo: string; observacao?: string; motivo?: MotivoAcuracidade }[],
  ) => { adicionados: number; atualizados: number; ignorados: number };
  setConferencia: (item: AnalyzedItem, status: StatusConferencia, motivo: import("./types").MotivoAcuracidade, obs: string) => void;
  barcodesBase: BarcodesBase;
  contagemAtual: ContagemAtual | null;
  importBarcodesBase: (file: File) => Promise<void>;
  importContagem: (file: File) => Promise<void>;
  atualizarContagemItem: (codigo: string, delta: number) => void;
  setContagemContado: (codigo: string, contado: number) => void;
  removerContagemItem: (codigo: string) => void;
  marcarContagemZerado: (codigo: string) => void;
  finalizarContagem: () => { contados: number; naoContados: ContagemItem[] };
  cancelarContagem: () => void;
  ready: boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

// Códigos numéricos com menos de 5 dígitos ganham zeros à esquerda (17 -> 00017),
// para casar com a planilha de itens.
const padCodigo5 = (c: string): string => {
  const t = String(c ?? "").trim();
  return /^\d{1,4}$/.test(t) ? t.padStart(5, "0") : t;
};

const padZonaSegura = (lista: ZonaSeguraRecord[]): ZonaSeguraRecord[] =>
  lista.map((z) => {
    const cod = padCodigo5(z.codigo);
    return cod === z.codigo ? z : { ...z, codigo: cod };
  });

// Chaves de conferência curtas viram 5 dígitos; mantém a mais recente se duplicar.
const padConferencia = (m: Record<string, ConferenciaState>) => {
  const mapa: Record<string, ConferenciaState> = {};
  let mudou = false;
  for (const [k, v] of Object.entries(m ?? {})) {
    const nk = padCodigo5(k);
    if (nk !== k) mudou = true;
    const ex = mapa[nk];
    if (!ex || String(v?.atualizadoEm ?? "") > String(ex?.atualizadoEm ?? "")) mapa[nk] = v;
  }
  return { mapa, mudou };
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [enderecoBase, setEnderecoBase] = useState<EnderecoBase>({
    registros: {},
    atualizadoEm: "",
  });
  const [movimentos, setMovimentos] = useState<RawMovimento[]>([]);
  const [meta, setMeta] = useState<CurrentMeta | null>(null);
  const [history, setHistory] = useState<ImportRecord[]>([]);
  const [zonaSegura, setZonaSegura] = useState<ZonaSeguraRecord[]>([]);
  const [resolvidos, setResolvidos] = useState<ResolvidoNoDia[]>([]);
  const [conferencia, setConf] = useState<Record<string, ConferenciaState>>({});
  const [barcodesBase, setBarcodesBase] = useState<BarcodesBase>({
    registros: {},
    porBarcode: {},
    nomeArquivo: "",
    atualizadoEm: "",
  });
  const [contagemAtual, setContagemAtual] = useState<ContagemAtual | null>(null);

  // Aplica um valor vindo da nuvem ao estado local (sem reenviar para a nuvem).

  const applyCloud = useCallback((key: string, value: unknown) => {
    switch (key) {
      case "endereco-base":
        setEnderecoBase((value as EnderecoBase) ?? { registros: {}, atualizadoEm: "" });
        break;
      case "current-movimentos":
        setMovimentos((value as RawMovimento[]) ?? []);
        break;
      case "current-meta":
        setMeta((value as CurrentMeta) ?? null);
        break;
      case "import-history":
        setHistory((value as ImportRecord[]) ?? []);
        break;
      case "zona-segura":
        setZonaSegura(padZonaSegura((value as ZonaSeguraRecord[]) ?? []));
        break;
      case "resolvidos-dia":
        setResolvidos((value as ResolvidoNoDia[]) ?? []);
        break;
      case "conferencia": {
        // O banco e a fonte de verdade. Ao limpar conferencias no Supabase,
        // descarte tambem o cache deste dispositivo para nao reimportar dados antigos.
        const normalized = padConferencia((value as Record<string, ConferenciaState>) ?? {}).mapa;
        setConf(normalized);
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem("monitor-abc-bignotto:conferencia", JSON.stringify(normalized));
          } catch { /* Navegador sem espaco ou armazenamento desativado */ }
        }
        break;
      }
      case "barcodes-base":
        setBarcodesBase(
          (value as BarcodesBase) ?? {
            registros: {},
            porBarcode: {},
            nomeArquivo: "",
            atualizadoEm: "",
          },
        );
        break;
      case "contagem-atual":
        setContagemAtual((value as ContagemAtual) ?? null);
        break;
    }
  }, []);

  // Hidratação: LocalStorage (instantâneo) + nuvem compartilhada (fonte de verdade).
  useEffect(() => {
    setLoadError(false);
    setReady(false);
    const t = storage.getTheme();
    setTheme(t);
    // Cache local primeiro para exibição imediata
    const localEnd = storage.getEnderecoBase();
    const localMov = storage.getCurrentMovimentos();
    const localMeta = storage.getCurrentMeta();
    const localHist = storage.getImportHistory();
    const localZona = storage.getZonaSegura();
    const localRes = storage.getResolvidos();
    const localConf = storage.getConferencia();
    const localBar = storage.getBarcodesBase();
    const localCont = storage.getContagemAtual();
    setEnderecoBase(localEnd);
    setMovimentos(localMov);
    setMeta(localMeta);
    setHistory(localHist);
    setZonaSegura(localZona);
    setResolvidos(localRes);
    setConf(localConf);
    setBarcodesBase(localBar);
    setContagemAtual(localCont);

    let alive = true;
    let cleanup = () => {};
    void (async () => {
      const cloud = await cloudGetAll();
      if (!alive) return;
      // O Supabase é a fonte de verdade. A abertura do sistema nunca grava
      // automaticamente cópias antigas deste navegador no banco.
      // Inclusive listas vazias do Supabase devem prevalecer sobre o cache.
      for (const key of CLOUD_KEYS) {
        applyCloud(key, Object.prototype.hasOwnProperty.call(cloud, key) ? cloud[key] : null);
      }
      setReady(true);

      cleanup = subscribeCloud((key, value) => applyCloud(key, value));
    })().catch(() => { if (alive) setLoadError(true); });

    return () => { alive = false; cleanup(); };
  }, [applyCloud, loadAttempt]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      storage.setTheme(next);
      return next;
    });
  }, []);

  const items = useMemo<AnalyzedItem[]>(() => {
    if (!meta) return [];
    return analyze({
      movimentos,
      enderecoBase,
      zonaSegura,
      resolvidosDoDia: resolvidos,
      dataImportacao: meta.dataImportacao,
    });
  }, [movimentos, enderecoBase, zonaSegura, resolvidos, meta]);

  const importEnderecos = useCallback(async (file: File) => {
    const text = await readFileSmart(file);
    const recs = parseEnderecos(text);
    if (recs.length === 0) {
      toast.error("Nenhum registro de endereço encontrado no arquivo.");
      return;
    }
    const registros: EnderecoBase["registros"] = {};
    for (const r of recs) registros[r.codigo] = r;
    const base: EnderecoBase = {
      registros,
      atualizadoEm: new Date().toISOString(),
    };
    setEnderecoBase(base);
    storage.setEnderecoBase(base);

    // Preenche endereços/LINHA/GRUPO na Zona Segura para itens que estavam sem
    // esses dados e que agora aparecem na nova base importada.
    let backfill = 0;
    const novaZona = zonaSegura.map((z) => {
      const rec = registros[z.codigo];
      if (!rec) return z;
      const novoEndereco = (rec.endereco ?? "").trim();
      const precisaEndereco = novoEndereco && !(z.endereco && z.endereco.trim());
      const precisaLinha = rec.linha && !z.linha;
      const precisaGrupo = rec.grupo && !z.grupo;
      if (!precisaEndereco && !precisaLinha && !precisaGrupo) return z;
      backfill++;
      const p = precisaEndereco ? parseAddress(novoEndereco) : null;
      return {
        ...z,
        endereco: precisaEndereco ? novoEndereco : z.endereco,
        bloco: p?.valido ? p.blocoNome : z.bloco,
        rua: p?.valido ? String(p.rua).padStart(2, "0") : z.rua,
        linha: precisaLinha ? rec.linha : z.linha,
        grupo: precisaGrupo ? rec.grupo : z.grupo,
      };
    });
    if (backfill > 0) {
      setZonaSegura(novaZona);
      storage.setZonaSegura(novaZona);
    }


    toast.success(
      `Base de endereços atualizada: ${recs.length} produtos.` +
        (backfill > 0 ? ` ${backfill} endereços preenchidos na Zona Segura.` : ""),
    );
  }, [zonaSegura]);

  const importMovimento = useCallback(
    async (file: File) => {
      const text = await readFileSmart(file);
      const result = parseMovimento(text);
      if (result.itens.length === 0) {
        toast.error(
          "Não foi possível localizar a tabela do relatório (cabeçalho CÓDIGO;DESCRIÇÃO).",
        );
        return;
      }
      const parts = nowParts();
      const dataArquivo = extractDateFromFilename(file.name);
      const dataReferencia = dataArquivo ?? parts.data;
      const newMeta: CurrentMeta = {
        importacaoId: `imp_${Date.now()}`,
        nomeArquivo: file.name,
        data: parts.iso,
        dataImportacao: dataReferencia,
        dataReferenciaOrigem: dataArquivo ? "arquivo" : "importacao",
      };
      setMovimentos(result.itens);
      setMeta(newMeta);
      storage.setCurrentMovimentos(result.itens);
      storage.setCurrentMeta(newMeta);

      // resumo para histórico
      const analyzed = analyze({
        movimentos: result.itens,
        enderecoBase,
        zonaSegura,
        resolvidosDoDia: resolvidos,
        dataImportacao: dataReferencia,
      });
      const rec: ImportRecord = {
        id: newMeta.importacaoId,
        data: parts.iso,
        nomeArquivo: file.name,
        totalItens: analyzed.length,
        itensCriticos: analyzed.filter(isCritico).length,
        ruptura: analyzed.filter(isBaixo).length,
        negativos: analyzed.filter(isNegativo).length,
        zerados: analyzed.filter(isZerado).length,
        devolucoes: analyzed.filter(isDevolucao).length,
        semEndereco: analyzed.filter((i) => i.enderecoStatus !== "ok").length,
        reincidencias: analyzed.filter((i) => i.reincidente).length,
        movidos: analyzed
          .filter((i) => i.qtdMovimentada > 0)
          .map((i) => ({ c: i.codigo, d: i.descricao })),
        erros: analyzed.flatMap((i) => {
          const t = i.tipoErro === "ESTOQUE_ZERADO" ? "Z" : i.tipoErro === "ESTOQUE_NEGATIVO" ? "N" : i.tipoErro === "ESTOQUE_BAIXO" ? "B" : null;
          return t ? [{ c: i.codigo, t: t as "Z" | "N" | "B" }] : [];
        }),
        dataRef: newMeta.dataImportacao,
      };
      const newHistory = [rec, ...history].slice(0, 200);
      setHistory(newHistory);
      storage.setImportHistory(newHistory);

      // Atualiza reincidências na Zona Segura.
      // Só conta reincidência quando a planilha é de uma DATA DIFERENTE da
      // correção e dessa data ainda não foi contabilizada (evita que reimportar
      // a mesma planilha do mesmo dia gere reincidência).
      const reincCodigos = new Set(
        analyzed.filter((i) => i.reincidente).map((i) => i.codigo),
      );
      if (reincCodigos.size > 0) {
        let mudou = false;
        const updatedZona = zonaSegura.map((z) => {
          if (!reincCodigos.has(z.codigo)) return z;
          const dataCorrecao = z.dataImportacaoOriginal || z.dataCorrecao;
          // mesma data da planilha que foi corrigida → não é reincidência
          if (dataReferencia <= dataCorrecao) return z;
          // essa data de planilha já foi contabilizada → não duplica
          if (z.ultimaDataReferencia === dataReferencia) return z;
          mudou = true;
          return {
            ...z,
            quantidadeReincidencias: z.quantidadeReincidencias + 1,
            ultimaReincidencia: parts.iso,
            ultimaDataReferencia: dataReferencia,
          };
        });
        if (mudou) {
          setZonaSegura(updatedZona);
          storage.setZonaSegura(updatedZona);
        }
      }


      toast.success(
        `Relatório importado: ${result.itens.length} itens (${result.ignoradas} linhas ignoradas).`,
      );
    },
    [enderecoBase, zonaSegura, resolvidos, history],
  );

  const clearCurrent = useCallback(() => {
    setMovimentos([]);
    setMeta(null);
    storage.setCurrentMovimentos([]);
    storage.setCurrentMeta(null);
    toast.success("Importação atual limpa. Zona Segura e histórico preservados.");
  }, []);

  const clearZonaSegura = useCallback(() => {
    setZonaSegura([]);
    storage.setZonaSegura([]);
    toast.success("Zona Segura apagada.");
  }, []);

  const adicionarConferidos = useCallback(
    (
      entradas: {
        codigo: string;
        observacao?: string;
        motivo?: import("./types").MotivoAcuracidade;
      }[],
    ) => {
      const parts = nowParts();
      let adicionados = 0;
      let atualizados = 0;
      let ignorados = 0;

      const map = new Map<string, ZonaSeguraRecord>();
      for (const z of zonaSegura) map.set(z.codigo, z);

      const newConf = { ...conferencia };

      for (const ent of entradas) {
        const codigo = ent.codigo.trim();
        if (!codigo) {
          ignorados++;
          continue;
        }
        const motivo: import("./types").MotivoAcuracidade =
          ent.motivo === "Divergente" ? "Divergente" : "Correto";
        const obs = (ent.observacao ?? "Conferência manual").trim();
        const item = items.find((i) => i.codigo === codigo);
        const endRec = enderecoBase.registros[codigo];
        const descricao = item?.descricao ?? endRec?.descricao ?? "";
        const endereco = item?.endereco ?? endRec?.endereco ?? "";
        const p = parseAddress(endereco);

        // Alimenta o índice de acuracidade (Correto / Divergente).
        newConf[codigo] = {
          status: motivo === "Divergente" ? "Divergente" : "Conferido",
          motivo,
          observacao: obs,
          atualizadoEm: parts.iso,
        };

        const existing = map.get(codigo);
        if (existing) {
          map.set(codigo, {
            ...existing,
            status: "Conferido",
            acaoRealizada: "Conferido (manual)",
            observacao: obs || existing.observacao,
            dataCorrecao: parts.data,
            horaCorrecao: parts.hora,
            quantidadeCorrecoes: existing.quantidadeCorrecoes + 1,
            dataImportacaoOriginal: meta?.dataImportacao ?? parts.data,
          });
          atualizados++;
        } else {
          map.set(codigo, {
            codigo,
            descricao,
            endereco,
            bloco: p.blocoNome,
            rua: p.valido ? String(p.rua).padStart(2, "0") : "",
            curvaOperacional: item?.curva ?? "",
            categoriaOriginal: item?.categoria ?? "Conferência manual",
            tipoErro: item?.tipoErro ?? "MANUAL",
            estoqueNaCorrecao: item?.qtdEstoque ?? 0,
            quantidadeMovimentadaNaCorrecao: item?.qtdMovimentada ?? 0,
            acaoRealizada: "Conferido (manual)",
            status: "Conferido",
            observacao: obs,
            dataCorrecao: parts.data,
            horaCorrecao: parts.hora,
            dataImportacaoOriginal: meta?.dataImportacao ?? parts.data,
            importacaoId: meta?.importacaoId ?? "",
            quantidadeCorrecoes: 1,
            quantidadeReincidencias: 0,
            ultimaReincidencia: null,
            linha: item?.linha ?? endRec?.linha ?? "",
            grupo: item?.grupo ?? endRec?.grupo ?? "",
          });
          adicionados++;
        }

      }

      const novaZona = Array.from(map.values());
      setZonaSegura(novaZona);
      storage.setZonaSegura(novaZona);
      setConf(newConf);
      storage.setConferencia(newConf);
      return { adicionados, atualizados, ignorados };
    },
    [zonaSegura, items, enderecoBase, meta, conferencia],
  );

  const setConferencia = useCallback(
    (item: AnalyzedItem, status: StatusConferencia, motivo: import("./types").MotivoAcuracidade, obs: string) => {
      const parts = nowParts();
      // Atualiza estado de conferência
      const newConf = {
        ...conferencia,
        [item.codigo]: {
          status,
          motivo,
          observacao: obs,
          atualizadoEm: parts.iso,
        } as ConferenciaState,
      };
      setConf(newConf);
      storage.setConferencia(newConf);

      if (!TREATED_STATUSES.includes(status)) {
        toast.success(`Status atualizado: ${status}`);
        return;
      }

      const p = parseAddress(item.endereco);

      // Zona Segura — atualiza ou cria
      const existingIdx = zonaSegura.findIndex((z) => z.codigo === item.codigo);
      let newZona: ZonaSeguraRecord[];
      if (existingIdx >= 0) {
        const ex = zonaSegura[existingIdx];
        const updated: ZonaSeguraRecord = {
          ...ex,
          status,
          acaoRealizada: status,
          observacao: obs || ex.observacao,
          estoqueNaCorrecao: item.qtdEstoque,
          quantidadeMovimentadaNaCorrecao: item.qtdMovimentada,
          tipoErro: item.tipoErro,
          categoriaOriginal: item.categoria,
          quantidadeCorrecoes: ex.quantidadeCorrecoes + 1,
          dataCorrecao: parts.data,
          horaCorrecao: parts.hora,
        };
        newZona = [...zonaSegura];
        newZona[existingIdx] = updated;
      } else {
        const novo: ZonaSeguraRecord = {
          codigo: item.codigo,
          descricao: item.descricao,
          endereco: item.endereco,
          bloco: p.blocoNome,
          rua: p.valido ? String(p.rua).padStart(2, "0") : "",
          curvaOperacional: item.curva,
          categoriaOriginal: item.categoria,
          tipoErro: item.tipoErro,
          estoqueNaCorrecao: item.qtdEstoque,
          quantidadeMovimentadaNaCorrecao: item.qtdMovimentada,
          acaoRealizada: status,
          status,
          observacao: obs,
          dataCorrecao: parts.data,
          horaCorrecao: parts.hora,
          dataImportacaoOriginal: meta?.dataImportacao ?? parts.data,
          importacaoId: meta?.importacaoId ?? "",
          quantidadeCorrecoes: 1,
          quantidadeReincidencias: 0,
          ultimaReincidencia: null,
          linha: item.linha ?? "",
          grupo: item.grupo ?? "",
        };
        newZona = [novo, ...zonaSegura];

      }
      setZonaSegura(newZona);
      storage.setZonaSegura(newZona);

      // Resolvido no dia (cumulatividade)
      if (item.tipoErro !== "NENHUM" && meta) {
        const chave = dailyKey(
          meta.dataImportacao,
          item.codigo,
          item.tipoErro,
          p.enderecoNormalizado,
        );
        const novoRes: ResolvidoNoDia = {
          chave,
          data: meta.dataImportacao,
          codigo: item.codigo,
          descricao: item.descricao,
          endereco: item.endereco,
          tipoErro: item.tipoErro,
          status,
          observacao: obs,
          horarioTratamento: parts.hora,
          importacaoId: meta.importacaoId,
        };
        const newRes = [novoRes, ...resolvidos.filter((r) => r.chave !== chave)];
        setResolvidos(newRes);
        storage.setResolvidos(newRes);
      }

      toast.success(`Item ${item.codigo} registrado na Zona Segura.`);
    },
    [conferencia, zonaSegura, resolvidos, meta],
  );

  // === Contagem por bipagem (Conferência Manual) ===




  const importBarcodesBase = useCallback(async (file: File) => {
    const text = await readFileSmart(file);
    const base = parseBarcodes(text, file.name);
    const total = Object.keys(base.registros).length;
    if (total === 0) {
      toast.error("Nenhum código encontrado na base (verifique se tem CÓDIGO e CÓD. BARRAS).");
      return;
    }
    setBarcodesBase(base);
    storage.setBarcodesBase(base);
    toast.success(
      `Base de códigos de barras atualizada: ${total} produtos, ${Object.keys(base.porBarcode).length} códigos de barras.`,
    );
  }, []);

  const importContagem = useCallback(async (file: File) => {
    const text = await readFileSmart(file);
    const itens = parseContagem(text);
    if (itens.length === 0) {
      toast.error("Nenhum item encontrado na planilha de contagem.");
      return;
    }
    const nova: ContagemAtual = {
      nomeArquivo: file.name,
      atualizadoEm: new Date().toISOString(),
      itens: sortContagemItems(itens),
    };
    setContagemAtual(nova);
    storage.setContagemAtual(nova);
    toast.success(`Contagem carregada: ${itens.length} itens.`);
  }, []);


  const atualizarContagemItem = useCallback(
    (codigo: string, delta: number) => {
      setContagemAtual((atual) => {
        if (!atual) return atual;
        const itens = sortContagemItems(
          atual.itens.map((it) => {
            if (it.codigo !== codigo) return it;
            const novo = Math.max(0, it.contado + delta);
            return { ...it, contado: novo, bipado: novo > 0 || it.bipado };
          }),
          codigo,
        );
        const nova = { ...atual, itens, atualizadoEm: new Date().toISOString() };
        storage.setContagemAtual(nova);
        return nova;
      });
    },
    [],
  );

  const setContagemContado = useCallback(
    (codigo: string, contado: number) => {
      setContagemAtual((atual) => {
        if (!atual) return atual;
        const c = Math.max(0, Math.floor(contado));
        const itens = sortContagemItems(
          atual.itens.map((it) =>
            it.codigo === codigo ? { ...it, contado: c, bipado: c > 0 || it.bipado } : it,
          ),
          codigo,
        );
        const nova = { ...atual, itens, atualizadoEm: new Date().toISOString() };
        storage.setContagemAtual(nova);
        return nova;
      });
    },
    [],
  );

  const removerContagemItem = useCallback(
    (codigo: string) => {
      setContagemAtual((atual) => {
        if (!atual) return atual;
        const itens = sortContagemItems(
          atual.itens.map((it) =>
            it.codigo === codigo ? { ...it, contado: 0, bipado: false } : it,
          ),
        );
        const nova = { ...atual, itens, atualizadoEm: new Date().toISOString() };
        storage.setContagemAtual(nova);
        return nova;
      });
    },
    [],
  );

  const marcarContagemZerado = useCallback(
    (codigo: string) => {
      setContagemAtual((atual) => {
        if (!atual) return atual;
        const itens = sortContagemItems(
          atual.itens.map((it) =>
            it.codigo === codigo ? { ...it, contado: 0, bipado: true } : it,
          ),
          codigo,
        );
        const nova = { ...atual, itens, atualizadoEm: new Date().toISOString() };
        storage.setContagemAtual(nova);
        return nova;
      });
    },
    [],
  );


  const cancelarContagem = useCallback(() => {
    setContagemAtual(null);
    storage.setContagemAtual(null);
    toast.success("Contagem cancelada.");
  }, []);

  const finalizarContagem = useCallback((): {
    contados: number;
    naoContados: ContagemItem[];
  } => {
    if (!contagemAtual) return { contados: 0, naoContados: [] };
    const parts = nowParts();
    const contados = contagemAtual.itens.filter((i) => i.bipado);
    const naoContados = contagemAtual.itens.filter((i) => !i.bipado);

    // Envia itens contados para Zona Segura + Conferência
    const map = new Map<string, ZonaSeguraRecord>();
    for (const z of zonaSegura) map.set(z.codigo, z);
    const newConf: Record<string, ConferenciaState> = { ...conferencia };

    for (const it of contados) {
      const divergente = it.contado !== it.saldo;
      const motivo: MotivoAcuracidade = divergente ? "Divergente" : "Correto";
      const status: StatusConferencia = divergente ? "Divergente" : "Conferido";
      const obs = divergente
        ? `Contagem: ${it.contado} vs consta: ${it.saldo}`
        : `Contagem confere (${it.contado}).`;
      newConf[it.codigo] = {
        status,
        motivo,
        observacao: obs,
        atualizadoEm: parts.iso,
      };
      const p = parseAddress(it.endereco);
      const existing = map.get(it.codigo);
      if (existing) {
        map.set(it.codigo, {
          ...existing,
          status: "Conferido",
          acaoRealizada: "Conferido (contagem)",
          observacao: obs,
          estoqueNaCorrecao: it.saldo,
          quantidadeMovimentadaNaCorrecao: it.contado,
          dataCorrecao: parts.data,
          horaCorrecao: parts.hora,
          quantidadeCorrecoes: existing.quantidadeCorrecoes + 1,
          dataImportacaoOriginal: existing.dataImportacaoOriginal || parts.data,
          linha: existing.linha || it.linha || "",
          grupo: existing.grupo || it.grupo || "",
        });
      } else {
        map.set(it.codigo, {
          codigo: it.codigo,
          descricao: it.descricao,
          endereco: it.endereco,
          bloco: p.blocoNome,
          rua: p.valido ? String(p.rua).padStart(2, "0") : "",
          curvaOperacional: "",
          categoriaOriginal: "Contagem",
          tipoErro: "CONTAGEM",
          estoqueNaCorrecao: it.saldo,
          quantidadeMovimentadaNaCorrecao: it.contado,
          acaoRealizada: "Conferido (contagem)",
          status: "Conferido",
          observacao: obs,
          dataCorrecao: parts.data,
          horaCorrecao: parts.hora,
          dataImportacaoOriginal: parts.data,
          importacaoId: "",
          quantidadeCorrecoes: 1,
          quantidadeReincidencias: 0,
          ultimaReincidencia: null,
          linha: it.linha || "",
          grupo: it.grupo || "",
        });
      }
    }

    const novaZona = Array.from(map.values());
    setZonaSegura(novaZona);
    storage.setZonaSegura(novaZona);
    setConf(newConf);
    storage.setConferencia(newConf);
    setContagemAtual(null);
    storage.setContagemAtual(null);

    return { contados: contados.length, naoContados };
  }, [contagemAtual, zonaSegura, conferencia]);

  const value: StoreValue = {
    theme,
    toggleTheme,
    enderecoBase,
    movimentos,
    meta,
    history,
    zonaSegura,
    resolvidos,
    conferencia,
    items,
    importEnderecos,
    importMovimento,
    clearCurrent,
    clearZonaSegura,
    adicionarConferidos,
    setConferencia,
    barcodesBase,
    contagemAtual,
    importBarcodesBase,
    importContagem,
    atualizarContagemItem,
    setContagemContado,
    removerContagemItem,
    marcarContagemZerado,
    finalizarContagem,
    cancelarContagem,
    ready,
  };

  if (!ready) return <main className="flex min-h-screen items-center justify-center bg-background px-4"><div className="max-w-md text-center">
    <h1 className="mb-3 text-xl font-bold">Gestão de Logística</h1>
    {loadError ? <><p role="alert" className="mb-5 text-destructive">Não foi possível carregar seus dados. As informações salvas foram preservadas. Tente novamente ou entre novamente com sua senha.</p><div className="flex justify-center gap-3"><Button onClick={() => setLoadAttempt(n => n + 1)}>Tentar novamente</Button><Button variant="outline" onClick={() => window.location.reload()}>Entrar novamente</Button></div></> : <p role="status" className="text-muted-foreground">Carregando suas informações salvas…</p>}
  </div></main>;
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore deve ser usado dentro de StoreProvider");
  return ctx;
}

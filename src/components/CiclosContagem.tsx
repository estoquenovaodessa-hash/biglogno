import { useMemo, useState } from "react";
import { Lightbulb, ClipboardList, ArrowLeft, ShieldCheck, CheckCircle2, Search, Trash2, Layers, FolderOpen, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { coletarEContar, itensColeta } from "@/lib/coletar";
import { listarParados, exportarLoteParados, selecionarLote } from "@/lib/parados";
import {
  useCiclos, tituloCiclo, proximoNumero, podeCriar, aplicarFinalizacao, metricasCiclo, excluirCiclo,
  listarSelecoes, itensDaSelecao, type SelecaoContagem, type TipoSelecao,
  type Ciclo, type CicloItem, type TipoCiclo,
  comparativoReinventario, iniciarReinventario, reinventarioEmAberto, aplicarFinalizacaoReinventario, ultimoReinventarioFinalizado,
} from "@/lib/ciclos";
import { lerPdfDivergencias } from "@/lib/pdfDivergencias";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const nf = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const dt = (iso?: string) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const dataCurto = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const hora = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");
const fmtDelta = (n: number) => `${n >= 0 ? "+" : ""}${nf(n)} p.p.`;
// No endereçamento, a linha pode vir como "001.000 - LUKMA".
// No resumo do grupo, exibimos apenas o nome legível: "Linha LUKMA".
const nomeCurtoLinha = (linha: string) => linha.trim().replace(/^\d+(?:\.\d+)*\s*[-–—]\s*/, "").trim();
const normalizarPesquisa = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
const chaveSelecao = (tipo: TipoSelecao, valor: string) => JSON.stringify([tipo, valor.trim()]);

// Uma contagem passa a ser elegível um mês-calendário após a primeira finalização.
// O dia é limitado ao último dia do mês de destino (ex.: 31/01 -> 28/02 ou 29/02).
function umMesApos(iso: string): number {
  const data = new Date(iso);
  if (!Number.isFinite(data.getTime())) return Number.POSITIVE_INFINITY;
  const ano = data.getUTCFullYear();
  const mesSeguinte = data.getUTCMonth() + 1;
  const ultimoDiaMesSeguinte = new Date(Date.UTC(ano, mesSeguinte + 1, 0)).getUTCDate();
  return Date.UTC(
    ano, mesSeguinte, Math.min(data.getUTCDate(), ultimoDiaMesSeguinte),
    data.getUTCHours(), data.getUTCMinutes(), data.getUTCSeconds(), data.getUTCMilliseconds(),
  );
}

// Ciclos com reinventário concluído, não em andamento e com a primeira contagem
// finalizada há pelo menos um mês. Ordenação: último reinventário mais antigo primeiro.
function listarSugestoesReinventario(ciclos: Ciclo[], agora: number) {
  return ciclos.flatMap((ciclo) => {
    if (ciclo.status !== "finalizado" || reinventarioEmAberto(ciclo)) return [];
    const ultimo = ultimoReinventarioFinalizado(ciclo);
    if (!ultimo || !ultimo.finalizadoEm) return [];
    const primeiraContagem = ciclo.finalizadoEm ?? ciclo.criadoEm;
    if (umMesApos(primeiraContagem) > agora) return [];
    const dataUltimo = Date.parse(ultimo.finalizadoEm);
    if (!Number.isFinite(dataUltimo)) return [];
    return [{ ciclo, ultimoEm: ultimo.finalizadoEm, dataUltimo }];
  }).sort((a, b) => a.dataUltimo - b.dataUltimo || a.ciclo.titulo.localeCompare(b.ciclo.titulo, "pt-BR", { numeric: true }));
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "bad" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", tone === "ok" && "text-success", tone === "bad" && "text-destructive")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("mt-0.5 text-lg font-bold tabular-nums text-foreground",
        tone === "ok" && "text-success", tone === "bad" && "text-destructive")}>{value}</span>
    </span>
  );
}

export function CiclosContagem() {
  const { items, zonaSegura, enderecoBase, movimentos, conferencia, adicionarConferidos } = useStore();
  const { ciclos, ready, salvar } = useCiclos();
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [finalizando, setFinalizando] = useState<Ciclo | null>(null);
  const [reinventarioDialogo, setReinventarioDialogo] = useState<Ciclo | null>(null);
  const [excluindo, setExcluindo] = useState<Ciclo | null>(null);
  const [arquivoFinalizacao, setArquivoFinalizacao] = useState<File | null>(null);
  const [arquivoReinventario, setArquivoReinventario] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [selecionando, setSelecionando] = useState(false);
  const [mostrandoSugestoes, setMostrandoSugestoes] = useState(false);
  const [tipoSelecao, setTipoSelecao] = useState<TipoSelecao>("linha");
  const [buscaSelecao, setBuscaSelecao] = useState("");

  const statusPorSelecao = useMemo(() => {
    const status = new Map<string, { estado: Ciclo["status"]; criadoEm: string }>();
    for (const ciclo of ciclos) {
      if (!ciclo.selecao) continue;
      const chave = chaveSelecao(ciclo.selecao.tipo, ciclo.selecao.valor);
      const anterior = status.get(chave);
      if (!anterior || ciclo.criadoEm >= anterior.criadoEm) {
        status.set(chave, { estado: ciclo.status, criadoEm: ciclo.criadoEm });
      }
    }
    return status;
  }, [ciclos]);

  const linhasPorGrupo = useMemo(() => {
    const mapa = new Map<string, Set<string>>();
    for (const item of Object.values(enderecoBase.registros)) {
      const grupo = item.grupo?.trim();
      const linha = nomeCurtoLinha(item.linha ?? "");
      if (!grupo || !linha) continue;
      if (!mapa.has(grupo)) mapa.set(grupo, new Set());
      mapa.get(grupo)!.add(linha);
    }
    const resultado = new Map<string, string[]>();
    for (const [grupo, linhas] of mapa) {
      resultado.set(grupo, [...linhas].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })));
    }
    return resultado;
  }, [enderecoBase]);

  const selecoes = useMemo(() => {
    const lista = listarSelecoes(enderecoBase, tipoSelecao, tipoSelecao === "linha" ? buscaSelecao : "");
    if (tipoSelecao !== "grupo" || !buscaSelecao.trim()) return lista;
    const pesquisa = normalizarPesquisa(buscaSelecao);
    return lista.filter((selecao) => normalizarPesquisa(
      `${selecao.valor} ${(linhasPorGrupo.get(selecao.valor) ?? []).join(" ")}`,
    ).includes(pesquisa));
  }, [enderecoBase, tipoSelecao, buscaSelecao, linhasPorGrupo]);

  const parados = useMemo(
    () => listarParados(enderecoBase, movimentos, zonaSegura, conferencia),
    [enderecoBase, movimentos, zonaSegura, conferencia],
  );

  const [dataReferenciaSugestoes, setDataReferenciaSugestoes] = useState(() => Date.now());
  const sugestoesReinventario = useMemo(
    () => listarSugestoesReinventario(ciclos, dataReferenciaSugestoes),
    [ciclos, dataReferenciaSugestoes],
  );
  const abrirSugestoes = () => {
    setDataReferenciaSugestoes(Date.now());
    setMostrandoSugestoes(true);
  };

  const criar = (tipo: TipoCiclo, itens: CicloItem[], selecao?: SelecaoContagem) => {
    const numero = proximoNumero(ciclos, tipo);
    const c: Ciclo = {
      id: crypto.randomUUID(), tipo, numero, titulo: tituloCiclo(tipo, numero),
      criadoEm: new Date().toISOString(), status: "aberto", itens, enviadoZona: false,
      ...(selecao ? { selecao } : {}),
    };
    salvar([c, ...ciclos]);
    return c;
  };

  const substituirCiclo = (cicloAtualizado: Ciclo) => {
    salvar(ciclos.map((c) => (c.id === cicloAtualizado.id ? cicloAtualizado : c)));
  };

  const onColetar = () => {
    if (!podeCriar(ciclos, "apuracao")) return toast.error("Finalize a Apuração aberta antes de criar outra.");
    const lista = itensColeta(items);
    if (!lista.length) return toast.error("Nenhum item zerado, baixo ou negativo — importe o relatório.");
    const datas: Record<string, string> = {};
    for (const z of zonaSegura) {
      const d = String(z.dataCorrecao ?? "");
      if (d && (!datas[z.codigo] || d > datas[z.codigo])) datas[z.codigo] = d;
    }
    coletarEContar(items, datas);
    const c = criar("apuracao", lista.map((i) => ({
      codigo: i.codigo, descricao: i.descricao, endereco: i.endereco || "",
      saldo: i.qtdEstoque, contagem: null, diferenca: 0, custo: 0, vrDiferenca: 0,
    })));
    toast.success(`${c.titulo} criada com ${lista.length} itens (arquivos baixados).`);
  };

  const onSelecao = (selecao: SelecaoContagem) => {
    if (!ready || !podeCriar(ciclos, "padrao")) return toast.error("Finalize o Padrão aberto antes de criar outro.");
    const ultimas = new Map(parados.map((item) => [item.codigo, item.ultimaContagem]));
    for (const z of zonaSegura) {
      const data = String(z.dataCorrecao ?? "");
      if (data > (ultimas.get(z.codigo) ?? "")) ultimas.set(z.codigo, data);
    }
    for (const [codigo, registro] of Object.entries(conferencia)) {
      const data = String(registro.atualizadoEm ?? "").slice(0, 10);
      if (data > (ultimas.get(codigo) ?? "")) ultimas.set(codigo, data);
    }
    const lista = itensDaSelecao(enderecoBase, selecao).map((item) => ({
      codigo: item.codigo, descricao: item.descricao, endereco: item.endereco || "",
      linha: item.linha || "", ultimaContagem: ultimas.get(item.codigo) ?? "",
    }));
    if (!lista.length) return toast.error("Nenhum produto encontrado nesta seleção.");
    const nome = `${selecao.tipo === "linha" ? "Linha" : "Grupo"}: ${selecao.valor}`;
    const codigoArquivo = selecao.valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 60);
    exportarLoteParados(lista, lista.length, { titulo: nome, arquivo: `${selecao.tipo}-${codigoArquivo}` });
    const c = criar("padrao", selecionarLote(lista, lista.length).map((item) => ({
      codigo: item.codigo, descricao: item.descricao, endereco: item.endereco,
      saldo: 0, contagem: null, diferenca: 0, custo: 0, vrDiferenca: 0,
    })), selecao);
    setSelecionando(false);
    setAbertoId(c.id);
    toast.success(`${c.titulo} criado · ${nome} · ${lista.length} itens (arquivos baixados).`);
  };

  const finalizar = async (comPdf: boolean) => {
    if (!finalizando) return;
    setBusy(true);
    try {
      let linhas = null;
      if (comPdf) {
        if (!arquivoFinalizacao) return toast.error("Escolha o PDF de divergências.");
        linhas = await lerPdfDivergencias(arquivoFinalizacao);
        if (!linhas.length) return toast.error("Não encontrei itens no PDF. Confira se é o Relatório de Diferenças.");
      }
      const fin = aplicarFinalizacao(finalizando, linhas);
      substituirCiclo(fin);
      const m = metricasCiclo(fin);
      toast.success(`${fin.titulo} finalizado: ${m.divergentes} divergentes, ${m.corretos} corretos.`);
      setFinalizando(null);
      setArquivoFinalizacao(null);
    } catch (e) {
      console.error(e);
      toast.error("Não consegui ler o PDF.");
    } finally {
      setBusy(false);
    }
  };

  const baixarArquivosReinventario = (c: Ciclo) => {
    const arquivo = `reinventario-${c.numero}`;
    const titulo = `${c.titulo} · Reinventário`;
    const lista = c.itens.map((item) => ({
      codigo: item.codigo,
      descricao: item.descricao,
      endereco: item.endereco || "",
      linha: "",
      ultimaContagem: c.finalizadoEm?.slice(0, 10) ?? "",
    }));
    exportarLoteParados(lista, lista.length, { titulo, arquivo });
  };

  const onReinventariar = (c: Ciclo) => {
    if (c.status !== "finalizado") return toast.error("Finalize o ciclo antes de reinventariar.");
    if (reinventarioEmAberto(c)) {
      setReinventarioDialogo(c);
      return;
    }
    const atualizado = iniciarReinventario(c);
    substituirCiclo(atualizado);
    baixarArquivosReinventario(c);
    toast.success(`Arquivos do reinventário de ${c.titulo} baixados. Após concluir a nova contagem, clique em "Finalizar reinventário".`);
  };

  const finalizarReinventario = async (comPdf: boolean) => {
    if (!reinventarioDialogo) return;
    setBusy(true);
    try {
      let linhas = null;
      if (comPdf) {
        if (!arquivoReinventario) return toast.error("Escolha o PDF de divergências do reinventário.");
        linhas = await lerPdfDivergencias(arquivoReinventario);
        if (!linhas.length) return toast.error("Não encontrei itens no PDF. Confira se é o Relatório de Diferenças.");
      }
      const atual = ciclos.find((x) => x.id === reinventarioDialogo.id) ?? reinventarioDialogo;
      // Evita processar duas vezes um reinventário já finalizado.
      if (!reinventarioEmAberto(atual)) {
        toast.error("Este reinventário já foi finalizado. Atualize a tela.");
        setReinventarioDialogo(null);
        return;
      }
      const fin = aplicarFinalizacaoReinventario(atual, linhas);
      const ultimo = ultimoReinventarioFinalizado(fin);
      if (!ultimo) throw new Error("Não foi possível identificar o reinventário finalizado.");

      // Envia o resultado da ÚLTIMA contagem, nunca as divergências do primeiro ciclo.
      // adicionarConferidos atualiza/insere por código na Zona Segura e mantém o
      // motivo (Correto/Divergente) no índice de acuracidade da aplicação.
      const envio = adicionarConferidos(ultimo.itens.map((item) => {
        const classificacao = item.diferenca !== 0 ? "Divergente" : "Correto";
        return {
          codigo: item.codigo,
          motivo: classificacao,
          observacao: `${fin.titulo} · Reinventário · ${classificacao}`,
        };
      }));
      const finEnviado: Ciclo = {
        ...fin,
        enviadoZona: true,
        enviadoEm: new Date().toISOString(),
      };
      substituirCiclo(finEnviado);
      const comp = comparativoReinventario(finEnviado);
      toast.success(
        `Reinventário finalizado e enviado à Zona Segura: ${envio.adicionados} novos, ${envio.atualizados} atualizados.` +
        (comp ? ` Acuracidade: ${nf(comp.reinventario)}% (${fmtDelta(comp.variacao)} em relação à primeira contagem).` : ""),
      );
      setReinventarioDialogo(null);
      setArquivoReinventario(null);
    } catch (e) {
      console.error(e);
      toast.error("Não consegui ler o PDF do reinventário.");
    } finally {
      setBusy(false);
    }
  };

  const enviarZona = (c: Ciclo) => {
    if (c.enviadoZona || c.status !== "finalizado") return;
    const r = adicionarConferidos(c.itens.map((i) => ({
      codigo: i.codigo, motivo: i.diferenca !== 0 ? "Divergente" : "Correto", observacao: c.titulo,
    })));
    substituirCiclo({ ...c, enviadoZona: true, enviadoEm: new Date().toISOString() });
    toast.success(`${c.titulo} enviado à Zona Segura: ${r.adicionados} novos, ${r.atualizados} atualizados.`);
  };

  const aberto = ciclos.find((c) => c.id === abertoId) ?? null;

  const confirmarExclusao = () => {
    if (!excluindo) return;
    salvar(excluirCiclo(ciclos, excluindo.id));
    if (abertoId === excluindo.id) setAbertoId(null);
    toast.success(`${excluindo.titulo} excluído.`);
    setExcluindo(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center rounded-lg border border-border bg-card px-3 py-2">
          <Button size="sm" variant="secondary" className="gap-2" onClick={abrirSugestoes} disabled={!ready}>
            <Lightbulb className="h-4 w-4" /> Sugestão de Reinventário
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setSelecionando(true)} disabled={!ready || !podeCriar(ciclos, "padrao")}>
            <Layers className="h-4 w-4" /> Contar por Linha ou Grupo
          </Button>
          <Button onClick={onColetar} disabled={!ready || !podeCriar(ciclos, "apuracao")}>
            <ClipboardList className="h-4 w-4" /> Coletar e Contar
          </Button>
        </div>
      </div>

      {aberto ? (
        <CicloDetalhe c={aberto} onVoltar={() => setAbertoId(null)}
          onFinalizar={() => setFinalizando(aberto)} onZona={() => enviarZona(aberto)}
          onReinventariar={() => onReinventariar(aberto)} onExcluir={() => setExcluindo(aberto)} />
      ) : (
        <div className="space-y-2">
          {!ready && <p className="text-sm text-muted-foreground">Carregando ciclos…</p>}
          {ready && !ciclos.length && (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nenhum ciclo ainda. Clique em "Contar por Linha ou Grupo" ou "Coletar e Contar" para criar o primeiro.
            </div>
          )}
          {ciclos.map((c) => {
            const m = metricasCiclo(c);
            const reinv = comparativoReinventario(c);
            const reinvAberto = !!reinventarioEmAberto(c);
            return (
              <div key={c.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
                <button onClick={() => setAbertoId(c.id)} className="min-w-0 flex-1 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold">{c.titulo}</span>
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold",
                      c.status === "aberto" ? "bg-warning/15 text-warning" : "bg-success/15 text-success")}>
                      {c.status === "aberto" ? "Em contagem" : "Concluído"}
                    </span>
                    {reinvAberto && <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning">Reinventário em andamento</span>}
                    {c.enviadoZona && <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">Na Zona Segura</span>}
                  </div>
                  {c.selecao && <p className="mt-1 break-words text-base font-semibold text-primary">{c.selecao.tipo === "linha" ? "Linha" : "Grupo"}: {c.selecao.valor}</p>}
                  <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
                    <Stat label="Criado" value={dataCurto(c.criadoEm)} />
                    <Stat label="Hora" value={hora(c.criadoEm)} />
                    <Stat label="Itens" value={nf(m.total)} />
                    {c.status === "finalizado" && <>
                      <Stat label="Divergentes" value={nf(m.divergentes)} />
                      <Stat label="Acuracidade ciclo" value={`${nf(m.acuracidade)}%`} />
                      {reinv && <>
                        <Stat label="Acurac. reinventário" value={`${nf(reinv.reinventario)}%`} tone={reinv.variacao >= 0 ? "ok" : "bad"} />
                        <Stat label="Variação" value={fmtDelta(reinv.variacao)} tone={reinv.variacao >= 0 ? "ok" : "bad"} />
                        <Stat label="Último reinventário" value={dt(reinv.finalizadoEm)} />
                      </>}
                      <Stat label="Valor" value={brl(m.valor)} tone={m.valor < 0 ? "bad" : m.valor > 0 ? "ok" : undefined} />
                    </>}
                  </div>
                </button>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Excluir ciclo ${c.titulo}`} title="Excluir ciclo" onClick={() => setExcluindo(c)}><Trash2 className="h-4 w-4" /></Button>
                  {c.status === "aberto" && <Button size="sm" variant="outline" onClick={() => setFinalizando(c)}><CheckCircle2 className="h-4 w-4" /> Finalizar Ciclo</Button>}
                  {c.status === "finalizado" && (
                    <Button size="sm" onClick={() => onReinventariar(c)}>
                      <RotateCcw className="h-4 w-4" /> {reinvAberto ? "Finalizar reinventário" : "Reinventariar"}
                    </Button>
                  )}
                  <Button size="sm" variant={c.enviadoZona ? "ghost" : "default"} disabled={c.enviadoZona || c.status !== "finalizado"}
                    title={c.status !== "finalizado" ? "Finalize o ciclo primeiro" : undefined} onClick={() => enviarZona(c)}>
                    <ShieldCheck className="h-4 w-4" /> {c.enviadoZona ? "Enviado" : "Zona Segura"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={mostrandoSugestoes} onOpenChange={setMostrandoSugestoes}>
        <DialogContent className="max-h-[85dvh] max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Sugestão de Reinventário</DialogTitle>
            <DialogDescription>
              Ciclos com pelo menos um reinventário concluído e primeira contagem finalizada há um mês ou mais.
              Prioridade para o último reinventário mais antigo.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {sugestoesReinventario.length} {sugestoesReinventario.length === 1 ? "ciclo elegível" : "ciclos elegíveis"}
          </p>
          <div className="max-h-[50dvh] divide-y divide-border overflow-y-auto">
            {sugestoesReinventario.map(({ ciclo, ultimoEm }, indice) => (
              <div key={ciclo.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{indice + 1}º · {ciclo.titulo}</span>
                    {indice === 0 && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">Prioridade máxima</span>}
                  </div>
                  {ciclo.selecao && <p className="text-sm text-primary">
                    {ciclo.selecao.tipo === "grupo" ? "Grupo" : "Linha"}: {ciclo.selecao.valor}
                  </p>}
                  <p className="text-sm text-muted-foreground">
                    Primeira contagem: {dt(ciclo.finalizadoEm ?? ciclo.criadoEm)}
                  </p>
                  <p className="text-sm text-muted-foreground">Último reinventário: {dt(ultimoEm)}</p>
                  <p className="text-sm text-muted-foreground">{nf(ciclo.itens.length)} itens</p>
                </div>
                <Button size="sm" className="shrink-0" onClick={() => {
                  setMostrandoSugestoes(false);
                  onReinventariar(ciclo);
                }}>
                  <RotateCcw className="h-4 w-4" /> Reinventariar
                </Button>
              </div>
            ))}
            {!sugestoesReinventario.length && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma sugestão no momento. São considerados somente ciclos já reinventariados,
                com a primeira contagem concluída há pelo menos um mês e sem reinventário em andamento.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={selecionando} onOpenChange={setSelecionando}>
        <DialogContent className="max-h-[85dvh] max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Contar por Linha ou Grupo</DialogTitle>
            <DialogDescription>{tipoSelecao === "linha" ? "Linhas" : "Grupos"} · {selecoes.length} encontrados</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant={tipoSelecao === "linha" ? "default" : "outline"} aria-pressed={tipoSelecao === "linha"} onClick={() => { setTipoSelecao("linha"); setBuscaSelecao(""); }}><Layers /> Linhas</Button>
            <Button variant={tipoSelecao === "grupo" ? "default" : "outline"} aria-pressed={tipoSelecao === "grupo"} onClick={() => { setTipoSelecao("grupo"); setBuscaSelecao(""); }}><FolderOpen /> Grupos</Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input autoFocus aria-label="Pesquisar linha ou grupo" placeholder="Nome ou código…" value={buscaSelecao} onChange={(e) => setBuscaSelecao(e.target.value)} className="h-10 bg-background pl-9" />
          </div>
          <div className="max-h-[45dvh] overflow-y-auto divide-y divide-border">
            {selecoes.map((selecao) => {
              const estado = statusPorSelecao.get(chaveSelecao(selecao.tipo, selecao.valor))?.estado;
              const linhas = selecao.tipo === "grupo" ? (linhasPorGrupo.get(selecao.valor) ?? []) : [];
              const rotuloLinha = linhas.length === 1 ? `Linha ${linhas[0]}`
                : linhas.length > 1 ? `Linhas ${linhas.join(", ")}` : "";
              return (
                <div key={`${selecao.tipo}:${selecao.valor}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words text-base font-semibold">
                      {selecao.valor}
                      {rotuloLinha && <span className="ml-1 text-sm font-normal text-muted-foreground">({rotuloLinha})</span>}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-muted-foreground">{nf(selecao.total)} itens</span>
                      {estado === "finalizado" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success" title="Ciclo finalizado" aria-label="Contagem finalizada">
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Contado
                        </span>
                      )}
                      {estado === "aberto" && (
                        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">Em contagem</span>
                      )}
                    </div>
                  </div>
                  <Button className="shrink-0" aria-label={`Criar ciclo ${selecao.valor}`} disabled={!ready || !podeCriar(ciclos, "padrao")} onClick={() => onSelecao(selecao)}><ClipboardList /> Criar ciclo</Button>
                </div>
              );
            })}
            {!selecoes.length && <p className="py-6 text-center text-muted-foreground">Nenhuma {tipoSelecao === "linha" ? "linha encontrada" : "grupo encontrado"}.</p>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!excluindo} onOpenChange={(o) => { if (!o) setExcluindo(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir ciclo "{excluindo?.titulo}"?</DialogTitle>
            <DialogDescription>
              O ciclo e seus resultados serão removidos da Contagem. Esta ação não pode ser desfeita.
              {excluindo?.status === "aberto" && " O botão de contagem deste tipo será liberado."}
              {excluindo?.enviadoZona && " Os itens já enviados à Zona Segura serão mantidos."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setExcluindo(null)}>Voltar</Button>
            <Button variant="destructive" onClick={confirmarExclusao}><Trash2 className="h-4 w-4" /> Excluir ciclo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!finalizando} onOpenChange={(o) => { if (!o) { setFinalizando(null); setArquivoFinalizacao(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar ciclo "{finalizando?.titulo}"</DialogTitle>
            <DialogDescription>
              Importe o Relatório de Diferenças (PDF) para cruzar com os itens do ciclo. Após finalizar, o ciclo fica somente para consulta.
            </DialogDescription>
          </DialogHeader>
          <label className="text-sm font-medium">Relatório de Diferenças (PDF)</label>
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => setArquivoFinalizacao(e.target.files?.[0] ?? null)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setFinalizando(null)}>Cancelar</Button>
            <Button variant="outline" disabled={busy} onClick={() => finalizar(false)}>Finalizar sem divergências</Button>
            <Button disabled={busy || !arquivoFinalizacao} onClick={() => finalizar(true)}>Finalizar Ciclo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reinventarioDialogo} onOpenChange={(o) => { if (!o) { setReinventarioDialogo(null); setArquivoReinventario(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar reinventário "{reinventarioDialogo?.titulo}"</DialogTitle>
            <DialogDescription>
              Importe o Relatório de Diferenças (PDF) do reinventário. O sistema irá comparar a acuracidade da primeira contagem com a acuracidade deste reinventário.
            </DialogDescription>
          </DialogHeader>
          <label className="text-sm font-medium">Relatório de Diferenças do reinventário (PDF)</label>
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => setArquivoReinventario(e.target.files?.[0] ?? null)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReinventarioDialogo(null)}>Cancelar</Button>
            <Button variant="outline" disabled={busy} onClick={() => finalizarReinventario(false)}>Finalizar sem divergências</Button>
            <Button disabled={busy || !arquivoReinventario} onClick={() => finalizarReinventario(true)}>Finalizar reinventário</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CicloDetalhe({ c, onVoltar, onFinalizar, onZona, onReinventariar, onExcluir }: {
  c: Ciclo; onVoltar: () => void; onFinalizar: () => void; onZona: () => void; onReinventariar: () => void; onExcluir: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "div" | "ok">("todos");
  const m = metricasCiclo(c);
  const reinv = comparativoReinventario(c);
  const reinvAberto = !!reinventarioEmAberto(c);
  const fin = c.status === "finalizado";
  const q = busca.trim().toLowerCase();
  const lista = c.itens.filter((i) =>
    (!q || i.codigo.includes(q) || i.descricao.toLowerCase().includes(q)) &&
    (filtro === "todos" || (filtro === "div" ? i.diferenca !== 0 : i.diferenca === 0)));
  const tone = (n: number) => (n > 0 ? "text-success" : n < 0 ? "text-destructive" : "text-muted-foreground");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onVoltar}><ArrowLeft className="h-4 w-4" /> Ciclos</Button>
        <h2 className="text-lg font-bold">{c.titulo}</h2>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", fin ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
          {fin ? `Concluído ${dt(c.finalizadoEm)}` : "Em contagem"}
        </span>
        {reinvAberto && <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning">Reinventário em andamento</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={onExcluir}><Trash2 className="h-4 w-4" /> Excluir ciclo</Button>
          {!fin && <Button size="sm" variant="outline" onClick={onFinalizar}><CheckCircle2 className="h-4 w-4" /> Finalizar Ciclo</Button>}
          {fin && <Button size="sm" onClick={onReinventariar}><RotateCcw className="h-4 w-4" /> {reinvAberto ? "Finalizar reinventário" : "Reinventariar"}</Button>}
          <Button size="sm" disabled={c.enviadoZona || !fin} onClick={onZona}>
            <ShieldCheck className="h-4 w-4" /> {c.enviadoZona ? "Enviado à Zona Segura" : "Zona Segura"}
          </Button>
        </div>
      </div>

      {c.selecao && <p className="break-words text-lg font-semibold text-primary">{c.selecao.tipo === "linha" ? "Linha" : "Grupo"}: {c.selecao.valor}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <Metric label="Itens contados" value={String(m.total)} />
        <Metric label="Com divergência" value={fin ? String(m.divergentes) : "—"} tone={m.divergentes ? "bad" : undefined} />
        <Metric label="Sem divergência" value={fin ? String(m.corretos) : "—"} tone="ok" />
        <Metric label="Acuracidade do ciclo" value={fin ? `${nf(m.acuracidade)}%` : "—"} />
        <Metric label="Acuracidade reinventário" value={reinv ? `${nf(reinv.reinventario)}%` : "—"} tone={reinv ? (reinv.variacao >= 0 ? "ok" : "bad") : undefined} sub={reinv?.finalizadoEm ? `Finalizado em ${dt(reinv.finalizadoEm)}` : reinvAberto ? "Reinventário em andamento" : "Sem reinventário"} />
        <Metric label="Variação reinventário" value={reinv ? fmtDelta(reinv.variacao) : "—"} tone={reinv ? (reinv.variacao >= 0 ? "ok" : "bad") : undefined} sub="Comparado com a primeira contagem" />
        <Metric label="Diferença em saldo (un)" value={fin ? nf(m.saldoAbs) : "—"} sub={fin ? `Sobra +${nf(m.sobra)} · Falta ${nf(m.falta)}` : undefined} />
        <Metric label="Diferença em valor" value={fin ? brl(m.valor) : "—"} tone={m.valor < 0 ? "bad" : m.valor > 0 ? "ok" : undefined} />
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por código ou descrição…"
            className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm" />
        </div>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="todos">Todos os itens</option>
          <option value="div">Divergentes</option>
          <option value="ok">Corretos</option>
        </select>
      </div>

      <div className="mobile-table-wrap overflow-x-auto rounded-xl border border-border">
        <table className="mobile-table w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Código</th>
              <th className="px-3 py-2 text-left">Descrição</th>
              <th className="px-3 py-2 text-center">Endereço</th>
              <th className="px-3 py-2 text-right">Saldo sistema</th>
              <th className="px-3 py-2 text-right">Contagem</th>
              <th className="px-3 py-2 text-right">Diferença (un)</th>
              <th className="px-3 py-2 text-right">Custo unitário</th>
              <th className="px-3 py-2 text-right">Diferença (R$)</th>
            </tr>
          </thead>
          <tbody>
            {lista.slice(0, 500).map((i) => (
              <tr key={i.codigo} className="border-t border-border">
                <td data-label="Código" className="px-3 py-2 font-mono">{i.codigo}</td>
                <td data-label="Descrição" className="px-3 py-2">{i.descricao}</td>
                <td data-label="Endereço" className="px-3 py-2 text-center">{i.endereco || "—"}</td>
                <td data-label="Saldo sistema" className="px-3 py-2 text-right tabular-nums">{nf(i.saldo)}</td>
                <td data-label="Contagem" className="px-3 py-2 text-right tabular-nums">{i.contagem === null ? "—" : nf(i.contagem)}</td>
                <td data-label="Diferença (un)" className={cn("px-3 py-2 text-right tabular-nums", tone(i.diferenca))}>{nf(i.diferenca)}</td>
                <td data-label="Custo unitário" className="px-3 py-2 text-right tabular-nums">{brl(i.custo)}</td>
                <td data-label="Diferença (R$)" className={cn("px-3 py-2 text-right tabular-nums", tone(i.vrDiferenca))}>{brl(i.vrDiferenca)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

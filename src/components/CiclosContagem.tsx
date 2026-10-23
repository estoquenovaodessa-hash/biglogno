import { useMemo, useState } from "react";
import { Archive, ClipboardList, ArrowLeft, ShieldCheck, CheckCircle2, Search, Trash2, Layers, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { coletarEContar, itensColeta } from "@/lib/coletar";
import { listarParados, exportarLoteParados, selecionarLote } from "@/lib/parados";
import {
  useCiclos, tituloCiclo, proximoNumero, podeCriar, aplicarFinalizacao, metricasCiclo, excluirCiclo,
  listarSelecoes, itensDaSelecao, type SelecaoContagem, type TipoSelecao,
  type Ciclo, type CicloItem, type TipoCiclo,
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

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "bad" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", tone === "ok" && "text-success", tone === "bad" && "text-destructive")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// Rótulo pequeno + número grande: usado nos cartões da lista de ciclos.
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
  const [excluindo, setExcluindo] = useState<Ciclo | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [selecionando, setSelecionando] = useState(false);
  const [tipoSelecao, setTipoSelecao] = useState<TipoSelecao>("linha");
  const [buscaSelecao, setBuscaSelecao] = useState("");
  const selecoes = useMemo(() => listarSelecoes(enderecoBase, tipoSelecao, buscaSelecao), [enderecoBase, tipoSelecao, buscaSelecao]);
  const [lote, setLote] = useState<number>(() =>
    typeof window === "undefined" ? 200 : Number(localStorage.getItem("monitor-abc-lote-parados")) || 200,
  );
  const parados = useMemo(
    () => listarParados(enderecoBase, movimentos, zonaSegura, conferencia),
    [enderecoBase, movimentos, zonaSegura, conferencia],
  );
  const nuncaContados = parados.filter((p) => !p.ultimaContagem).length;

  const finalizados = ciclos.filter((c) => c.status === "finalizado");
  const acurGeral = finalizados.length
    ? finalizados.reduce((s, c) => s + metricasCiclo(c).acuracidade, 0) / finalizados.length
    : 0;

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

  const onParados = () => {
    if (!podeCriar(ciclos, "padrao")) return toast.error("Finalize o Padrão aberto antes de criar outro.");
    if (!parados.length) return toast.error("Nenhum item parado — importe a base de endereços e o relatório de vendas.");
    const sel = selecionarLote(parados, lote);
    exportarLoteParados(parados, lote);
    const c = criar("padrao", sel.map((i) => ({
      codigo: i.codigo, descricao: i.descricao, endereco: i.endereco,
      saldo: 0, contagem: null, diferenca: 0, custo: 0, vrDiferenca: 0,
    })));
    toast.success(`${c.titulo} criado com ${sel.length} itens (arquivos baixados).`);
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
        if (!arquivo) return toast.error("Escolha o PDF de divergências.");
        linhas = await lerPdfDivergencias(arquivo);
        if (!linhas.length) return toast.error("Não encontrei itens no PDF. Confira se é o Relatório de Diferenças.");
      }
      const fin = aplicarFinalizacao(finalizando, linhas);
      salvar(ciclos.map((c) => (c.id === fin.id ? fin : c)));
      const m = metricasCiclo(fin);
      toast.success(`${fin.titulo} finalizado: ${m.divergentes} divergentes, ${m.corretos} corretos.`);
      setFinalizando(null);
      setArquivo(null);
    } catch (e) {
      console.error(e);
      toast.error("Não consegui ler o PDF.");
    } finally {
      setBusy(false);
    }
  };

  const enviarZona = (c: Ciclo) => {
    if (c.enviadoZona || c.status !== "finalizado") return;
    const r = adicionarConferidos(c.itens.map((i) => ({
      codigo: i.codigo, motivo: i.diferenca !== 0 ? "Divergente" : "Correto", observacao: c.titulo,
    })));
    salvar(ciclos.map((x) => (x.id === c.id ? { ...x, enviadoZona: true, enviadoEm: new Date().toISOString() } : x)));
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
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          <span>Parados: <strong className="text-foreground">{parados.length}</strong> · nunca contados: <strong className="text-foreground">{nuncaContados}</strong></span>
          <label className="flex items-center gap-1">
            Lote do dia
            <input type="number" min={1} value={lote}
              onChange={(e) => { const n = Math.max(1, Number(e.target.value) || 1); setLote(n); localStorage.setItem("monitor-abc-lote-parados", String(n)); }}
              className="w-20 rounded border border-input bg-background px-2 py-1 text-foreground" />
          </label>
          <Button size="sm" variant="secondary" onClick={onParados} disabled={!ready || !podeCriar(ciclos, "padrao")}>
            <Archive className="h-4 w-4" /> Contar Parados
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
        <CicloDetalhe c={aberto} acurGeral={acurGeral} onVoltar={() => setAbertoId(null)}
          onFinalizar={() => setFinalizando(aberto)} onZona={() => enviarZona(aberto)} onExcluir={() => setExcluindo(aberto)} />
      ) : (
        <div className="space-y-2">
          {!ready && <p className="text-sm text-muted-foreground">Carregando ciclos…</p>}
          {ready && !ciclos.length && (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nenhum ciclo ainda. Clique em "Coletar e Contar" ou "Contar Parados" para criar o primeiro.
            </div>
          )}
          {ciclos.map((c) => {
            const m = metricasCiclo(c);
            return (
              <div key={c.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
                <button onClick={() => setAbertoId(c.id)} className="min-w-0 flex-1 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold">{c.titulo}</span>
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold",
                      c.status === "aberto" ? "bg-warning/15 text-warning" : "bg-success/15 text-success")}>
                      {c.status === "aberto" ? "Em contagem" : "Concluído"}
                    </span>
                    {c.enviadoZona && <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">Na Zona Segura</span>}
                  </div>
                  {c.selecao && <p className="mt-1 break-words text-base font-semibold text-primary">{c.selecao.tipo === "linha" ? "Linha" : "Grupo"}: {c.selecao.valor}</p>}
                  <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
                    <Stat label="Criado" value={dataCurto(c.criadoEm)} />
                    <Stat label="Hora" value={hora(c.criadoEm)} />
                    <Stat label="Itens" value={nf(m.total)} />
                    {c.status === "finalizado" && <>
                      <Stat label="Divergentes" value={nf(m.divergentes)} />
                      <Stat label="Acuracidade" value={`${nf(m.acuracidade)}%`} />
                      <Stat label="Valor" value={brl(m.valor)} tone={m.valor < 0 ? "bad" : m.valor > 0 ? "ok" : undefined} />
                    </>}
                  </div>
                </button>
                <div className="flex gap-2">
                   <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Excluir ciclo ${c.titulo}`} title="Excluir ciclo" onClick={() => setExcluindo(c)}><Trash2 className="h-4 w-4" /></Button>
                  {c.status === "aberto" && <Button size="sm" variant="outline" onClick={() => setFinalizando(c)}><CheckCircle2 className="h-4 w-4" /> Finalizar Ciclo</Button>}
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
            {selecoes.map((selecao) => (
              <div key={selecao.valor} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words text-base font-semibold">{selecao.valor}</p>
                  <p className="text-sm text-muted-foreground">{nf(selecao.total)} itens</p>
                </div>
                <Button className="shrink-0" aria-label={`Criar ciclo ${selecao.valor}`} disabled={!ready || !podeCriar(ciclos, "padrao")} onClick={() => onSelecao(selecao)}><ClipboardList /> Criar ciclo</Button>
              </div>
            ))}
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

      <Dialog open={!!finalizando} onOpenChange={(o) => { if (!o) { setFinalizando(null); setArquivo(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar ciclo "{finalizando?.titulo}"</DialogTitle>
            <DialogDescription>
              Importe o Relatório de Diferenças (PDF) para cruzar com os itens do ciclo. Após finalizar, o ciclo fica somente para consulta.
            </DialogDescription>
          </DialogHeader>
          <label className="text-sm font-medium">Relatório de Diferenças (PDF)</label>
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setFinalizando(null)}>Cancelar</Button>
            <Button variant="outline" disabled={busy} onClick={() => finalizar(false)}>Finalizar sem divergências</Button>
            <Button disabled={busy || !arquivo} onClick={() => finalizar(true)}>Finalizar Ciclo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CicloDetalhe({ c, acurGeral, onVoltar, onFinalizar, onZona, onExcluir }: {
  c: Ciclo; acurGeral: number; onVoltar: () => void; onFinalizar: () => void; onZona: () => void; onExcluir: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "div" | "ok">("todos");
  const m = metricasCiclo(c);
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
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={onExcluir}><Trash2 className="h-4 w-4" /> Excluir ciclo</Button>
          {!fin && <Button size="sm" variant="outline" onClick={onFinalizar}><CheckCircle2 className="h-4 w-4" /> Finalizar Ciclo</Button>}
          <Button size="sm" disabled={c.enviadoZona || !fin} onClick={onZona}>
            <ShieldCheck className="h-4 w-4" /> {c.enviadoZona ? "Enviado à Zona Segura" : "Zona Segura"}
          </Button>
        </div>
      </div>

      {c.selecao && <p className="break-words text-lg font-semibold text-primary">{c.selecao.tipo === "linha" ? "Linha" : "Grupo"}: {c.selecao.valor}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        <Metric label="Acuracidade estoque" value={`${nf(acurGeral)}%`} sub="Média entre todos os ciclos" />
        <Metric label="Itens contados" value={String(m.total)} />
        <Metric label="Com divergência" value={fin ? String(m.divergentes) : "—"} tone={m.divergentes ? "bad" : undefined} />
        <Metric label="Sem divergência" value={fin ? String(m.corretos) : "—"} tone="ok" />
        <Metric label="Acuracidade do ciclo" value={fin ? `${nf(m.acuracidade)}%` : "—"} />
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

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp, FileDown, Plus, Printer, Tag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import {
  SBO_UNITS, createSboCatalog, findSboItem, parseSboQuantity,
  createSboLabelsPdf, sboLabelFilename, type SboUnit, type SboLabel,
} from "@/lib/sbo-label";
import { requestSboPrint, getSboPrintRequestStatus } from "@/lib/sbo-print.functions";
import { useOperatorRights } from "./useOperatorRights";

type Row = { id: number; code: string; description: string; quantityText: string; unit: SboUnit };
function toLabel(row: Row): SboLabel | null {
  const quantity = parseSboQuantity(row.quantityText, row.unit);
  return quantity === null ? null : { code: row.code, description: row.description, quantity, unit: row.unit };
}

/** Mini S.B.O. separado do formulário de conferência e conectado à mesma
 * fila segura da Argox que já funciona no tablet. */
export function MiniSboLabels() {
  const { barcodesBase, enderecoBase, items, ready } = useStore();
  const rights = useOperatorRights();
  const catalog = useMemo(() => createSboCatalog(barcodesBase, enderecoBase, items),
    [barcodesBase, enderecoBase, items]);
  const [expanded, setExpanded] = useState(true);
  const [code, setCode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitOverride, setUnitOverride] = useState<SboUnit | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const previousRequest = useRef<{ id: string; snapshot: string; sent: boolean } | null>(null);
  const nextId = useRef(0);
  const codeInput = useRef<HTMLInputElement>(null);
  const selected = useMemo(() => findSboItem(catalog, code), [catalog, code]);
  const effectiveUnit = unitOverride ?? selected?.unit ?? "UN";
  const labels = useMemo(() => rows.map(toLabel), [rows]);
  const valid = labels.length > 0 && labels.every(item => item !== null);
  const canWrite = rights.conferencia;
  const sendPrint = useServerFn(requestSboPrint);
  const readStatus = useServerFn(getSboPrintRequestStatus);
  const status = useQuery({
    queryKey: ["sbo-remote-print", requestId],
    enabled: !!requestId,
    queryFn: () => readStatus({ data: { requestId: requestId! } }),
    refetchInterval: query => query.state.data?.completed ? false : 5000,
    refetchOnWindowFocus: true,
  });

  function addRow(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canWrite) return;
    if (!ready) { setError("Aguarde o carregamento da base de produtos."); return; }
    if (!selected) { setError("Código ou código de barras não encontrado."); return; }
    if (parseSboQuantity(quantity, effectiveUnit) === null) {
      setError(effectiveUnit === "UN"
        ? "Para UN, informe uma quantidade inteira maior que zero."
        : "Informe quantidade válida com até três casas decimais.");
      return;
    }
    if (rows.length >= 500) { setError("Limite de 500 etiquetas por lista."); return; }
    setRows(old => [...old, { id: ++nextId.current, code: selected.code,
      description: selected.description, quantityText: quantity.trim(), unit: effectiveUnit }]);
    setCode(""); setQuantity("1"); setUnitOverride(null); setError("");
    codeInput.current?.focus();
  }

  function patch(id: number, updates: Partial<Row>) {
    setRows(old => old.map(row => row.id === id ? { ...row, ...updates } : row));
    setError("");
  }

  function downloadPdf() {
    if (!valid || generating) return;
    setGenerating(true); setError("");
    try {
      const printable = labels as SboLabel[];
      createSboLabelsPdf(printable).save(sboLabelFilename(printable));
      toast.success("PDF S.B.O com " + printable.length + " etiqueta(s) gerado.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível gerar o PDF.";
      setError(message); toast.error(message);
    } finally { setGenerating(false); }
  }

  async function print() {
    if (!canWrite || !valid || sending) return;
    const printable = labels as SboLabel[];
    const snapshot = JSON.stringify(printable);
    const prior = previousRequest.current;
    if (prior?.sent && prior.snapshot === snapshot &&
      !window.confirm("Esta lista já foi enviada à Argox. Imprimir novamente? Isso pode gerar duplicatas.")) return;
    if (!window.confirm("Enviar " + printable.length + " etiqueta(s) S.B.O à Argox do computador?")) return;
    const id = prior && !prior.sent && prior.snapshot === snapshot ? prior.id : crypto.randomUUID();
    previousRequest.current = { id, snapshot, sent: false };
    setSending(true); setError("");
    try {
      const result = await sendPrint({ data: { requestId: id, labels: printable } });
      previousRequest.current = { id, snapshot, sent: true };
      setRequestId(result.requestId);
      toast.success(result.labelCount + " etiqueta(s) enviadas à fila da Argox.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Falha ao solicitar impressão S.B.O.";
      setError(message); toast.error(message);
    } finally { setSending(false); }
  }

  return <section aria-label="Mini S.B.O — etiquetas de produtos"
    className="min-w-0 overflow-hidden rounded-xl border border-border border-t-4 border-t-primary bg-card shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-4">
      <div className="flex items-center gap-2">
        <Tag className="h-5 w-5 shrink-0 text-primary" />
        <div><h2 className="text-base font-extrabold">S.B.O rápido</h2>
          <p className="text-xs text-muted-foreground">Etiquetas 60 × 30 mm · Argox</p></div>
      </div>
      <Button type="button" size="sm" variant="ghost" className="gap-1.5"
        aria-expanded={expanded} aria-controls="mini-sbo-content"
        onClick={() => setExpanded(current => !current)}>
        {expanded ? <>Recolher <ChevronUp className="h-4 w-4" /></>
          : <>Abrir <ChevronDown className="h-4 w-4" /></>}
      </Button>
    </header>

    {expanded && <div id="mini-sbo-content" className="space-y-3 border-t border-border/70 px-3 pb-4 pt-3 sm:px-4">
      <form onSubmit={addRow} className="space-y-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_90px] gap-2">
          <label className="min-w-0 text-xs font-bold" htmlFor="mini-sbo-code">
            Código / código de barras
            <Input id="mini-sbo-code" ref={codeInput} value={code}
              onChange={e => { setCode(e.target.value); setUnitOverride(null); setError(""); }}
              className="mt-1 h-10 font-mono text-base" placeholder="Ex.: 03610" maxLength={100}
              autoComplete="off" disabled={!canWrite || sending} />
          </label>
          <label className="min-w-0 text-xs font-bold" htmlFor="mini-sbo-quantity">
            Quantidade
            <Input id="mini-sbo-quantity" value={quantity} inputMode="decimal"
              onChange={e => { setQuantity(e.target.value); setError(""); }}
              className="mt-1 h-10 px-2 text-base" disabled={!canWrite || sending} />
          </label>
        </div>
        <div className="flex min-w-0 flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-xs font-bold" htmlFor="mini-sbo-unit">
            Unidade
            <select id="mini-sbo-unit" value={effectiveUnit}
              onChange={e => setUnitOverride(e.target.value as SboUnit)}
              disabled={!canWrite || sending}
              className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
              {SBO_UNITS.map(unit => <option value={unit} key={unit}>{unit}</option>)}
            </select>
          </label>
          <Button type="submit" className="h-10 min-w-[120px] flex-1 gap-1.5 font-bold"
            disabled={!ready || !canWrite || sending}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>
        {!!code && (selected
          ? <p role="status" className="break-words rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-lg font-extrabold leading-snug text-emerald-800 dark:text-emerald-300 sm:text-xl">
              {selected.description}
            </p>
          : <p role="status" className="break-words text-sm font-semibold text-destructive">
              Produto não encontrado no cadastro.
            </p>
        )}
        {!ready && <p role="status" className="text-xs text-muted-foreground">Carregando cadastro de itens…</p>}
        {!canWrite && <p role="status" className="text-xs text-muted-foreground">Sem permissão de Conferência.</p>}
      </form>

      <div className="rounded-lg border border-border/80">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
          <h3 className="text-xs font-extrabold">Lista · {rows.length} etiqueta(s)</h3>
          {rows.length > 0 && <Button type="button" size="sm" variant="ghost" disabled={sending}
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => { if (window.confirm("Limpar a lista S.B.O?")) { setRows([]); setError(""); } }}>
            <X className="h-3.5 w-3.5" /> Limpar
          </Button>}
        </div>
        {rows.length ? <ul className="max-h-[260px] divide-y divide-border/70 overflow-y-auto">
          {rows.map(row => <li key={row.id} className="flex min-w-0 flex-wrap items-center gap-2 px-2.5 py-2">
            <div className="min-w-[110px] flex-1">
              <p className="text-xs font-extrabold">{row.code}</p>
              <p className="break-words text-[11px] leading-4 text-muted-foreground">{row.description}</p>
            </div>
            <Input value={row.quantityText} inputMode="decimal"
              aria-label={"Quantidade da etiqueta " + row.code}
              onChange={e => patch(row.id, { quantityText: e.target.value })}
              className="h-9 w-[75px] px-2 text-sm" disabled={!canWrite || sending} />
            <select value={row.unit} aria-label={"Unidade da etiqueta " + row.code}
              onChange={e => patch(row.id, { unit: e.target.value as SboUnit })}
              className="h-9 w-[83px] rounded-md border border-input bg-background px-1 text-xs"
              disabled={!canWrite || sending}>
              {SBO_UNITS.map(unit => <option value={unit} key={unit}>{unit}</option>)}
            </select>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0"
              aria-label={"Excluir etiqueta " + row.code} disabled={sending}
              onClick={() => setRows(old => old.filter(item => item.id !== row.id))}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </li>)}
        </ul> : <p className="px-3 py-4 text-center text-xs text-muted-foreground">
          Informe um item e pressione Enter para adicionar.
        </p>}
      </div>

      {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" disabled={!valid || sending || generating}
          className="h-10 gap-1.5 text-xs font-bold" onClick={downloadPdf}>
          <FileDown className="h-4 w-4" /> Gerar PDF
        </Button>
        <Button type="button" disabled={!valid || sending || generating || !canWrite}
          className="h-10 gap-1.5 text-xs font-extrabold" onClick={() => void print()}>
          <Printer className="h-4 w-4" /> {sending ? "Enviando…" : "Imprimir na Argox (" + rows.length + ")"}
        </Button>
      </div>
      {requestId && <div role="status" aria-live="polite"
        className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
        <strong className="block">Última solicitação à Argox</strong>
        {status.isError ? <span>Não foi possível consultar a fila; verifique a conexão.</span>
        : !status.data?.total ? <span>Aguardando atualização da fila…</span>
        : <span>{status.data.completed && !status.data.errors
            ? "Todos os lotes enviados ao spooler do Windows."
            : status.data.errors ? String(status.data.errors) + " lote(s) com erro."
            : status.data.claimed ? "Computador processando a impressão…"
            : "Aguardando o computador conectado à Argox."}
          {" "}Lotes: {status.data.spooled}/{status.data.total}.
          {status.data.error && <span className="mt-1 block text-destructive">{status.data.error}</span>}
        </span>}
        <p className="mt-1 text-[11px] text-muted-foreground">
          Spooler confirmado não garante saída física. Confira a Argox antes de repetir.
        </p>
      </div>}
    </div>}
  </section>;
}

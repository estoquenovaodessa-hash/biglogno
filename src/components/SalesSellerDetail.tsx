import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Save, Trash2, UserRoundCheck } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSellerSalesCount } from "@/lib/sales-verification.functions";
import { sellerMetrics, sellerSalesSchema, errorComment, type VerificationRecord } from "@/lib/sales-verification";
import { creditedExpeditionRecords, isExpeditionAuthorshipEligible, type ExpeditionAuthorshipMap } from "@/lib/sales-authorship";
import { Percent, SalesDataTable } from "./SalesDataTable";

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function SalesSellerDetail({
  seller, period, periodLabel, records, authorships, savedCount,
  authorshipOpen, authorshipNotice,
  onClose, onSaved, onDelete, onAuthorship,
}: {
  seller: string;
  period: string;
  periodLabel: string;
  records: VerificationRecord[];
  authorships: ExpeditionAuthorshipMap;
  /** Enquanto a janela de autoria está acima desta, não fechar o detalhe. */
  authorshipOpen: boolean;
  authorshipNotice: string;
  savedCount: number;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
  onDelete: (record: VerificationRecord) => void;
  onAuthorship: (record: VerificationRecord) => void;
}) {
  const [count, setCount] = useState(String(savedCount));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const save = useServerFn(saveSellerSalesCount);
  const list = records.filter(r => r.seller === seller);
  const credited = creditedExpeditionRecords(records, authorships, seller);
  const metrics = sellerMetrics(records, seller, Number(count));
  // ÚNICO indicador aumentado pela autoria: número de conferências do vendedor.
  const displayedCount = metrics.count + credited.length;

  async function saveCount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = sellerSalesSchema.safeParse({ seller, period, count: Number(count) });
    if (!parsed.success) {
      setError("Informe uma quantidade inteira de vendas, a partir de zero.");
      return;
    }
    setBusy(true); setError("");
    try {
      await save({ data: parsed.data });
      await onSaved();
      setNotice("Quantidade de vendas salva.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  const realRows = list.filter(r => r.source !== "csv").map(r => [
    r.document,
    r.clientName,
    r.verifierName,
    r.items,
    <div key={r.id} className="space-y-1">
      <span className={r.correct ? "font-bold text-success" : "font-bold text-destructive"}>
        {r.correct ? "Certo" : "Errado"}
      </span>
      {authorships[r.id] && <p className="text-[11px] font-bold text-amber-500">
        Autoria consultiva: {authorships[r.id].seller}
      </p>}
    </div>,
    errorComment(r),
    money(r.value),
    new Date(r.createdAt).toLocaleString("pt-BR"),
    <div key={r.id} className="flex items-center gap-1">
      {isExpeditionAuthorshipEligible(r) && <Button variant="outline" size="sm"
        className="h-8 gap-1 text-xs font-bold" title="Definir vendedor que solicitou o pedido da Expedição"
        aria-label={"Autoria da conferência " + r.document}
        onClick={() => onAuthorship(r)}>
        <UserRoundCheck className="h-3.5 w-3.5" /> Autoria
      </Button>}
      <Button variant="ghost" size="icon" className="text-destructive" title="Excluir conferência"
        aria-label={"Excluir conferência " + r.document} onClick={() => onDelete(r)}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>,
  ]);

  const creditedRows = credited.map(r => [
    r.document, r.clientName, r.verifierName,
    "—",
    <span key={r.id} className="inline-flex rounded-md border border-amber-400/45 bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-500">
      Autoria — duplicado da Expedição
    </span>,
    "Crédito consultivo: não soma itens, erros, acertos ou valor.",
    "—",
    new Date(r.createdAt).toLocaleString("pt-BR"),
    <Button key={r.id} variant="outline" size="sm" className="h-8 gap-1 text-xs"
      title="Alterar ou remover autoria sem apagar a conferência"
      onClick={() => onAuthorship(r)}>
      <UserRoundCheck className="h-3.5 w-3.5" /> Autoria
    </Button>,
  ]);

  return <Dialog open onOpenChange={open => { if (!open && !authorshipOpen) onClose(); }}>
    <DialogContent onInteractOutside={event => { if (authorshipOpen) event.preventDefault(); }}
      onEscapeKeyDown={event => { if (authorshipOpen) event.preventDefault(); }}
      className="sales-manager max-h-[90dvh] w-[calc(100%-2rem)] max-w-6xl overflow-y-auto border-t-4 border-t-brand-gold bg-card shadow-brand">
      <DialogHeader>
        <DialogTitle className="text-2xl">Desempenho de {seller}</DialogTitle>
        <DialogDescription>{periodLabel}</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ["Conferências", displayedCount],
          ["Certas / Erros", metrics.correct + " / " + metrics.errors],
          ["% de acerto", <Percent key="accuracy" value={list.length ? metrics.accuracy : null} />],
          ["Valor das vendas conferidas", money(metrics.value)],
        ].map(([label, value], i) =>
          <div key={i} className="min-w-0 border-b-2 border-border py-3">
            <p className="text-sm font-semibold text-muted-foreground">{label}</p>
            <p className="mt-2 break-words text-2xl font-bold tabular-nums">{value}</p>
          </div>)}
      </div>
      {credited.length > 0 && <p className="rounded-lg border border-amber-400/35 bg-amber-500/10 p-3 text-xs font-semibold text-amber-600 dark:text-amber-300">
        {metrics.count} conferência(s) real(is) + {credited.length} autoria(s) consultiva(s) duplicada(s) da Expedição.
        O acréscimo vale exclusivamente para a contagem deste vendedor, sem alterar os cards gerais, a acuracidade ou o faturamento.
      </p>}
      {seller !== "NÃO INFORMADO" && <form className="flex flex-wrap items-end gap-4 border-y border-border bg-accent/40 py-4"
        onSubmit={event => { void saveCount(event); }}>
        <label className="space-y-2">
          <span className="block font-semibold">Vendas do vendedor no período</span>
          <Input aria-label="Vendas do vendedor no período" type="number" min={0}
            max={100000000} step={1} value={count}
            onChange={e => { setCount(e.target.value); setNotice(""); }}
            className="w-44 bg-entry-field" />
        </label>
        <Button type="submit" disabled={busy}><Save />Salvar vendas</Button>
        <div className="ml-auto">
          <p className="text-sm font-semibold text-muted-foreground">% de vendas conferidas</p>
          <Percent value={metrics.coverage} />
        </div>
      </form>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {notice && <p role="status" className="text-success">{notice}</p>}
      {authorshipNotice && <p role="status"
        className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
        {authorshipNotice}
      </p>}
      <section>
        <h2 className="mb-2 text-xl font-bold">Maiores motivos de erro</h2>
        <div className="h-60 w-full min-w-0" role="img"
          aria-label={metrics.errorsByReason.map(r => r.reason + ": " + r.count).join(", ")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={metrics.errorsByReason} layout="vertical" margin={{ left: 8, right: 30, top: 12, bottom: 4 }}>
              <CartesianGrid stroke="var(--border)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 14 }} />
              <YAxis type="category" dataKey="reason" width={116}
                tick={{ fill: "var(--foreground)", fontSize: 13 }} />
              <Tooltip cursor={{ fill: "var(--accent)" }}
                contentStyle={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              <Bar name="Ocorrências" dataKey="count" fill="var(--destructive)" barSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <SalesDataTable title="Todas as conferências do vendedor"
        headers={["Documento", "Cliente", "Conferente", "Itens", "Situação", "Comentário", "Valor", "Data / Hora", "Ações"]}
        rows={[...realRows, ...creditedRows]} />
    </DialogContent>
  </Dialog>;
}

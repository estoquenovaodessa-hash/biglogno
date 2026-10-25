import { useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardCheck, Users, UserRoundCheck, RefreshCw, Upload, Plus, Pencil, Trash2, FileDown, Save, ChevronRight, ChartNoAxesCombined, Package, CheckCircle2, AlertTriangle, Target, CircleDollarSign, Search, RotateCcw, ListChecks, CalendarDays, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { canonicalCode, errorComment, parseClients, salesMetrics, verifierSchema, type Verifier, type VerificationRecord } from "@/lib/sales-verification";
import { readSalesVerification, replaceSalesClients, saveSalesVerifiers, saveSalesPeriodCount, deleteSalesVerification } from "@/lib/sales-verification.functions";
import { SalesVerificationForm } from "./SalesVerificationForm";
import { Retira } from "./Retira";
import type { AccessRole } from "@/lib/access-policy";
import { createSalesReport } from "@/lib/pdfSalesVerification";
import { Percent, SalesDataTable as DataTable } from "./SalesDataTable";
import { SalesSellerDetail } from "./SalesSellerDetail";
import { sellerCountKey } from "@/lib/sales-verification";
import { SalesWeeklyAnalysis } from "./SalesWeeklyAnalysis";
import { SalesHistoryImport } from "./SalesHistoryImport";
import { salesDay } from "@/lib/sales-weekly";

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const number = (n: number) => n.toLocaleString("pt-BR");
const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// Os códigos 101 e 102 continuam registrados no banco, mas o gestor
// visualiza a área operacional. Histórico antigo sem setor identificado
// não é rotulado como Balcão por suposição.
function conferenceArea(record: VerificationRecord): string {
  const code = canonicalCode(record.verifierCode ?? "");
  if (code === "101") return "BALCÃO";
  if (code === "102") return "EXPEDIÇÃO";
  if (record.channel === "balcao") return "BALCÃO";
  if (record.channel === "expedicao" || record.seller === "EXPEDIÇÃO") return "EXPEDIÇÃO";
  return "NÃO IDENTIFICADA";
}

export function SalesVerification({ role }: { role: AccessRole }) {
  const queryClient = useQueryClient();
  const read = useServerFn(readSalesVerification), importClients = useServerFn(replaceSalesClients), saveVerifiers = useServerFn(saveSalesVerifiers), saveCount = useServerFn(saveSalesPeriodCount), deleteRecord = useServerFn(deleteSalesVerification);
  const query = useQuery({ queryKey: ["sales-verification", role], queryFn: () => read(), refetchInterval: 30000 });
  const [tab, setTab] = useState("Painel"), [search, setSearch] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState("all");
  // Quantidade de vendas (número inteiro), não valor financeiro.
  const [sales, setSales] = useState<string | null>(null);
  const [sellerFilter, setSellerFilter] = useState("all");
  const [verifierFilter, setVerifierFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [recordSearch, setRecordSearch] = useState("");
  const [pendingClients, setPendingClients] = useState<ReturnType<typeof parseClients> | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<string | null>(null), [pendingDelete, setPendingDelete] = useState<VerificationRecord | null>(null), [recordLimit, setRecordLimit] = useState(200);
  const [analyzing, setAnalyzing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const data = query.data;
  if (!data) return <div className="py-8">{query.isError ? <><p role="alert" className="text-destructive">Não foi possível carregar a conferência.</p><Button variant="outline" onClick={() => query.refetch()}>Tentar novamente</Button></> : <p role="status">Carregando conferência…</p>}</div>;
  if (role === "operador") return <div className="mx-auto grid max-w-6xl items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><SalesVerificationForm clients={data.clients} prefix={data.prefix} lastClientCode={data.clientCode} lastVerifierCode={data.verifierCode} onRegistered={() => { void query.refetch(); void queryClient.invalidateQueries({ queryKey: ['pickups'] }); void queryClient.invalidateQueries({ queryKey: ['deliveries'] }); }} /><Retira role={role} clients={data.clients} /></div>;
  // O período escolhido é a base dos relatórios e da quantidade total de vendas.
  const periodRecords = data.records.filter(r => period === "all" || (period === "today" ? salesDay(r.createdAt) === salesDay(new Date()) : salesDay(r.createdAt).startsWith(period)));
  const periodKey = period === "today" ? localDay(new Date()) : period;
  const savedSalesCount = Number(data.periodCounts[periodKey] ?? 0);
  const salesCount = Number(sales ?? savedSalesCount);
  const salesInputValid = sales !== "" && Number.isSafeInteger(salesCount) && salesCount >= 0 && salesCount <= 100000000;
  const selectedRecords = periodRecords.filter(r =>
    (sellerFilter === "all" || r.seller === sellerFilter) &&
    (verifierFilter === "all" || `${canonicalCode(r.verifierCode)}|${r.verifierName}` === verifierFilter) &&
    (clientFilter === "all" || canonicalCode(r.clientCode) === clientFilter) &&
    (statusFilter === "all" || r.correct === (statusFilter === "correct"))
  );
  const records = selectedRecords;
  const metrics = salesMetrics(records);
  const periodMetrics = salesMetrics(periodRecords);
  const clients = data.clients.filter(c => `${c.code} ${c.name}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const availableSellers = [...new Set(periodRecords.map(r => r.seller))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const availableVerifiers = [...new Map(periodRecords.map(r => [`${canonicalCode(r.verifierCode)}|${r.verifierName}`, { code: canonicalCode(r.verifierCode), name: r.verifierName }])).values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const availableClients = [...new Map(periodRecords.map(r => [canonicalCode(r.clientCode), { code: canonicalCode(r.clientCode), name: r.clientName }])).values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const verificationGroups = new Map<string, { name: string; area: string; records: VerificationRecord[] }>();
  for (const record of records) {
    const area = conferenceArea(record);
    const name = record.verifierName?.trim() || "Não informado";
    // IDs evitam juntar homônimos. O histórico sem ID agrupa pelo nome.
    const identity = record.employeeId || `nome:${name.toLocaleLowerCase("pt-BR")}`;
    const key = JSON.stringify([identity, area]);
    let group = verificationGroups.get(key);
    if (!group) {
      group = { name, area, records: [] };
      verificationGroups.set(key, group);
    }
    group.records.push(record);
  }
  const groupedVerifiers = [...verificationGroups.values()].map(group => ({
    name: group.name,
    area: group.area,
    hasTime: group.records.some(r => r.durationSeconds !== null),
    ...salesMetrics(group.records),
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR") || a.area.localeCompare(b.area, "pt-BR"));
  const groupedSellers = [...new Set(records.map(r => r.seller))].map(s => ({ name: s, ...salesMetrics(records.filter(r => r.seller === s)) })).sort((a, b) => b.count - a.count);
  const searchedRecords = records.filter(r => {
    const q = recordSearch.toLocaleLowerCase("pt-BR").trim();
    return !q || [r.document, r.clientName, r.clientCode, r.verifierName, r.verifierCode, r.seller].some(v => String(v ?? "").toLocaleLowerCase("pt-BR").includes(q));
  }).filter(r => r.source !== "csv");
  const errorRecords = records.filter(r => !r.correct && r.source !== "csv");
  function resetFilters() {
    setSellerFilter("all"); setVerifierFilter("all"); setClientFilter("all"); setStatusFilter("all"); setRecordSearch(""); setRecordLimit(200);
  }
  const periodLabel = period === "all" ? "Todo o período" : period === "today" ? "Hoje" : new Date(`${period}-02T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const deletionButton = (r: VerificationRecord) => <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label={`Excluir conferência ${r.document}`} title="Excluir conferência" onClick={() => { setError(""); setPendingDelete(r); }}><Trash2 className="h-4 w-4" /></Button>;
  function exportReport() { createSalesReport(periodRecords, periodLabel, savedSalesCount).save("bignotto-relatorio-conferencia.pdf"); }
  async function persistSalesCount() {
    if (!salesInputValid) { setError("Informe a quantidade inteira de vendas no período."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await saveCount({ data: { period: periodKey, count: salesCount } });
      await query.refetch(); setSales(null);
      setNotice(`Quantidade de ${number(salesCount)} vendas salva para ${periodLabel.toLocaleLowerCase("pt-BR")}.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar a quantidade de vendas."); }
    finally { setBusy(false); }
  }
  return <div className="sales-manager min-w-0 space-y-5">
    <header className="rounded-xl border border-border bg-card/80 p-4 shadow-sm lg:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"><ClipboardCheck className="h-6 w-6" /></span>
          <div><h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Painel de Conferência</h2><p className="mt-1 text-sm text-muted-foreground">Acompanhe resultados e gerencie os registros da operação.</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab === "Painel" && <>
            <SalesHistoryImport onImported={() => query.refetch()} />
            <Button size="sm" variant="secondary" className="font-semibold" onClick={() => setAnalyzing(true)}><ChartNoAxesCombined className="h-4 w-4" /> Analisar</Button>
            <Button size="sm" variant="outline" onClick={exportReport}><FileDown className="h-4 w-4" /> PDF</Button>
          </>}
          <Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Atualizar</Button>
        </div>
      </div>
      <nav className="mt-5 flex flex-wrap gap-1 border-t border-border pt-3" aria-label="Áreas da conferência">
        {["Painel", "Clientes"].map(t => <Button key={t} size="sm" variant={tab === t ? "secondary" : "ghost"} aria-current={tab === t ? "page" : undefined} className="rounded-lg font-semibold" onClick={() => { setTab(t); setSearch(""); }}>
          {t}
        </Button>)}
      </nav>
    </header>

    {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</div>}
    {notice && <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success" role="status">{notice}</div>}

    {tab === "Painel" && <>
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm" aria-label="Filtros do período">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground"><CalendarDays className="h-4 w-4 text-primary" /> Filtros e vendas do período</h3>
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={resetFilters}><RotateCcw className="h-4 w-4" /> Limpar filtros</Button>
        </div>
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <label className="min-w-0 space-y-1.5 text-xs font-semibold text-muted-foreground">Período
            <select aria-label="Período" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground" value={period} onChange={e => { setPeriod(e.target.value); setSales(null); resetFilters(); setSelectedSeller(null); }}>
              <option value="all">Todo o período</option><option value="today">Hoje</option>
              <option value={localDay(new Date()).slice(0, 7)}>Mês atual</option>
              <option value={localDay(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)).slice(0, 7)}>Mês anterior</option>
            </select>
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-semibold text-muted-foreground">Vendedor
            <select aria-label="Filtrar vendedor" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground" value={sellerFilter} onChange={e => { setSellerFilter(e.target.value); setRecordLimit(200); }}>
              <option value="all">Todos</option>{availableSellers.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-semibold text-muted-foreground">Conferente
            <select aria-label="Filtrar conferente" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground" value={verifierFilter} onChange={e => { setVerifierFilter(e.target.value); setRecordLimit(200); }}>
              <option value="all">Todos</option>{availableVerifiers.map(v => <option key={`${v.code}|${v.name}`} value={`${v.code}|${v.name}`}>{v.name} · {v.code === "101" ? "Balcão" : v.code === "102" ? "Expedição" : v.code}</option>)}
            </select>
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-semibold text-muted-foreground">Cliente
            <select aria-label="Filtrar cliente" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground" value={clientFilter} onChange={e => { setClientFilter(e.target.value); setRecordLimit(200); }}>
              <option value="all">Todos</option>{availableClients.map(v => <option key={v.code} value={v.code}>{v.name}</option>)}
            </select>
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-semibold text-muted-foreground">Situação
            <select aria-label="Filtrar situação" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setRecordLimit(200); }}>
              <option value="all">Todas</option><option value="correct">Certo</option><option value="wrong">Errado</option>
            </select>
          </label>
          <div className="min-w-0 space-y-1.5 rounded-lg border border-brand-gold/50 bg-brand-gold/5 px-2 py-1.5">
            <label htmlFor="sales-period-count" className="block text-xs font-bold text-foreground">Vendas no período <span className="font-normal text-muted-foreground">(quantidade)</span></label>
            <div className="flex gap-1.5">
              <Input id="sales-period-count" aria-label="Quantidade de vendas no período" title="Informe o número de vendas, não o valor financeiro" inputMode="numeric" type="number" min={0} step={1} max={100000000} className="h-9 min-w-0 flex-1 border-brand-gold/30 bg-background text-base font-bold tabular-nums" value={sales ?? data.periodCounts[periodKey] ?? 0} onChange={e => { setSales(e.target.value); setNotice(""); }} />
              <Button size="sm" className="h-9 shrink-0" title="Salvar quantidade de vendas no período" aria-label="Salvar quantidade de vendas no período" disabled={busy || !salesInputValid} onClick={persistSalesCount}><Save className="h-4 w-4" /> Salvar</Button>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Indicadores de conferência" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <VerificationKpi icon={ClipboardCheck} title="Total de conferências" value={number(metrics.count)} detail="Registros no filtro" />
        <VerificationKpi icon={Package} title="Qtd. itens" value={number(metrics.items)} detail="Itens conferidos" />
        <VerificationKpi icon={CheckCircle2} title="Certas" value={number(metrics.correct)} detail="Conferências corretas" tone="success" />
        <VerificationKpi icon={AlertTriangle} title="Erros" value={number(metrics.errors)} detail="Conferências divergentes" tone="danger" />
        <VerificationKpi icon={CircleDollarSign} title="Valor conferido" value={money(metrics.value)} detail="Soma dos registros" tone="success" />
        <VerificationKpi icon={Target} title="% de acerto" value={<Percent value={metrics.count ? metrics.accuracy : null} />} detail="Meta de acuracidade: 100%" tone="primary" />
      </section>

      <section className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-border bg-card px-4 py-3" aria-label="Comparativo entre vendas e conferências">
        <div className="flex items-center gap-2 text-sm"><ListChecks className="h-5 w-5 text-primary" /><span className="text-muted-foreground">Vendas no período:</span><strong className="text-lg tabular-nums">{number(savedSalesCount)}</strong><span className="text-xs text-muted-foreground">vendas</span></div>
        <div className="flex items-center gap-2 text-sm"><ChartNoAxesCombined className="h-5 w-5 text-primary" /><span className="text-muted-foreground">Conferência × Vendas:</span><Percent value={savedSalesCount > 0 ? periodMetrics.count / savedSalesCount * 100 : null} /></div>
        <span className="text-xs text-muted-foreground">Comparativo calculado com todas as conferências do período, sem os filtros de vendedor, cliente ou situação.</span>
      </section>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <section className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-start gap-2"><ChartNoAxesCombined className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h3 className="text-lg font-bold tracking-tight">Desempenho por conferente</h3><p className="text-xs text-muted-foreground">Resultado de cada operador por área de conferência no filtro selecionado.</p></div></div>
          <div className="[&_table]:text-sm [&_th]:text-xs [&_td]:text-sm">
            <DataTable headers={["Operador", "Área de conferência", "Conferências", "Qtd. itens", "Certas", "Erros", "% acerto", "Tempo médio", "Valor"]} rows={groupedVerifiers.map(v => [v.name, v.area, number(v.count), number(v.items), number(v.correct), number(v.errors), <Percent value={v.accuracy} />, v.hasTime ? `${Math.round(v.minutes)} min` : "—", money(v.value)])} />
          </div>
        </section>
        <section className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-start gap-2"><Users className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h3 className="text-lg font-bold tracking-tight">Desempenho por vendedor</h3><p className="text-xs text-muted-foreground">Conferências e acuracidade por vendedor.</p></div></div>
          <div className="[&_table]:text-sm [&_th]:text-xs [&_td]:text-sm">
            <DataTable headers={["Vendedor", "Conferências", "Qtd. itens", "Certas", "Erros", "% acerto", "Valor conferido"]} rows={groupedSellers.map(v => [<Button variant="ghost" className="h-auto justify-start gap-2 whitespace-normal px-0 text-sm font-bold text-primary" aria-label={`Ver conferências de ${v.name}`} onClick={() => setSelectedSeller(v.name)}>{v.name}<ChevronRight className="h-4 w-4 shrink-0" /></Button>, number(v.count), number(v.items), number(v.correct), number(v.errors), <Percent value={v.accuracy} />, money(v.value)])} />
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-start gap-2"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h3 className="text-lg font-bold tracking-tight">Comentários dos erros</h3><p className="text-xs text-muted-foreground">Registros de conferências com divergências.</p></div></div>
        <DataTable errorTone headers={["Data", "Documento", "Cliente", "Conferente", "Comentário do erro", "Valor", "Ações"]} rows={errorRecords.map(r => [new Date(r.createdAt).toLocaleString("pt-BR"), r.document, r.clientName, `${r.verifierCode} · ${r.verifierName}`, errorComment(r), money(r.value), deletionButton(r)])} />
      </section>
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2"><ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h3 className="text-lg font-bold tracking-tight">Registros de conferência</h3><p className="text-xs text-muted-foreground">{number(searchedRecords.length)} registro(s) encontrados. Consulte e gerencie as conferências.</p></div></div>
          <label className="relative w-full max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Buscar nos registros de conferência" placeholder="Buscar documento, cliente ou conferente…" value={recordSearch} onChange={e => { setRecordSearch(e.target.value); setRecordLimit(200); }} className="pl-9" />
          </label>
        </div>
        <DataTable headers={["Data", "Documento", "Cliente", "Conferente", "Qtd. itens", "Situação", "Vendedor", "Valor", "Ações"]} rows={searchedRecords.slice(0, recordLimit).map(r => [new Date(r.createdAt).toLocaleString("pt-BR"), r.document, r.clientName, r.verifierName, number(r.items), <span className={r.correct ? "inline-flex rounded-md bg-success/10 px-2 py-1 text-xs font-bold text-success" : "inline-flex rounded-md bg-destructive/10 px-2 py-1 text-xs font-bold text-destructive"}>{r.correct ? "Certo" : "Errado"}</span>, r.seller, money(r.value), deletionButton(r)])} />
        {searchedRecords.length > recordLimit && <div className="mt-4 flex justify-center"><Button variant="outline" onClick={() => setRecordLimit(n => n + 200)}>Carregar mais registros</Button></div>}
      </section>
    </>}
    {tab === "Clientes" && <section><h2 className="mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-primary" />Base de clientes</h2><div className="mb-4 flex flex-wrap items-center gap-3"><Input aria-label="Buscar clientes" placeholder="Buscar por código ou nome…" className="max-w-sm" value={search} onChange={e => setSearch(e.target.value)} /><span className="ml-auto text-sm text-muted-foreground">{number(data.clients.length)} cliente(s)</span><Button variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}><Upload />Importar base cliente</Button><input ref={fileInput} type="file" accept=".csv" className="hidden" aria-label="Planilha de clientes" onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
        setError(""); try { if (file.size > 30 * 1024 * 1024) throw new Error("Arquivo acima de 30 MB."); const bytes = await file.arrayBuffer(); let text = new TextDecoder("utf-8").decode(bytes); if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(bytes); setPendingClients(parseClients(text)); } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível ler o CSV."); }
      }} /></div><DataTable headers={["Código", "Nome do cliente"]} rows={clients.slice(0, 500).map(c => [c.code, c.name])} />{clients.length > 500 && <p className="mt-3 text-sm text-muted-foreground">Exibindo 500 de {number(clients.length)} clientes. Refine a busca.</p>}</section>}
    {analyzing && <SalesWeeklyAnalysis records={data.records} onClose={() => setAnalyzing(false)} />}
    {selectedSeller && <SalesSellerDetail key={`${periodKey}:${selectedSeller}`} seller={selectedSeller} period={periodKey} periodLabel={periodLabel} records={records} savedCount={data.sellerCounts[sellerCountKey(periodKey, selectedSeller)] ?? 0} onClose={() => setSelectedSeller(null)} onSaved={() => query.refetch()} onDelete={r => { setError(""); setPendingDelete(r); }} />}
    <Dialog open={Boolean(pendingDelete)} onOpenChange={open => { if (!open && !busy) { setPendingDelete(null); setError(""); } }}><DialogContent><DialogHeader><DialogTitle>Excluir registro de conferência?</DialogTitle></DialogHeader><p>Documento <strong>{pendingDelete?.document}</strong> · {pendingDelete?.seller}. A exclusão é definitiva e atualizará os indicadores e relatórios. <strong>O pedido vinculado em Retira ou Entregas também será apagado, mesmo se já estiver finalizado.</strong> Pedidos cadastrados manualmente não serão afetados.</p>{error && <p role="alert" className="text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => { setPendingDelete(null); setError(""); }}>Cancelar</Button><Button variant="destructive" disabled={busy} onClick={async () => { if (!pendingDelete) return; setBusy(true); setError(""); try { const result = await deleteRecord({ data: { id: pendingDelete.id } }); setPendingDelete(null); setNotice(result.pickupsDeleted + result.deliveriesDeleted > 0 ? "Conferência excluída e pedido vinculado em Retira/Entregas removido." : "Conferência excluída. Não havia pedido vinculado em Retira/Entregas."); await Promise.allSettled([query.refetch(), queryClient.invalidateQueries({ queryKey: ["pickups"] }), queryClient.invalidateQueries({ queryKey: ["deliveries"] })]); } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível excluir."); } finally { setBusy(false); } }}><Trash2 />Excluir registro</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(pendingClients)} onOpenChange={open => { if (!open) setPendingClients(null); }}><DialogContent><DialogHeader><DialogTitle>Importar base de clientes</DialogTitle></DialogHeader><p>{number(pendingClients?.length ?? 0)} clientes encontrados. A nova importação substituirá a base atual; os registros de conferência serão preservados.</p><DialogFooter><Button variant="outline" onClick={() => setPendingClients(null)}>Cancelar</Button><Button disabled={busy} onClick={async () => { if (!pendingClients) return; setBusy(true); try { const result = await importClients({ data: pendingClients }); await query.refetch(); setPendingClients(null); setNotice(`${number(result.count)} clientes importados.`); } catch { setError("Não foi possível importar os clientes."); setPendingClients(null); } finally { setBusy(false); } }}><Upload />Confirmar importação</Button></DialogFooter></DialogContent></Dialog>

  </div>;
}


// Indicadores com ênfase visual, mantendo as cores configuradas do BigLogno.
function VerificationKpi({ icon: Icon, title, value, detail, tone = "primary" }: {
  icon: LucideIcon; title: string; value: ReactNode; detail: string; tone?: "primary" | "success" | "danger";
}) {
  const toneColor = tone === "success" ? "text-success bg-success/10" : tone === "danger" ? "text-destructive bg-destructive/10" : "text-primary bg-primary/10";
  return <div className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm">
    <div className="mb-3 flex items-center gap-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneColor}`}><Icon className="h-5 w-5" /></span>
      <p className="text-xs font-bold uppercase leading-snug tracking-wide text-muted-foreground">{title}</p>
    </div>
    <div className="break-words text-2xl font-extrabold tracking-tight tabular-nums text-foreground">{value}</div>
    <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
  </div>;
}

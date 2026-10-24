import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, CalendarDays,
  CheckCircle2, ClipboardCheck, Download,
  Layers, PackageCheck, RefreshCw, RotateCcw, Target, Truck, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCiclos } from "@/lib/ciclos";
import { readSalesVerification } from "@/lib/sales-verification.functions";
import { listDeliveries } from "@/lib/deliveries.functions";
import { listPickups } from "@/lib/pickups.functions";
import {
  buildGeneralReport, displayDay, indicatorChange, indicatorValue,
  lastClosedWeek, mondayOf, nextWeek, type GeneralIndicator, type GeneralReport,
} from "@/lib/general-report";
import { renderGeneralReportJPEG, saveGeneralReportJPEG } from "@/lib/general-report-image";
import { salesDay } from "@/lib/sales-weekly";

const keys = [
  { key: "accuracy", icon: Target, label: "Acuracidade geral", style: "text-blue-400" },
  { key: "cycles", icon: Layers, label: "Ciclos concluídos", style: "text-blue-400" },
  { key: "checks", icon: ClipboardCheck, label: "Conferências", style: "text-blue-400" },
  { key: "deliveries", icon: Truck, label: "Entregas", style: "text-blue-400" },
] as const;
const sectorKeys = [
  { key: "cycles", name: "Contagem", icon: Layers },
  { key: "recounts", name: "Reinventário", icon: RotateCcw },
  { key: "checks", name: "Conferência", icon: ClipboardCheck },
  { key: "deliveries", name: "Entregas", icon: Truck },
  { key: "pickups", name: "Retira", icon: PackageCheck },
] as const;

function detail(report: GeneralReport, key: GeneralIndicator["key"]) {
  return report.indicators.find(item => item.key === key)!;
}
function Trend({ indicator }: { indicator: GeneralIndicator }) {
  const up = indicator.direction === "up", down = indicator.direction === "down";
  return <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-bold ${up ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : down ? "border-rose-500/30 bg-rose-500/10 text-rose-400" : "border-border bg-accent/40 text-muted-foreground"}`}>
    {up ? <ArrowUpRight className="h-4 w-4" /> : down ? <ArrowDownRight className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
    {indicatorChange(indicator)}
  </span>;
}
function MetricCard({ indicator, icon: Icon }: { indicator: GeneralIndicator; icon: typeof Target }) {
  return <div className="min-w-0 rounded-xl border border-[#295482] bg-[#0c243d] p-4 text-white shadow-sm">
    <div className="flex items-start gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#164575] text-[#87bdff]"><Icon className="h-5 w-5" /></span>
      <div className="min-w-0"><h3 className="text-base font-bold">{indicator.title}</h3><p className="mt-0.5 text-xs text-[#adc4dd]">{indicator.detail}</p></div>
    </div>
    <p className="mt-4 text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl">{indicatorValue(indicator.current, indicator.unit)}</p>
    <div className="mt-3 flex flex-wrap items-center gap-2"><Trend indicator={indicator} /><span className="text-xs text-[#adc4dd]">Anterior: {indicatorValue(indicator.previous, indicator.unit)}</span></div>
  </div>;
}
export function ApuracaoGeral() {
  const { ciclos, ready: cyclesReady } = useCiclos();
  const readSales = useServerFn(readSalesVerification);
  const readDeliveries = useServerFn(listDeliveries);
  const readPickups = useServerFn(listPickups);
  const sales = useQuery({ queryKey: ["apuração-geral", "conferencias"], queryFn: () => readSales(), staleTime: 60000, refetchOnWindowFocus: false });
  const deliveries = useQuery({ queryKey: ["apuração-geral", "entregas"], queryFn: () => readDeliveries(), staleTime: 60000, refetchOnWindowFocus: false });
  const pickups = useQuery({ queryKey: ["apuração-geral", "retiras"], queryFn: () => readPickups(), staleTime: 60000, refetchOnWindowFocus: false });
  const [week, setWeek] = useState(lastClosedWeek);
  const [generatedWeek, setGeneratedWeek] = useState(lastClosedWeek);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const loading = !cyclesReady || !sales.data || !deliveries.data || !pickups.data;
  const failed = sales.isError || deliveries.isError || pickups.isError;

  const report = useMemo(() => {
    if (loading || failed) return null;
    return buildGeneralReport(ciclos, sales.data!.records, deliveries.data!, pickups.data!.records, generatedWeek);
  }, [ciclos, loading, failed, sales.data, deliveries.data, pickups.data, generatedWeek]);

  async function generate() {
    setBusy(true);
    setMessage("");
    try {
      const res = await Promise.all([sales.refetch(), deliveries.refetch(), pickups.refetch()]);
      if (res.some(x => x.isError || !x.data)) throw new Error("Uma das fontes de dados não respondeu. Confira a conexão e tente novamente.");
      setGeneratedWeek(week);
      setMessage("Apuração atualizada a partir dos registros disponíveis.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível consultar os dados.");
    } finally { setBusy(false); }
  }
  function download() {
    if (!report || week !== generatedWeek) {
      setMessage("Clique em Gerar apuração para atualizar o JPEG com a semana escolhida.");
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      renderGeneralReportJPEG(canvas, report);
      saveGeneralReportJPEG(canvas, report);
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível baixar o JPEG."); }
  }
  const currentMonday = mondayOf(salesDay(new Date()));
  const summaryTone = report && report.improved > report.declined ? "text-emerald-400" : report && report.declined > report.improved ? "text-rose-400" : "text-[#7bb7ff]";

  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="min-w-0"><h2 className="flex items-center gap-2 text-xl font-bold"><BarChart3 className="h-6 w-6 text-primary" />Apuração Geral</h2>
        <p className="mt-1 text-sm text-muted-foreground">Comparativo semanal dos resultados de Contagem, Conferência, Entregas e Retira.</p></div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-44"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Semana de referência</span>
          <input aria-label="Escolha uma data da semana" type="date" max={salesDay(new Date())} value={week}
            onChange={e => { if (e.target.value) setWeek(mondayOf(e.target.value)); }}
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <Button variant="outline" className="h-10" disabled={busy} onClick={() => setWeek(nextWeek(week, -1))} aria-label="Semana anterior">←</Button>
        <Button variant="outline" className="h-10" disabled={busy || week >= currentMonday} onClick={() => setWeek(nextWeek(week, 1))} aria-label="Próxima semana">→</Button>
        <Button className="h-10 bg-[#ffbb23] font-bold text-[#07172a] hover:bg-[#ffd269]" disabled={busy || loading || failed} onClick={() => { void generate(); }}><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />Gerar apuração</Button>
        <Button variant="outline" className="h-10" disabled={busy || !report || week !== generatedWeek} onClick={download}><Download className="h-4 w-4" />Gerar JPEG</Button>
      </div>
    </div>

    {message && <p role="status" className="rounded-md border border-border bg-card p-3 text-sm">{message}</p>}
    {failed && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">Não foi possível carregar uma das fontes de dados. Tente gerar novamente.</p>}
    {loading && !failed && <p role="status" className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Carregando histórico para comparar as semanas…</p>}

    {report && <div className="min-w-0 space-y-4">
        <div className="rounded-xl border border-[#295482] bg-[#0c243d] px-5 py-4 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="flex items-center gap-2 text-sm font-bold text-[#83bcff]"><CalendarDays className="h-4 w-4" />{displayDay(report.weekStart)} a {displayDay(report.weekEnd)}</p>
              <h3 className={`mt-1 text-2xl font-extrabold ${summaryTone}`}>{report.comparable === 0 ? "Sem base comparativa" : report.improved > report.declined ? "Evolução positiva" : report.declined > report.improved ? "Pontos de atenção" : "Semana em equilíbrio"}</h3>
              <p className="mt-1 text-sm text-[#b8cde4]">Comparado a {displayDay(report.priorStart)} – {displayDay(report.priorEnd)}</p></div>
            <div className="rounded-lg border border-[#2c5886] bg-[#102d4b] px-4 py-3 text-sm"><strong className="text-emerald-400">{report.improved} melhoraram</strong><span className="mx-2">·</span><strong className="text-rose-400">{report.declined} caíram</strong><span className="mx-2">·</span>{report.stable} estáveis</div>
          </div>
          {report.partial && <p className="mt-3 rounded-md border border-[#b77a22]/30 bg-[#875013]/20 px-3 py-2 text-xs text-[#ffd280]"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />Semana em andamento: os números são parciais e comparados com uma semana completa.</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {keys.map(({ key, icon }) => <MetricCard key={key} icon={icon} indicator={detail(report, key)} />)}
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-base font-bold">Evolução por setor</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sectorKeys.map(({ key, name, icon: Icon }) => { const metric = detail(report, key); return <div key={key} className="rounded-lg border border-border bg-background/50 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" />{name}</p>
              <p className="mt-2 text-2xl font-bold">{indicatorValue(metric.current, metric.unit)}</p>
              <div className="mt-2"><Trend indicator={metric} /></div>
            </div>; })}
          </div>
          <div className="mt-3 rounded-lg border border-border p-3">
            <p className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-primary" />Acerto na Conferência</p>
            <p className="mt-1 text-xl font-bold">{indicatorValue(detail(report, "checkAccuracy").current, "percent")}</p>
            <Trend indicator={detail(report, "checkAccuracy")} />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-base font-bold">Resumo executivo</h3>
          <div className="space-y-3">{report.highlights.map((highlight, i) => <p key={i} className="flex items-start gap-3 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{i + 1}</span>{highlight}
          </p>)}</div>
        </div>
        <p className="text-xs text-muted-foreground">Critérios: ciclos e reinventários na data de finalização; acuracidade ponderada por quantidade de itens; conferências na data de registro; entregas e retiradas na data de conclusão. Excluídos ou sem data não são recuperáveis no histórico. Os números são calculados dos registros atualmente disponíveis.</p>
    </div>
  </section>;
}

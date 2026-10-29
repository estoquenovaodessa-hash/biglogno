import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Gauge, RefreshCw, Route } from "lucide-react";
import { readGpsKilometers } from "@/lib/delivery-gps.functions";
import { formatGpsKm, gpsPeriodBounds, type GpsPeriod } from "@/lib/delivery-gps";
import { expeditionLocalDay } from "@/lib/expedition-history";
import type { Employee } from "@/lib/employees";
import { Button } from "@/components/ui/button";

const shortDate = (day: string) => day.split("-").reverse().join("/");

export function DeliveryKilometersPanel({ drivers, selectedDriverId }: {
  drivers: Employee[];
  selectedDriverId: string;
}) {
  const read = useServerFn(readGpsKilometers);
  const [period, setPeriod] = useState<GpsPeriod>("day");
  const [referenceDate, setReferenceDate] = useState(() => expeditionLocalDay(new Date().toISOString()));
  const query = useQuery({
    queryKey: ["manager-delivery-km-gps", period, referenceDate],
    queryFn: () => read({ data: { date: referenceDate, period } }),
    staleTime: 30000, refetchInterval: 60000, refetchOnWindowFocus: true,
  });
  const bounds = gpsPeriodBounds(referenceDate, period);
  const driverRows = drivers.filter(driver => selectedDriverId === "all" || driver.id === selectedDriverId);
  const totals = new Map((query.data?.rows ?? []).map(row => [row.employeeId, row]));
  const measured = driverRows.map(driver => ({ driver, data: totals.get(driver.id) }));
  const recorded = measured.filter(entry => (entry.data?.samples ?? 0) > 0);
  const totalMeters = recorded.reduce((sum, entry) => sum + (entry.data?.distanceMeters ?? 0), 0);
  const totalSamples = recorded.reduce((sum, entry) => sum + (entry.data?.samples ?? 0), 0);
  const heading = period === "day" ? "Diário" : period === "week" ? "Semanal" : "Mensal";
  const dateRange = period === "day" ? shortDate(bounds.start) : `De ${shortDate(bounds.start)} a ${shortDate(new Date(new Date(bounds.end + "T12:00:00Z").getTime() - 86400000).toISOString().slice(0, 10))}`;

  return <section className="rounded-xl border border-border bg-card p-4 shadow-sm" aria-label="Quilometragem GPS por entregador">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <Gauge className="h-5 w-5 text-primary" /> Quilometragem por entregador
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">Distância aproximada registrada pelo GPS durante operações em rota.</p>
      </div>
      <Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => { void query.refetch(); }}>
        <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
        Atualizar KM
      </Button>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <label className="block text-xs font-semibold text-muted-foreground">
        Período da quilometragem
        <select aria-label="Período da quilometragem" value={period}
          onChange={event => setPeriod(event.target.value as GpsPeriod)}
          className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
          <option value="day">Diário</option>
          <option value="week">Semanal</option>
          <option value="month">Mensal</option>
        </select>
      </label>
      <label className="block text-xs font-semibold text-muted-foreground">
        Data de referência
        <input aria-label="Data de referência para KM" type="date" value={referenceDate}
          onChange={event => { if (event.target.value) setReferenceDate(event.target.value); }}
          className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" />
      </label>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="rounded-lg border border-border bg-background/60 px-4 py-3">
        <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <Route className="h-4 w-4" /> KM GPS · {heading}
        </p>
        <p className="mt-1 text-3xl font-extrabold tabular-nums">
          {query.isLoading ? "Carregando…" : recorded.length ? formatGpsKm(totalMeters) : "Sem medição"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{selectedDriverId === "all" ? "Todos os entregadores" : "Entregador selecionado"} · {totalSamples} trecho(s)</p>
      </div>
      <div className="rounded-lg border border-border bg-background/60 px-4 py-3">
        <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <CalendarDays className="h-4 w-4" /> Intervalo consultado
        </p>
        <p className="mt-2 text-base font-bold">{dateRange}</p>
        <p className="mt-1 text-xs text-muted-foreground">{recorded.length} entregador(es) com medição</p>
      </div>
    </div>

    {query.isError && <p role="alert" className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      {query.error instanceof Error ? query.error.message : "Não foi possível consultar KM."}
    </p>}
    {!query.isError && <div className="mt-3 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr><th className="px-3 py-2">Entregador</th><th className="px-3 py-2 text-right">KM registrados</th><th className="px-3 py-2 text-right">Trechos GPS</th></tr>
        </thead>
        <tbody>
          {measured.map(({ driver, data }) => <tr key={driver.id} className="border-t border-border">
            <td className="px-3 py-2.5 font-semibold">{driver.name}{!driver.active && <span className="ml-1 text-xs font-normal text-muted-foreground">(inativo)</span>}</td>
            <td className="px-3 py-2.5 text-right font-bold tabular-nums">{!query.data ? "—" : data?.samples ? formatGpsKm(data.distanceMeters) : "Sem medição"}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{data?.samples ?? "—"}</td>
          </tr>)}
          {!measured.length && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">Nenhum funcionário com emblema ENTREGADOR neste filtro.</td></tr>}
        </tbody>
      </table>
    </div>}

    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
      O registro começa após o entregador autorizar a localização no celular e iniciar uma entrega.
      O aplicativo precisa permanecer aberto na tela de Entregas, com sinal GPS. Pausas, falta de internet,
      GPS impreciso e o aplicativo em segundo plano podem deixar trechos sem medição.
      Períodos anteriores à ativação não possuem histórico GPS. Os valores não são dados de hodômetro nem distâncias planejadas no mapa.
    </p>
  </section>;
}

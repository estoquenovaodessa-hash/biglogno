import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Gauge, RefreshCw, Route, TriangleAlert } from "lucide-react";
import type { Delivery } from "@/lib/deliveries";
import type { Employee } from "@/lib/employees";
import type { DeliveryClientAddress } from "@/lib/delivery-addresses";
import { shiftLabel } from "@/lib/expedition-schedule";
import {
  currentSaoPauloDate, estimatedKmTrips, formatRoadKm, kmPeriodBounds,
  type EstimatedKmResult, type KmPeriod,
} from "@/lib/delivery-estimated-km";
import { calculateEstimatedTripKm } from "@/lib/delivery-road-km";
import { Button } from "@/components/ui/button";

const shortDate = (day: string) => day.split("-").reverse().join("/");
const isRecorded = (outcome?: EstimatedKmResult) => typeof outcome?.meters === "number";

/** Quilometragem calculada pelas vias: SEM GPS e SEM rastreamento do celular.
 * Reconstitui as viagens com as entregas concluídas, por motorista/dia/turno.
 * Não apresenta distância parcial como se fosse total. */
export function DeliveryKilometersPanel({
  drivers, selectedDriverId, deliveries, addresses, storeOrigin, originError,
}: {
  drivers: Employee[];
  selectedDriverId: string;
  deliveries: Delivery[];
  addresses: DeliveryClientAddress[];
  storeOrigin?: DeliveryClientAddress;
  originError?: boolean;
}) {
  const [period, setPeriod] = useState<KmPeriod>("day");
  const [referenceDate, setReferenceDate] = useState(currentSaoPauloDate);
  const [recheck, setRecheck] = useState(0);
  const [calculated, setCalculated] = useState<Record<string, EstimatedKmResult>>({});
  const bounds = kmPeriodBounds(referenceDate, period);
  const trips = useMemo(
    () => estimatedKmTrips(deliveries, drivers, addresses, storeOrigin, referenceDate, period),
    [deliveries, drivers, addresses, storeOrigin, referenceDate, period],
  );
  const selectedTrips = trips.filter(trip => selectedDriverId === "all" || trip.employeeId === selectedDriverId);
  // Snapshot estável para não reiniciar cálculos em renderizações sem mudanças.
  const snapshot = JSON.stringify(selectedTrips.map(trip => ({
    key: trip.key, id: trip.employeeId, stops: trip.stops.map(stop => ({
      key: stop.key, at: stop.at, address: stop.address,
    })),
  })));

  useEffect(() => {
    const controller = new AbortController();
    setCalculated({});
    void (async () => {
      for (const trip of selectedTrips) {
        if (controller.signal.aborted) return;
        let outcome: EstimatedKmResult;
        try {
          outcome = await calculateEstimatedTripKm(trip.stops, controller.signal);
        } catch {
          if (controller.signal.aborted) return;
          outcome = { meters: null, reason: "Serviço de rotas indisponível." };
        }
        if (!controller.signal.aborted) {
          setCalculated(current => ({ ...current, [trip.key]: outcome }));
        }
      }
    })();
    return () => controller.abort();
  }, [snapshot, recheck]);

  const processed = selectedTrips.filter(trip => Object.prototype.hasOwnProperty.call(calculated, trip.key)).length;
  const ready = selectedTrips.filter(trip => isRecorded(calculated[trip.key]));
  const missing = selectedTrips.filter(trip => calculated[trip.key] && !isRecorded(calculated[trip.key]));
  const sum = ready.reduce((total, trip) => total + (calculated[trip.key]?.meters ?? 0), 0);
  const pending = selectedTrips.length - processed;
  const dateRange = period === "day" ? shortDate(bounds.start) : "De " + shortDate(bounds.start)
    + " a " + shortDate(new Date(Date.parse(bounds.end + "T12:00:00Z") - 86400000).toISOString().slice(0, 10));
  const summary = drivers
    .filter(driver => selectedDriverId === "all" || selectedDriverId === driver.id)
    .map(driver => {
      const relevant = selectedTrips.filter(trip => trip.employeeId === driver.id);
      return {
        driver, relevant,
        done: relevant.filter(trip => isRecorded(calculated[trip.key])),
        missing: relevant.filter(trip => calculated[trip.key] && !isRecorded(calculated[trip.key])),
      };
    });

  return <section className="rounded-xl border border-border bg-card p-4 shadow-sm" aria-label="Quilometragem estimada por endereços">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-bold"><Gauge className="h-5 w-5 text-primary" /> KM por entregador</h3>
        <p className="mt-1 text-xs text-muted-foreground">Distâncias calculadas entre a loja e as entregas finalizadas, pelas ruas. Sem GPS.</p>
      </div>
      <Button size="sm" variant="outline" onClick={() => setRecheck(n => n + 1)}>
        <RefreshCw className="h-4 w-4" /> Recalcular KM
      </Button>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="block text-xs font-semibold text-muted-foreground">
        Período
        <select aria-label="Período de KM por endereço" value={period}
          onChange={event => setPeriod(event.target.value as KmPeriod)}
          className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
          <option value="day">Diário</option>
          <option value="week">Semanal</option>
          <option value="month">Mensal</option>
        </select>
      </label>
      <label className="block text-xs font-semibold text-muted-foreground">
        Data de referência
        <input type="date" aria-label="Data de referência dos KM" value={referenceDate}
          onChange={event => { if (event.target.value) setReferenceDate(event.target.value); }}
          className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" />
      </label>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-border bg-background/60 p-4">
        <p className="text-xs font-bold text-muted-foreground">Total estimado pelas ruas</p>
        <p className="mt-1 text-3xl font-extrabold tabular-nums">
          {!selectedTrips.length ? "0,00 km" : ready.length ? formatRoadKm(sum) : pending ? "Calculando…" : "Indisponível"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {ready.length}/{selectedTrips.length} turno(s) calculado(s)
          {missing.length > 0 ? " · " + missing.length + " sem cálculo" : ""}
          {pending > 0 ? " · " + pending + " aguardando" : ""}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-background/60 p-4">
        <p className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
          <CalendarDays className="h-4 w-4" /> Período e entregas
        </p>
        <p className="mt-2 text-base font-bold">{dateRange}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {selectedTrips.reduce((total, trip) => total + trip.documents, 0)} nota(s) finalizada(s)
          · {selectedTrips.length} turno(s)
        </p>
      </div>
    </div>

    {originError && <p role="alert" className="mt-3 text-sm text-destructive">
      Não foi possível consultar a origem no cadastro.
    </p>}
    {!storeOrigin && selectedTrips.length > 0 && <p role="status" className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
      <TriangleAlert className="mr-1 inline h-4 w-4" />
      Cadastre a loja BIGNOTTO FERRAMENTAS na Av. Ampélio Gazetta nos endereços para calcular a partida de cada turno.
    </p>}
    {missing.length > 0 && <p role="status" className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
      {missing.length} rota(s) não puderam ser calculadas integralmente. O total acima inclui apenas as rotas completas; não contabiliza como zero os trechos desconhecidos.
    </p>}

    <div className="mt-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>
          <th className="px-3 py-2">Entregador</th>
          <th className="px-3 py-2 text-right">KM estimados</th>
          <th className="px-3 py-2 text-right">Turnos calculados</th>
        </tr></thead>
        <tbody>
          {summary.map(({ driver, relevant, done, missing: failures }) => <tr key={driver.id} className="border-t border-border">
            <td className="px-3 py-2.5 font-semibold">{driver.name}</td>
            <td className="px-3 py-2.5 text-right font-bold tabular-nums">
              {relevant.length === 0 ? "Sem entregas" : done.length
                ? formatRoadKm(done.reduce((sum, row) => sum + (calculated[row.key]?.meters ?? 0), 0))
                : failures.length === relevant.length ? "Indisponível" : "Calculando…"}
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums">{done.length}/{relevant.length}</td>
          </tr>)}
          {!summary.length && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">Nenhum entregador cadastrado.</td></tr>}
        </tbody>
      </table>
    </div>

    <h4 className="mt-4 flex items-center gap-2 text-sm font-bold"><Route className="h-4 w-4" /> Detalhes por turno</h4>
    <div className="mt-2 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-xs sm:text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>
          <th className="px-3 py-2">Dia / turno</th>
          <th className="px-3 py-2">Entregador</th>
          <th className="px-3 py-2 text-right">Paradas</th>
          <th className="px-3 py-2 text-right">KM</th>
        </tr></thead>
        <tbody>
          {selectedTrips.map(trip => <tr key={trip.key} className="border-t border-border">
            <td className="whitespace-nowrap px-3 py-2.5">
              <strong>{shortDate(trip.day)}</strong> · {shiftLabel(trip.shift)}
            </td>
            <td className="px-3 py-2.5">{trip.name}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{trip.visits}</td>
            <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
              {calculated[trip.key] ? isRecorded(calculated[trip.key])
                ? formatRoadKm(calculated[trip.key].meters!)
                : <span title={calculated[trip.key].reason} className="text-amber-600 dark:text-amber-400">Não calculado</span>
                : "Calculando…"}
              {calculated[trip.key]?.legs?.length === trip.stops.length - 1 &&
                <details className="mt-1 min-w-40 text-left text-xs font-normal">
                  <summary className="cursor-pointer font-semibold text-primary">Ver KM entre endereços</summary>
                  <ol className="mt-2 space-y-1 text-muted-foreground">
                    {calculated[trip.key].legs!.map((meters, index) =>
                      <li key={index} className="border-t border-border/70 pt-1">
                        {trip.stops[index]?.kind === "origin" ? "LOJA" : trip.stops[index]?.company}
                        {" → "}{trip.stops[index + 1]?.company}: <strong>{formatRoadKm(meters)}</strong>
                      </li>
                    )}
                  </ol>
                </details>}
              {calculated[trip.key]?.meters === null &&
                <p className="mt-1 text-left text-xs font-normal text-muted-foreground">
                  {calculated[trip.key].reason}
                </p>}
            </td>
          </tr>)}
          {!selectedTrips.length && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Nenhuma entrega finalizada no período.</td></tr>}
        </tbody>
      </table>
    </div>
    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
      Cálculo: BIGNOTTO FERRAMENTAS → primeira entrega → demais paradas confirmadas do mesmo entregador, dia e turno.
      A loja é a origem de cada turno; não é somado o retorno à loja após a última parada.
      A distância é estimada pelas vias disponíveis e pode variar com o roteamento atual. Rotas sem endereço ou sem resposta
      do serviço aparecem como não calculadas. O sistema não solicita localização nem monitora o celular do entregador.
    </p>
  </section>;
}

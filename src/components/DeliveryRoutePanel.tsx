import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { CheckCircle2, Clock3, ExternalLink, MapPin, Navigation2, Route, Save, TriangleAlert, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtBrasilia, type Delivery } from "@/lib/deliveries";
import { normalizeDeliveryClientCode, type DeliveryClientAddress } from "@/lib/delivery-addresses";
import { fullDeliveryAddress, getRouteStops, googleRouteSegments, listDeliveryRoutes, type RouteStop } from "@/lib/delivery-route";
import { shiftLabel } from "@/lib/expedition-schedule";
import { DeliveryRouteMap } from "./DeliveryRouteMap";
import { GoogleMapsAddressConfirm } from "./GoogleMapsAddressConfirm";
import type { ConfirmedPoint } from "@/lib/google-maps-location";

const reais = (value: number) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function RouteStopNumber({ number }: { number: number }) {
  return <span aria-label={number + "ª parada"} className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[3px] border-white text-xs font-black text-white shadow-[0_3px_9px_rgba(22,65,151,0.28)] ${number === 1 ? "bg-[#06a247]" : "bg-[#245ddc]"}`}>
    {number}
  </span>;
}
function StopCard({
  stop, index, editing, openEdit, form, setForm, saveEdit, closeEdit, busy, saveError, unresolved, onConfirmLocation,
}: {
  stop: RouteStop; index: number; editing: boolean; openEdit: () => void;
  form: { address: string; neighborhood: string; city: string; state: string };
  setForm: Dispatch<SetStateAction<{ address: string; neighborhood: string; city: string; state: string }>>;
  saveEdit: () => void; closeEdit: () => void; busy: boolean; saveError: string;
  unresolved: boolean;
  onConfirmLocation: (clientCode: string, point: ConfirmedPoint) => Promise<void>;
}) {
  const receiver = [...new Set(stop.deliveries.map(d => d.receiver?.trim()).filter((v): v is string => !!v))];
  const isCollection = stop.deliveries[0]?.source === "coleta";
  const value = stop.deliveries.reduce((total, d) => total + (d.onlyDelivery ? 0 : Number(d.value) || 0), 0);
  return <div className="relative flex gap-3 pb-4 last:pb-0">
    <div className="absolute left-[17px] top-9 bottom-[-1px] w-[3px] rounded-full bg-[#bad3f0] last:hidden" aria-hidden="true" />
    <RouteStopNumber number={index + 1} />
    <article className="min-w-0 flex-1 rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{index + 1}ª parada confirmada</p>
          <h5 className="mt-1 break-words text-base font-extrabold text-foreground">{stop.company}</h5>
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /> {fmtBrasilia(stop.at)}</p>
        </div>
        {stop.address ? <CheckCircle2 aria-label="Endereço cadastrado" className="h-5 w-5 shrink-0 text-emerald-600" /> : <TriangleAlert aria-label="Endereço não encontrado" className="h-5 w-5 shrink-0 text-amber-500" />}
      </div>
      {stop.address
        ? <p className="mt-2 break-words text-xs text-muted-foreground">{fullDeliveryAddress(stop.address)}</p>
        : <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{isCollection ? "Endereço da coleta não informado — registro preservado no histórico, sem marcador no mapa." : "Endereço sem cadastro — parada preservada na sequência."}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {stop.deliveries.map(delivery => <span key={delivery.id} className={`rounded-md border px-2 py-1 text-xs font-medium ${delivery.source === "coleta" ? "border-orange-400/40 bg-orange-400/15 text-orange-700 dark:text-orange-300" : "border-border bg-muted/40"}`}>
          {delivery.source === "coleta" ? "COLETA" : delivery.onlyDelivery ? "Somente entrega" : "Nota " + (delivery.document || "—") }
        </span>)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {receiver.length > 0 && <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" /> {receiver.join(", ")}</span>}
        {isCollection && stop.deliveries[0]?.collectionContact && <span>Falar com: {stop.deliveries[0].collectionContact}</span>}
        {isCollection && <span className="inline-flex items-center gap-1 font-semibold">
          <span aria-hidden="true">{stop.deliveries[0]?.collectionTransport === "moto" ? "🏍️" : stop.deliveries[0]?.collectionTransport === "carro" ? "🚗" : "🚚"}</span>
          {stop.deliveries[0]?.collectionTransport === "moto" ? "MOTO" : stop.deliveries[0]?.collectionTransport === "carro" ? "CARRO" : "Transporte não informado"}
        </span>}
        <span className="font-semibold">{isCollection && stop.deliveries[0]?.collectionValueProvided === false ? "Valor não informado" : reais(value)}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
        {!isCollection && <Button size="sm" variant="outline" disabled={!stop.clientCode} onClick={openEdit}>{stop.address ? "Editar endereço" : "Cadastrar endereço"}</Button>}
        {stop.address && <a className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
          href={"https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(fullDeliveryAddress(stop.address))}
          target="_blank" rel="noopener noreferrer"><MapPin className="h-3.5 w-3.5" /> Abrir local <ExternalLink className="h-3 w-3" /></a>}
      </div>
      {editing && <form className="mt-3 grid gap-2 border-t border-border pt-3" onSubmit={event => { event.preventDefault(); saveEdit(); }}>
        <p className="text-xs font-semibold">Endereço do cliente · código {stop.clientCode}</p>
        <Input required aria-label="Rua e número" maxLength={300} placeholder="Rua e número" value={form.address} onChange={e => setForm(v => ({ ...v, address: e.target.value }))} />
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_60px] gap-2">
          <Input aria-label="Bairro" maxLength={300} placeholder="Bairro" value={form.neighborhood} onChange={e => setForm(v => ({ ...v, neighborhood: e.target.value }))} />
          <Input required aria-label="Cidade" maxLength={300} placeholder="Cidade" value={form.city} onChange={e => setForm(v => ({ ...v, city: e.target.value }))} />
          <Input required aria-label="UF" maxLength={2} placeholder="UF" value={form.state} onChange={e => setForm(v => ({ ...v, state: e.target.value.toUpperCase() }))} />
        </div>
        {saveError && <p role="alert" className="text-xs text-destructive">{saveError}</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={busy}><Save className="h-4 w-4" /> {busy ? "Salvando…" : "Salvar endereço"}</Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={closeEdit}>Cancelar</Button>
        </div>
      </form>}
      {!isCollection && <GoogleMapsAddressConfirm stop={stop} unresolved={unresolved}
        onSave={point => onConfirmLocation(stop.clientCode, point)} />}
    </article>
  </div>;
}

export function DeliveryRoutePanel({
  deliveries, addresses, storeOrigin, originError, onSaveAddress, onConfirmLocation,
}: {
  deliveries: Delivery[];
  addresses: DeliveryClientAddress[];
  storeOrigin?: DeliveryClientAddress;
  originError?: boolean;
  onSaveAddress: (address: DeliveryClientAddress) => Promise<void>;
  onConfirmLocation: (clientCode: string, point: ConfirmedPoint) => Promise<void>;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [routeKey, setRouteKey] = useState("");
  const [roadDistance, setRoadDistance] = useState<number | null>(null);
  const [form, setForm] = useState({ address: "", neighborhood: "", city: "", state: "SP" });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [unresolved, setUnresolved] = useState<number[]>([]);
  const reportUnresolved = useCallback((indices: number[]) => {
    setUnresolved(current => current.length === indices.length && current.every((id, i) => id === indices[i]) ? current : indices);
  }, []);
  // A rota independe da entrega selecionada no grid (que pode estar pendente).
  const routes = useMemo(() => listDeliveryRoutes(deliveries), [deliveries]);
  const activeRoute = routes.find(route => route.key === routeKey) ?? routes[0] ?? null;
  const stopsSnapshot = JSON.stringify(activeRoute ? getRouteStops(deliveries, activeRoute.selected, addresses, storeOrigin) : []);
  const stops = useMemo(() => JSON.parse(stopsSnapshot) as RouteStop[], [stopsSnapshot]);
  const visitStops = stops.filter(stop => stop.kind !== "origin");
  const routeSegments = useMemo(() => googleRouteSegments(stops), [stops]);
  const missing = visitStops.filter(stop => !stop.address);
  const located = stops.filter(stop => !!stop.address);
  const routeDate = activeRoute?.day.split("-").reverse().join("/") ?? "";
  const openEdit = (stop: RouteStop, index: number) => {
    setEditing(index);
    setForm({ address: stop.address?.address ?? "", neighborhood: stop.address?.neighborhood ?? "", city: stop.address?.city ?? "", state: stop.address?.state ?? "SP" });
    setSaveError("");
  };
  const saveEdit = async (stop: RouteStop) => {
    if (!stop.clientCode) { setSaveError("Esta entrega não tem código do cliente para associar o endereço."); return; }
    if (!form.address.trim() || !form.city.trim() || !/^[A-Za-z]{2}$/.test(form.state.trim())) {
      setSaveError("Preencha rua, cidade e UF com duas letras."); return;
    }
    setBusy(true); setSaveError("");
    try {
      await onSaveAddress({
        client_code: normalizeDeliveryClientCode(stop.clientCode),
        address: form.address.trim(), neighborhood: form.neighborhood.trim(),
        city: form.city.trim(), state: form.state.trim().toUpperCase(),
      });
      setEditing(null);
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : "Falha ao salvar o endereço."); }
    finally { setBusy(false); }
  };

  return <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-background/40" aria-label="Rota de entregas do motorista">
    <header className="bg-[#122b4b] px-4 py-4 text-white sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.15em] text-[#a8c8f0]"><Navigation2 className="h-4 w-4" /> Percurso do entregador</div>
          <h4 className="mt-1 flex items-center gap-2 text-lg font-extrabold sm:text-xl"><Route className="h-5 w-5 text-[#78b5ff]" /> Rota realizada</h4>
          <p className="mt-1 text-xs text-[#ceddf0]">{activeRoute ? activeRoute.name + " · " + routeDate + " · " + shiftLabel(activeRoute.shift) : "Nenhuma rota finalizada disponível"}</p>
        </div>
        <span className="rounded-xl border border-[#4f7195] bg-[#1b4068] px-3 py-2 text-center text-xs font-bold text-white">
          <span className="block text-2xl font-black">{visitStops.length}</span> {visitStops.length === 1 ? "parada" : "paradas"}
        </span>
      </div>
    </header>
    <div className="space-y-4 p-3 sm:p-4">
      {routes.length > 0 && <label className="block space-y-1.5 text-sm font-bold">
        <span>Selecionar entregador, dia e turno</span>
        <select aria-label="Rota finalizada por entregador, dia e turno" value={activeRoute?.key ?? ""} onChange={e => { setRouteKey(e.target.value); setEditing(null); setRoadDistance(null); }}
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-semibold text-foreground">
          {routes.map(route => <option key={route.key} value={route.key}>{route.name} · {route.day.split("-").reverse().join("/")} · {shiftLabel(route.shift)} · {route.count} {route.count === 1 ? "operação" : "operações"} finalizadas</option>)}
        </select>
      </label>}
      {located.length > 0 && <DeliveryRouteMap stops={stops} onUnresolvedChange={reportUnresolved}
        onRoadDistanceChange={setRoadDistance} />}
      {!located.length && stops.length > 0 && <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center">
        <MapPin className="h-7 w-7 text-[#245ddc]" /><p className="mt-2 text-sm font-semibold">Cadastre os endereços para mostrar os piquetes no mapa.</p>
      </div>}
      <p className="text-xs text-muted-foreground">A linha azul acompanha as ruas calculadas a partir dos endereços, seguindo a ordem das entregas confirmadas. Não é uma gravação do GPS do veículo. Quando o roteamento falha, aparecem trechos pontilhados estimados.</p>
      {!!activeRoute && !storeOrigin && <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
        <TriangleAlert className="mr-1 inline h-4 w-4" /> Origem fixa: BIGNOTTO FERRAMENTAS, cliente código 1. {originError ? "Não foi possível consultar os endereços." : "O endereço do cliente 1 não foi encontrado na base de endereços. Importe ou corrija o endereço do código 1 para incluir a loja no mapa."}
      </p>}
      {!!activeRoute && <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs font-semibold">
        <strong>Origem de cada turno:</strong> BIGNOTTO FERRAMENTAS {storeOrigin ? "· " + fullDeliveryAddress(storeOrigin) : "· Av. Ampélio Gazetta (endereço a confirmar)"}
        <span className="mt-1 block text-muted-foreground">Distância estimada pelas ruas (desde a loja): {roadDistance === null || !storeOrigin ? "Indisponível ou trajeto incompleto" : (roadDistance / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " km"}. Não é a quilometragem medida pelo GPS.</span>
      </div>}
      {missing.length > 0 && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
        <TriangleAlert className="mr-1 inline h-4 w-4" /> {missing.length} {missing.length === 1 ? "parada está sem endereço" : "paradas estão sem endereço"}: {missing.map(stop => stop.company).join(", ")}. Nenhuma parada é retirada da lista.
      </p>}
      {routeSegments.length > 0 && <div className="flex flex-wrap gap-2">
        {routeSegments.map((segment, index) => <a key={segment.url} href={segment.url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-[#2379e5] px-3 py-2.5 text-sm font-extrabold text-white hover:bg-[#1265c8]">
          <Navigation2 className="h-4 w-4" /> {routeSegments.length === 1 ? "Abrir rota no Google Maps" : "Abrir trecho " + (index + 1) + " de " + routeSegments.length} <ExternalLink className="h-3.5 w-3.5" />
        </a>)}
      </div>}
      {routeSegments.length > 0 && <p className="text-xs text-muted-foreground">O Google Maps calcula as vias atuais entre as paradas, na ordem registrada. O caminho não é um histórico GPS.</p>}
      <div className="rounded-xl bg-[#e9f2ff] px-3 py-2 text-xs font-semibold text-[#315d93] dark:bg-[#183251] dark:text-[#b8d6f5]">
        Sequência de entregas e coletas confirmadas · {visitStops.length} {visitStops.length === 1 ? "visita" : "visitas"} · {visitStops.reduce((sum, stop) => sum + stop.deliveries.length, 0)} {visitStops.reduce((sum, stop) => sum + stop.deliveries.length, 0) === 1 ? "operação" : "operações"}
      </div>
      <div className="relative">
        {stops.filter(stop => stop.kind === "origin").map(stop =>
          <div key={stop.key} className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-white bg-[#06a247] text-sm font-black text-white">L</span>
            <div className="min-w-0"><strong className="text-sm">ORIGEM · BIGNOTTO FERRAMENTAS</strong>
              <p className="mt-1 break-words text-xs text-muted-foreground">{stop.address ? fullDeliveryAddress(stop.address) : "Av. Ampélio Gazetta"}</p></div>
          </div>)}
        {visitStops.map((stop, index) => <StopCard key={stop.key + ":" + stop.at + ":" + index} stop={stop} index={index}
          editing={editing === index} openEdit={() => openEdit(stop, index)}
          form={form} setForm={setForm} saveEdit={() => { void saveEdit(stop); }}
          closeEdit={() => setEditing(null)} busy={busy} saveError={saveError}
          unresolved={unresolved.includes(index + (storeOrigin ? 1 : 0))} onConfirmLocation={onConfirmLocation} />)}
        {stops.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma entrega finalizada com entregador e horário foi encontrada. O mapa será preenchido após as confirmações.</p>}
      </div>
    </div>
  </section>;
}

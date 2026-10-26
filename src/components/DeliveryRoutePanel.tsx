import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { CheckCircle2, Clock3, ExternalLink, MapPin, Navigation2, Route, Save, TriangleAlert, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtBrasilia, type Delivery } from "@/lib/deliveries";
import { normalizeDeliveryClientCode, type DeliveryClientAddress } from "@/lib/delivery-addresses";
import { fullDeliveryAddress, getRouteStops, googleRouteSegments, saoPauloDay, type RouteStop } from "@/lib/delivery-route";
import { DeliveryRouteMap } from "./DeliveryRouteMap";

const reais = (value: number) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function RouteStopNumber({ number }: { number: number }) {
  return <span aria-label={number + "ª parada"} className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[3px] border-white text-xs font-black text-white shadow-[0_3px_9px_rgba(22,65,151,0.28)] ${number === 1 ? "bg-[#06a247]" : "bg-[#245ddc]"}`}>
    {number}
  </span>;
}
function StopCard({
  stop, index, editing, openEdit, form, setForm, saveEdit, closeEdit, busy, saveError,
}: {
  stop: RouteStop; index: number; editing: boolean; openEdit: () => void;
  form: { address: string; neighborhood: string; city: string; state: string };
  setForm: Dispatch<SetStateAction<{ address: string; neighborhood: string; city: string; state: string }>>;
  saveEdit: () => void; closeEdit: () => void; busy: boolean; saveError: string;
}) {
  const receiver = [...new Set(stop.deliveries.map(d => d.receiver?.trim()).filter((v): v is string => !!v))];
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
        : <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Endereço sem cadastro — parada preservada na sequência.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {stop.deliveries.map(delivery => <span key={delivery.id} className="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium">
          {delivery.onlyDelivery ? "Somente entrega" : "Nota " + (delivery.document || "—")}
        </span>)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {receiver.length > 0 && <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" /> {receiver.join(", ")}</span>}
        <span className="font-semibold">{reais(value)}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
        <Button size="sm" variant="outline" disabled={!stop.clientCode} onClick={openEdit}>{stop.address ? "Editar endereço" : "Cadastrar endereço"}</Button>
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
    </article>
  </div>;
}

export function DeliveryRoutePanel({
  deliveries, selected, addresses, onSaveAddress,
}: {
  deliveries: Delivery[];
  selected: Delivery;
  addresses: DeliveryClientAddress[];
  onSaveAddress: (address: DeliveryClientAddress) => Promise<void>;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState({ address: "", neighborhood: "", city: "", state: "SP" });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  // As entregas são consultadas periodicamente. Preservar a identidade da sequência
  // evita desmontar o mapa e reiniciar a localização de endereços a cada atualização.
  const stopsSnapshot = JSON.stringify(getRouteStops(deliveries, selected, addresses));
  const stops = useMemo(() => JSON.parse(stopsSnapshot) as RouteStop[], [stopsSnapshot]);
  const routeSegments = useMemo(() => googleRouteSegments(stops), [stops]);
  const missing = stops.filter(stop => !stop.address);
  const located = stops.filter(stop => !!stop.address);
  const routeDate = saoPauloDay(selected.finishedAt || selected.arrivedAt || selected.startedAt || selected.createdAt);
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
          <p className="mt-1 text-xs text-[#ceddf0]">{selected.driver ? selected.driver + " · " + routeDate.split("-").reverse().join("/") : "Entregador ainda não definido"}</p>
        </div>
        <span className="rounded-xl border border-[#4f7195] bg-[#1b4068] px-3 py-2 text-center text-xs font-bold text-white">
          <span className="block text-2xl font-black">{stops.length}</span> {stops.length === 1 ? "parada" : "paradas"}
        </span>
      </div>
    </header>
    <div className="space-y-4 p-3 sm:p-4">
      {located.length > 0 && <DeliveryRouteMap stops={stops} />}
      {!located.length && stops.length > 0 && <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center">
        <MapPin className="h-7 w-7 text-[#245ddc]" /><p className="mt-2 text-sm font-semibold">Cadastre os endereços para mostrar os piquetes no mapa.</p>
      </div>}
      <p className="text-xs text-muted-foreground">A linha azul acompanha as ruas calculadas a partir dos endereços, seguindo a ordem das entregas confirmadas. Não é uma gravação do GPS do veículo. Quando o roteamento falha, aparecem trechos pontilhados estimados.</p>
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
        Sequência de entregas confirmadas · {stops.length} {stops.length === 1 ? "visita" : "visitas"} · {stops.reduce((sum, stop) => sum + stop.deliveries.length, 0)} {stops.reduce((sum, stop) => sum + stop.deliveries.length, 0) === 1 ? "documento" : "documentos"}
      </div>
      <div className="relative">
        {stops.map((stop, index) => <StopCard key={stop.key + ":" + stop.at + ":" + index} stop={stop} index={index}
          editing={editing === index} openEdit={() => openEdit(stop, index)}
          form={form} setForm={setForm} saveEdit={() => { void saveEdit(stop); }}
          closeEdit={() => setEditing(null)} busy={busy} saveError={saveError} />)}
        {stops.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma entrega finalizada neste dia para este entregador. O mapa será preenchido após as confirmações.</p>}
      </div>
    </div>
  </section>;
}

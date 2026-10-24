import { useState } from "react";
import { CheckCircle2, Clock3, ExternalLink, MapPin, Route, Save, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtBrasilia, type Delivery } from "@/lib/deliveries";
import { normalizeDeliveryClientCode, type DeliveryClientAddress } from "@/lib/delivery-addresses";

type Stop = {
  key: string;
  company: string;
  clientCode: string;
  date: string;
  deliveries: Delivery[];
  address?: DeliveryClientAddress;
};

function localDay(iso: string): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function visitTime(delivery: Delivery): string {
  return delivery.arrivedAt ?? delivery.finishedAt ?? "";
}
function fullAddress(address: DeliveryClientAddress): string {
  return [address.address, address.neighborhood, address.city, address.state, "Brasil"].filter(Boolean).join(", ");
}
function getRouteStops(deliveries: Delivery[], selected: Delivery, addresses: DeliveryClientAddress[]): Stop[] {
  if (!selected.driver?.trim()) return [];
  const date = localDay(selected.finishedAt ?? selected.arrivedAt ?? selected.startedAt ?? selected.createdAt);
  const driver = selected.driver.trim().toLocaleLowerCase("pt-BR");
  const known = new Map(addresses.map(a => [normalizeDeliveryClientCode(a.client_code), a]));
  const matching = deliveries.filter(d =>
    d.driver?.trim().toLocaleLowerCase("pt-BR") === driver &&
    d.status === "finalizada" &&
    Boolean(visitTime(d)) &&
    localDay(visitTime(d)) === date
  ).sort((a, b) => visitTime(a).localeCompare(visitTime(b)) || a.position - b.position);
  const stops: Stop[] = [];
  for (const d of matching) {
    const code = normalizeDeliveryClientCode(d.companyCode ?? "");
    // Mesma empresa consecutiva é uma parada, mesmo com várias notas.
    const key = code ? `codigo:${code}` : `empresa:${d.company.trim().toLocaleLowerCase("pt-BR")}`;
    const previous = stops[stops.length - 1];
    if (previous?.key === key) {
      previous.deliveries.push(d);
      continue;
    }
    stops.push({
      key,
      company: d.company,
      clientCode: code,
      date: visitTime(d),
      deliveries: [d],
      address: code ? known.get(code) : undefined,
    });
  }
  return stops;
}
function googleDirectionsUrl(stops: Stop[]): string | null {
  if (stops.length < 2) return null;
  const params = new URLSearchParams({
    api: "1",
    origin: fullAddress(stops[0].address!),
    destination: fullAddress(stops[stops.length - 1].address!),
    travelmode: "driving",
  });
  const middle = stops.slice(1, -1);
  if (middle.length) params.set("waypoints", middle.map(s => fullAddress(s.address!)).join("|"));
  return "https://www.google.com/maps/dir/?" + params.toString();
}

export function DeliveryRoutePanel({
  deliveries, selected, addresses, onSaveAddress,
}: {
  deliveries: Delivery[];
  selected: Delivery;
  addresses: DeliveryClientAddress[];
  onSaveAddress: (address: DeliveryClientAddress) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ address: "", neighborhood: "", city: "", state: "SP" });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const stops = getRouteStops(deliveries, selected, addresses);
  const ready = stops.length >= 2 && stops.every(s => !!s.address);
  const routeUrl = ready ? googleDirectionsUrl(stops) : null;
  const missing = stops.filter(s => !s.address);
  const first = stops[0], last = stops[stops.length - 1];

  // Mapa antigo por endereço: nunca rotular como trilha real de GPS.
  // O link de direções oficial é o caminho principal para visualizar todas as paradas.
  const previewUrl = ready ? "https://maps.google.com/maps?output=embed&dirflg=d&saddr="
    + encodeURIComponent(fullAddress(first.address!))
    + "&daddr=" + encodeURIComponent(fullAddress(last.address!)) : null;

  const openEdit = (stop: Stop) => {
    setEditing(stop.key);
    setForm({ address: stop.address?.address ?? "", neighborhood: stop.address?.neighborhood ?? "", city: stop.address?.city ?? "", state: stop.address?.state ?? "SP" });
    setSaveError("");
  };
  const saveEdit = async (stop: Stop) => {
    if (!stop.clientCode) { setSaveError("Esta entrega não possui um código de cliente. Não é possível associar o endereço com segurança."); return; }
    if (!form.address.trim() || !form.city.trim() || !/^[A-Za-z]{2}$/.test(form.state.trim())) {
      setSaveError("Preencha endereço, cidade e UF com duas letras."); return;
    }
    setBusy(true); setSaveError("");
    try {
      await onSaveAddress({
        client_code: stop.clientCode,
        address: form.address.trim(), neighborhood: form.neighborhood.trim(),
        city: form.city.trim(), state: form.state.trim().toUpperCase(),
      });
      setEditing(null);
    } catch (e) { setSaveError(e instanceof Error ? e.message : "Não foi possível salvar o endereço."); }
    finally { setBusy(false); }
  };
  return <div className="mt-5 rounded-lg border border-border bg-background/40 p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="flex items-center gap-2 text-sm font-bold"><Route className="h-4 w-4 text-primary" /> Percurso das entregas</h4>
      <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">Reconstrução por horários</span>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">
      {selected.driver ? `Entregador: ${selected.driver} · ${stops.length} parada(s) finalizada(s) no mesmo dia` : "Sem entregador atribuído"}
      . A ordem usa os horários de chegada registrados. Não é histórico de posições GPS.
    </p>
    {stops.length > 0 && <div className="mt-3 space-y-2">
      {stops.map((stop, index) => <div key={stop.key + ":" + index} className="rounded-md border border-border/80 bg-card/70 p-3">
        <div className="flex items-start gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold">{stop.company}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" /> {fmtBrasilia(stop.date)} · {stop.deliveries.length} documento(s)</p>
            {stop.address ? <p className="mt-1 text-xs text-muted-foreground">{fullAddress(stop.address)}</p>
              : <p className="mt-1 flex items-center gap-1 text-xs text-warning"><TriangleAlert className="h-3.5 w-3.5" /> Endereço não encontrado na base</p>}
          </div>
          <Button type="button" variant="outline" size="sm" disabled={!stop.clientCode} onClick={() => openEdit(stop)}>
            {stop.address ? "Editar" : "Cadastrar"}
          </Button>
        </div>
        {editing === stop.key && <form className="mt-3 grid gap-2 border-t border-border pt-3" onSubmit={e => { e.preventDefault(); void saveEdit(stop); }}>
          <p className="text-xs font-semibold">Endereço do cliente · código {stop.clientCode}</p>
          <Input required aria-label="Rua e número" maxLength={300} placeholder="Rua e número" value={form.address} onChange={e => setForm(v => ({ ...v, address: e.target.value }))} />
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_60px] gap-2">
            <Input aria-label="Bairro" maxLength={300} placeholder="Bairro" value={form.neighborhood} onChange={e => setForm(v => ({ ...v, neighborhood: e.target.value }))} />
            <Input required aria-label="Cidade" maxLength={300} placeholder="Cidade" value={form.city} onChange={e => setForm(v => ({ ...v, city: e.target.value }))} />
            <Input required aria-label="UF" maxLength={2} placeholder="UF" value={form.state} onChange={e => setForm(v => ({ ...v, state: e.target.value.toUpperCase() }))} />
          </div>
          {saveError && <p role="alert" className="text-xs text-destructive">{saveError}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={busy}><Save className="h-4 w-4" /> {busy ? "Salvando…" : "Salvar endereço"}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={busy}>Cancelar</Button>
          </div>
        </form>}
      </div>)}
    </div>}
    {stops.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Não há paradas finalizadas com horários para reconstruir este percurso.</p>}
    {stops.length === 1 && <p className="mt-3 text-sm text-muted-foreground">É necessária pelo menos mais uma parada para calcular uma rota.</p>}
    {stops.length >= 2 && missing.length > 0 && <p className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
      Cadastre os endereços ausentes ({missing.map(s => s.company).join(", ")}) para desenhar a rota completa, sem omitir paradas.
    </p>}
    {routeUrl && <div className="mt-4 space-y-3">
      <p className="text-sm font-semibold">{first.company} → {last.company}</p>
      <a className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground hover:opacity-90" href={routeUrl} target="_blank" rel="noopener noreferrer">
        <MapPin className="h-4 w-4" /> Ver rota completa no Google Maps <ExternalLink className="h-3.5 w-3.5" />
      </a>
      <p className="text-xs text-muted-foreground">O Google Maps calcula um percurso possível pelas vias atuais, na sequência das paradas registradas. Não corresponde necessariamente ao caminho efetivamente percorrido.</p>
      {previewUrl && <div className="overflow-hidden rounded-lg border border-border">
        <iframe title="Prévia estimada entre primeira e última parada" src={previewUrl} className="h-[290px] w-full" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Prévia apenas do primeiro ao último endereço. O botão acima inclui as paradas intermediárias. A prévia depende da disponibilidade de incorporação do Google Maps.</p>
      </div>}
    </div>}
    {stops.length > 0 && stops.every(s => !!s.address) && <p className="mt-3 flex items-center gap-1.5 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Endereços de todas as paradas cadastrados.</p>}
  </div>;
}

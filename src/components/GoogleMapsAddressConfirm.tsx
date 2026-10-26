import { useState } from "react";
import { CheckCircle2, ExternalLink, MapPin, Save, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RouteStop } from "@/lib/delivery-route";
import { googleMapsPointUrl, googleMapsSearchUrl, parseGoogleMapsPoint, type ConfirmedPoint } from "@/lib/google-maps-location";

export function GoogleMapsAddressConfirm({ stop, unresolved, onSave }: {
  stop: RouteStop;
  unresolved: boolean;
  onSave: (point: ConfirmedPoint) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const point = parseGoogleMapsPoint(value);
  const confirmed = stop.address?.locationSource === "google_maps"
    && stop.address.latitude !== undefined && stop.address.longitude !== undefined;

  async function confirm() {
    if (!point || !stop.address || !stop.clientCode) return;
    setBusy(true); setError("");
    try {
      await onSave(point);
      setOpen(false); setValue("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível confirmar este ponto.");
    } finally { setBusy(false); }
  }

  return <div className="mt-3 rounded-lg border border-border/80 bg-background/60 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className={"inline-flex items-center gap-1.5 text-xs font-bold " +
        (confirmed ? "text-emerald-700 dark:text-emerald-400" : unresolved ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
        {confirmed ? <CheckCircle2 className="h-4 w-4" />
          : unresolved ? <TriangleAlert className="h-4 w-4" />
          : <MapPin className="h-4 w-4" />}
        {confirmed ? "Ponto validado pelo gestor no Google Maps"
          : unresolved ? "Endereço não localizado automaticamente"
          : "Localização do cliente"}
      </span>
      <Button variant="outline" size="sm" type="button" disabled={!stop.clientCode || !stop.address || busy}
        onClick={() => { setOpen(v => !v); setError(""); }}>
        {confirmed ? "Corrigir localização" : "Confirmar pelo Google Maps"}
      </Button>
    </div>
    {!stop.address && <p className="mt-2 text-xs text-muted-foreground">Cadastre primeiro a rua, cidade e UF do cliente.</p>}
    {confirmed && <p className="mt-1 text-xs text-muted-foreground">
      Latitude {stop.address!.latitude!.toFixed(6)} · Longitude {stop.address!.longitude!.toFixed(6)}.
      O mapa reutiliza estas coordenadas nas próximas entregas.
    </p>}
    {open && stop.address && <div className="mt-3 space-y-3 border-t border-border pt-3">
      <p className="text-xs font-semibold">1. Abra o Google Maps e confira onde fica a entrada do cliente.</p>
      <a href={googleMapsSearchUrl(stop.address, stop.company)} target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#2379e5] px-3 py-2 text-xs font-bold text-white hover:bg-[#1460b7]">
        <MapPin className="h-4 w-4" /> Pesquisar endereço no Google Maps <ExternalLink className="h-3.5 w-3.5" />
      </a>
      <p className="text-xs text-muted-foreground">
        2. No Google Maps, clique com o botão direito no local correto e escolha as coordenadas exibidas.
        Copie a latitude e longitude ou o link completo de um local que contenha as coordenadas.
        Links curtos (maps.app.goo.gl) precisam ser abertos primeiro.
      </p>
      <label className="block space-y-1.5 text-xs font-semibold">
        <span>Coordenadas ou link completo do Google Maps</span>
        <Input value={value} onChange={e => setValue(e.target.value)} maxLength={4000}
          placeholder="-22.777123, -47.293456" aria-label={"Localização Google Maps de " + stop.company} />
      </label>
      {value.trim() && !point && <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">
        Não encontrei coordenadas válidas. Cole no formato latitude, longitude ou use o link completo do marcador, não apenas o centro do mapa.
      </p>}
      {point && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
        <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
          Ponto encontrado: {point.latitude.toFixed(7)}, {point.longitude.toFixed(7)}
        </p>
        <a href={googleMapsPointUrl(point)} target="_blank" rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary underline">
          Conferir este ponto no Google Maps <ExternalLink className="h-3 w-3" />
        </a>
      </div>}
      <p className="text-xs text-muted-foreground">3. Confira o ponto antes de salvar. A confirmação ficará vinculada a este código de cliente.</p>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={!point || busy} onClick={() => { void confirm(); }}>
          <Save className="h-4 w-4" /> {busy ? "Salvando..." : "Confirmar posição"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </div>}
  </div>;
}

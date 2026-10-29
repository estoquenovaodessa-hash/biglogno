import { useState } from "react";
import { CheckCircle2, ExternalLink, MapPin, Save, TriangleAlert } from "lucide-react";
import type { RouteStop } from "@/lib/delivery-route";
import { googleMapsPointUrl, googleMapsSearchUrl, parseGoogleMapsPoint, type ConfirmedPoint } from "@/lib/google-maps-location";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Coletas não possuem código de cliente: confirmação é vinculada ao ID da
 * coleta e compartilhada com o cadastro de empresas para uso futuro. */
export function CollectionGoogleMapsConfirm({ stop, onSave }: {
  stop: RouteStop;
  onSave: (collectionId: string, address: string, point: ConfirmedPoint) => Promise<void>;
}) {
  const collection = stop.deliveries.find(row => row.source === "coleta");
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState(stop.address?.address ?? collection?.collectionAddress ?? "");
  const [mapsValue, setMapsValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const point = parseGoogleMapsPoint(mapsValue);
  const confirmed = stop.address?.locationSource === "google_maps"
    && stop.address.latitude !== undefined && stop.address.longitude !== undefined;
  if (!collection) return null;

  const searchAddress = address.trim()
    ? { client_code: "", address: address.trim(), neighborhood: "", city: "", state: "" }
    : undefined;
  async function save() {
    if (!point || !address.trim() || !collection) return;
    setBusy(true); setError("");
    try {
      await onSave(collection.id, address.trim(), point);
      setOpen(false); setMapsValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar o local da coleta.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-3 rounded-lg border border-orange-400/35 bg-orange-500/10 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className={"flex items-center gap-1.5 text-xs font-bold " +
        (confirmed ? "text-emerald-400" : "text-orange-300")}>
        {confirmed ? <CheckCircle2 className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
        {confirmed ? "Local da coleta confirmado no Google Maps" : "Local da coleta sem ponto confirmado"}
      </span>
      <Button type="button" variant="outline" size="sm" disabled={busy}
        onClick={() => { setAddress(stop.address?.address ?? collection.collectionAddress ?? ""); setOpen(v => !v); setError(""); }}>
        {confirmed ? "Corrigir local da coleta" : "Confirmar endereço da coleta"}
      </Button>
    </div>
    {confirmed && <p className="mt-2 text-xs text-muted-foreground">
      Este ponto é utilizado no mapa e no cálculo de KM. O endereço padrão ficará disponível para próximas coletas da empresa.
    </p>}
    {open && <div className="mt-3 space-y-3 border-t border-orange-400/25 pt-3">
      <label className="block space-y-1.5 text-xs font-semibold">
        <span>Endereço da coleta (rua, número, cidade e UF)</span>
        <Input value={address} maxLength={400} disabled={busy}
          onChange={event => setAddress(event.target.value)}
          placeholder="Rua, número, bairro, cidade - SP" aria-label="Endereço confirmado da coleta" />
      </label>
      <a href={googleMapsSearchUrl(searchAddress, stop.company)}
        target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#2379e5] px-3 py-2 text-xs font-bold text-white hover:bg-[#1460b7]">
        <MapPin className="h-4 w-4" /> Pesquisar coleta no Google Maps <ExternalLink className="h-3.5 w-3.5" />
      </a>
      <p className="text-xs text-muted-foreground">
        No Google Maps, confirme o endereço e clique com o botão direito no marcador para copiar
        latitude e longitude, ou copie um link completo que contenha as coordenadas.
        Links curtos precisam ser abertos antes.
      </p>
      <label className="block space-y-1.5 text-xs font-semibold">
        <span>Coordenadas ou link completo do Google Maps</span>
        <Input value={mapsValue} maxLength={4000} disabled={busy}
          onChange={event => setMapsValue(event.target.value)}
          placeholder="-22.777123, -47.293456" aria-label="Ponto da coleta no Google Maps" />
      </label>
      {mapsValue.trim() && !point && <p role="alert" className="flex items-center gap-1 text-xs text-amber-300">
        <TriangleAlert className="h-4 w-4" /> Informe coordenadas válidas do marcador, não somente o centro do mapa.
      </p>}
      {point && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs">
        <span className="font-bold text-emerald-400">Ponto: {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</span>
        <a className="mt-1 block text-sky-400 underline" target="_blank" rel="noopener noreferrer"
          href={googleMapsPointUrl(point)}>Conferir localização antes de salvar</a>
      </div>}
      <p className="text-xs text-muted-foreground">
        A confirmação corrigirá esta coleta na rota realizada e salvará o local para as próximas coletas desta empresa.
        Não modifica o recibo nem os horários da coleta já finalizada.
      </p>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={!point || address.trim().length < 5 || busy}
          onClick={() => { void save(); }}><Save className="h-4 w-4" />
          {busy ? "Salvando…" : "Salvar local confirmado"}</Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </div>}
  </div>;
}

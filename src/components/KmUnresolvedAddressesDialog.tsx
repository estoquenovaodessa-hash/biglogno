import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Pencil, Save, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GoogleMapsAddressConfirm } from "./GoogleMapsAddressConfirm";
import { CollectionGoogleMapsConfirm } from "./CollectionGoogleMapsConfirm";
import { normalizeDeliveryClientCode, type DeliveryClientAddress } from "@/lib/delivery-addresses";
import type { ConfirmedPoint } from "@/lib/google-maps-location";
import type { KmAddressIssue, KmRouteFailure } from "@/lib/km-unresolved-addresses";

const emptyForm = { address: "", neighborhood: "", city: "", state: "" };
type AddressForm = typeof emptyForm;

export function KmUnresolvedAddressesDialog({
  open, onOpenChange, issues, routeFailures, onSaveAddress, onConfirmLocation, onConfirmCollectionLocation,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  issues: KmAddressIssue[];
  routeFailures: KmRouteFailure[];
  onSaveAddress: (address: DeliveryClientAddress) => Promise<void>;
  onConfirmLocation: (clientCode: string, point: ConfirmedPoint) => Promise<void>;
  onConfirmCollectionLocation: (collectionId: string, address: string, point: ConfirmedPoint) => Promise<void>;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<AddressForm>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function beginEdit(issue: KmAddressIssue) {
    setEditingKey(issue.key);
    setError("");
    setNotice("");
    const current = issue.stop.address;
    setForm({
      address: current?.address ?? "",
      neighborhood: current?.neighborhood ?? "",
      city: current?.city ?? "",
      state: current?.state ?? "",
    });
  }

  async function save(issue: KmAddressIssue) {
    if (busy) return;
    const clientCode = issue.stop.kind === "origin"
      ? "1" : normalizeDeliveryClientCode(issue.stop.clientCode);
    if (!/^\d{1,12}$/.test(clientCode)) {
      setError("Esta entrega não possui um código de cliente válido. Corrija o cadastro de origem.");
      return;
    }
    const data: DeliveryClientAddress = {
      client_code: clientCode,
      address: form.address.trim(),
      neighborhood: form.neighborhood.trim(),
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
    };
    if (!data.address || !data.city || !/^[A-Z]{2}$/.test(data.state)) {
      setError("Preencha rua e número, cidade e UF com duas letras.");
      return;
    }
    if ([data.address, data.city, data.neighborhood].some(value => value.length > 300)) {
      setError("Cada campo do endereço deve ter até 300 caracteres.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      await onSaveAddress(data);
      setEditingKey(null);
      setNotice("Endereço do cliente " + clientCode + " salvo. Recalculando os KM com o cadastro atualizado.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o endereço.");
    } finally { setBusy(false); }
  }

  return <DialogPrimitive.Root open={open} onOpenChange={next => {
    if (busy) return;
    onOpenChange(next);
    if (!next) { setEditingKey(null); setError(""); setNotice(""); }
  }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[3000] bg-[#06152f]/80 backdrop-blur-[3px]" />
      <DialogPrimitive.Content aria-describedby="km-issues-description"
        className="fixed left-1/2 top-1/2 z-[3010] max-h-[90dvh] w-[calc(100%-1.25rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-sky-500/45 bg-[#0b2747] p-4 text-white shadow-[0_25px_90px_rgba(0,12,42,0.75)] outline-none sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-sky-500/30 pb-4">
          <div>
            <DialogPrimitive.Title className="flex items-center gap-2 text-lg font-extrabold text-white">
              <TriangleAlert className="h-5 w-5 text-amber-400" />
              Endereços não localizados nos KM
            </DialogPrimitive.Title>
            <DialogPrimitive.Description id="km-issues-description" className="mt-1 text-xs text-sky-200">
              Entregas e coletas dos turnos sem cálculo completo. Corrija o cadastro ou confirme o ponto no Google Maps.
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close asChild><Button type="button" variant="outline" size="sm"
            disabled={busy} className="shrink-0 gap-1.5 border-sky-500/50 bg-[#143b62] text-white hover:bg-sky-800 hover:text-white">
            <X className="h-4 w-4" /> Fechar
          </Button></DialogPrimitive.Close>
        </div>

        {notice && <p role="status" className="mb-3 rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">{notice}</p>}
        {issues.length === 0 && routeFailures.length === 0 &&
          <p role="status" className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            Não há endereços pendentes nas rotas deste período. Os cálculos foram atualizados.
          </p>}
        {issues.length > 0 && <div className="space-y-3">
          <p className="text-sm font-bold text-white">
            {issues.length} {issues.length === 1 ? "endereço requer" : "endereços requerem"} atenção
          </p>
          {issues.map(issue => {
            const { stop } = issue;
            const collection = stop.deliveries.some(d => d.source === "coleta");
            const code = stop.kind === "origin" ? "1" : normalizeDeliveryClientCode(stop.clientCode);
            const canEdit = !collection && /^\d{1,12}$/.test(code);
            const editing = editingKey === issue.key;
            return <article key={issue.key} className="rounded-xl border border-amber-500/35 bg-[#102f50] p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="break-words text-sm font-extrabold text-white">
                    {stop.kind === "origin" ? "ORIGEM · " : collection ? "COLETA · " : "ENTREGA · "}{stop.company}
                  </h4>
                  <p className="mt-1 break-words text-xs text-sky-200">
                    {stop.kind === "origin" ? "Código 1 · Loja Bignotto" :
                      collection ? "Endereço individual da coleta" :
                      code ? "Código do cliente: " + code : "Cliente sem código cadastrado"}
                  </p>
                  {stop.deliveries.length > 0 && <p className="mt-1 break-words text-xs text-sky-200">
                    {stop.deliveries.map(d => d.source === "coleta"
                      ? "Coleta" : d.onlyDelivery ? "Somente entrega" : "Nota " + (d.document || "—")).join(" · ")}
                  </p>}
                </div>
                {canEdit && <Button type="button" size="sm" variant="outline" disabled={busy}
                  className="gap-1.5 border-sky-500/55 bg-[#123b68] text-white hover:bg-sky-700 hover:text-white"
                  onClick={() => editing ? setEditingKey(null) : beginEdit(issue)}>
                  <Pencil className="h-4 w-4" /> {stop.address ? "Editar endereço" : "Cadastrar endereço"}
                </Button>}
              </div>
              <p className="mt-2 text-xs font-semibold text-amber-200">{issue.reason}</p>
              <p className="mt-1 text-xs text-sky-100">
                {stop.address
                  ? [stop.address.address, stop.address.neighborhood, stop.address.city, stop.address.state].filter(Boolean).join(", ")
                  : "Endereço não cadastrado para esta parada."}
              </p>
              <p className="mt-2 text-[11px] text-sky-300">
                {issue.trips.join(" · ")}
              </p>
              {!canEdit && !collection && <p className="mt-2 text-xs text-amber-200">
                Não é possível associar um endereço sem código de cliente. Corrija primeiro a identificação do pedido.
              </p>}
              {editing && <form className="mt-3 grid gap-2 border-t border-sky-500/35 pt-3"
                onSubmit={event => { event.preventDefault(); void save(issue); }}>
                <label className="space-y-1 text-xs font-bold text-sky-100">
                  <span>Rua e número *</span>
                  <Input required maxLength={300} aria-label={"Rua e número de " + stop.company}
                    className="border-sky-600 bg-[#061d35] text-white"
                    value={form.address} onChange={e => setForm(v => ({ ...v, address: e.target.value }))}/>
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_80px]">
                  <label className="space-y-1 text-xs font-bold text-sky-100">
                    <span>Bairro</span>
                    <Input maxLength={300} aria-label={"Bairro de " + stop.company}
                      className="border-sky-600 bg-[#061d35] text-white"
                      value={form.neighborhood} onChange={e => setForm(v => ({ ...v, neighborhood: e.target.value }))}/>
                  </label>
                  <label className="space-y-1 text-xs font-bold text-sky-100">
                    <span>Cidade *</span>
                    <Input required maxLength={300} aria-label={"Cidade de " + stop.company}
                      className="border-sky-600 bg-[#061d35] text-white"
                      value={form.city} onChange={e => setForm(v => ({ ...v, city: e.target.value }))}/>
                  </label>
                  <label className="space-y-1 text-xs font-bold text-sky-100">
                    <span>UF *</span>
                    <Input required maxLength={2} aria-label={"UF de " + stop.company}
                      className="border-sky-600 bg-[#061d35] text-white"
                      value={form.state} onChange={e => setForm(v => ({ ...v, state: e.target.value.toUpperCase() }))}/>
                  </label>
                </div>
                {editingKey === issue.key && error && <p role="alert" className="text-xs text-red-300">{error}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" disabled={busy}><Save className="h-4 w-4"/>
                    {busy ? "Salvando..." : "Salvar endereço"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={busy}
                    onClick={() => { setEditingKey(null); setError(""); }}>Cancelar</Button>
                </div>
              </form>}
              {collection
                ? <CollectionGoogleMapsConfirm stop={stop} onSave={onConfirmCollectionLocation}/>
                : canEdit && stop.address && <GoogleMapsAddressConfirm stop={stop} unresolved
                    onSave={point => onConfirmLocation(code, point)}/>}
            </article>;
          })}
        </div>}
        {routeFailures.length > 0 && <section className="mt-4 space-y-2 rounded-xl border border-sky-500/45 bg-[#10324e] p-3">
          <h3 className="text-sm font-bold text-sky-100">Outras rotas sem cálculo</h3>
          <p className="text-xs text-sky-200">
            Estas falhas não identificaram um endereço incorreto. O serviço de geocodificação
            ou de cálculo das vias pode estar indisponível. Recalcule os KM após verificar a conexão.
          </p>
          {routeFailures.map(item => <div key={item.key} className="border-t border-sky-600/25 pt-2 text-xs">
            <p className="font-bold text-white">{item.trip}</p>
            <p className="mt-1 text-sky-200">{item.reason}</p>
          </div>)}
        </section>}
        <p className="mt-4 text-xs text-sky-200">
          Salvar um endereço ou confirmar um ponto atualiza o cadastro do gestor. O sistema
          recalcula as rotas sem alterar as notas, os horários ou a identificação dos entregadores.
        </p>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}

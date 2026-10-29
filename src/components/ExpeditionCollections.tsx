import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardPlus, MapPin, PackageCheck, Pencil, Plus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addCollection, addCollectionCompany, listCollectionCompanies } from "@/lib/collections.functions";
import { readCollectionLocations } from "@/lib/collection-locations.functions";
import { googleMapsPointUrl } from "@/lib/google-maps-location";
import type { Delivery } from "@/lib/deliveries";
import { fmtBrasilia } from "@/lib/deliveries";
import { parseMoneyInput } from "@/lib/sales-verification";
import { shiftOf, shiftLabel, scheduledDateLabel, type ExpeditionShift } from "@/lib/expedition-schedule";
import { ExpeditionCollectionEditor } from "./ExpeditionCollectionEditor";
import { ExpeditionShiftPicker } from "./ExpeditionShiftPicker";
import { Sun, Sunset, CalendarDays } from "lucide-react";

const money = (value: number) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function collectionLabel(order: Delivery): string {
  if (order.status === "finalizada") return "COLETADO";
  if (order.status === "nao_iniciada") return "AGUARDANDO COLETA";
  if (order.status === "no_destino") return "NO DESTINO";
  return "COLETANDO";
}

export function ExpeditionCollections({ records, canManage, readOnly, onCreated, onSetShift, scheduleBusy }: {
  records: Delivery[];
  canManage: boolean;
  readOnly: boolean;
  onCreated: () => Promise<void>;
  onSetShift: (ids: string[], shift: ExpeditionShift | null) => Promise<void>;
  scheduleBusy: boolean;
}) {
  const client = useQueryClient();
  const list = useServerFn(listCollectionCompanies);
  const addCompany = useServerFn(addCollectionCompany);
  const addOrder = useServerFn(addCollection);
  const readLocations = useServerFn(readCollectionLocations);
  const locations = useQuery({ queryKey: ["collection-locations"], queryFn: () => readLocations(), staleTime: 30000 });
  const companies = useQuery({
    queryKey: ["collection-companies"], queryFn: () => list(), staleTime: 30000,
  });
  const [companyDialog, setCompanyDialog] = useState(false);
  const [collectionDialog, setCollectionDialog] = useState(false);
  const [editing, setEditing] = useState<Delivery | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [address, setAddress] = useState("");
  const [value, setValue] = useState("");
  const [vehicle, setVehicle] = useState<"moto" | "carro" | null>(null);
  const [contact, setContact] = useState("");
  const [payment, setPayment] = useState<"dinheiro" | "faturado">("dinheiro");
  const [scheduledDate, setScheduledDate] = useState("");
  const [shift, setShift] = useState<ExpeditionShift | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestId = useRef<string | null>(null);
  const collections = records.filter(order => order.source === "coleta").slice()
    .sort((a, b) => a.status === "finalizada" && b.status !== "finalizada" ? 1
      : b.status === "finalizada" && a.status !== "finalizada" ? -1
        : b.createdAt.localeCompare(a.createdAt));
  const moneyNumber = value.trim() ? parseMoneyInput(value) : undefined;
  const validValue = moneyNumber === undefined || (Number.isFinite(moneyNumber) && moneyNumber >= 0 && moneyNumber <= 100000000);
  const canWrite = canManage && !readOnly;

  async function saveCompany() {
    if (!canWrite || !companyName.trim() || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await addCompany({ data: { id: crypto.randomUUID(), name: companyName.trim() } });
      await client.invalidateQueries({ queryKey: ["collection-companies"] });
      setCompanyName(""); setCompanyDialog(false);
      setNotice("Empresa cadastrada com sucesso.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar a empresa.");
    } finally { setBusy(false); }
  }

  async function saveCollection() {
    if (!canWrite || !companyId || !vehicle || !validValue || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (!requestId.current) requestId.current = crypto.randomUUID();
      await addOrder({ data: {
        requestId: requestId.current, companyId, address: address.trim(),
        value: moneyNumber, vehicle, contact: contact.trim(),
        payment, scheduledDate, shift,
      } });
      requestId.current = null;
      await onCreated();
      setCollectionDialog(false);
      setAddress(""); setValue(""); setVehicle(null); setContact(""); setCompanyId("");
      setPayment("dinheiro"); setScheduledDate(""); setShift(null);
      setNotice("Coleta adicionada à Expedição e à fila do entregador.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível adicionar a coleta.");
    } finally { setBusy(false); }
  }

  return <section aria-label="Coletas da Expedição" className="min-w-0 rounded-xl border border-orange-400/35 bg-card shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-400/30 px-3 py-3">
      <div className="flex items-center gap-2">
        <PackageCheck className="h-5 w-5 shrink-0 text-orange-500" />
        <h2 className="text-lg font-extrabold sm:text-xl">COLETAS</h2>
        <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-bold text-orange-700 dark:text-orange-300">{collections.length}</span>
      </div>
      {!readOnly && <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" className="gap-1.5 bg-orange-600 text-white hover:bg-orange-700"
          disabled={!canWrite} onClick={() => { setError(""); setCollectionDialog(true); }}>
          <ClipboardPlus className="h-4 w-4" /> Adicionar coleta
        </Button>
        <Button type="button" size="sm" variant="outline" className="gap-1.5 border-orange-400/45"
          disabled={!canWrite} onClick={() => { setError(""); setCompanyDialog(true); }}>
          <Plus className="h-4 w-4" /> Adicionar empresa de coleta
        </Button>
      </div>}
    </header>
    <div className="space-y-2 p-3">
      {notice && <p role="status" className="text-xs font-medium text-emerald-600">{notice}</p>}
      {error && !companyDialog && !collectionDialog && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {collections.map(order => <article key={order.id} className="rounded-lg border border-orange-400/40 bg-orange-500/[0.10] p-3">
        <ExpeditionShiftPicker placement="top" ids={[order.id]} shift={shiftOf(order)}
          readOnly={readOnly} disabled={!canWrite || busy || scheduleBusy || order.status !== "nao_iniciada"}
          onSetShift={onSetShift} />
        {order.scheduledDate && <div className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-orange-800 dark:text-orange-200">
          <CalendarDays className="h-4 w-4" /> {scheduledDateLabel(order.scheduledDate)}
        </div>}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 break-words text-sm font-extrabold">{order.company}</h3>
          <span className="rounded-full border border-orange-500/40 bg-orange-500/15 px-2 py-1 text-[11px] font-extrabold text-orange-700 dark:text-orange-300">{collectionLabel(order)}</span>
        </div>
        <div className="mt-3 space-y-1.5 border-t border-orange-400/20 pt-3 text-xs sm:text-sm">
          <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" /><span className="break-words">{order.collectionAddress || "Endereço não informado"}</span></p>
          {!!order.collectionLocationConfirmedAt && <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-300">✓ Local confirmado no Google Maps {Number.isFinite(order.collectionLatitude) && Number.isFinite(order.collectionLongitude) && <a className="ml-1 underline" target="_blank" rel="noopener noreferrer" href={googleMapsPointUrl({ latitude: order.collectionLatitude!, longitude: order.collectionLongitude! })}>Ver local</a>}</p>}
          <p><strong>Valor:</strong> {order.collectionValueProvided === false ? "Não informado" : money(order.value)}</p>
          <p className="flex items-center gap-2"><span aria-hidden="true" className="text-lg">{order.collectionTransport === "moto" ? "🏍️" : order.collectionTransport === "carro" ? "🚗" : "🚚"}</span>
            <span><strong>Transporte:</strong> {order.collectionTransport === "moto" ? "MOTO" : order.collectionTransport === "carro" ? "CARRO" : "Não informado"}</span></p>
          <p><strong>Pagamento:</strong> {order.collectionPayment === "faturado" ? "Faturado" : order.collectionPayment === "dinheiro" ? "Dinheiro" : "Não informado"}</p>
          <p className="flex gap-2"><UserRound className="h-4 w-4 shrink-0 text-orange-500" /><span><strong>Falar com:</strong> {order.collectionContact || "Não informado"}</span></p>
          <p><strong>Entregador:</strong> {order.driver || "Não atribuído"}</p>
          <p className="text-muted-foreground"><strong>Início:</strong> {fmtBrasilia(order.startedAt)} · <strong>Chegada:</strong> {fmtBrasilia(order.arrivedAt)}</p>
          {order.finishedAt && <p className="text-xs font-bold text-orange-700 dark:text-orange-300">Coletado em: {fmtBrasilia(order.finishedAt)}</p>}
        </div>
        {!readOnly && <div className="mt-3 flex justify-end border-t border-orange-400/20 pt-3">
          <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5 border-orange-400/40"
            disabled={!canWrite || order.status !== "nao_iniciada"}
            title={order.status !== "nao_iniciada" ? "Coleta iniciada ou finalizada não pode ser editada" : undefined}
            onClick={() => { setError(""); setEditing(order); }}>
            <Pencil className="h-4 w-4" /> Editar
          </Button>
        </div>}
      </article>)}
      {!collections.length && <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma coleta cadastrada.</p>}
    </div>
    {!readOnly && <>
      {editing && <ExpeditionCollectionEditor key={editing.id} record={editing}
        companies={companies.data ?? []} onClose={() => setEditing(null)}
        onSaved={onCreated} />}
      <Dialog open={companyDialog} onOpenChange={open => { if (!busy) { setCompanyDialog(open); setError(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar empresa de coleta</DialogTitle></DialogHeader>
          <label className="space-y-1.5 text-sm font-semibold">Nome da empresa
            <Input autoFocus maxLength={180} value={companyName} onChange={event => setCompanyName(event.target.value)}
              placeholder="Empresa de coleta" />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="button" disabled={busy || !canWrite || companyName.trim().length < 2} onClick={() => { void saveCompany(); }}>
            {busy ? "Salvando..." : "Salvar empresa"}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={collectionDialog} onOpenChange={open => { if (!busy) { setCollectionDialog(open); setError(""); if (!open) requestId.current = null; } }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Adicionar coleta</DialogTitle></DialogHeader>
          <label className="space-y-1.5 text-sm font-semibold">Empresa de coleta
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              value={companyId} onChange={event => { const id = event.target.value; setCompanyId(id); setAddress(locations.data?.defaults[id]?.address ?? ""); }}>
              <option value="">Selecione uma empresa</option>
              {(companies.data ?? []).map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          {companies.isError && <p role="alert" className="text-xs text-destructive">Não foi possível consultar as empresas cadastradas.</p>}
          {!companies.isError && !(companies.data ?? []).length && <p className="text-xs text-muted-foreground">Cadastre primeiro uma empresa usando “Adicionar empresa de coleta”.</p>}
          <label className="space-y-1.5 text-sm font-semibold">Endereço da coleta (opcional)
            <Input value={address} maxLength={400} onChange={event => setAddress(event.target.value)}
              placeholder="Rua, número, bairro, cidade e UF (se souber)" />
          </label>
          {!!companyId && !!locations.data?.defaults[companyId] && <p role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-600 dark:text-emerald-300">✓ Endereço confirmado pelo gestor e reutilizado para esta empresa. Caso o local seja outro, informe um endereço diferente.</p>}
          <label className="space-y-1.5 text-sm font-semibold">Valor da coleta (R$) — opcional
            <Input inputMode="decimal" value={value} onChange={event => setValue(event.target.value)}
              placeholder="Deixe em branco se não informado" />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Meio de transporte</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["moto", "carro"] as const).map(option => <Button key={option} type="button"
                variant={vehicle === option ? "default" : "outline"} aria-pressed={vehicle === option}
                className="h-12 gap-2 text-sm font-extrabold" onClick={() => setVehicle(option)}>
                <span aria-hidden="true" className="text-xl">{option === "moto" ? "🏍️" : "🚗"}</span>
                {option === "moto" ? "MOTO" : "CARRO"}
              </Button>)}
            </div>
            {!vehicle && <p className="text-xs text-muted-foreground">Selecione MOTO ou CARRO para continuar.</p>}
          </fieldset>
          <label className="space-y-1.5 text-sm font-semibold">Forma de pagamento
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              value={payment} onChange={event => setPayment(event.target.value as "dinheiro" | "faturado")}>
              <option value="dinheiro">Dinheiro</option><option value="faturado">Faturado</option>
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-semibold">Data específica (opcional)
            <Input type="date" value={scheduledDate} onChange={event => setScheduledDate(event.target.value)} />
          </label>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Turno da coleta</p>
            <div className="grid grid-cols-2 gap-2">
              {(["manha", "tarde"] as const).map(value => <Button key={value} type="button"
                variant={shift === value ? "default" : "outline"}
                aria-pressed={shift === value} className="h-10 gap-2"
                onClick={() => setShift(current => current === value ? null : value)}>
                {value === "manha" ? <Sun className="h-4 w-4" /> : <Sunset className="h-4 w-4" />}
                {shiftLabel(value)}
              </Button>)}
            </div>
            <p className="text-xs text-muted-foreground">{shift ? "Turno: " + shiftLabel(shift) : "Turno indefinido até selecionar manhã ou tarde."}</p>
          </div>
          <label className="space-y-1.5 text-sm font-semibold">Falar com (opcional)
            <Input value={contact} maxLength={150} onChange={event => setContact(event.target.value)}
              placeholder="Nome ou referência" />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="button" disabled={busy || !canWrite || !companyId || !vehicle || !validValue}
            onClick={() => { void saveCollection(); }}>
            {busy ? "Salvando..." : "Adicionar coleta à fila"}
          </Button>
        </DialogContent>
      </Dialog>
    </>}
  </section>;
}

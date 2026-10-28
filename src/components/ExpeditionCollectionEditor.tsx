import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Sun, Sunset } from "lucide-react";
import type { Delivery } from "@/lib/deliveries";
import type { CollectionCompany } from "@/lib/collections";
import { editCollection } from "@/lib/collections.functions";
import { scheduledDateLabel, shiftLabel, type ExpeditionShift } from "@/lib/expedition-schedule";
import { parseMoneyInput } from "@/lib/sales-verification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const displayValue = (record: Delivery) => record.collectionValueProvided === false
  ? "" : Number.isFinite(record.value) ? String(record.value).replace(".", ",") : "";

/** Os cartões da Expedição são somente leitura. Esta é a única área de edição
 * das informações de uma coleta; o servidor confirma a permissão e a situação. */
export function ExpeditionCollectionEditor({ record, companies, onClose, onSaved }: {
  record: Delivery;
  companies: CollectionCompany[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const edit = useServerFn(editCollection);
  const [companyId, setCompanyId] = useState(() =>
    record.collectionCompanyId && companies.some(company => company.id === record.collectionCompanyId)
      ? record.collectionCompanyId
      : companies.find(company => company.name.trim().toLowerCase() === record.company.trim().toLowerCase())?.id ?? "");
  const [address, setAddress] = useState(record.collectionAddress ?? "");
  const [value, setValue] = useState(displayValue(record));
  const [contact, setContact] = useState(record.collectionContact ?? "");
  const [payment, setPayment] = useState<"dinheiro" | "faturado">(record.collectionPayment === "faturado" ? "faturado" : "dinheiro");
  const [vehicle, setVehicle] = useState<"moto" | "carro" | null>(record.collectionTransport ?? null);
  const [scheduledDate, setScheduledDate] = useState(record.scheduledDate ?? "");
  const [shift, setShift] = useState<ExpeditionShift | null>(record.expeditionShift ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const amount = value.trim() ? parseMoneyInput(value) : undefined;
  const validAmount = amount === undefined || (Number.isFinite(amount) && amount >= 0 && amount <= 100000000);
  const valid = !!companyId && !!vehicle && validAmount && address.trim().length <= 400 && contact.trim().length <= 150;
  async function save() {
    if (!valid || saving) return;
    setSaving(true); setError("");
    try {
      await edit({ data: {
        id: record.id, companyId, address: address.trim(), value: amount,
        contact: contact.trim(), payment, vehicle: vehicle!, scheduledDate, shift,
      } });
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a coleta.");
    } finally { setSaving(false); }
  }

  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Editar coleta — {record.company}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <label className="block space-y-1.5 text-sm font-semibold">Empresa de coleta
          <select value={companyId} onChange={event => setCompanyId(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" disabled={saving}>
            <option value="">Selecione a empresa</option>
            {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </label>
        {!companyId && <p className="text-xs text-muted-foreground">Se a empresa anterior não estiver no catálogo, selecione uma cadastrada antes de salvar.</p>}
        <label className="block space-y-1.5 text-sm font-semibold">Endereço (opcional)
          <Input value={address} maxLength={400} onChange={event => setAddress(event.target.value)} disabled={saving} placeholder="Rua, número, cidade" />
        </label>
        <label className="block space-y-1.5 text-sm font-semibold">Valor (opcional)
          <Input value={value} inputMode="decimal" onChange={event => setValue(event.target.value)} disabled={saving} placeholder="Deixe em branco se não informado" />
        </label>
        <label className="block space-y-1.5 text-sm font-semibold">Pagamento
          <select value={payment} onChange={event => setPayment(event.target.value as "dinheiro" | "faturado")}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" disabled={saving}>
            <option value="dinheiro">Dinheiro</option><option value="faturado">Faturado</option>
          </select>
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Meio de transporte</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["moto", "carro"] as const).map(option => <Button key={option} type="button"
              variant={vehicle === option ? "default" : "outline"} className="h-10 gap-2"
              disabled={saving} aria-pressed={vehicle === option} onClick={() => setVehicle(option)}>
              <span aria-hidden="true" className="text-lg">{option === "moto" ? "🏍️" : "🚗"}</span>
              {option === "moto" ? "MOTO" : "CARRO"}
            </Button>)}
          </div>
        </fieldset>
        <label className="block space-y-1.5 text-sm font-semibold">Falar com (opcional)
          <Input value={contact} maxLength={150} onChange={event => setContact(event.target.value)} disabled={saving} />
        </label>
        <label className="block space-y-1.5 text-sm font-semibold">Data específica (opcional)
          <Input type="date" value={scheduledDate} onChange={event => setScheduledDate(event.target.value)} disabled={saving} />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Turno</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["manha", "tarde"] as const).map(option => <Button key={option} type="button"
              variant={shift === option ? "default" : "outline"} className="h-10 gap-2"
              disabled={saving} aria-pressed={shift === option}
              onClick={() => setShift(previous => previous === option ? null : option)}>
              {option === "manha" ? <Sun className="h-4 w-4" /> : <Sunset className="h-4 w-4" />}
              {shiftLabel(option)}
            </Button>)}
          </div>
          <p className="text-xs text-muted-foreground">
            <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
            {scheduledDate ? scheduledDateLabel(scheduledDate) + " • " : ""}{shift ? shiftLabel(shift) : "TURNO INDEFINIDO"}
          </p>
        </fieldset>
        {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={saving || !valid} onClick={() => { void save(); }}>{saving ? "Salvando..." : "Salvar alterações"}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

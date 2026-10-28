import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardPlus, MapPin, PackageCheck, Plus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addCollection, addCollectionCompany, listCollectionCompanies } from "@/lib/collections.functions";
import type { Delivery } from "@/lib/deliveries";
import { fmtBrasilia } from "@/lib/deliveries";

const money = (value: number) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function collectionLabel(order: Delivery): string {
  if (order.status === "finalizada") return "COLETADO";
  if (order.status === "nao_iniciada") return "AGUARDANDO COLETA";
  if (order.status === "no_destino") return "NO DESTINO";
  return "COLETANDO";
}

export function ExpeditionCollections({ records, canManage, readOnly, onCreated }: {
  records: Delivery[]; canManage: boolean; readOnly: boolean; onCreated: () => Promise<void>;
}) {
  const client = useQueryClient();
  const list = useServerFn(listCollectionCompanies);
  const addCompany = useServerFn(addCollectionCompany);
  const addOrder = useServerFn(addCollection);
  const companies = useQuery({
    queryKey: ["collection-companies"], queryFn: () => list(), staleTime: 30000,
  });
  const [companyDialog, setCompanyDialog] = useState(false);
  const [collectionDialog, setCollectionDialog] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [address, setAddress] = useState("");
  const [value, setValue] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestId = useRef<string | null>(null);
  const collections = records.filter(order => order.source === "coleta").slice()
    .sort((a, b) => a.status === "finalizada" && b.status !== "finalizada" ? 1
      : b.status === "finalizada" && a.status !== "finalizada" ? -1
        : b.createdAt.localeCompare(a.createdAt));
  const moneyNumber = Number(value.replace(/\s/g, "").replace(",", "."));
  const validValue = value.trim() !== "" && Number.isFinite(moneyNumber) && moneyNumber >= 0 && moneyNumber <= 100000000;
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
    if (!canWrite || !companyId || address.trim().length < 8 || !validValue || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (!requestId.current) requestId.current = crypto.randomUUID();
      await addOrder({ data: {
        requestId: requestId.current, companyId, address: address.trim(),
        value: moneyNumber, contact: contact.trim(),
      } });
      requestId.current = null;
      await onCreated();
      setCollectionDialog(false);
      setAddress(""); setValue(""); setContact(""); setCompanyId("");
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
    </header>
    <div className="space-y-2 p-3">
      {!readOnly && <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="gap-1.5 bg-orange-600 text-white hover:bg-orange-700"
          disabled={!canWrite} onClick={() => { setError(""); setCollectionDialog(true); }}>
          <ClipboardPlus className="h-4 w-4" /> Adicionar coleta
        </Button>
        <Button type="button" size="sm" variant="outline" className="gap-1.5 border-orange-400/45"
          disabled={!canWrite} onClick={() => { setError(""); setCompanyDialog(true); }}>
          <Plus className="h-4 w-4" /> Adicionar empresa de coleta
        </Button>
      </div>}
      {notice && <p role="status" className="text-xs font-medium text-emerald-600">{notice}</p>}
      {error && !companyDialog && !collectionDialog && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {collections.map(order => <article key={order.id} className="rounded-lg border border-orange-400/40 bg-orange-500/[0.10] p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 break-words text-sm font-extrabold">{order.company}</h3>
          <span className="rounded-full border border-orange-500/40 bg-orange-500/15 px-2 py-1 text-[11px] font-extrabold text-orange-700 dark:text-orange-300">{collectionLabel(order)}</span>
        </div>
        <div className="mt-3 space-y-1.5 border-t border-orange-400/20 pt-3 text-xs sm:text-sm">
          <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" /><span className="break-words">{order.collectionAddress || "Endereço não informado"}</span></p>
          <p><strong>Valor:</strong> {money(order.value)}</p>
          <p className="flex gap-2"><UserRound className="h-4 w-4 shrink-0 text-orange-500" /><span><strong>Falar com:</strong> {order.collectionContact || "Não informado"}</span></p>
          <p><strong>Entregador:</strong> {order.driver || "Não atribuído"}</p>
          <p className="text-muted-foreground"><strong>Início:</strong> {fmtBrasilia(order.startedAt)} · <strong>Chegada:</strong> {fmtBrasilia(order.arrivedAt)}</p>
          {order.finishedAt && <p className="text-xs font-bold text-orange-700 dark:text-orange-300">Coletado em: {fmtBrasilia(order.finishedAt)}</p>}
        </div>
      </article>)}
      {!collections.length && <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma coleta cadastrada.</p>}
    </div>
    {!readOnly && <>
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
              value={companyId} onChange={event => setCompanyId(event.target.value)}>
              <option value="">Selecione uma empresa</option>
              {(companies.data ?? []).map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          {companies.isError && <p role="alert" className="text-xs text-destructive">Não foi possível consultar as empresas cadastradas.</p>}
          {!companies.isError && !(companies.data ?? []).length && <p className="text-xs text-muted-foreground">Cadastre primeiro uma empresa usando “Adicionar empresa de coleta”.</p>}
          <label className="space-y-1.5 text-sm font-semibold">Endereço completo da coleta
            <Input value={address} maxLength={400} onChange={event => setAddress(event.target.value)}
              placeholder="Rua, número, bairro, cidade e UF" />
          </label>
          <label className="space-y-1.5 text-sm font-semibold">Valor da coleta (R$)
            <Input inputMode="decimal" value={value} onChange={event => setValue(event.target.value)}
              placeholder="0,00" />
          </label>
          <label className="space-y-1.5 text-sm font-semibold">Falar com (opcional)
            <Input value={contact} maxLength={150} onChange={event => setContact(event.target.value)}
              placeholder="Nome ou referência" />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="button" disabled={busy || !canWrite || !companyId || address.trim().length < 8 || !validValue}
            onClick={() => { void saveCollection(); }}>
            {busy ? "Salvando..." : "Adicionar coleta à fila"}
          </Button>
        </DialogContent>
      </Dialog>
    </>}
  </section>;
}

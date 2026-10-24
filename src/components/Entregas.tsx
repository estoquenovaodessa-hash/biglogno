import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Package, Plus, Truck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { AccessRole } from '@/lib/access-policy';
import { activeDeliveryCount, deliveryGroups, fmtBrasilia, fmtDuration, travelMs, waitMs, type Delivery, type DeliveryAction } from '@/lib/deliveries';
import { addManualDelivery, listDeliveries, reorderDeliveries, updateDelivery } from '@/lib/deliveries.functions';
import { readSalesVerification } from '@/lib/sales-verification.functions';
import { canonicalCode, parseMoneyInput } from '@/lib/sales-verification';
import { LogisticsOrderFields } from './LogisticsOrderFields';
import { Retira } from './Retira';
import { ManagerDeliveries } from './ManagerDeliveries';
import { OperatorDeliveryCard } from './OperatorDeliveryCard';
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const DRIVER_KEY = 'bignotto-delivery-driver';

export function Entregas({ role }: { role: AccessRole }) {
  const list = useServerFn(listDeliveries), act = useServerFn(updateDelivery), reorder = useServerFn(reorderDeliveries), add = useServerFn(addManualDelivery), readSales = useServerFn(readSalesVerification);
  const q = useQuery({ queryKey: ['deliveries'], queryFn: () => list(), refetchInterval: 10000 });
  const sales = useQuery({ queryKey: ['logistics-companies', role], queryFn: () => readSales(), enabled: role === 'operador' });
  const [driver, setDriver] = useState(''), [draftDriver, setDraftDriver] = useState(''), [identified, setIdentified] = useState(false), [identityOpen, setIdentityOpen] = useState(false);
  const [section, setSection] = useState('Entregas');
  const [arrived, setArrived] = useState<Delivery[] | null>(null), [receiver, setReceiver] = useState('');
  const [adding, setAdding] = useState(false), [document, setDocument] = useState(''), [code, setCode] = useState(''), [value, setValue] = useState(''), [onlyDelivery, setOnlyDelivery] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { if (role !== 'operador') return; const name = localStorage.getItem(DRIVER_KEY) ?? ''; setDriver(name); setDraftDriver(name); setIdentified(true); setIdentityOpen(!name); }, [role]);
  async function run(fn: () => Promise<unknown>) { setBusy(true); setError(''); try { await fn(); await q.refetch(); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir.'); return false; } finally { setBusy(false); } }
  const action = (a: DeliveryAction) => run(() => act({ data: a }));
  const all = q.data ?? [], open = all.filter(d => d.status !== 'finalizada'), groups = deliveryGroups(open);
  const done = all.filter(d => d.status === 'finalizada').sort((a,b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
  const clients = sales.data?.clients ?? [];
  function move(i: number, direction: -1 | 1) { const next = [...groups]; const j = i + direction; if (j < 0 || j >= next.length) return; [next[i], next[j]] = [next[j], next[i]]; void run(() => reorder({ data: { ids: next.flatMap(g => g.map(d => d.id)) } })); }
  const controlsDisabled = busy || !driver || q.isError;
  const queue = <div className="grid grid-cols-1 gap-4">
    {groups.map((group, index) => {
      const order = group[0];
      if (!order) return null;
      return <OperatorDeliveryCard key={order.id}
        orders={group}
        all={all}
        index={index}
        totalGroups={groups.length}
        controlsDisabled={controlsDisabled}
        driver={driver}
        onMove={direction => move(index, direction)}
        onAction={action}
        onArrive={async () => {
          if (await action({ action: 'arrive', id: order.id })) {
            setReceiver('');
            setArrived(group);
          }
        }}
        onSign={() => { setReceiver(''); setArrived(group); }}
      />;
    })}
    {!groups.length && <div className="rounded-xl border border-dashed border-[#315887] bg-[#102039] px-5 py-10 text-center">
      <Truck className="mx-auto h-10 w-10 text-[#6daaff]" />
      <p className="mt-3 text-sm font-semibold text-[#c4d8f4]">Nenhuma entrega pendente.</p>
    </div>}
  </div>;
  return <section className={`mx-auto min-w-0 space-y-5 ${role === 'operador' ? 'w-full max-w-[560px]' : ''}`}>
    {role === 'gestor' && <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <div className="flex items-center gap-3">
        <span className="text-primary"><Truck className="h-6 w-6" /></span>
        <h1 className="text-2xl font-extrabold">Entregas</h1>
      </div>
      <div className="flex gap-2">{['Entregas', 'Retira'].map(s =>
        <Button key={s} variant={section === s ? 'default' : 'outline'} onClick={() => setSection(s)}>{s}</Button>
      )}</div>
    </header>}
    {role === 'gestor' && section === 'Retira' ? <Retira role={role} /> : <>
    {role === 'operador' && <>
      <div className="flex items-center gap-3 rounded-xl border border-[#315886] bg-gradient-to-r from-[#1a395e] to-[#152945] p-4 shadow-[0_5px_18px_rgba(8,40,96,0.18)]">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#2a5689] text-[#afd1ff]">
          <UserRound className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-[#b3c9e5]">Entregador</p>
          <p className="break-words text-lg font-extrabold text-[#f1f7ff]">{driver || '—'}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-lg text-[#a6ccff] hover:bg-[#2b4a70] hover:text-white"
          aria-label="Alterar entregador" title="Alterar entregador" onClick={() => { setDraftDriver(driver); setIdentityOpen(true); }}>
          <UserRound className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Package className="h-5 w-5 text-[#ffb300]" /> Em andamento:
          <span className="text-lg font-extrabold tabular-nums text-[#ffc135]">{activeDeliveryCount(all)}/2</span>
        </p>
        <Button className="h-11 gap-2 rounded-lg border border-[#aacfff]/50 bg-[#75aaff] px-4 font-extrabold text-[#07182b] shadow-[0_3px_12px_rgba(50,119,231,0.15)] hover:bg-[#93bfff]"
          disabled={!driver || !sales.data || sales.isError}
          onClick={() => { setDocument(''); setCode(''); setValue(''); setOnlyDelivery(false); setError(''); setAdding(true); }}>
          <Plus className="h-5 w-5" /> Adicionar entrega
        </Button>
      </div>
      {sales.isError && <p role="alert" className="text-destructive">Não foi possível consultar as empresas.</p>}
    </>}
    {error && !arrived && !adding && <p role="alert" className="text-destructive">{error}</p>}
    {role === 'gestor' ? <ManagerDeliveries deliveries={all} isLoading={!q.data && !q.isError} isError={q.isError} isFetching={q.isFetching} onRefresh={() => { void q.refetch(); }} /> : !q.data ? <p role={q.isError ? 'alert' : 'status'}>{q.isError ? 'Não foi possível carregar as entregas.' : 'Carregando entregas…'}</p> : role === 'operador' ? queue : <div className="grid gap-6 xl:grid-cols-2"><div><h2 className="mb-4 text-xl font-bold">Pendentes ({open.length})</h2>{queue}</div><div><h2 className="mb-4 text-xl font-bold text-success">Finalizadas ({done.length})</h2><div className="space-y-3">{done.map(d => <Card key={d.id} className="gap-2 p-4"><h3 className="break-words text-2xl font-bold">{d.company}</h3><p className="text-2xl font-bold">{d.onlyDelivery ? 'SOMENTE ENTREGA' : money(d.value)}</p>{d.document && <p className="text-lg">Nº documento: {d.document}</p>}<p className="text-lg">Entregador: <strong>{d.driver}</strong></p><div className="grid grid-cols-2 gap-3 bg-muted p-3"><p>Trajeto<strong className="block text-xl">{fmtDuration(travelMs(d))}</strong></p><p>Espera<strong className="block text-xl">{fmtDuration(waitMs(d))}</strong></p></div><p className="text-base text-muted-foreground">Recebedor: {d.receiver}<br />{fmtBrasilia(d.finishedAt)}</p></Card>)}{!done.length && <p className="py-6 text-muted-foreground">Nenhuma entrega finalizada.</p>}</div></div></div>}
    </>}
    {role === 'operador' && <>
      <Dialog open={identified && identityOpen} onOpenChange={o => { if (driver) setIdentityOpen(o); }}><DialogContent onEscapeKeyDown={e => { if (!driver) e.preventDefault(); }} onInteractOutside={e => { if (!driver) e.preventDefault(); }}><DialogHeader><DialogTitle>Identificar entregador</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={e => { e.preventDefault(); const name = draftDriver.trim(); if (!name) return; localStorage.setItem(DRIVER_KEY,name); setDriver(name); setIdentityOpen(false); }}><label className="block space-y-2 font-semibold">Nome do entregador<Input aria-label="Nome do entregador" autoFocus required maxLength={100} value={draftDriver} onChange={e => setDraftDriver(e.target.value)} className="h-12 text-xl font-bold md:text-xl" /></label><Button type="submit" className="h-12 w-full text-lg" disabled={!draftDriver.trim()}>Entrar em Entregas</Button></form></DialogContent></Dialog>
      <Dialog open={!!arrived} onOpenChange={o => { if (!busy && !o) setArrived(null); }}><DialogContent><DialogHeader><DialogTitle>Assinar notinhas</DialogTitle></DialogHeader><h2 className="break-words text-2xl font-bold">{arrived?.[0]?.company}</h2><p className="text-xl font-bold">{arrived && money(arrived.reduce((s,d) => s+d.value,0))}</p><p className="break-words text-lg">{arrived?.map(d => d.onlyDelivery ? 'SOMENTE ENTREGA' : `Doc. ${d.document}`).join(' · ')}</p><label className="block space-y-2 font-semibold">Nome do recebedor<Input aria-label="Nome do recebedor" autoFocus maxLength={150} value={receiver} onChange={e => setReceiver(e.target.value)} className="h-12 text-xl font-bold md:text-xl" /></label>{error && <p role="alert" className="text-destructive">{error}</p>}<Button className="h-12 text-lg font-bold" disabled={busy || !receiver.trim()} onClick={async () => { const d = arrived?.[0]; if (d && await action({ action:'finish', id:d.id, receiver:receiver.trim() })) setArrived(null); }}>Finalizar entrega{arrived && arrived.length > 1 ? ` (${arrived.length} pedidos)` : ''}</Button></DialogContent></Dialog>
      <Dialog open={adding} onOpenChange={o => { if (!busy) setAdding(o); }}><DialogContent><DialogHeader><DialogTitle>Adicionar entrega</DialogTitle></DialogHeader><label className="flex items-center gap-3 text-lg font-bold"><input type="checkbox" checked={onlyDelivery} onChange={e => setOnlyDelivery(e.target.checked)} className="h-5 w-5 accent-primary" />Somente entrega</label><LogisticsOrderFields clients={clients} code={code} setCode={setCode} document={document} setDocument={setDocument} value={value} setValue={setValue} onlyCompany={onlyDelivery} />{error && <p role="alert" className="text-destructive">{error}</p>}<Button className="h-12 text-lg" disabled={busy || !clients.some(c => canonicalCode(c.code) === canonicalCode(code)) || (!onlyDelivery && (!document || !Number.isFinite(parseMoneyInput(value))))} onClick={async () => { if (await run(() => add({ data: { requestId:crypto.randomUUID(), companyCode:code, onlyDelivery, ...(onlyDelivery ? {} : { document, value:parseMoneyInput(value) }) } }))) setAdding(false); }}>Adicionar</Button></DialogContent></Dialog>
    </>}
  </section>;
}

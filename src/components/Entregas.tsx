import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { CalendarDays, Clock3, Package, Plus, Sun, Sunset, Truck } from 'lucide-react';
import { useActiveEmployee } from './EmployeeGate';
import { useOperatorRights } from './useOperatorRights';
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
import { DeliveryGpsRecorder } from './DeliveryGpsRecorder';
import { operatorShiftSections, shiftLabel, type ShiftSection } from '@/lib/expedition-schedule';
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function Entregas({ role }: { role: AccessRole }) {
  const list = useServerFn(listDeliveries), act = useServerFn(updateDelivery), reorder = useServerFn(reorderDeliveries), add = useServerFn(addManualDelivery), readSales = useServerFn(readSalesVerification);
  const q = useQuery({ queryKey: ['deliveries'], queryFn: () => list(), refetchInterval: 10000 });
  const sales = useQuery({ queryKey: ['logistics-companies', role], queryFn: () => readSales(), enabled: role === 'operador' });
  const { employee } = useActiveEmployee();
  const rights = useOperatorRights();
  const canOperate = role === 'gestor' || rights.entregas;
  const driver = employee?.name ?? '';
  const [section, setSection] = useState('Entregas');
  const [arrived, setArrived] = useState<Delivery[] | null>(null), [receiver, setReceiver] = useState('');
  const [adding, setAdding] = useState(false), [document, setDocument] = useState(''), [code, setCode] = useState(''), [value, setValue] = useState(''), [onlyDelivery, setOnlyDelivery] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>) { setBusy(true); setError(''); try { await fn(); await q.refetch(); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir.'); return false; } finally { setBusy(false); } }
  const action = (a: DeliveryAction) => run(() => act({ data: a }));
  const all = q.data ?? [], open = all.filter(d => d.status !== 'finalizada'), groups = deliveryGroups(open);
  // Evitar contar notas unificadas duas vezes. A gravação GPS associa os
  // segmentos apenas ao pedido ativo mais antigo deste entregador.
  const gpsActiveDelivery = employee?.id && employee.badge === "ENTREGADOR"
    ? open.filter(d => d.driverEmployeeId === employee.id && d.status === "em_rota")
      .sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? "") || a.id.localeCompare(b.id))[0]
    : undefined;
  const sections = operatorShiftSections(groups);
  const done = all.filter(d => d.status === 'finalizada').sort((a,b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
  const clients = sales.data?.clients ?? [];
  // Permite reorganizar somente dentro do mesmo turno; jamais transfere pedidos
  // entre MANHÃ/TARDE/INDEFINIDO ao usar as setas da fila.
  function move(shift: ShiftSection, index: number, direction: -1 | 1) {
    const section = sections.find(entry => entry.shift === shift);
    const other = index + direction;
    if (!section || other < 0 || other >= section.groups.length) return;
    const arranged = sections.map(entry => ({
      shift: entry.shift, groups: [...entry.groups],
    }));
    const target = arranged.find(entry => entry.shift === shift)!;
    [target.groups[index], target.groups[other]] = [target.groups[other], target.groups[index]];
    const ids = arranged.flatMap(entry => entry.groups.flatMap(group => group.map(item => item.id)));
    void run(() => reorder({ data: { ids } }));
  }
  const controlsDisabled = busy || !driver || q.isError || !canOperate;
  const queue = <div className="space-y-6">
    {sections.map(({ shift, groups: shiftGroups }) => <section key={shift} className="space-y-3" aria-label={shiftLabel(shift)}>
      <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${shift === "manha"
        ? "border-sky-400/40 bg-sky-600/15 text-sky-200"
        : shift === "tarde" ? "border-orange-400/40 bg-orange-500/15 text-orange-200"
        : "border-[#365a88] bg-[#18304d] text-[#c2d4ef]"}`}>
        {shift === "manha" ? <Sun className="h-5 w-5" /> : shift === "tarde" ? <Sunset className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
        <h2 className="text-base font-extrabold tracking-widest">{shiftLabel(shift)}</h2>
        <span className="ml-auto rounded-full border border-current/25 px-2.5 py-0.5 text-xs font-bold">{shiftGroups.length}</span>
      </div>
      {shiftGroups.map((group, index) => {
        const order = group[0];
        if (!order) return null;
        return <OperatorDeliveryCard key={order.id}
          orders={group}
          all={all}
          index={index}
          totalGroups={shiftGroups.length}
          controlsDisabled={controlsDisabled}
          driver={driver}
          onMove={direction => move(shift, index, direction)}
          onAction={action}
          onArrive={async () => {
            if (await action({ action: 'arrive', id: order.id }) && order.source !== 'coleta') {
              setReceiver('');
              setArrived(group);
            }
          }}
          onSign={() => { if (order.source !== 'coleta') { setReceiver(''); setArrived(group); } }}
        />;
      })}
      {!shiftGroups.length && <p className="rounded-lg border border-dashed border-[#365a88] bg-[#101c2e] px-3 py-4 text-center text-xs text-[#9db6d8]">Nenhuma operação neste turno.</p>}
    </section>)}
    {!groups.length && <div className="rounded-xl border border-dashed border-[#315887] bg-[#102039] px-5 py-6 text-center text-sm text-[#c4d8f4]">
      Nenhuma entrega ou coleta pendente.
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Package className="h-5 w-5 text-[#ffb300]" /> Em andamento:
          <span className="text-lg font-extrabold tabular-nums text-[#ffc135]">{activeDeliveryCount(all)}/2</span>
        </p>
        <Button className="h-11 gap-2 rounded-lg border border-[#aacfff]/50 bg-[#75aaff] px-4 font-extrabold text-[#07182b] shadow-[0_3px_12px_rgba(50,119,231,0.15)] hover:bg-[#93bfff]"
          disabled={!canOperate || !driver || !sales.data || sales.isError}
          onClick={() => { setDocument(''); setCode(''); setValue(''); setOnlyDelivery(false); setError(''); setAdding(true); }}>
          <Plus className="h-5 w-5" /> Adicionar entrega
        </Button>
      </div>
      <DeliveryGpsRecorder deliveryId={gpsActiveDelivery?.id ?? null}
        enabled={canOperate && !!employee && employee.badge === "ENTREGADOR"} />
      {sales.isError && <p role="alert" className="text-destructive">Não foi possível consultar as empresas.</p>}
      {!canOperate && <p role="status" className="text-sm text-muted-foreground">Somente consulta: seu perfil não possui o direito Entregas. Os botões operacionais estão bloqueados.</p>}
    </>}
    {error && !arrived && !adding && <p role="alert" className="text-destructive">{error}</p>}
    {role === 'gestor' ? <ManagerDeliveries deliveries={all} isLoading={!q.data && !q.isError} isError={q.isError} isFetching={q.isFetching} onRefresh={() => { void q.refetch(); }} /> : !q.data ? <p role={q.isError ? 'alert' : 'status'}>{q.isError ? 'Não foi possível carregar as entregas.' : 'Carregando entregas…'}</p> : role === 'operador' ? queue : <div className="grid gap-6 xl:grid-cols-2"><div><h2 className="mb-4 text-xl font-bold">Pendentes ({open.length})</h2>{queue}</div><div><h2 className="mb-4 text-xl font-bold text-success">Finalizadas ({done.length})</h2><div className="space-y-3">{done.map(d => <Card key={d.id} className="gap-2 p-4"><h3 className="break-words text-2xl font-bold">{d.company}</h3><p className="text-2xl font-bold">{d.onlyDelivery ? 'SOMENTE ENTREGA' : money(d.value)}</p>{d.document && <p className="text-lg">Nº documento: {d.document}</p>}<p className="text-lg">Entregador: <strong>{d.driver}</strong></p><div className="grid grid-cols-2 gap-3 bg-muted p-3"><p>Trajeto<strong className="block text-xl">{fmtDuration(travelMs(d))}</strong></p><p>Espera<strong className="block text-xl">{fmtDuration(waitMs(d))}</strong></p></div><p className="text-base text-muted-foreground">Recebedor: {d.receiver}<br />{fmtBrasilia(d.finishedAt)}</p></Card>)}{!done.length && <p className="py-6 text-muted-foreground">Nenhuma entrega finalizada.</p>}</div></div></div>}
    </>}
    {role === 'operador' && <>
      <Dialog open={!!arrived} onOpenChange={o => { if (!busy && !o) setArrived(null); }}><DialogContent><DialogHeader><DialogTitle>Assinar notinhas</DialogTitle></DialogHeader><h2 className="break-words text-2xl font-bold">{arrived?.[0]?.company}</h2><p className="text-xl font-bold">{arrived && money(arrived.reduce((s,d) => s+d.value,0))}</p><p className="break-words text-lg">{arrived?.map(d => d.onlyDelivery ? 'SOMENTE ENTREGA' : `Doc. ${d.document}`).join(' · ')}</p><label className="block space-y-2 font-semibold">Nome do recebedor<Input aria-label="Nome do recebedor" autoFocus maxLength={150} value={receiver} onChange={e => setReceiver(e.target.value)} className="h-12 text-xl font-bold md:text-xl" /></label>{error && <p role="alert" className="text-destructive">{error}</p>}<Button className="h-12 text-lg font-bold" disabled={busy || !canOperate || !receiver.trim()} onClick={async () => { const d = arrived?.[0]; if (d && await action({ action:'finish', id:d.id, receiver:receiver.trim() })) setArrived(null); }}>Finalizar entrega{arrived && arrived.length > 1 ? ` (${arrived.length} pedidos)` : ''}</Button></DialogContent></Dialog>
      <Dialog open={adding} onOpenChange={o => { if (!busy) setAdding(o); }}><DialogContent><DialogHeader><DialogTitle>Adicionar entrega</DialogTitle></DialogHeader><label className="flex items-center gap-3 text-lg font-bold"><input type="checkbox" checked={onlyDelivery} onChange={e => setOnlyDelivery(e.target.checked)} className="h-5 w-5 accent-primary" />Somente entrega</label><LogisticsOrderFields clients={clients} code={code} setCode={setCode} document={document} setDocument={setDocument} value={value} setValue={setValue} onlyCompany={onlyDelivery} />{error && <p role="alert" className="text-destructive">{error}</p>}<Button className="h-12 text-lg" disabled={busy || !canOperate || !clients.some(c => canonicalCode(c.code) === canonicalCode(code)) || (!onlyDelivery && (!document || !Number.isFinite(parseMoneyInput(value))))} onClick={async () => { if (await run(() => add({ data: { requestId:crypto.randomUUID(), companyCode:code, onlyDelivery, ...(onlyDelivery ? {} : { document, value:parseMoneyInput(value) }) } }))) setAdding(false); }}>Adicionar</Button></DialogContent></Dialog>
    </>}
  </section>;
}

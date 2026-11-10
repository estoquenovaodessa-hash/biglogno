import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Plus, Truck } from 'lucide-react';
import { useActiveEmployee } from './EmployeeGate';
import { useOperatorRights } from './useOperatorRights';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { AccessRole } from '@/lib/access-policy';
import { deliveryGroups, fmtBrasilia, fmtDuration, travelMs, type Delivery, type DeliveryAction } from '@/lib/deliveries';
import { addManualDelivery, listDeliveries, updateDelivery } from '@/lib/deliveries.functions';
import { readSalesVerification } from '@/lib/sales-verification.functions';
import { canonicalCode, parseMoneyInput } from '@/lib/sales-verification';
import { LogisticsOrderFields } from './LogisticsOrderFields';
import { Retira } from './Retira';
import { ManagerDeliveries } from './ManagerDeliveries';
import { OperatorDeliveryCard } from './OperatorDeliveryCard';
import { canSeeInMyDeliveries, clientAccent, deliveryCompanyIdentity } from '@/lib/delivery-dispatch';
import { isCaue } from '@/lib/delivery-accountability';
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function Entregas({ role }: { role: AccessRole }) {
  const list = useServerFn(listDeliveries), act = useServerFn(updateDelivery), add = useServerFn(addManualDelivery), readSales = useServerFn(readSalesVerification);
  const q = useQuery({ queryKey: ['deliveries'], queryFn: () => list(), refetchInterval: 10000 });
  const sales = useQuery({ queryKey: ['logistics-companies', role], queryFn: () => readSales(), enabled: role === 'operador' });
  const { employee } = useActiveEmployee();
  const rights = useOperatorRights();
  const canOperate = role === 'gestor' || rights.entregas;
  const driver = employee?.name ?? '';
  const [section, setSection] = useState('Entregas');
  const [queueTab,setQueueTab] = useState<'mine'|'all'>('mine');
  const [arrived, setArrived] = useState<Delivery[] | null>(null), [receiver, setReceiver] = useState('');
  const [adding, setAdding] = useState(false), [document, setDocument] = useState(''), [code, setCode] = useState(''), [value, setValue] = useState(''), [onlyDelivery, setOnlyDelivery] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>) { setBusy(true); setError(''); try { await fn(); await q.refetch(); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir.'); return false; } finally { setBusy(false); } }
  const action = (a: DeliveryAction) => run(() => act({ data: a }));
  const all = q.data ?? [];
  const open = all.filter(d=>d.status!=='finalizada');
  const groups = deliveryGroups(open);
  const firstIndex = new Map<string,number>();
  const companyCounts = new Map<string,number>();
  groups.forEach((g,index)=>{
    const k=deliveryCompanyIdentity(g[0]);
    if(!firstIndex.has(k))firstIndex.set(k,index);
    companyCounts.set(k,(companyCounts.get(k)||0)+1);
  });
  // Agrupa visualmente clientes repetidos sem alterar a posição persistida
  // nem a sequência do mapa do gestor.
  const orderedGroups = groups.slice().sort((a,b)=>
    (firstIndex.get(deliveryCompanyIdentity(a[0]))||0)
      -(firstIndex.get(deliveryCompanyIdentity(b[0]))||0)
    || a[0].position-b[0].position);
  const visibleGroups = orderedGroups.filter(g=>
    queueTab==='all'||canSeeInMyDeliveries(g[0],employee?.name));
  const done = all.filter(d=>d.status==='finalizada').sort((a,b)=>(b.finishedAt??'').localeCompare(a.finishedAt??''));
  const clients = sales.data?.clients??[];
  const controlsDisabled=busy||!driver||q.isError||!canOperate;
  const queue=<div className="space-y-2.5">
    {employee&&isCaue(employee.name)&&<div role="status" className="rounded-lg border border-sky-400/50 bg-[#123a64] px-4 py-3 text-sm font-semibold text-[#c7e8ff]">
      Cauê atua como apoio do Luciano. As operações CARRO são atribuídas a Luciano.
    </div>}
    {visibleGroups.map(group=>{
      const order=group[0];
      const identity=deliveryCompanyIdentity(order);
      const canComplete=canSeeInMyDeliveries(order,employee?.name);
      return <OperatorDeliveryCard key={order.id} orders={group}
        controlsDisabled={controlsDisabled||!canComplete}
        accentColor={(companyCounts.get(identity)||0)>1?clientAccent(identity):undefined}
        onDeliver={()=>{setError('');setReceiver('');setArrived(group);}}
        onCollect={()=>{void action({action:'collect',id:order.id});}}
      />;
    })}
    {!visibleGroups.length&&<div className="rounded-xl border border-dashed border-[#315887] bg-[#102039] px-5 py-6 text-center text-sm text-[#c4d8f4]">
      {queueTab==='mine'?'Nenhuma entrega atribuída ao seu veículo. Consulte Todas entregas para ver a fila.':'Nenhuma entrega ou coleta pendente.'}
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex gap-2" role="group" aria-label="Visualização de entregas">
          <Button type="button" size="sm" variant={queueTab==='mine'?'default':'outline'}
            className="h-10 font-bold" aria-pressed={queueTab==='mine'}
            onClick={()=>setQueueTab('mine')}>Minhas entregas</Button>
          <Button type="button" size="sm" variant={queueTab==='all'?'default':'outline'}
            className="h-10 font-bold" aria-pressed={queueTab==='all'}
            onClick={()=>setQueueTab('all')}>Todas entregas</Button>
        </div>
        <Button className="h-10 gap-2 rounded-lg border border-[#aacfff]/50 bg-[#75aaff] px-3 font-extrabold text-[#07182b] hover:bg-[#93bfff]"
          disabled={!canOperate||!driver||!sales.data||sales.isError}
          onClick={()=>{setDocument('');setCode('');setValue('');setOnlyDelivery(false);setError('');setAdding(true);}}>
          <Plus className="h-4 w-4"/> Adicionar entrega
        </Button>
      </div>
      {sales.isError&&<p role="alert" className="text-destructive">Não foi possível consultar as empresas.</p>}
      {!canOperate&&<p role="status" className="text-sm text-muted-foreground">Somente consulta: seu perfil não possui o direito Entregas.</p>}
    </>}
    {error && !arrived && !adding && <p role="alert" className="text-destructive">{error}</p>}
    {role === 'gestor' ? <ManagerDeliveries deliveries={all} isLoading={!q.data && !q.isError} isError={q.isError} isFetching={q.isFetching} onRefresh={() => { void q.refetch(); }} /> : !q.data ? <p role={q.isError ? 'alert' : 'status'}>{q.isError ? 'Não foi possível carregar as entregas.' : 'Carregando entregas…'}</p> : role === 'operador' ? queue : <div className="grid gap-6 xl:grid-cols-2"><div><h2 className="mb-4 text-xl font-bold">Pendentes ({open.length})</h2>{queue}</div><div><h2 className="mb-4 text-xl font-bold text-success">Finalizadas ({done.length})</h2><div className="space-y-3">{done.map(d => <Card key={d.id} className="gap-2 p-4"><h3 className="break-words text-2xl font-bold">{d.company}</h3><p className="text-2xl font-bold">{d.onlyDelivery ? 'SOMENTE ENTREGA' : money(d.value)}</p>{d.document && <p className="text-lg">Nº documento: {d.document}</p>}<p className="text-lg">Entregador: <strong>{d.driver}</strong></p><div className="grid grid-cols-1 gap-3 bg-muted p-3"><p>Trajeto<strong className="block text-xl">{fmtDuration(travelMs(d))}</strong></p></div><p className="text-base text-muted-foreground">Recebedor: {d.receiver}<br />{fmtBrasilia(d.finishedAt)}</p></Card>)}{!done.length && <p className="py-6 text-muted-foreground">Nenhuma entrega finalizada.</p>}</div></div></div>}
    </>}
    {role === 'operador' && <>
      <Dialog open={!!arrived} onOpenChange={o => { if (!busy && !o) setArrived(null); }}><DialogContent><DialogHeader><DialogTitle>Entregar — confirmar recebimento</DialogTitle></DialogHeader><h2 className="break-words text-2xl font-bold">{arrived?.[0]?.company}</h2><p className="text-xl font-bold">{arrived && money(arrived.reduce((s,d) => s+d.value,0))}</p><p className="break-words text-lg">{arrived?.map(d => d.onlyDelivery ? 'SOMENTE ENTREGA' : `Doc. ${d.document}`).join(' · ')}</p><label className="block space-y-2 font-semibold">Nome do recebedor<Input aria-label="Nome do recebedor" autoFocus maxLength={150} value={receiver} onChange={e => setReceiver(e.target.value)} className="h-12 text-xl font-bold md:text-xl" /></label>{error && <p role="alert" className="text-destructive">{error}</p>}<Button className="h-12 text-lg font-bold" disabled={busy || !canOperate || !receiver.trim()} onClick={async () => { const d = arrived?.[0]; if (d && await action({ action:'deliver', id:d.id, receiver:receiver.trim() })) setArrived(null); }}>Confirmar entrega{arrived && arrived.length > 1 ? ` (${arrived.length} notas)` : ''}</Button></DialogContent></Dialog>
      <Dialog open={adding} onOpenChange={o => { if (!busy) setAdding(o); }}><DialogContent><DialogHeader><DialogTitle>Adicionar entrega</DialogTitle></DialogHeader><label className="flex items-center gap-3 text-lg font-bold"><input type="checkbox" checked={onlyDelivery} onChange={e => setOnlyDelivery(e.target.checked)} className="h-5 w-5 accent-primary" />Somente entrega</label><LogisticsOrderFields clients={clients} code={code} setCode={setCode} document={document} setDocument={setDocument} value={value} setValue={setValue} onlyCompany={onlyDelivery} />{error && <p role="alert" className="text-destructive">{error}</p>}<Button className="h-12 text-lg" disabled={busy || !canOperate || !clients.some(c => canonicalCode(c.code) === canonicalCode(code)) || (!onlyDelivery && (!document || !Number.isFinite(parseMoneyInput(value))))} onClick={async () => { if (await run(() => add({ data: { requestId:crypto.randomUUID(), companyCode:code, onlyDelivery, ...(onlyDelivery ? {} : { document, value:parseMoneyInput(value) }) } }))) setAdding(false); }}>Adicionar</Button></DialogContent></Dialog>
    </>}
  </section>;
}

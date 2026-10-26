import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { PackageCheck, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { addManualPickup, completePickup, listPickups } from '@/lib/pickups.functions';
import { type Pickup } from '@/lib/pickups';
import { parseMoneyInput, canonicalCode, type SalesClient } from '@/lib/sales-verification';
import { fmtBrasilia } from '@/lib/deliveries';
import { LogisticsOrderFields } from './LogisticsOrderFields';
import type { AccessRole } from '@/lib/access-policy';
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function Retira({ role, clients = [] }: { role: AccessRole; clients?: SalesClient[] }) {
  const list = useServerFn(listPickups), add = useServerFn(addManualPickup), complete = useServerFn(completePickup);
  const q = useQuery({ queryKey: ['pickups', role], queryFn: () => list(), refetchInterval: 10000 });
  const [selected, setSelected] = useState<Pickup | null>(null), [receiver, setReceiver] = useState('');
  const [adding, setAdding] = useState(false), [source, setSource] = useState<'SBO' | 'NO'>('NO');
  const [collector, setCollector] = useState(''), [code, setCode] = useState(''), [document, setDocument] = useState(''), [value, setValue] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function run(fn: () => Promise<unknown>) { setBusy(true); setError(''); try { await fn(); await q.refetch(); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir.'); return false; } finally { setBusy(false); } }
  if (!q.data) return <section><h2 className="text-2xl font-bold">Retira</h2><p role={q.isError ? 'alert' : 'status'}>{q.isError ? 'Não foi possível carregar Retira.' : 'Carregando Retira…'}</p></section>;
  const open = q.data.records.filter(p => p.status === 'pendente'), done = q.data.records.filter(p => p.status === 'finalizada').sort((a,b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
  const rows = (records: Pickup[], finished = false) => <div className="space-y-3">{records.map(p => <Card key={p.id} className="gap-3 p-4">
    <div className="flex flex-wrap items-center gap-2"><h3 className="min-w-0 flex-1 break-words text-2xl font-bold leading-tight">{p.company}</h3><span className="rounded bg-accent px-2 py-1 text-sm font-bold text-primary">{p.source === 'conferencia' ? 'Expedição' : p.source}</span></div>
    {p.value !== undefined && <p className="text-2xl font-bold">{money(p.value)}</p>}{p.document && <p className="text-lg font-semibold">Doc. {p.document}</p>}
    {finished ? <><p className="text-lg">Retirado por: <strong>{p.receiver ?? 'Não informado'}</strong></p><p className="text-sm">Operador que entregou: <strong>{p.handedBy ?? 'Não informado'}</strong></p><p className="font-semibold text-muted-foreground">Retirado em {fmtBrasilia(p.finishedAt)}</p></> : role === 'operador' && <Button className="h-12 w-full text-lg font-bold" disabled={busy} onClick={() => { setReceiver(''); setError(''); setSelected(p); }}><PackageCheck />RETIRAR</Button>}
  </Card>)}{!records.length && <p className="py-5 text-muted-foreground">{finished ? 'Nenhuma retirada finalizada.' : 'Nenhum pedido para retira.'}</p>}</div>;
  return <section className="min-w-0 space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3"><h2 className="flex items-center gap-2 text-2xl font-bold"><PackageCheck className="text-primary" />Retira</h2>{role === 'operador' && <Button variant="outline" onClick={() => { setAdding(true); setSource('NO'); setCollector(''); setCode(''); setDocument(''); setValue(''); setError(''); }}><Plus />Adicionar</Button>}</header>
    {error && !selected && !adding && <p role="alert" className="text-destructive">{error}</p>}
    {role === 'gestor' ? <div className="grid gap-6 xl:grid-cols-2"><div><h3 className="mb-3 text-lg font-bold">Pendentes ({open.length})</h3>{rows(open)}</div><div><h3 className="mb-3 text-lg font-bold text-success">Finalizados ({done.length})</h3>{rows(done, true)}</div></div> : rows(open)}
    <Dialog open={!!selected} onOpenChange={o => { if (!busy && !o) setSelected(null); }}><DialogContent><DialogHeader><DialogTitle>Confirmar retirada</DialogTitle></DialogHeader><p className="break-words text-xl font-bold">{selected?.company}</p><label className="space-y-2 font-semibold">Nome da pessoa que retirou<Input aria-label="Nome da pessoa que retirou" autoFocus value={receiver} onChange={e => setReceiver(e.target.value)} maxLength={150} placeholder="Quem está levando este pedido?" className="h-12 text-xl font-bold md:text-xl" /></label>{error && <p role="alert" className="text-destructive">{error}</p>}<Button className="h-12 text-lg" disabled={busy || !receiver.trim()} onClick={async () => { if (selected && await run(() => complete({ data: { id: selected.id, receiver: receiver.trim() } }))) setSelected(null); }}>Confirmar retirada</Button></DialogContent></Dialog>
    <Dialog open={adding} onOpenChange={o => { if (!busy) setAdding(o); }}><DialogContent><DialogHeader><DialogTitle>Adicionar Retira</DialogTitle></DialogHeader><div className="grid grid-cols-2 gap-2">{(['SBO','NO'] as const).map(s => <Button key={s} variant={source === s ? 'default' : 'outline'} aria-pressed={source === s} onClick={() => setSource(s)}>{s}</Button>)}</div>{source === 'SBO' ? <label className="space-y-2 font-semibold">Nome do retirador<Input aria-label="Nome do retirador" value={collector} onChange={e => setCollector(e.target.value)} maxLength={150} className="h-12 text-xl font-bold md:text-xl" /></label> : <LogisticsOrderFields clients={clients} code={code} setCode={setCode} document={document} setDocument={setDocument} value={value} setValue={setValue} />}{error && <p role="alert" className="text-destructive">{error}</p>}<Button className="h-12 text-lg" disabled={busy || (source === 'SBO' ? !collector.trim() : !document || !Number.isFinite(parseMoneyInput(value)) || !clients.some(c => canonicalCode(c.code) === canonicalCode(code)))} onClick={async () => { const data = source === 'SBO' ? { source, requestId: crypto.randomUUID(), collector } : { source, requestId: crypto.randomUUID(), document, companyCode: code, value: parseMoneyInput(value) }; if (await run(() => add({ data }))) setAdding(false); }}>Adicionar</Button></DialogContent></Dialog>
  </section>;
}

import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { logisticsCommitError } from './logistics-commit-error';
import { applyDeliveryGroupAction, deliveryActionSchema, manualDeliverySchema, type Delivery } from './deliveries';

type Row = { id: string; created_at: string; position: number; payload: unknown };
const toDelivery = (r: Row): Delivery => ({ ...(r.payload as Omit<Delivery, 'id' | 'position' | 'createdAt'>), id: r.id, position: r.position, createdAt: r.created_at });
const payloadOf = ({ id: _i, position: _p, createdAt: _c, ...rest }: Delivery) => JSON.parse(JSON.stringify(rest));
async function loadAll() {
  const { logisticsClient } = await import('./logistics.server');
  const db = await logisticsClient();
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('deliveries').select('id,created_at,position,payload').order('position').order('id').range(offset, offset + 999);
    if (error) throw new Error('Não foi possível carregar as entregas.');
    rows.push(...(data ?? [])); if (!data || data.length < 1000) break;
  }
  return { db, rows, list: rows.map(toDelivery) };
}
export const listDeliveries = createServerFn({ method: 'GET' }).handler(async () => {
  const { requireAccess } = await import('./access.server'); await requireAccess();
  return (await loadAll()).list;
});
export const addManualDelivery = createServerFn({ method: 'POST' }).inputValidator(manualDeliverySchema).handler(async ({ data }) => {
  const { operatorAccess, companyByCode, logisticsClient } = await import('./logistics.server');
  await operatorAccess(); const company = await companyByCode(data.companyCode); const db = await logisticsClient();
  const payload = { document: data.onlyDelivery ? '' : data.document, value: data.onlyDelivery ? 0 : data.value, company: company.name, companyCode: company.code, onlyDelivery: data.onlyDelivery, source: 'manual', status: 'nao_iniciada' };
  const { error } = await db.from('deliveries').upsert({ id: data.requestId, payload, position: Date.now() / 1000 }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw new Error('Não foi possível adicionar a entrega.'); return { ok: true };
});
export const updateDelivery = createServerFn({ method: 'POST' }).inputValidator(deliveryActionSchema).handler(async ({ data }) => {
  const { requireSelectedOperator } = await import('./employees.functions');
  const employee = await requireSelectedOperator();
  const { db, rows, list } = await loadAll();
  const action = data.action === 'start' ? { ...data, driver: employee.name }
    : data.action === 'mark_ready' ? { ...data, preparedBy: employee.name } : data;
  const next = applyDeliveryGroupAction(list, action, new Date()).map(d =>
    data.action === 'start' && d.status === 'em_rota' && d.startedAt && list.find(old => old.id === d.id)?.status === 'nao_iniciada'
      ? { ...d, driverEmployeeId: employee.id }
      : data.action === 'cancel' && d.status === 'nao_iniciada' && list.find(old => old.id === d.id)?.status !== 'nao_iniciada'
        ? { ...d, driverEmployeeId: undefined }
        : d
  );
  const changes = next.filter((d, i) => d !== list[i]).map(d => ({ id: d.id, payload: payloadOf(d), position: d.position }));
  const { data: saved, error } = await db.rpc('commit_logistics_changes', { kind: 'deliveries', expected: rows.map(r => ({ id: r.id, payload: r.payload })) as never, changes });
  if (error) throw logisticsCommitError('atualizar as entregas', error);
  if (saved !== true) throw new Error('A atualização das entregas não foi confirmada pelo Supabase. Atualize e tente novamente.');
  return { ok: true };
});
export const reorderDeliveries = createServerFn({ method: 'POST' }).inputValidator(z.object({ ids: z.array(z.string().uuid()).min(1).max(10000) })).handler(async ({ data }) => {
  const { operatorAccess } = await import('./logistics.server'); await operatorAccess();
  const { db, rows, list } = await loadAll();
  const open = list.filter(d => d.status !== 'finalizada');
  if (new Set(data.ids).size !== data.ids.length || data.ids.length !== open.length || open.some(d => !data.ids.includes(d.id))) throw new Error('A fila mudou. Atualize e tente novamente.');
  const changes = data.ids.map((id, i) => {
    const delivery = open.find(d => d.id === id);
    if (!delivery) throw new Error('Entrega não encontrada.');
    return { id, payload: payloadOf(delivery), position: i + 1 };
  });
  const { data: saved, error } = await db.rpc('commit_logistics_changes', { kind: 'deliveries', expected: rows.map(r => ({ id: r.id, payload: r.payload })) as never, changes });
  if (error) throw logisticsCommitError('reorganizar as entregas', error);
  if (saved !== true) throw new Error('A nova ordem não foi confirmada pelo Supabase. Atualize e tente novamente.');
  return { ok: true };
});

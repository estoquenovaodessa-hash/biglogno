import { createServerFn } from '@tanstack/react-start';
import { finishPickup, finishPickupSchema, markPickupReadySchema, manualPickupSchema, type Pickup } from './pickups';
import { logisticsCommitError } from './logistics-commit-error';

export const listPickups = createServerFn({ method: 'GET' }).handler(async () => {
  const { requireAccess } = await import('./access.server'); const role = await requireAccess();
  const { logisticsClient } = await import('./logistics.server'); const db = await logisticsClient();
  const records: Pickup[] = [];
  for (let offset = 0; ; offset += 1000) {
    let q = db.from('pickups').select('id,created_at,payload').order('created_at', { ascending: false }).order('id');
    if (role === 'operador') q = q.eq('payload->>status', 'pendente');
    const { data, error } = await q.range(offset, offset + 999);
    if (error) throw new Error('Não foi possível carregar Retira.');
    records.push(...(data ?? []).map(r => ({ ...(r.payload as unknown as Pickup), id: r.id, createdAt: r.created_at })));
    if (!data || data.length < 1000) break;
  }
  const { data: last, error } = await db.from('pickups').select('payload').eq('payload->>status', 'finalizada').order('payload->>finishedAt', { ascending: false }).limit(1);
  if (error) throw new Error('Não foi possível carregar o último operador.');
  return { records, lastHandedBy: (last?.[0]?.payload as unknown as Pickup | undefined)?.handedBy ?? '' };
});
export const addManualPickup = createServerFn({ method: 'POST' }).inputValidator(manualPickupSchema).handler(async ({ data }) => {
  const { operatorAccess, companyByCode, logisticsClient } = await import('./logistics.server'); await operatorAccess();
  const db = await logisticsClient();
  const company = data.source === 'NO' ? await companyByCode(data.companyCode) : null;
  const payload = data.source === 'SBO' ? { source: 'SBO', company: data.collector, collector: data.collector, status: 'pendente' } : { source: 'NO', company: company?.name, companyCode: company?.code, document: data.document, value: data.value, status: 'pendente' };
  const { error } = await db.from('pickups').upsert({ id: data.requestId, payload }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw new Error('Não foi possível adicionar Retira.'); return { ok: true };
});
export const completePickup = createServerFn({ method: 'POST' }).inputValidator(finishPickupSchema).handler(async ({ data }) => {
  const { requireSelectedOperator } = await import('./employees.functions');
  const employee = await requireSelectedOperator();
  const { logisticsClient } = await import('./logistics.server'); const db = await logisticsClient();
  const { data: row, error } = await db.from('pickups').select('id,created_at,payload').eq('id', data.id).maybeSingle();
  if (error || !row) throw new Error('Retira não encontrada.');
  const p = finishPickup({ ...(row.payload as unknown as Pickup), id: row.id, createdAt: row.created_at }, data.receiver, employee.name, new Date());
  const { id: _i, createdAt: _c, ...payload } = p;
  const { data: saved, error: saveError } = await db.rpc('commit_logistics_changes', {
    kind: 'pickups',
    expected: [{ id: row.id, payload: row.payload }],
    changes: [{ id: row.id, payload }],
  });
  if (saveError) throw logisticsCommitError('confirmar a retirada', saveError);
  if (saved !== true) throw new Error('A retirada não foi confirmada pelo Supabase. Atualize e tente novamente.');
  return { ok: true };
});

/** Expedição recebe apenas as retiras originadas da Conferência, inclusive já retiradas. */
export const listExpeditionPickups = createServerFn({ method: 'GET' }).handler(async () => {
  const { requireAccess } = await import('./access.server');
  await requireAccess();
  const { logisticsClient } = await import('./logistics.server');
  const db = await logisticsClient();
  const records: Pickup[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('pickups')
      .select('id,created_at,payload').eq('payload->>source', 'conferencia')
      .order('created_at', { ascending: false }).order('id').range(offset, offset + 999);
    if (error) throw new Error('Não foi possível carregar as retiradas da conferência.');
    records.push(...(data ?? []).map(r => ({
      ...(r.payload as unknown as Pickup), id: r.id, createdAt: r.created_at,
    })));
    if (!data || data.length < 1000) break;
  }
  return records;
});

/** Registra separação física sem alterar o status da retirada nem o responsável. */
export const markPickupPrepared = createServerFn({ method: 'POST' })
  .inputValidator(markPickupReadySchema).handler(async ({ data }) => {
    const { requireSelectedOperator } = await import('./employees.functions');
    const employee = await requireSelectedOperator();
    const { logisticsClient } = await import('./logistics.server');
    const db = await logisticsClient();
    const { data: row, error } = await db.from('pickups')
      .select('id,payload').eq('id', data.id).maybeSingle();
    if (error || !row) throw new Error('Retirada não encontrada.');
    const original = row.payload as unknown as Pickup;
    if (original.source !== 'conferencia') throw new Error('Apenas retiras vindas da Conferência podem ser separadas nesta tela.');
    if (original.status !== 'pendente') throw new Error('O pedido já foi retirado.');
    if (original.preparedAt) return { ok: true };
    const payload = { ...original, preparedAt: new Date().toISOString(), preparedBy: employee.name };
    const { data: saved, error: saveError } = await db.rpc('commit_logistics_changes', {
      kind: 'pickups',
      expected: [{ id: row.id, payload: row.payload }],
      changes: [{ id: row.id, payload }],
    });
    if (saveError) throw logisticsCommitError('marcar a retirada como separada', saveError);
    if (saved !== true) throw new Error('A separação não foi confirmada pelo Supabase. Atualize e tente novamente.');
    return { ok: true };
  });

import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { finishPickup, finishPickupSchema, manualPickupSchema, type Pickup } from './pickups';
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
  const { requireOperatorPermission } = await import('./employees.functions'); await requireOperatorPermission('conferencia');
  const db = await logisticsClient();
  const company = data.source === 'NO' ? await companyByCode(data.companyCode) : null;
  const payload = data.source === 'SBO' ? { source: 'SBO', company: data.collector, collector: data.collector, status: 'pendente' } : { source: 'NO', company: company?.name, companyCode: company?.code, document: data.document, value: data.value, status: 'pendente' };
  const { error } = await db.from('pickups').upsert({ id: data.requestId, payload }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw new Error('Não foi possível adicionar Retira.'); return { ok: true };
});
export const completePickup = createServerFn({ method: 'POST' }).inputValidator(finishPickupSchema).handler(async ({ data }) => {
  const { requireOperatorPermission } = await import('./employees.functions');
  const employee = await requireOperatorPermission('conferencia');
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

/**
 * Transfere atomicamente uma Retira pendente originada da Conferência
 * para Entregas, preservando o ID e created_at da Conferência/separação.
 * A transferência exige a RPC instalada no Supabase, nunca faz
 * INSERT + DELETE em requisições independentes.
 */
export const transferPickupToDelivery = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { requireExpeditionTransferOperator } = await import('./employees.functions');
    await requireExpeditionTransferOperator();
    const { logisticsClient } = await import('./logistics.server');
    const db = await logisticsClient();
    const { data: moved, error } = await db.rpc('transfer_pickup_to_delivery', {
      p_pickup_id: data.id,
    });
    if (error) {
      console.error('[Retira → Entregas] Falha na transferência atômica', {
        code: error.code, message: error.message,
      });
      if (error.code === 'PGRST202' || error.code === '42883') {
        throw new Error('Falta executar o SQL de transferência Retira → Entrega no Supabase.');
      }
      if (error.code === 'P0001') throw new Error(error.message);
      throw new Error('Não foi possível transferir o pedido. Nenhuma transferência foi confirmada.');
    }
    if (moved !== true) throw new Error('O Supabase não confirmou a transferência.');
    return { ok: true };
  });

/** Transferência protegida: Entrega não iniciada => Retira. O SQL
 * move a nota entre tabelas preservando created_at e ID originais. */
export const transferDeliveryToPickup = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { requireExpeditionTransferOperator } = await import('./employees.functions');
    await requireExpeditionTransferOperator();
    const { logisticsClient } = await import('./logistics.server');
    const db = await logisticsClient();
    const { data: moved, error } = await db.rpc('transfer_delivery_to_pickup', {
      p_delivery_id: data.id,
    });
    if (error) {
      console.error('[Entregas → Retira] Falha na transferência atômica', {
        code: error.code, message: error.message,
      });
      if (error.code === 'PGRST202' || error.code === '42883') {
        throw new Error('Falta executar o SQL de transferências da Expedição no Supabase.');
      }
      if (error.code === 'P0001') throw new Error(error.message);
      throw new Error('Não foi possível transferir a entrega. Nenhuma transferência foi confirmada.');
    }
    if (moved !== true) throw new Error('O Supabase não confirmou a transferência.');
    return { ok: true };
  });

/**
 * Transfere em uma só transação TODAS as notas selecionadas de uma empresa.
 * Não executa loops de requisições: qualquer falha desfaz o grupo inteiro.
 * O servidor valida a identidade do perfil autorizado antes de usar service_role.
 */
export const transferExpeditionOrders = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    ids: z.array(z.string().uuid()).min(1, 'Selecione ao menos uma nota.').max(100),
    direction: z.enum(['toPickup', 'toDelivery']),
  }).superRefine((input, ctx) => {
    if (new Set(input.ids).size !== input.ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ids'], message: 'Há notas repetidas na seleção.' });
    }
  }))
  .handler(async ({ data }) => {
    const { requireExpeditionTransferOperator } = await import('./employees.functions');
    await requireExpeditionTransferOperator();
    const { logisticsClient } = await import('./logistics.server');
    const db = await logisticsClient();
    const { data: moved, error } = await db.rpc('transfer_expedition_orders', {
      p_ids: data.ids, p_direction: data.direction,
    });
    if (error) {
      console.error('[Expedição] Falha na transferência atômica de notas', {
        code: error.code, message: error.message,
      });
      if (error.code === 'PGRST202' || error.code === '42883') {
        throw new Error('Instale o SQL de transferência de notas unificadas no Supabase.');
      }
      if (error.code === 'P0001') throw new Error(error.message);
      throw new Error('A transferência não foi confirmada. Nenhum pedido deve ser considerado movido.');
    }
    if (moved !== true) throw new Error('O Supabase não confirmou a transferência conjunta.');
    return { ok: true, count: data.ids.length };
  });

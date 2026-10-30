import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { logisticsCommitError } from './logistics-commit-error';
import { expeditionScheduleInputSchema, advanceExpeditionShift } from './expedition-schedule';
import { expeditionLocalDay } from './expedition-history';
import { applyDeliveryGroupAction, deliveryActionSchema, manualDeliverySchema, type Delivery } from './deliveries';

type Row = { id: string; created_at: string; position: number; payload: unknown };
const toDelivery = (r: Row): Delivery => ({ ...(r.payload as Omit<Delivery, 'id' | 'position' | 'createdAt'>), id: r.id, position: r.position, createdAt: r.created_at });
const payloadOf = ({ id: _i, position: _p, createdAt: _c, ...rest }: Delivery) => JSON.parse(JSON.stringify(rest));
async function loadAll() {
  const { logisticsClient } = await import('./logistics.server');
  const db = await logisticsClient();
  // Reconcilia o turno ao consultar (também quando o cron ainda não executou).
  // O agendamento SQL executa independentemente de alguém estar online.
  const { error: rolloverError } = await db.rpc('rollover_logistics_shifts');
  if (rolloverError && !['PGRST202', '42883'].includes(rolloverError.code ?? ''))
    console.error('[Turnos] Não foi possível aplicar o rollover', rolloverError.code);
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('deliveries').select('id,created_at,position,payload').order('position').order('id').range(offset, offset + 999);
    if (error) throw new Error('Não foi possível carregar as entregas.');
    rows.push(...(data ?? [])); if (!data || data.length < 1000) break;
  }
  const now = new Date();
  return { db, rows, list: rows.map(toDelivery).map(d => advanceExpeditionShift(d, now)) };
}
export const listDeliveries = createServerFn({ method: 'GET' }).handler(async () => {
  const { requireAccess } = await import('./access.server'); await requireAccess();
  const { applyCollectionLocations } = await import('./collection-locations');
  const { loadCollectionLocations } = await import('./collection-locations.functions');
  const { list } = await loadAll();
  // Operador, Expedição e Gestor recebem o MESMO endereço validado.
  // Nada modifica as entregas persistidas: apenas complementa a consulta.
  return applyCollectionLocations(list, await loadCollectionLocations());
});
export const addManualDelivery = createServerFn({ method: 'POST' }).inputValidator(manualDeliverySchema).handler(async ({ data }) => {
  const { operatorAccess, companyByCode, logisticsClient } = await import('./logistics.server');
  await operatorAccess(); const { requireOperatorPermission } = await import('./employees.functions'); await requireOperatorPermission('entregas'); const company = await companyByCode(data.companyCode); const db = await logisticsClient();
  const payload = { document: data.onlyDelivery ? '' : data.document, value: data.onlyDelivery ? 0 : data.value, company: company.name, companyCode: company.code, onlyDelivery: data.onlyDelivery, source: 'manual', status: 'nao_iniciada' };
  const { error } = await db.from('deliveries').upsert({ id: data.requestId, payload, position: Date.now() / 1000 }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw new Error('Não foi possível adicionar a entrega.'); return { ok: true };
});
export const updateDelivery = createServerFn({ method: 'POST' }).inputValidator(deliveryActionSchema).handler(async ({ data }) => {
  const { requireOperatorPermission, deliveryResponsibleForOperator } = await import('./employees.functions');
  const actor = await requireOperatorPermission('entregas');
  const { isCaue, isLuciano } = await import('./delivery-accountability');
  const { db, rows, list } = await loadAll();
  const original = list.find(row => row.id === data.id);
  if (!original) throw new Error('Entrega não encontrada.');
  // Apoio do Cauê é exclusivo das operações do Luciano; não interfere na
  // Expedição dos demais motoristas nem em viagens próprias do Marcelo.
  if (isCaue(actor.name) && original.status !== 'nao_iniciada' && original.driver
      && !isCaue(original.driver) && !isLuciano(original.driver)) {
    throw new Error('O apoio de Cauê nas Entregas é exclusivo das operações de Luciano.');
  }
  const responsible = isCaue(actor.name)
    ? await deliveryResponsibleForOperator(actor)
    : actor;
  const action = data.action === 'start'
    ? { ...data, driver: responsible.name }
    : data;
  const next = applyDeliveryGroupAction(list, action, new Date()).map((row, i) => {
    const old = list[i];
    if (row === old) return row;
    const started = data.action === 'start' && row.status === 'em_rota'
      && row.startedAt && old.status === 'nao_iniciada';
    const cancelled = data.action === 'cancel' && row.status === 'nao_iniciada'
      && old.status !== 'nao_iniciada';
    // Mesmo pedidos antigos iniciados pelo Cauê passam a pertencer ao Luciano
    // quando um novo movimento for registrado. O histórico de autor fica separado.
    const legacyCaue = isCaue(row.driver);
    const owner = legacyCaue && !cancelled && (isCaue(actor.name) || isLuciano(actor.name))
      ? responsible : null;
    return {
      ...row,
      ...(started ? {
        driverEmployeeId: responsible.id,
        startedBy: actor.name, startedByEmployeeId: actor.id,
      } : cancelled ? {
        driverEmployeeId: undefined,
        startedBy: undefined, startedByEmployeeId: undefined,
      } : {}),
      ...(owner ? { driver: owner.name, driverEmployeeId: owner.id } : {}),
      lastActionBy: actor.name,
      lastActionByEmployeeId: actor.id,
    };
  });
  const changes = next.filter((d, i) => d !== list[i]).map(d => ({ id: d.id, payload: payloadOf(d), position: d.position }));
  const { data: saved, error } = await db.rpc('commit_logistics_changes', { kind: 'deliveries', expected: rows.map(r => ({ id: r.id, payload: r.payload })) as never, changes });
  if (error) throw logisticsCommitError('atualizar as entregas', error);
  if (saved !== true) throw new Error('A atualização das entregas não foi confirmada pelo Supabase. Atualize e tente novamente.');
  return { ok: true };
});
/** A Expedição define o turno dos pedidos ainda não iniciados. Em coletas,
 * também pode ajustar a data. O gestor consulta mas não modifica. */
export const setExpeditionSchedule = createServerFn({ method: 'POST' })
  .inputValidator(expeditionScheduleInputSchema).handler(async ({ data }) => {
    const { requireOperatorPermission } = await import('./employees.functions');
    await requireOperatorPermission('expedicao');
    const { db, rows, list } = await loadAll();
    if (new Set(data.ids).size !== data.ids.length) throw new Error('Não repita pedidos na mesma alteração.');
    const targets = list.filter(row => data.ids.includes(row.id));
    if (targets.length !== data.ids.length) throw new Error('Pedido não encontrado. Atualize a Expedição.');
    if (targets.some(row => row.status !== 'nao_iniciada'))
      throw new Error('O turno não pode ser alterado depois que a operação começou.');
    if (data.scheduledDate !== undefined && targets.some(row => row.source !== 'coleta'))
      throw new Error('Data específica é permitida somente para coletas.');
    // A primeira atribuição de turno sela um lote. Notas que chegarem após
    // a separação continuam sem turno e nunca herdam a assinatura deste lote.
    // Reatribuir/remover turno preserva o ID, para não unificar lotes antigos.
    const batchId = data.shift
      ? targets.find(row => row.expeditionBatchId)?.expeditionBatchId ?? crypto.randomUUID()
      : undefined;
    const today = expeditionLocalDay(new Date().toISOString());
    const changes = targets.map(row => ({
      id: row.id, position: row.position,
      payload: payloadOf({
        ...row,
        expeditionShift: data.shift ?? undefined,
        expeditionShiftDate: data.shift
          ? row.source === 'coleta'
            ? (data.scheduledDate === undefined ? row.scheduledDate : data.scheduledDate) || today
            : today
          : undefined,
        expeditionBatchId: row.expeditionBatchId ?? batchId,
        ...(data.scheduledDate === undefined ? {} : { scheduledDate: data.scheduledDate ?? undefined }),
      }),
    }));
    const { data: saved, error } = await db.rpc('commit_logistics_changes', {
      kind: 'deliveries',
      expected: rows.map(row => ({ id: row.id, payload: row.payload })) as never,
      changes,
    });
    if (error) throw logisticsCommitError('agendar o turno da Expedição', error);
    if (saved !== true) throw new Error('Não foi possível confirmar o agendamento. Atualize e tente novamente.');
    return { ok: true };
  });

export const reorderDeliveries = createServerFn({ method: 'POST' }).inputValidator(z.object({ ids: z.array(z.string().uuid()).min(1).max(10000) })).handler(async ({ data }) => {
  const { operatorAccess } = await import('./logistics.server'); await operatorAccess();
  const { requireOperatorPermission } = await import('./employees.functions'); await requireOperatorPermission('entregas');
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

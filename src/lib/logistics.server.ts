import { canOperateLogistics } from './deliveries';
import { canonicalCode, clientSchema } from './sales-verification';
import { requireAccess } from './access.server';
import { z } from 'zod';

export async function operatorAccess() {
  if (!canOperateLogistics(await requireAccess())) throw new Error('Somente o operador pode realizar esta ação.');
}
export async function logisticsClient() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin;
}
export async function companyByCode(code: string) {
  const db = await logisticsClient();
  const { data, error } = await db.from('app_state').select('value').eq('key', 'sales-clients').maybeSingle();
  if (error) throw new Error('Não foi possível consultar as empresas.');
  const clients = z.array(clientSchema).parse(data?.value ?? []);
  const company = clients.find(c => canonicalCode(c.code) === canonicalCode(code));
  if (!company) throw new Error('Empresa não encontrada na base importada.');
  return company;
}

-- BigLogno: transferência de todas ou de notas selecionadas de um grupo unificado.
-- Execute APÓS sql/2026-10-26-transferencias-expedicao-caue.sql no Supabase SQL Editor.
-- Esta migração SOMENTE cria a função, sem alterar pedidos existentes.
-- A autorização exclusiva do Cauê é verificada nas funções server-side do BigLogno.
-- As RPCs existentes continuam válidas para movimentação individual.
--
-- O conjunto inteiro é transacionado de uma vez: se uma nota falhar,
-- TODAS as alterações são desfeitas (sem transferências parciais).
-- IDs e created_at originais continuam preservados pelas funções individuais.

CREATE OR REPLACE FUNCTION public.transfer_expedition_orders(
  p_ids uuid[], p_direction text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_count integer;
  available_count integer;
  companies_count integer;
  order_id uuid;
BEGIN
  selected_count := cardinality(p_ids);
  IF selected_count IS NULL OR selected_count < 1 OR selected_count > 100 THEN
    RAISE EXCEPTION 'Selecione entre 1 e 100 notas para transferir.';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_ids) AS t(id) WHERE id IS NULL)
     OR (SELECT count(DISTINCT x.id) FROM unnest(p_ids) AS x(id)) <> selected_count
  THEN
    RAISE EXCEPTION 'A seleção contém notas inválidas ou repetidas.';
  END IF;
  IF p_direction IS NULL OR p_direction NOT IN ('toPickup', 'toDelivery') THEN
    RAISE EXCEPTION 'Destino de transferência inválido.';
  END IF;

  -- Bloqueio compartilhado com a conferência, entregas e retiras.
  PERFORM pg_advisory_xact_lock(hashtext('bignotto-logistics'));

  IF p_direction = 'toPickup' THEN
    SELECT count(*), count(DISTINCT coalesce(
      nullif(payload->>'companyCode', ''),
      lower(btrim(payload->>'company'))
    ))
      INTO available_count, companies_count
      FROM public.deliveries
      WHERE id = ANY(p_ids)
        AND payload->>'source' = 'conferencia'
        AND payload->>'status' = 'nao_iniciada'
        AND coalesce(payload->>'onlyDelivery', 'false') <> 'true';
  ELSE
    SELECT count(*), count(DISTINCT coalesce(
      nullif(payload->>'companyCode', ''),
      lower(btrim(payload->>'company'))
    ))
      INTO available_count, companies_count
      FROM public.pickups
      WHERE id = ANY(p_ids)
        AND payload->>'source' = 'conferencia'
        AND payload->>'status' = 'pendente';
  END IF;

  -- Pré-valida TODAS antes da primeira alteração.
  IF available_count <> selected_count THEN
    RAISE EXCEPTION 'Uma ou mais notas já mudaram de situação. Atualize a Expedição.';
  END IF;
  IF companies_count <> 1 THEN
    RAISE EXCEPTION 'Selecione notas de uma única empresa.';
  END IF;

  FOR order_id IN
    SELECT DISTINCT u.id FROM unnest(p_ids) AS u(id) ORDER BY u.id
  LOOP
    IF p_direction = 'toPickup' THEN
      PERFORM public.transfer_delivery_to_pickup(order_id);
    ELSE
      PERFORM public.transfer_pickup_to_delivery(order_id);
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_expedition_orders(uuid[],text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_expedition_orders(uuid[],text)
  TO service_role;
NOTIFY pgrst, 'reload schema';

-- Consulta inofensiva: não faz transferências.
SELECT
  to_regprocedure('public.transfer_pickup_to_delivery(uuid)') IS NOT NULL AS retira_para_entrega_ok,
  to_regprocedure('public.transfer_delivery_to_pickup(uuid)') IS NOT NULL AS entrega_para_retira_ok,
  to_regprocedure('public.transfer_expedition_orders(uuid[],text)') IS NOT NULL AS selecao_de_notas_ok;

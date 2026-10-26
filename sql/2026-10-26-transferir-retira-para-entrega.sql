-- BigLogno: transferir um pedido pendente da Retira para Entregas.
-- Executar uma única vez no Supabase SQL Editor. Nenhum pedido é alterado
-- ao executar esta migração; somente a função de transferência é instalada.
--
-- Garantias:
--  * A Conferência original, seu id e seu created_at NÃO são atualizados.
--  * A entrega assume o mesmo id, created_at, documento e valor da retirada.
--  * Inserção em Entregas e exclusão da Retira ocorrem na MESMA transação.
--  * Bloqueio advisory é compartilhado com commit_logistics_changes.
--  * Somente pedidos pendentes originados da Conferência são aceitos.
--  * Chamada repetida após sucesso retorna true sem duplicar a entrega.
--  * Service role apenas; operador é validado na função server-side do site.

CREATE OR REPLACE FUNCTION public.transfer_pickup_to_delivery(p_pickup_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_pickup public.pickups%ROWTYPE;
  delivery_payload jsonb;
BEGIN
  -- Mesma trava das operações de logística existentes, para não concorrer
  -- com uma confirmação de retirada ou alterações da fila de Entregas.
  PERFORM pg_advisory_xact_lock(hashtext('bignotto-logistics'));

  SELECT * INTO old_pickup
    FROM public.pickups
    WHERE id = p_pickup_id
    FOR UPDATE;

  IF NOT FOUND THEN
    -- Retry seguro após uma resposta de rede perdida: não recria o pedido.
    IF EXISTS (
      SELECT 1 FROM public.deliveries d
      WHERE d.id = p_pickup_id
        AND d.payload->>'transferredFrom' = 'retira'
    ) THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'Retira não encontrada ou já movimentada.';
  END IF;

  IF old_pickup.payload->>'status' IS DISTINCT FROM 'pendente' THEN
    RAISE EXCEPTION 'O pedido já foi retirado e não pode ser transferido.';
  END IF;
  IF old_pickup.payload->>'source' IS DISTINCT FROM 'conferencia' THEN
    RAISE EXCEPTION 'Somente pedidos vindos da Conferência podem ser transferidos nesta tela.';
  END IF;
  IF NULLIF(btrim(old_pickup.payload->>'document'), '') IS NULL
    OR NULLIF(btrim(old_pickup.payload->>'company'), '') IS NULL
    OR NULLIF(btrim(old_pickup.payload->>'companyCode'), '') IS NULL
    OR jsonb_typeof(old_pickup.payload->'value') IS DISTINCT FROM 'number'
  THEN
    RAISE EXCEPTION 'O pedido não possui dados completos de nota, empresa e valor.';
  END IF;

  -- Usa o MESMO id da Conferência/Retira para preservar o vínculo com
  -- exclusão de Conferência e não criar um segundo pedido.
  IF EXISTS (SELECT 1 FROM public.deliveries d WHERE d.id = p_pickup_id) THEN
    RAISE EXCEPTION 'Já existe uma entrega para este pedido.';
  END IF;

  -- Preserva campos originais (empresa, nota, valor, origem, canal e
  -- eventual preparedAt/preparedBy), descartando dados de recebimento.
  delivery_payload :=
    (old_pickup.payload - 'collector' - 'receiver' - 'handedBy' - 'finishedAt')
    || jsonb_build_object(
      'status', 'nao_iniciada',
      'source', 'conferencia',
      'transferredFrom', 'retira'
    );

  INSERT INTO public.deliveries (id, created_at, position, payload)
    VALUES (
      old_pickup.id,
      old_pickup.created_at,
      extract(epoch FROM clock_timestamp()),
      delivery_payload
    );

  DELETE FROM public.pickups WHERE id = old_pickup.id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_pickup_to_delivery(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_pickup_to_delivery(uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';

-- Verificação: true indica função instalada.
-- Este SELECT NÃO transfere nenhum pedido.
SELECT to_regprocedure('public.transfer_pickup_to_delivery(uuid)')
  IS NOT NULL AS transferencia_instalada;

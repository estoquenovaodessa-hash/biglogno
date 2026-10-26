-- BigLogno: transferências bidirecionais na Central de Expedição.
-- Instalar no Supabase SQL Editor. Esta migração NÃO move pedidos existentes.
-- Também instala a função Retira -> Entregas caso a migração anterior não tenha sido aplicada.
-- Permissões de chamada: SOMENTE service_role; no BigLogno, as rotas server-side
-- validam o ID de sessão do operador Cauê antes de chamar qualquer função.
-- O perfil é apenas selecionável via senha compartilhada de operador; consulte
-- o gestor sobre autenticação individual para exclusividade forte.
--
-- Ambos os sentidos usam ID e created_at ORIGINAIS.
-- A Conferência NÃO é alterada. Apenas um pedido ainda NÃO iniciado/retirado
-- pode ser transferido. A gravação e remoção ocorrem na mesma transação.
-- As funções compartilham a trava advisory das ações logísticas normais.

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

CREATE OR REPLACE FUNCTION public.transfer_delivery_to_pickup(p_delivery_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_delivery public.deliveries%ROWTYPE;
  pickup_payload jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bignotto-logistics'));

  SELECT * INTO old_delivery FROM public.deliveries
    WHERE id = p_delivery_id FOR UPDATE;

  IF NOT FOUND THEN
    -- Confirma a execução anterior sem criar registros duplicados.
    IF EXISTS (
      SELECT 1 FROM public.pickups p
      WHERE p.id = p_delivery_id AND p.payload->>'transferredFrom' = 'entrega'
    ) THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'Entrega não encontrada ou já movimentada.';
  END IF;

  -- Não permitir transferência de pedido em rota, pausado, no destino,
  -- concluído ou criado manualmente em Entregas.
  IF old_delivery.payload->>'status' IS DISTINCT FROM 'nao_iniciada' THEN
    RAISE EXCEPTION 'Somente entregas ainda não iniciadas podem ir para Retira.';
  END IF;
  IF old_delivery.payload->>'source' IS DISTINCT FROM 'conferencia' THEN
    RAISE EXCEPTION 'Somente pedidos da Conferência podem ser transferidos.';
  END IF;
  IF NULLIF(btrim(old_delivery.payload->>'document'), '') IS NULL
    OR NULLIF(btrim(old_delivery.payload->>'company'), '') IS NULL
    OR NULLIF(btrim(old_delivery.payload->>'companyCode'), '') IS NULL
    OR jsonb_typeof(old_delivery.payload->'value') IS DISTINCT FROM 'number'
    OR old_delivery.payload->>'onlyDelivery' = 'true'
  THEN
    RAISE EXCEPTION 'Não é possível transferir entrega sem nota, empresa e valor completos.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.pickups p WHERE p.id = p_delivery_id) THEN
    RAISE EXCEPTION 'Já existe uma retirada para este pedido.';
  END IF;

  -- Descarta dados de rota e conserva nota, valor, cliente, canal,
  -- preparação e created_at original (momento da separação).
  pickup_payload :=
    (old_delivery.payload
      - 'driver' - 'driverEmployeeId' - 'startedAt' - 'pausedAt'
      - 'pausedMs' - 'arrivedAt' - 'finishedAt' - 'receiver' - 'onlyDelivery'
      - 'separate')
    || jsonb_build_object(
      'status', 'pendente',
      'source', 'conferencia',
      'transferredFrom', 'entrega'
    );

  INSERT INTO public.pickups (id, created_at, payload)
    VALUES (old_delivery.id, old_delivery.created_at, pickup_payload);

  DELETE FROM public.deliveries WHERE id = old_delivery.id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_delivery_to_pickup(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_delivery_to_pickup(uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';

-- Apenas verifica a existência; não movimenta pedidos.
SELECT
  to_regprocedure('public.transfer_pickup_to_delivery(uuid)') IS NOT NULL
    AS retira_para_entrega_ok,
  to_regprocedure('public.transfer_delivery_to_pickup(uuid)') IS NOT NULL
    AS entrega_para_retira_ok;

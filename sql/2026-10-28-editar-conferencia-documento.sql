-- BigLogno | Conferência: edição de documento já registrado e sincronização logística.
-- Execute uma vez em Supabase > SQL Editor depois de atualizar o código do GitHub.
-- O script SOMENTE cria/substitui uma função. NÃO migra, apaga ou altera dados existentes.
--
-- A rotina opera na mesma transação sobre Conferência, Entregas e Retiras, mantendo
-- ID e created_at originais. Impede alterações em notas já iniciadas, retiradas,
-- entregues ou modificadas por outro funcionário após a abertura da edição.
-- Chamadas somente via service_role; o backend verifica direito Conferência.

CREATE OR REPLACE FUNCTION public.edit_verification_logistics(
  p_record_id uuid,
  p_expected_verification jsonb,
  p_verification jsonb,
  p_logistics_kind text,
  p_logistics jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_record public.sales_verification_records%ROWTYPE;
  v_delivery public.deliveries%ROWTYPE;
  v_pickup public.pickups%ROWTYPE;
  v_has_delivery boolean;
  v_has_pickup boolean;
  v_original_kind text;
  v_created_at timestamptz;
  v_payload jsonb;
BEGIN
  IF p_logistics_kind IS NULL OR p_logistics_kind NOT IN ('deliveries', 'pickups', 'none') THEN
    RAISE EXCEPTION 'CONFERENCIA_DESTINO_INVALIDO';
  END IF;
  IF p_verification IS NULL OR jsonb_typeof(p_verification) IS DISTINCT FROM 'object'
    OR nullif(trim(p_verification->>'document'), '') IS NULL
    OR p_verification->>'requestId' IS DISTINCT FROM p_record_id::text
    OR p_logistics IS NULL OR jsonb_typeof(p_logistics) IS DISTINCT FROM 'object'
    OR p_logistics->>'source' IS DISTINCT FROM 'conferencia'
    OR p_logistics->>'document' IS DISTINCT FROM p_verification->>'document'
  THEN
    RAISE EXCEPTION 'CONFERENCIA_DADOS_INVALIDOS';
  END IF;

  -- Mesma trava já utilizada pelo registro, conclusão, roteamento e transferências.
  PERFORM pg_advisory_xact_lock(hashtext('bignotto-logistics'));

  SELECT * INTO v_record FROM public.sales_verification_records
    WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONFERENCIA_NAO_ENCONTRADA'; END IF;
  IF v_record.payload IS DISTINCT FROM p_expected_verification THEN
    RAISE EXCEPTION 'CONFERENCIA_MODIFICADA';
  END IF;
  IF v_record.payload->>'source' = 'csv' THEN
    RAISE EXCEPTION 'CONFERENCIA_IMPORTADA';
  END IF;
  IF v_record.payload->>'document' IS DISTINCT FROM p_verification->>'document' THEN
    RAISE EXCEPTION 'CONFERENCIA_DOCUMENTO_NAO_EDITAVEL';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.sales_verification_records
    WHERE id <> p_record_id AND payload->>'document' = p_verification->>'document'
  ) THEN RAISE EXCEPTION 'CONFERENCIA_DOCUMENTO_DUPLICADO'; END IF;

  SELECT * INTO v_delivery FROM public.deliveries WHERE id = p_record_id FOR UPDATE;
  v_has_delivery := FOUND;
  SELECT * INTO v_pickup FROM public.pickups WHERE id = p_record_id FOR UPDATE;
  v_has_pickup := FOUND;
  IF v_has_delivery AND v_has_pickup THEN RAISE EXCEPTION 'CONFERENCIA_VINCULO_DUPLICADO'; END IF;
  IF v_has_delivery THEN
    IF v_delivery.payload->>'source' IS DISTINCT FROM 'conferencia' THEN
      RAISE EXCEPTION 'CONFERENCIA_VINCULO_INVALIDO';
    END IF;
    IF v_delivery.payload->>'status' IS DISTINCT FROM 'nao_iniciada' THEN
      RAISE EXCEPTION 'CONFERENCIA_OPERACAO_INICIADA';
    END IF;
  END IF;
  IF v_has_pickup THEN
    IF v_pickup.payload->>'source' IS DISTINCT FROM 'conferencia' THEN
      RAISE EXCEPTION 'CONFERENCIA_VINCULO_INVALIDO';
    END IF;
    IF v_pickup.payload->>'status' IS DISTINCT FROM 'pendente' THEN
      RAISE EXCEPTION 'CONFERENCIA_OPERACAO_INICIADA';
    END IF;
  END IF;

  v_original_kind := CASE WHEN v_has_delivery THEN 'deliveries'
    WHEN v_has_pickup THEN 'pickups' ELSE 'none' END;
  v_created_at := CASE WHEN v_has_delivery THEN v_delivery.created_at
    WHEN v_has_pickup THEN v_pickup.created_at ELSE v_record.created_at END;

  -- Quando o destino permanece o mesmo, preserva turno, posição, situação
  -- e demais propriedades já adicionadas na Expedição.
  IF p_logistics_kind = v_original_kind AND p_logistics_kind = 'deliveries' THEN
    UPDATE public.deliveries
      SET payload = v_delivery.payload || jsonb_build_object(
        'document', p_verification->>'document',
        'company', p_verification->>'clientName',
        'companyCode', p_verification->>'clientCode',
        'value', p_verification->'value',
        'channel', p_verification->>'channel')
      WHERE id = p_record_id;
  ELSIF p_logistics_kind = v_original_kind AND p_logistics_kind = 'pickups' THEN
    UPDATE public.pickups
      SET payload = v_pickup.payload || jsonb_build_object(
        'document', p_verification->>'document',
        'company', p_verification->>'clientName',
        'companyCode', p_verification->>'clientCode',
        'value', p_verification->'value',
        'channel', p_verification->>'channel')
      WHERE id = p_record_id;
  ELSE
    -- Alteração de destino (Entrega, Retira ou só Conferência).
    -- Exclusão/entrada dos vínculos ocorre na mesma transação.
    IF v_has_delivery THEN DELETE FROM public.deliveries WHERE id = p_record_id; END IF;
    IF v_has_pickup THEN DELETE FROM public.pickups WHERE id = p_record_id; END IF;
    IF p_logistics_kind = 'deliveries' THEN
      v_payload := p_logistics || jsonb_build_object('status', 'nao_iniciada');
      INSERT INTO public.deliveries(id, created_at, position, payload)
        VALUES(p_record_id, v_created_at, extract(epoch FROM clock_timestamp()), v_payload);
    ELSIF p_logistics_kind = 'pickups' THEN
      v_payload := p_logistics || jsonb_build_object('status', 'pendente');
      INSERT INTO public.pickups(id, created_at, payload)
        VALUES(p_record_id, v_created_at, v_payload);
    END IF;
  END IF;

  -- A nota mantém o ID e a data de criação original. A alteração do operador
  -- aparece em todas as consultas que leem esta mesma linha.
  UPDATE public.sales_verification_records
    SET payload = p_verification
    WHERE id = p_record_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.edit_verification_logistics(uuid,jsonb,jsonb,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edit_verification_logistics(uuid,jsonb,jsonb,text,jsonb)
  TO service_role;
NOTIFY pgrst, 'reload schema';

-- Confirmação apenas, não altera dados.
SELECT to_regprocedure('public.edit_verification_logistics(uuid,jsonb,jsonb,text,jsonb)') IS NOT NULL
  AS editar_conferencia_ok;

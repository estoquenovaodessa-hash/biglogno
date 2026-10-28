-- BigLogno | Correção definitiva da edição de COLETAS na Expedição
-- Executar uma vez no Supabase > SQL Editor, vinculado ao projeto BigLogno.
-- Seguro para reexecução: apenas cria/substitui a função de edição.
-- NÃO altera pedidos, notas, empresas, histórico, RLS ou tabelas existentes.
--
-- A rotina geral commit_logistics_changes confere toda a fila de Entregas;
-- para editar apenas uma coleta isso pode gerar conflitos falsos.
-- Esta função compara SOMENTE o registro solicitado, sob a MESMA trava global
-- já usada em Entregas/Retiras, e não permite alterar dados de operação.
--
-- A chamada é restrita ao service_role. O servidor do BigLogno valida
-- separadamente o direito individual "Expedição" antes de executar o RPC.

CREATE OR REPLACE FUNCTION public.update_expedition_collection(
  p_id uuid,
  p_expected_payload jsonb,
  p_next_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current jsonb;
BEGIN
  -- Compartilha a trava com o início/fim das viagens e transferências.
  PERFORM pg_advisory_xact_lock(hashtext('bignotto-logistics'));

  SELECT d.payload INTO v_current
  FROM public.deliveries AS d
  WHERE d.id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COLETA_NAO_ENCONTRADA';
  END IF;

  IF v_current->>'source' IS DISTINCT FROM 'coleta' THEN
    RAISE EXCEPTION 'COLETA_TIPO_INVALIDO';
  END IF;

  IF v_current->>'status' IS DISTINCT FROM 'nao_iniciada' THEN
    RAISE EXCEPTION 'COLETA_JA_INICIADA';
  END IF;

  -- Conflito real: só a coleta selecionada foi alterada após a leitura.
  IF v_current IS DISTINCT FROM p_expected_payload THEN
    RAISE EXCEPTION 'COLETA_CONFLITO';
  END IF;

  IF p_next_payload IS NULL OR jsonb_typeof(p_next_payload) <> 'object'
     OR p_next_payload->>'source' IS DISTINCT FROM 'coleta'
     OR p_next_payload->>'status' IS DISTINCT FROM 'nao_iniciada'
  THEN
    RAISE EXCEPTION 'COLETA_DADOS_INVALIDOS';
  END IF;

  -- Somente os campos de cadastro podem mudar. Campos da viagem, motorista,
  -- posicionamento, status e histórico permanecem imutáveis nesta função.
  IF (v_current
        - 'company' - 'collectionCompanyId' - 'collectionAddress'
        - 'collectionContact' - 'value' - 'collectionValueProvided'
        - 'collectionTransport' - 'collectionPayment'
        - 'scheduledDate' - 'expeditionShift')
     IS DISTINCT FROM
     (p_next_payload
        - 'company' - 'collectionCompanyId' - 'collectionAddress'
        - 'collectionContact' - 'value' - 'collectionValueProvided'
        - 'collectionTransport' - 'collectionPayment'
        - 'scheduledDate' - 'expeditionShift')
  THEN
    RAISE EXCEPTION 'COLETA_CAMPOS_PROTEGIDOS';
  END IF;

  IF jsonb_typeof(p_next_payload->'value') IS DISTINCT FROM 'number'
    OR p_next_payload->>'collectionTransport' NOT IN ('moto', 'carro')
    OR p_next_payload->>'collectionPayment' NOT IN ('dinheiro', 'faturado')
    OR NULLIF(btrim(p_next_payload->>'company'), '') IS NULL
  THEN
    RAISE EXCEPTION 'COLETA_DADOS_INVALIDOS';
  END IF;

  UPDATE public.deliveries
  SET payload = p_next_payload
  WHERE id = p_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.update_expedition_collection(uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_expedition_collection(uuid, jsonb, jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';

-- Apenas confirma a instalação; não edita nenhum pedido.
SELECT
  to_regprocedure('public.update_expedition_collection(uuid,jsonb,jsonb)') IS NOT NULL
    AS edicao_coleta_ok;

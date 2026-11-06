-- BigLogno | CORREÇÃO ÚNICA da fase de Logística Reversa (06/11/2026)
--
-- Situação constatada: a "coleta de itens" era SEPARAÇÃO INTERNA.
-- O fornecedor ainda NÃO retirou os materiais e a tratativa não começou.
--
-- Para ciclos cuja separação foi finalizada (payload.status="finalizado"),
-- o estágio adequado é payload.treatmentStatus="em_tratativa".
-- Ciclos com separação ainda aberta permanecem "em_contagem".
--
-- PRESERVA id, numero, criacao, grupos, itens, quantidades, fornecedor,
-- marca, finishedAt e o status de separacao (aberto/finalizado).
--
-- REINICIA apenas informações posteriores à separação: os quatro passos
-- do contato, dados de NFDev, volumes, coleta externa e resolução.
--
-- Faz cópia de segurança ANTES de alterar registros.
-- Execução única. Não rode novamente depois que novas tratativas começarem.
-- Abrir no Supabase > SQL Editor > New query > Run.
BEGIN;

LOCK TABLE public.reverse_logistics_cycles IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS public.reverse_logistics_stage_reset_backup_20261106 (
  id uuid PRIMARY KEY,
  number bigint NOT NULL,
  version integer NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reverse_logistics_stage_reset_backup_20261106 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reverse_logistics_stage_reset_backup_20261106
  FROM PUBLIC, anon, authenticated;

-- Impede uma segunda execução acidental (e a perda de etapas futuras).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.reverse_logistics_stage_reset_backup_20261106) THEN
    RAISE EXCEPTION
      'A correção já foi executada. Não repita o reset. Consulte o backup 20261106.';
  END IF;
END;
$$;

INSERT INTO public.reverse_logistics_stage_reset_backup_20261106
  (id, number, version, payload, updated_at)
SELECT id, number, version, payload, updated_at
FROM public.reverse_logistics_cycles;

-- Remove marcos posteriores à separação interna, sem tocar em itens ou
-- quantidade, nem no estado de separação que libera as tratativas.
WITH reset_rows AS (
  SELECT
    id,
    CASE
      WHEN payload->>'status' = 'finalizado' THEN
        jsonb_set(
          payload - 'treatmentStatus' - 'contactSteps' - 'contactStartedAt'
                  - 'nfd' - 'volumes' - 'returnMode' - 'returnNfe'
                  - 'statusChangedAt',
          '{treatmentStatus}', '"em_tratativa"'::jsonb, true
        )
      ELSE
        payload - 'treatmentStatus' - 'contactSteps' - 'contactStartedAt'
                - 'nfd' - 'volumes' - 'returnMode' - 'returnNfe'
                - 'statusChangedAt'
    END AS updated_payload
  FROM public.reverse_logistics_cycles
)
UPDATE public.reverse_logistics_cycles AS c
SET payload = r.updated_payload,
    version = c.version + 1,
    updated_at = now()
FROM reset_rows AS r
WHERE c.id = r.id;

-- Validação na mesma transação: apresenta totais reais após a correção.
SELECT
  count(*) AS total_de_ciclos,
  count(*) FILTER (
    WHERE payload->>'status' = 'finalizado'
      AND payload->>'treatmentStatus' = 'em_tratativa'
  ) AS separacao_concluida_em_tratativas,
  count(*) FILTER (WHERE payload->>'status' = 'aberto') AS separacao_ainda_aberta,
  count(*) FILTER (WHERE payload->>'treatmentStatus' IN (
    'aguardando_coleta','coletado','resolvido','devolvido'
  )) AS indevidamente_em_etapas_posteriores
FROM public.reverse_logistics_cycles;

COMMIT;

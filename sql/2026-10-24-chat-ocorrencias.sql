-- BigLogno — Chat de Ocorrências de Estoque
-- Execute uma única vez no Supabase > SQL Editor, no projeto que hospeda o BigLogno.
-- Esta migração não apaga nem substitui tabelas ou dados existentes.
CREATE TABLE IF NOT EXISTS public.item_chat_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL CHECK (codigo ~ '^[0-9]{5}$'),
  descricao text NOT NULL,
  endereco text NOT NULL DEFAULT '',
  motivo text NOT NULL,
  criado_por_id uuid NOT NULL,
  criado_por_nome text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  resolvido_por_id uuid,
  resolvido_por_nome text,
  resolvido_em timestamptz
);

CREATE INDEX IF NOT EXISTS item_chat_occurrences_criado_em_idx
  ON public.item_chat_occurrences (criado_em DESC);

-- Somente o serviço do backend utiliza essa tabela. O navegador nunca recebe a service role key.
ALTER TABLE public.item_chat_occurrences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.item_chat_occurrences FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.item_chat_occurrences TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_item_chat_occurrence(
  occurrence_id uuid,
  resolver_id uuid,
  resolver_name text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  issue public.item_chat_occurrences%ROWTYPE;
  original jsonb;
  zone jsonb;
  old_row jsonb;
  new_row jsonb;
  updated_zone jsonb;
  conf jsonb;
  d text;
  h text;
BEGIN
  IF resolver_name IS NULL OR btrim(resolver_name) = '' THEN
    RAISE EXCEPTION 'Funcionário não informado';
  END IF;

  UPDATE public.item_chat_occurrences
    SET resolvido_em = now(), resolvido_por_id = resolver_id, resolvido_por_nome = resolver_name
    WHERE id = occurrence_id AND resolvido_em IS NULL
    RETURNING * INTO issue;
  IF NOT FOUND THEN RETURN false; END IF;

  -- A atualização e a Zona Segura são uma única transação, sem resolução parcial.
  INSERT INTO public.app_state(key, value, updated_at)
    VALUES ('zona-segura', '[]'::jsonb, now())
    ON CONFLICT (key) DO NOTHING;
  SELECT value INTO original FROM public.app_state WHERE key = 'zona-segura' FOR UPDATE;
  IF jsonb_typeof(original) <> 'array' THEN
    RAISE EXCEPTION 'A Zona Segura não possui um formato válido';
  END IF;

  SELECT v.value INTO old_row
    FROM jsonb_array_elements(original) AS v(value)
    WHERE v.value->>'codigo' = issue.codigo LIMIT 1;

  d := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY');
  h := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI');
  new_row := jsonb_build_object(
    'codigo', issue.codigo, 'descricao', issue.descricao, 'endereco', issue.endereco,
    'bloco', '', 'rua', '', 'curvaOperacional', '', 'categoriaOriginal', 'Chat',
    'tipoErro', issue.motivo, 'estoqueNaCorrecao', 0,
    'quantidadeMovimentadaNaCorrecao', 0, 'acaoRealizada', 'Ocorrência resolvida no Chat',
    'status', 'Divergente', 'motivo', 'Divergente', 'observacao', 'Chat',
    'dataCorrecao', d, 'horaCorrecao', h,
    'dataImportacaoOriginal', d, 'importacaoId', '',
    'quantidadeCorrecoes', 1, 'quantidadeReincidencias', 0,
    'ultimaReincidencia', null
  );
  IF old_row IS NOT NULL THEN
    new_row := old_row || new_row || jsonb_build_object(
      'quantidadeCorrecoes', COALESCE(
        CASE WHEN old_row->>'quantidadeCorrecoes' ~ '^[0-9]+$'
          THEN (old_row->>'quantidadeCorrecoes')::integer ELSE 0 END, 0) + 1,
      'descricao', COALESCE(NULLIF(issue.descricao, ''), old_row->>'descricao', ''),
      'endereco', COALESCE(NULLIF(issue.endereco, ''), old_row->>'endereco', '')
    );
  END IF;

  SELECT COALESCE(jsonb_agg(v.value ORDER BY v.ordinality), '[]'::jsonb) INTO updated_zone
    FROM jsonb_array_elements(original) WITH ORDINALITY AS v(value, ordinality)
    WHERE v.value->>'codigo' IS DISTINCT FROM issue.codigo;
  zone := updated_zone || jsonb_build_array(new_row);
  UPDATE public.app_state SET value = zone, updated_at = now() WHERE key = 'zona-segura';

  -- Alimenta também o índice de acuracidade da Zona Segura, sem zerar outros produtos.
  INSERT INTO public.app_state(key, value, updated_at)
    VALUES ('conferencia', '{}'::jsonb, now())
    ON CONFLICT (key) DO NOTHING;
  SELECT value INTO conf FROM public.app_state WHERE key = 'conferencia' FOR UPDATE;
  IF jsonb_typeof(conf) <> 'object' THEN
    RAISE EXCEPTION 'A conferência não possui um formato válido';
  END IF;
  UPDATE public.app_state
    SET value = jsonb_set(conf, ARRAY[issue.codigo], jsonb_build_object(
      'status', 'Divergente', 'motivo', 'Divergente',
      'observacao', 'Chat', 'atualizadoEm', now()::text
    ), true), updated_at = now()
    WHERE key = 'conferencia';
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_item_chat_occurrence(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_item_chat_occurrence(uuid,uuid,text) TO service_role;

-- Atualiza o catálogo de funções do PostgREST (Supabase API).
NOTIFY pgrst, 'reload schema';

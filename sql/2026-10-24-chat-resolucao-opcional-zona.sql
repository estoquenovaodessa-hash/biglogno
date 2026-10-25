-- BigLogno — escolha Sim/Não ao resolver ocorrência no Chat.
-- Executar uma única vez no Supabase > SQL Editor, DEPOIS do SQL original do Chat.
-- Preserva todas as ocorrências e toda a Zona Segura; não exclui registros.

ALTER TABLE public.item_chat_occurrences
  ADD COLUMN IF NOT EXISTS enviado_zona_segura boolean;

-- Pela regra anterior, todas as ocorrências já resolvidas eram
-- automaticamente encaminhadas à Zona Segura.
UPDATE public.item_chat_occurrences
SET enviado_zona_segura = true
WHERE resolvido_em IS NOT NULL AND enviado_zona_segura IS NULL;

-- Uma rotina atômica: o resultado só será "Resolvido" se o caminho
-- selecionado pelo operador for concluído.
-- Sim = aproveita a rotina existente, que registra Zona Segura + Divergente.
-- Não = encerra somente no Chat, sem tocar em zona-segura ou conferencia.
CREATE OR REPLACE FUNCTION public.resolve_item_chat_occurrence_v2(
  occurrence_id uuid,
  resolver_id uuid,
  resolver_name text,
  send_to_safe_zone boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  done boolean := false;
BEGIN
  IF send_to_safe_zone IS NULL THEN
    RAISE EXCEPTION 'Informe se o item deve seguir para a Zona Segura';
  END IF;
  IF resolver_id IS NULL OR resolver_name IS NULL OR btrim(resolver_name) = '' THEN
    RAISE EXCEPTION 'Funcionário não informado';
  END IF;

  IF send_to_safe_zone THEN
    -- A rotina antiga atualiza ocorrência, Zona Segura e acuracidade
    -- em uma única transação. Qualquer falha reverte TUDO.
    SELECT public.resolve_item_chat_occurrence(
      occurrence_id, resolver_id, resolver_name
    ) INTO done;

    IF done THEN
      UPDATE public.item_chat_occurrences
      SET enviado_zona_segura = true
      WHERE id = occurrence_id;
    END IF;
  ELSE
    -- Condição evita que duas pessoas resolvam o mesmo chamado.
    UPDATE public.item_chat_occurrences
      SET resolvido_em = now(),
          resolvido_por_id = resolver_id,
          resolvido_por_nome = resolver_name,
          enviado_zona_segura = false
      WHERE id = occurrence_id AND resolvido_em IS NULL
      RETURNING true INTO done;
  END IF;

  RETURN COALESCE(done, false);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_item_chat_occurrence_v2(uuid,uuid,text,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_item_chat_occurrence_v2(uuid,uuid,text,boolean)
  TO service_role;

-- Expõe nova coluna e função para o backend Supabase.
NOTIFY pgrst, 'reload schema';

-- VALIDAÇÃO (também pode executar separadamente):
SELECT
  (SELECT COUNT(*) = 1 FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'item_chat_occurrences'
     AND column_name = 'enviado_zona_segura') AS coluna_ok,
  to_regprocedure(
    'public.resolve_item_chat_occurrence_v2(uuid,uuid,text,boolean)'
  ) IS NOT NULL AS funcao_ok,
  COALESCE(has_function_privilege(
    'service_role',
    to_regprocedure('public.resolve_item_chat_occurrence_v2(uuid,uuid,text,boolean)'),
    'EXECUTE'
  ), false) AS permissao_ok;

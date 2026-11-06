-- BigLogno | RESTAURAÇÃO das fases (uso excepcional).
-- Execute somente se o reset de 06/11/2026 precisar ser revertido.
-- Não sobrescreve um ciclo que foi editado DEPOIS do reset:
-- valida se a versão atual é exatamente (versão do backup + 1).
BEGIN;
LOCK TABLE public.reverse_logistics_cycles IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF to_regclass('public.reverse_logistics_stage_reset_backup_20261106') IS NULL THEN
    RAISE EXCEPTION 'Backup do reset não localizado.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.reverse_logistics_stage_reset_backup_20261106 b
    JOIN public.reverse_logistics_cycles c ON c.id=b.id
    WHERE c.version <> b.version + 1
  ) THEN
    RAISE EXCEPTION 'Há ciclos editados após o reset; restauração automática cancelada para evitar perda de dados.';
  END IF;
END;
$$;
UPDATE public.reverse_logistics_cycles AS c
SET payload=b.payload,
    version=c.version+1,
    updated_at=now()
FROM public.reverse_logistics_stage_reset_backup_20261106 b
WHERE c.id=b.id
  AND c.version=b.version+1;
COMMIT;

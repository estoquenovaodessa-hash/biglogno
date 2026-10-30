-- BigLogno: passagem automática e idempotente de turnos para Entregas e Coletas.
-- Execute no Supabase > SQL Editor do projeto BigLogno, uma única vez.
-- Horário: America/Sao_Paulo. 12h31 = TARDE; 17h31 = MANHÃ do próximo dia.
-- Executa a cada minuto via pg_cron e também sob demanda pelo backend.
-- Somente linhas NÃO finalizadas, com expeditionShift "manha" ou "tarde".
-- Mantém notas, grupos, motoristas, GPS, timestamps e entregas concluídas.
-- "Retira" não possui turno; portanto não é alterada.
-- Coletas agendadas para datas futuras são respeitadas até chegar o dia.

BEGIN;
CREATE OR REPLACE FUNCTION public.rollover_logistics_shifts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamp := clock_timestamp() AT TIME ZONE 'America/Sao_Paulo';
  v_today date;
  v_clock time;
  v_count integer := 0;
BEGIN
  v_today := v_now::date;
  v_clock := v_now::time;
  -- Mesma trava das ações de entrega, coleta e transferência de Expedição.
  PERFORM pg_advisory_xact_lock(hashtext('bignotto-logistics'));

  WITH pending AS (
    SELECT d.id, d.payload, d.created_at,
      CASE
        WHEN d.payload->>'source' = 'coleta'
          AND d.payload->>'scheduledDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          THEN (d.payload->>'scheduledDate')::date
        WHEN d.payload->>'expeditionShiftDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          THEN (d.payload->>'expeditionShiftDate')::date
        ELSE (d.created_at AT TIME ZONE 'America/Sao_Paulo')::date
      END AS base_day
    FROM public.deliveries d
    WHERE d.payload->>'status' <> 'finalizada'
      AND d.payload->>'expeditionShift' IN ('manha', 'tarde')
  ),
  decisions AS (
    SELECT p.id, p.payload, p.base_day,
      CASE
        WHEN p.base_day < v_today THEN
          CASE WHEN v_clock >= TIME '17:31' THEN 'manha'
               WHEN v_clock >= TIME '12:31' THEN 'tarde' ELSE 'manha' END
        WHEN v_clock >= TIME '17:31' THEN 'manha'
        WHEN v_clock >= TIME '12:31' AND p.payload->>'expeditionShift' = 'manha'
          THEN 'tarde'
        ELSE p.payload->>'expeditionShift'
      END AS target_shift,
      CASE
        WHEN p.base_day < v_today OR v_clock >= TIME '17:31' THEN
          CASE WHEN v_clock >= TIME '17:31' THEN v_today + 1 ELSE v_today END
        ELSE p.base_day
      END AS target_day
    FROM pending p
    WHERE p.base_day <= v_today
  )
  UPDATE public.deliveries d SET payload =
    jsonb_set(
      jsonb_set(
        jsonb_set(d.payload, '{expeditionShift}', to_jsonb(decisions.target_shift), true),
        '{expeditionShiftDate}', to_jsonb(to_char(decisions.target_day, 'YYYY-MM-DD')), true
      ),
      '{expeditionShiftMovedAt}', to_jsonb(clock_timestamp()::text), true
    )
    || CASE WHEN d.payload->>'source' = 'coleta'
      AND (d.payload ? 'scheduledDate' OR decisions.target_day <> decisions.base_day)
      THEN jsonb_build_object('scheduledDate', to_char(decisions.target_day, 'YYYY-MM-DD'))
      ELSE '{}'::jsonb END
  FROM decisions
  WHERE d.id = decisions.id
    AND (d.payload->>'expeditionShift' IS DISTINCT FROM decisions.target_shift
      OR decisions.base_day IS DISTINCT FROM decisions.target_day);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.rollover_logistics_shifts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollover_logistics_shifts() TO service_role;
COMMIT;

-- Exige a extensão pg_cron habilitada no projeto Supabase.
-- Rode no SQL Editor com permissões de administrador do banco.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule(
  'biglogno-rollover-turnos',
  '* * * * *',
  'SELECT public.rollover_logistics_shifts();'
);
-- Executa uma vez também agora, para corrigir os turnos vencidos.
SELECT public.rollover_logistics_shifts() AS registros_transferidos_agora;
SELECT jobid, jobname, schedule, active FROM cron.job
WHERE jobname = 'biglogno-rollover-turnos';

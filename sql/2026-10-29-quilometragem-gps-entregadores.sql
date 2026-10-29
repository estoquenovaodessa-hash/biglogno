-- BigLogno | GPS: quilometragem por entregador, dia/semana/mês.
-- Execute UMA VEZ no Supabase > SQL Editor depois de publicar o código.
-- Não modifica pedidos existentes. Coleta dados apenas a partir da ativação
-- e da autorização de localização no navegador do entregador.
-- NÃO armazena coordenadas: somente distância entre leituras válidas do GPS.
--
-- Limitações: navegador deve permanecer aberto/ativo, HTTPS, permissão GPS.
-- Distância aproximada, não hodômetro nem reconstrução de trajetos antigos.

CREATE TABLE IF NOT EXISTS public.delivery_gps_distance_events (
  id uuid PRIMARY KEY,
  employee_id uuid NOT NULL,
  delivery_id uuid NOT NULL,
  session_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  distance_m numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_gps_distance_bounds CHECK (distance_m >= 5 AND distance_m <= 1000),
  CONSTRAINT delivery_gps_distance_time_order CHECK (finished_at > started_at)
);
CREATE INDEX IF NOT EXISTS delivery_gps_events_employee_date_idx
  ON public.delivery_gps_distance_events (employee_id, finished_at DESC);
CREATE INDEX IF NOT EXISTS delivery_gps_events_date_idx
  ON public.delivery_gps_distance_events (finished_at DESC);
ALTER TABLE public.delivery_gps_distance_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.delivery_gps_distance_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.delivery_gps_distance_events TO service_role;

-- API recebe apenas incrementos calculados pelo GPS no navegador do
-- operador; o servidor garante que o pedido ainda está em rota para ele.
-- UUID do evento torna repetição da requisição idempotente.
CREATE OR REPLACE FUNCTION public.record_delivery_gps_distance(
  p_event_id uuid,
  p_employee_id uuid,
  p_delivery_id uuid,
  p_session_id uuid,
  p_started_at timestamptz,
  p_finished_at timestamptz,
  p_distance_m numeric
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_payload jsonb;
  v_seconds double precision;
BEGIN
  -- Dados inválidos nunca entram no relatório.
  v_seconds := extract(epoch FROM (p_finished_at - p_started_at));
  IF p_event_id IS NULL OR p_employee_id IS NULL OR p_delivery_id IS NULL
     OR p_session_id IS NULL OR p_started_at IS NULL OR p_finished_at IS NULL
     OR p_distance_m IS NULL
     OR v_seconds < 3 OR v_seconds > 180
     OR p_distance_m < 5 OR p_distance_m > 1000
     OR p_distance_m / v_seconds > 38.9  -- 140 km/h, limite plausível
     OR p_finished_at > now() + interval '3 minutes'
     OR p_finished_at < now() - interval '3 minutes'
  THEN
    RAISE EXCEPTION 'GPS_DADOS_INVALIDOS';
  END IF;

  SELECT payload INTO v_payload
    FROM public.deliveries WHERE id = p_delivery_id FOR SHARE;
  IF NOT FOUND OR v_payload->>'status' <> 'em_rota'
     OR v_payload->>'driverEmployeeId' IS DISTINCT FROM p_employee_id::text
  THEN
    RAISE EXCEPTION 'GPS_OPERACAO_NAO_ATIVA';
  END IF;

  INSERT INTO public.delivery_gps_distance_events(
    id, employee_id, delivery_id, session_id, started_at, finished_at, distance_m
  ) VALUES (
    p_event_id, p_employee_id, p_delivery_id, p_session_id,
    p_started_at, p_finished_at, p_distance_m
  ) ON CONFLICT (id) DO NOTHING;
  RETURN TRUE;
END;
$$;

-- Agregação por dias CIVIS em São Paulo e semana iniciada na segunda-feira.
-- Sem registro GPS => sem dados, nunca um zero fictício.
CREATE OR REPLACE FUNCTION public.delivery_gps_distance_report(
  p_reference_date date,
  p_period text
)
RETURNS TABLE (
  employee_id uuid,
  distance_m numeric,
  segments bigint,
  first_at timestamptz,
  last_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_first date;
  v_last date;
BEGIN
  IF p_reference_date IS NULL OR p_period NOT IN ('day', 'week', 'month') THEN
    RAISE EXCEPTION 'GPS_PERIODO_INVALIDO';
  END IF;
  v_first := CASE p_period
    WHEN 'day' THEN p_reference_date
    WHEN 'week' THEN date_trunc('week', p_reference_date::timestamp)::date
    ELSE date_trunc('month', p_reference_date::timestamp)::date
  END;
  v_last := CASE p_period
    WHEN 'day' THEN v_first + 1
    WHEN 'week' THEN v_first + 7
    ELSE (v_first + interval '1 month')::date
  END;

  RETURN QUERY
    SELECT p.employee_id, sum(p.distance_m) AS distance_m,
           count(*) AS segments, min(p.started_at) AS first_at,
           max(p.finished_at) AS last_at
    FROM public.delivery_gps_distance_events AS p
    WHERE p.finished_at >= (v_first::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND p.finished_at < (v_last::timestamp AT TIME ZONE 'America/Sao_Paulo')
    GROUP BY p.employee_id ORDER BY sum(p.distance_m) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.record_delivery_gps_distance(
  uuid,uuid,uuid,uuid,timestamptz,timestamptz,numeric
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_delivery_gps_distance(
  uuid,uuid,uuid,uuid,timestamptz,timestamptz,numeric
) TO service_role;

REVOKE ALL ON FUNCTION public.delivery_gps_distance_report(date,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_gps_distance_report(date,text) TO service_role;

NOTIFY pgrst, 'reload schema';

SELECT to_regprocedure('public.record_delivery_gps_distance(uuid,uuid,uuid,uuid,timestamptz,timestamptz,numeric)') IS NOT NULL
    AS gps_registro_ok,
  to_regprocedure('public.delivery_gps_distance_report(date,text)') IS NOT NULL
    AS gps_relatorio_ok;

-- BigLogno · Interação divertida Gestor ↔ Operador
-- Execute uma única vez no Supabase SQL Editor. Não altera tabelas operacionais.
CREATE TABLE IF NOT EXISTS public.friendly_presence (
  client_id uuid PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('gestor', 'operador')),
  employee_id uuid NOT NULL,
  display_name text NOT NULL,
  area text NOT NULL CHECK (area IN ('Contagem', 'Conferência', 'Entregas', 'Fora')),
  last_seen timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS friendly_presence_lookup_idx
  ON public.friendly_presence (role, area, last_seen DESC);

CREATE TABLE IF NOT EXISTS public.friendly_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('peek', 'ping')),
  area text NOT NULL CHECK (area IN ('Contagem', 'Conferência', 'Entregas')),
  actor_name text NOT NULL,
  from_client_id uuid NOT NULL,
  target_client_id uuid NOT NULL,
  source_event_id uuid UNIQUE REFERENCES public.friendly_events (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS friendly_events_target_idx
  ON public.friendly_events (target_client_id, created_at DESC);

ALTER TABLE public.friendly_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendly_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.friendly_presence FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.friendly_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendly_presence TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendly_events TO service_role;

NOTIFY pgrst, 'reload schema';

-- Validação estrutural:
SELECT
  to_regclass('public.friendly_presence') IS NOT NULL AS presenca_ok,
  to_regclass('public.friendly_events') IS NOT NULL AS eventos_ok,
  COALESCE(has_table_privilege('service_role', 'public.friendly_presence', 'INSERT'), false) AS gravacao_presenca_ok,
  COALESCE(has_table_privilege('service_role', 'public.friendly_events', 'INSERT'), false) AS gravacao_eventos_ok;

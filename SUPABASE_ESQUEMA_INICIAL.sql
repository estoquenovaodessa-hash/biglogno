-- BIGLOGNO - esquema INICIAL para um projeto Supabase NOVO e VAZIO.
-- NÃO rode se tabelas/dados do aplicativo já existirem.
-- Execute inteiro no Supabase SQL Editor após fazer backup; a transação impede migração parcial.
BEGIN;

-- supabase/migrations/20260703141528_cccf9e00-b8b9-4287-95a2-7a07261ba38f.sql
CREATE TABLE public.app_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_state TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_state TO authenticated;
GRANT ALL ON public.app_state TO service_role;

ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app_state" ON public.app_state FOR SELECT USING (true);
CREATE POLICY "Anyone can insert app_state" ON public.app_state FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update app_state" ON public.app_state FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete app_state" ON public.app_state FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.app_state;

-- drizzle/migrations/0000_protect_shared_access.sql
CREATE TABLE public.access_attempts (fingerprint text PRIMARY KEY, attempts integer NOT NULL DEFAULT 1, window_start timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.access_attempts TO service_role;
ALTER TABLE public.access_attempts ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.allow_access_attempt(fingerprint text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE attempt_count integer;
BEGIN
  INSERT INTO public.access_attempts AS a (fingerprint, attempts, window_start) VALUES (fingerprint, 1, now())
  ON CONFLICT ON CONSTRAINT access_attempts_pkey DO UPDATE SET
    attempts = CASE WHEN a.window_start < now() - interval '15 minutes' THEN 1 ELSE a.attempts + 1 END,
    window_start = CASE WHEN a.window_start < now() - interval '15 minutes' THEN now() ELSE a.window_start END
  RETURNING attempts INTO attempt_count;
  RETURN attempt_count <= 10;
END;
$$;
REVOKE ALL ON FUNCTION public.allow_access_attempt(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allow_access_attempt(text) TO service_role;
ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can update app_state" ON public.app_state;
DROP POLICY IF EXISTS "Anyone can read app_state" ON public.app_state;
DROP POLICY IF EXISTS "Anyone can insert app_state" ON public.app_state;
DROP POLICY IF EXISTS "Anyone can delete app_state" ON public.app_state;
REVOKE ALL ON public.app_state FROM anon, authenticated;
GRANT ALL ON public.app_state TO service_role;

-- drizzle/migrations/0001_sales_verification_records.sql
CREATE TABLE public.sales_verification_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT ALL ON public.sales_verification_records TO service_role;
ALTER TABLE public.sales_verification_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX sales_verification_created_idx ON public.sales_verification_records (created_at DESC);

-- drizzle/migrations/0002_create_deliveries.sql
CREATE TABLE public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  position double precision NOT NULL DEFAULT extract(epoch from now()),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT ALL ON public.deliveries TO service_role;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

-- drizzle/migrations/0003_logistics_pickups_atomic_actions.sql
CREATE TABLE public.pickups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL);
GRANT ALL ON public.pickups TO service_role;
ALTER TABLE public.pickups ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.commit_logistics_changes(kind text, expected jsonb, changes jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; current_payload jsonb;
BEGIN
 IF kind NOT IN ('deliveries','pickups') THEN RAISE EXCEPTION 'Invalid kind'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('bignotto-logistics'));
 FOR r IN SELECT * FROM jsonb_array_elements(expected) LOOP
  IF kind = 'deliveries' THEN SELECT payload INTO current_payload FROM public.deliveries WHERE id=(r->>'id')::uuid FOR UPDATE;
  ELSE SELECT payload INTO current_payload FROM public.pickups WHERE id=(r->>'id')::uuid FOR UPDATE; END IF;
  IF current_payload IS DISTINCT FROM r->'payload' THEN RAISE EXCEPTION 'Dados atualizados por outro dispositivo. Atualize e tente novamente.'; END IF;
 END LOOP;
 IF kind='deliveries' AND (SELECT count(*) FROM public.deliveries) <> jsonb_array_length(expected) THEN RAISE EXCEPTION 'Fila alterada. Atualize e tente novamente.'; END IF;
 FOR r IN SELECT * FROM jsonb_array_elements(changes) LOOP
  IF kind='deliveries' THEN UPDATE public.deliveries SET payload=r->'payload', position=COALESCE((r->>'position')::double precision,position) WHERE id=(r->>'id')::uuid;
  ELSE UPDATE public.pickups SET payload=r->'payload' WHERE id=(r->>'id')::uuid; END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.commit_logistics_changes(text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_logistics_changes(text,jsonb,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.register_verification_logistics(record_id uuid, verification jsonb, logistics_kind text, logistics jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('bignotto-logistics'));
 IF EXISTS(SELECT 1 FROM public.sales_verification_records WHERE payload->>'document'=verification->>'document' AND id<>record_id) THEN RAISE EXCEPTION 'Documento já foi registrado.'; END IF;
 INSERT INTO public.sales_verification_records(id,payload) VALUES(record_id,verification) ON CONFLICT(id) DO NOTHING;
 IF logistics_kind='deliveries' THEN INSERT INTO public.deliveries(id,position,payload) VALUES(record_id,extract(epoch FROM now()),logistics) ON CONFLICT(id) DO NOTHING;
 ELSIF logistics_kind='pickups' THEN INSERT INTO public.pickups(id,payload) VALUES(record_id,logistics) ON CONFLICT(id) DO NOTHING;
 ELSIF logistics_kind <> 'none' THEN RAISE EXCEPTION 'Invalid kind'; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.register_verification_logistics(uuid,jsonb,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_verification_logistics(uuid,jsonb,text,jsonb) TO service_role;

COMMIT;

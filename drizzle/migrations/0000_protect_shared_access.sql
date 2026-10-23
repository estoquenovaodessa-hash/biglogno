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
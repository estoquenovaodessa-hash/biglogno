CREATE TABLE public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  position double precision NOT NULL DEFAULT extract(epoch from now()),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT ALL ON public.deliveries TO service_role;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
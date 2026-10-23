CREATE TABLE public.sales_verification_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT ALL ON public.sales_verification_records TO service_role;
ALTER TABLE public.sales_verification_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX sales_verification_created_idx ON public.sales_verification_records (created_at DESC);
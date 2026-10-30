-- BigLogno: módulo de Logística Reversa - execução no SQL Editor do Supabase.
-- Novo cadastro isolado, não altera Contagem, estoque, Entregas ou Expedição.
-- Numeração automática sequencial, mesmo com dois operadores criando ao mesmo tempo.
BEGIN;
CREATE TABLE IF NOT EXISTS public.reverse_logistics_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reverse_logistics_cycles_created_idx
  ON public.reverse_logistics_cycles(created_at DESC);
ALTER TABLE public.reverse_logistics_cycles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reverse_logistics_cycles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reverse_logistics_cycles TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
COMMIT;
SELECT to_regclass('public.reverse_logistics_cycles') IS NOT NULL AS modulo_instalado;

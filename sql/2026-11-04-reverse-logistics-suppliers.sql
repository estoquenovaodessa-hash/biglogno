-- BigLogno | fornecedores da Logística Reversa
-- Execute UMA VEZ em Supabase > SQL Editor > New query > Run.
-- Isolado da tabela de ciclos. O histórico de ciclos existente é preservado.
BEGIN;
CREATE TABLE IF NOT EXISTS public.reverse_logistics_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 180),
  brands text[] NOT NULL CHECK (cardinality(brands) BETWEEN 1 AND 100),
  contact_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  cnpj text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS reverse_logistics_supplier_name_unique
  ON public.reverse_logistics_suppliers (lower(btrim(name)));
ALTER TABLE public.reverse_logistics_suppliers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reverse_logistics_suppliers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reverse_logistics_suppliers TO service_role;
COMMIT;
SELECT to_regclass('public.reverse_logistics_suppliers') IS NOT NULL AS cadastro_instalado;

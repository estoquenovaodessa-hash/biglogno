-- BigLogno Print | fila de etiquetas da Conferência | 2026-11-07
-- Instalação: Supabase > SQL Editor > New query > executar UMA vez.
-- Não cria jobs para registros antigos: evita disparar centenas de etiquetas.
-- A impressão automática só é ativada depois de configurar os dois
-- secrets do Worker: PRINT_AGENT_TOKEN e AUTO_CONFERENCE_PRINT_ENABLED=true.

BEGIN;
CREATE TABLE IF NOT EXISTS public.conference_label_print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id uuid NOT NULL UNIQUE REFERENCES public.sales_verification_records(id) ON DELETE CASCADE,
  document text NOT NULL,
  pdf_base64 text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','claimed','spooled','error')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_id uuid,
  leased_at timestamptz,
  spooled_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(pdf_base64) BETWEEN 20 AND 550000)
);
CREATE INDEX IF NOT EXISTS conference_label_print_jobs_pending
  ON public.conference_label_print_jobs(created_at,id)
  WHERE status='pending';

ALTER TABLE public.conference_label_print_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.conference_label_print_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.conference_label_print_jobs TO service_role;

-- Um trabalho por vez, com bloqueio de linha (SKIP LOCKED).
-- NÃO reprocessa automaticamente um trabalho já reivindicado: se o PC
-- parar após imprimir mas antes do ACK, reimprimir automaticamente pode
-- gerar uma etiqueta duplicada. O operador corrige manualmente após verificar.
CREATE OR REPLACE FUNCTION public.claim_next_conference_label_print_job(p_lease_id uuid)
RETURNS TABLE(job_id uuid, document text, pdf_base64 text, lease_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $$
  WITH chosen AS (
    SELECT j.id FROM public.conference_label_print_jobs AS j
    WHERE j.status='pending'
    ORDER BY j.created_at,j.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  ), claimed AS (
    UPDATE public.conference_label_print_jobs AS j
    SET status='claimed',
        lease_id=p_lease_id,
        leased_at=now(),
        attempts=j.attempts+1,
        updated_at=now()
    FROM chosen
    WHERE j.id=chosen.id
    RETURNING j.id,j.document,j.pdf_base64,j.lease_id
  )
  SELECT claimed.id,claimed.document,claimed.pdf_base64,claimed.lease_id
  FROM claimed;
$$;
REVOKE ALL ON FUNCTION public.claim_next_conference_label_print_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_conference_label_print_job(uuid) TO service_role;
COMMIT;

-- Consulta opcional depois da configuração:
-- SELECT document,status,attempts,created_at,spooled_at,last_error
-- FROM public.conference_label_print_jobs ORDER BY created_at DESC LIMIT 25;

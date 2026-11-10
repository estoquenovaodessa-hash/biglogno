-- BigLog | Impressão S.B.O solicitada pelo tablet
-- Amplia a fila existente; não recria trabalhos nem reimprime conferências antigas.
-- BigLogno Print v2.0 continua usando claim_next_conference_label_print_job sem alterações.

BEGIN;

ALTER TABLE public.conference_label_print_jobs
  ALTER COLUMN verification_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS job_kind text NOT NULL DEFAULT 'conferencia',
  ADD COLUMN IF NOT EXISTS sbo_request_id uuid,
  ADD COLUMN IF NOT EXISTS sbo_part_number integer,
  ADD COLUMN IF NOT EXISTS sbo_label_count integer,
  ADD COLUMN IF NOT EXISTS sbo_requested_by text;

ALTER TABLE public.conference_label_print_jobs
  ADD CONSTRAINT conference_label_print_jobs_kind_check
    CHECK (job_kind IN ('conferencia', 'sbo')),
  ADD CONSTRAINT conference_label_print_jobs_source_check
    CHECK (
      (
        job_kind = 'conferencia'
        AND verification_id IS NOT NULL
        AND sbo_request_id IS NULL
        AND sbo_part_number IS NULL
        AND sbo_label_count IS NULL
      )
      OR
      (
        job_kind = 'sbo'
        AND verification_id IS NULL
        AND sbo_request_id IS NOT NULL
        AND sbo_part_number BETWEEN 1 AND 50
        AND sbo_label_count BETWEEN 1 AND 500
      )
    ),
  ADD CONSTRAINT conference_label_print_jobs_sbo_request_part_key
    UNIQUE (sbo_request_id, sbo_part_number);

-- Mantém a mesma segurança da fila de conferência: service_role somente,
-- sem acesso direto do tablet à tabela ou ao token do agente.
ALTER TABLE public.conference_label_print_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conference_label_print_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conference_label_print_jobs TO service_role;

COMMIT;

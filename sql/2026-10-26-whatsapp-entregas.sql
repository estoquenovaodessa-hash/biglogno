-- BigLogno: avisos opcionais de entrega por WhatsApp.
-- Executar no Supabase SQL Editor. NÃO envia nenhuma mensagem por si só.
-- O disparo requer telefone e autorização explícita, além de um conector
-- independente configurado e conectado ao WhatsApp.
CREATE TABLE IF NOT EXISTS public.delivery_whatsapp_contacts (
  company_code text PRIMARY KEY,
  company_name text NOT NULL DEFAULT '',
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+55[0-9]{10,11}$'),
  opted_in boolean NOT NULL DEFAULT false,
  opted_in_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_whatsapp_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  delivery_id uuid NOT NULL,
  company_code text NOT NULL,
  company_name text NOT NULL,
  document text NOT NULL DEFAULT '',
  phone_e164 text NOT NULL,
  message_body text NOT NULL,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','em_envio','enviado','falha','cancelado')),
  attempt_id uuid,
  attempted_at timestamptz,
  sent_at timestamptz,
  external_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_whatsapp_outbox_created_idx
  ON public.delivery_whatsapp_outbox (status, created_at);
CREATE INDEX IF NOT EXISTS delivery_whatsapp_outbox_company_idx
  ON public.delivery_whatsapp_outbox (company_code, created_at DESC);

ALTER TABLE public.delivery_whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_whatsapp_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_whatsapp_contacts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.delivery_whatsapp_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_whatsapp_contacts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_whatsapp_outbox TO service_role;

-- Enfileirar SOMENTE quando o pedido sai de "não iniciada" para "em rota".
-- Pedidos unificados (mesmo cliente e mesmo instante de início)
-- geram apenas uma mensagem para evitar repetição por nota.
CREATE OR REPLACE FUNCTION public.queue_delivery_whatsapp_notice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code text;
  start_marker text;
  contact_row public.delivery_whatsapp_contacts%ROWTYPE;
  title text;
  notice text;
BEGIN
  IF OLD.payload->>'status' IS DISTINCT FROM 'nao_iniciada'
     OR NEW.payload->>'status' IS DISTINCT FROM 'em_rota' THEN
    RETURN NEW;
  END IF;

  code := regexp_replace(coalesce(NEW.payload->>'companyCode', ''), '^0+', '');
  start_marker := NEW.payload->>'startedAt';
  IF code = '' OR start_marker IS NULL OR start_marker = '' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO contact_row FROM public.delivery_whatsapp_contacts c
    WHERE c.company_code = code AND c.opted_in = true;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  title := left(coalesce(NEW.payload->>'company', 'cliente'), 150);
  notice := 'Olá! 👋 Aqui é da Bignotto Ferramentas. Sua entrega saiu para entrega e está a caminho! 🚚📦 Obrigado pela preferência.';
  INSERT INTO public.delivery_whatsapp_outbox
    (idempotency_key, delivery_id, company_code, company_name, document, phone_e164, message_body)
  VALUES
    (code || ':' || start_marker, NEW.id, code, title,
     left(coalesce(NEW.payload->>'document', ''), 30), contact_row.phone_e164, notice)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_delivery_whatsapp_notice() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_queue_delivery_whatsapp_notice ON public.deliveries;
CREATE TRIGGER trg_queue_delivery_whatsapp_notice
  AFTER UPDATE OF payload ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.queue_delivery_whatsapp_notice();

-- A fila só pode ser retirada pelo serviço autenticado via Cloudflare.
-- Não há reenvio automático de "em_envio", evitando mensagens duplicadas
-- quando há queda de rede entre o envio e a confirmação.
CREATE OR REPLACE FUNCTION public.claim_delivery_whatsapp_message()
RETURNS TABLE (
  message_id uuid, attempt_token uuid, target_phone text, message_text text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH selected AS (
    SELECT o.id FROM public.delivery_whatsapp_outbox o
    JOIN public.delivery_whatsapp_contacts c ON c.company_code = o.company_code
      AND c.opted_in AND c.phone_e164 = o.phone_e164
    WHERE o.status = 'pendente'
    ORDER BY o.created_at, o.id
    LIMIT 1 FOR UPDATE OF o SKIP LOCKED
  ), claimed AS (
    UPDATE public.delivery_whatsapp_outbox o
    SET status = 'em_envio', attempt_id = gen_random_uuid(), attempted_at = now()
    FROM selected s WHERE o.id = s.id
    RETURNING o.id, o.attempt_id, o.phone_e164, o.message_body
  )
  SELECT c.id, c.attempt_id, c.phone_e164, c.message_body FROM claimed c;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_delivery_whatsapp_message(
  p_message_id uuid, p_attempt_token uuid,
  p_sent boolean, p_external_message_id text DEFAULT NULL, p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_id uuid;
BEGIN
  UPDATE public.delivery_whatsapp_outbox
  SET status = CASE WHEN p_sent THEN 'enviado' ELSE 'falha' END,
    sent_at = CASE WHEN p_sent THEN now() ELSE NULL END,
    external_message_id = left(coalesce(p_external_message_id,''), 300),
    last_error = CASE WHEN p_sent THEN NULL ELSE left(coalesce(p_error,'Falha no conector'), 400) END
  WHERE id = p_message_id AND attempt_id = p_attempt_token AND status = 'em_envio'
  RETURNING id INTO updated_id;
  RETURN updated_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_delivery_whatsapp_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_delivery_whatsapp_message(uuid,uuid,boolean,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_delivery_whatsapp_message() TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_delivery_whatsapp_message(uuid,uuid,boolean,text,text) TO service_role;

NOTIFY pgrst, 'reload schema';

SELECT
  to_regclass('public.delivery_whatsapp_contacts') IS NOT NULL AS contatos_ok,
  to_regclass('public.delivery_whatsapp_outbox') IS NOT NULL AS fila_ok,
  EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_queue_delivery_whatsapp_notice' AND NOT tgisinternal
  ) AS gatilho_ok,
  to_regprocedure('public.claim_delivery_whatsapp_message()') IS NOT NULL AS retirada_ok;

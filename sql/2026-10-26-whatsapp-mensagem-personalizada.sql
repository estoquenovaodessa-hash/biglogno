-- BigLogno / WhatsApp: personalizar os NOVOS avisos de saída.
-- Execute DEPOIS de sql/2026-10-26-whatsapp-entregas.sql.
-- NÃO recria a fila, NÃO altera registros já enviados e NÃO exige reconectar o WhatsApp.
-- Quando a entrega reúne várias notas para o mesmo cliente, atualiza a
-- mesma notificação dentro da transação (1 aviso, notas e valores somados).

ALTER TABLE public.delivery_whatsapp_outbox
  ADD COLUMN IF NOT EXISTS notes text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS order_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_value numeric(16,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priced_order_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_name text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.format_delivery_whatsapp_notice(
  p_company text,
  p_driver text,
  p_notes text[],
  p_order_count integer,
  p_total numeric,
  p_priced_count integer
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  recipient text;
  driver_label text;
  notes_label text;
  value_label text;
  amount_brazil text;
  formatted_us text;
BEGIN
  -- Os nomes vêm de cadastros já existentes e são apenas exibidos no aviso.
  recipient := left(regexp_replace(coalesce(nullif(btrim(p_company), ''), 'cliente'),
    '[\r\n]+', ' ', 'g'), 150);
  driver_label := left(regexp_replace(coalesce(nullif(btrim(p_driver), ''), 'Não informado'),
    '[\r\n]+', ' ', 'g'), 100);

  IF coalesce(array_length(p_notes, 1), 0) = 0 THEN
    notes_label := 'Número da nota: não informado (somente entrega)';
  ELSIF array_length(p_notes, 1) = 1 THEN
    notes_label := 'Nota: *' || p_notes[1] || '*';
  ELSE
    notes_label := 'Notas: *' || array_to_string(p_notes, ', ') || '*';
  END IF;

  IF coalesce(p_priced_count, 0) = 0 THEN
    value_label := 'Valor total: não informado (somente entrega)';
  ELSE
    -- Máscara fixa: separador de milhar "." e centavos "," (pt-BR),
    -- independentemente de lc_numeric do banco PostgreSQL.
    formatted_us := to_char(round(greatest(coalesce(p_total, 0), 0), 2),
      'FM999,999,999,999,990.00');
    amount_brazil := replace(replace(replace(formatted_us, ',', '#'), '.', ','), '#', '.');
    value_label := 'Valor total: *R$ ' || amount_brazil || '*';
  END IF;

  RETURN 'Olá, *' || recipient || '*! 👋'
    || E'\n' || 'Aqui é da *Bignotto Ferramentas*. Seja bem-vindo(a)!'
    || E'\n\n🚚 ' || CASE WHEN p_order_count > 1
      THEN 'Seus pedidos saíram para entrega!'
      ELSE 'Seu pedido saiu para entrega!'
    END
    || E'\n\n🧾 ' || notes_label
    || E'\n💰 ' || value_label
    || E'\n👤 Entregador: *' || driver_label || '*'
    || E'\n\n📦 Agradecemos pela preferência!';
END;
$$;

REVOKE ALL ON FUNCTION public.format_delivery_whatsapp_notice(
  text,text,text[],integer,numeric,integer
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.queue_delivery_whatsapp_notice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code text;
  started text;
  contact_row public.delivery_whatsapp_contacts%ROWTYPE;
  company_label text;
  driver_label text;
  note_number text;
  new_notes text[];
  line_value numeric(16,2) := 0;
  new_priced_count integer := 0;
BEGIN
  -- Apenas NOVAS saídas. Retomadas de pausa e alterações de status
  -- subsequentes não geram outro WhatsApp.
  IF OLD.payload->>'status' IS DISTINCT FROM 'nao_iniciada'
     OR NEW.payload->>'status' IS DISTINCT FROM 'em_rota' THEN
    RETURN NEW;
  END IF;

  code := regexp_replace(coalesce(NEW.payload->>'companyCode', ''), '^0+(?=\\d)', '');
  started := NEW.payload->>'startedAt';
  IF code = '' OR nullif(started, '') IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO contact_row FROM public.delivery_whatsapp_contacts c
    WHERE c.company_code = code AND c.opted_in = true;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  company_label := left(coalesce(nullif(btrim(NEW.payload->>'company'), ''), 'cliente'), 150);
  driver_label := left(coalesce(nullif(btrim(NEW.payload->>'driver'), ''), 'Não informado'), 100);
  note_number := nullif(btrim(NEW.payload->>'document'), '');
  new_notes := CASE WHEN note_number IS NULL THEN ARRAY[]::text[]
    ELSE ARRAY[left(note_number, 30)]::text[] END;

  -- "Somente entrega" não possui valor de nota: não transformar isso
  -- em R$ 0,00 e não deixar payloads antigos inválidos impedir a saída.
  IF NEW.payload->>'onlyDelivery' IS DISTINCT FROM 'true' THEN
    new_priced_count := 1;
    IF coalesce(NEW.payload->>'value','') ~ '^[0-9]+(\\.[0-9]+)?$' THEN
      line_value := least((NEW.payload->>'value')::numeric, 100000000);
    END IF;
  END IF;

  INSERT INTO public.delivery_whatsapp_outbox (
    idempotency_key, delivery_id, company_code, company_name,
    document, phone_e164, message_body, notes, order_count,
    total_value, priced_order_count, driver_name
  ) VALUES (
    code || ':' || started, NEW.id, code, company_label,
    coalesce(left(note_number,30),''), contact_row.phone_e164,
    public.format_delivery_whatsapp_notice(
      company_label, driver_label, new_notes, 1, line_value, new_priced_count
    ),
    new_notes, 1, line_value, new_priced_count, driver_label
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    notes = public.delivery_whatsapp_outbox.notes || EXCLUDED.notes,
    order_count = public.delivery_whatsapp_outbox.order_count + 1,
    total_value = public.delivery_whatsapp_outbox.total_value + EXCLUDED.total_value,
    priced_order_count = public.delivery_whatsapp_outbox.priced_order_count + EXCLUDED.priced_order_count,
    message_body = public.format_delivery_whatsapp_notice(
      public.delivery_whatsapp_outbox.company_name,
      public.delivery_whatsapp_outbox.driver_name,
      public.delivery_whatsapp_outbox.notes || EXCLUDED.notes,
      public.delivery_whatsapp_outbox.order_count + 1,
      public.delivery_whatsapp_outbox.total_value + EXCLUDED.total_value,
      public.delivery_whatsapp_outbox.priced_order_count + EXCLUDED.priced_order_count
    )
  WHERE public.delivery_whatsapp_outbox.status = 'pendente'
    AND public.delivery_whatsapp_outbox.phone_e164 = EXCLUDED.phone_e164;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_delivery_whatsapp_notice() FROM PUBLIC, anon, authenticated;
-- O gatilho da migração anterior já aponta para esta função.
-- Caso alguém a tenha apagado, garante sua presença sem duplicá-lo.
DROP TRIGGER IF EXISTS trg_queue_delivery_whatsapp_notice ON public.deliveries;
CREATE TRIGGER trg_queue_delivery_whatsapp_notice
  AFTER UPDATE OF payload ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.queue_delivery_whatsapp_notice();

NOTIFY pgrst, 'reload schema';

-- Verificação sem disparar mensagens:
SELECT
  to_regprocedure('public.format_delivery_whatsapp_notice(text,text,text[],integer,numeric,integer)') IS NOT NULL AS modelo_ok,
  to_regprocedure('public.queue_delivery_whatsapp_notice()') IS NOT NULL AS gatilho_funcao_ok,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_queue_delivery_whatsapp_notice' AND NOT tgisinternal
  ) AS gatilho_ok;

-- Prévia do texto. Apenas SELECT, não cria pedido nem coloca nada na fila.
SELECT
  public.format_delivery_whatsapp_notice(
    'CLIENTE TESTE', 'CARLOS', ARRAY['12345']::text[], 1, 149.90, 1
  ) AS exemplo_um_pedido,
  public.format_delivery_whatsapp_notice(
    'EMPRESA EXEMPLO', 'JOÃO', ARRAY['12345','12346']::text[], 2, 249.90, 2
  ) AS exemplo_varios_pedidos;

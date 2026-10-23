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
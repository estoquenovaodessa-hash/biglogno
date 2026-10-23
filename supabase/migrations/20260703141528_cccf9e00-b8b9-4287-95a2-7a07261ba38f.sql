CREATE TABLE public.app_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_state TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_state TO authenticated;
GRANT ALL ON public.app_state TO service_role;

ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app_state" ON public.app_state FOR SELECT USING (true);
CREATE POLICY "Anyone can insert app_state" ON public.app_state FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update app_state" ON public.app_state FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete app_state" ON public.app_state FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.app_state;
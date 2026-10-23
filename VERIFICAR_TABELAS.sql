-- Consultas de leitura. Verifique quais tabelas já existem no Supabase antes da migração.
SELECT to_regclass('public.app_state') AS app_state,
       to_regclass('public.access_attempts') AS access_attempts,
       to_regclass('public.sales_verification_records') AS sales_verification_records,
       to_regclass('public.deliveries') AS deliveries,
       to_regclass('public.pickups') AS pickups;

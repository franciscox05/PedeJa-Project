-- Adds partner onboarding fields for requests and stores
ALTER TABLE public.restaurant_signup_requests
  ADD COLUMN IF NOT EXISTS nif varchar,
  ADD COLUMN IF NOT EXISTS morada_completa text,
  ADD COLUMN IF NOT EXISTS horario_funcionamento jsonb,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS place_id text;

ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS nif varchar,
  ADD COLUMN IF NOT EXISTS morada_completa text,
  ADD COLUMN IF NOT EXISTS horario_funcionamento jsonb,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS place_id text;

CREATE INDEX IF NOT EXISTS idx_lojas_horario_funcionamento ON public.lojas USING GIN (horario_funcionamento);
CREATE INDEX IF NOT EXISTS idx_requests_horario_funcionamento ON public.restaurant_signup_requests USING GIN (horario_funcionamento);
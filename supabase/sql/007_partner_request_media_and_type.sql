-- Adds category and image fields to partner signup requests.
ALTER TABLE public.restaurant_signup_requests
  ADD COLUMN IF NOT EXISTS idtipoloja integer,
  ADD COLUMN IF NOT EXISTS imagemfundo text,
  ADD COLUMN IF NOT EXISTS icon text;

CREATE INDEX IF NOT EXISTS idx_restaurant_signup_requests_tipo ON public.restaurant_signup_requests (idtipoloja);

-- Backfill: approved stores without type become the default restaurant type.
WITH default_restaurant_type AS (
  SELECT idtipoloja
  FROM public.tiposloja
  WHERE tipoloja ILIKE '%restaur%'
     OR descricao ILIKE '%restaur%'
  ORDER BY idtipoloja
  LIMIT 1
)
UPDATE public.lojas l
SET idtipoloja = d.idtipoloja
FROM default_restaurant_type d
WHERE l.idtipoloja IS NULL;

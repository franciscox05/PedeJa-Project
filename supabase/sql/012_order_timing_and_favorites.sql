ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_timing_mode text NOT NULL DEFAULT 'ASAP';

CREATE INDEX IF NOT EXISTS idx_orders_submitted_at
  ON public.orders (submitted_at);

CREATE INDEX IF NOT EXISTS idx_orders_order_timing_mode
  ON public.orders (order_timing_mode);

CREATE TABLE IF NOT EXISTS public.favorite_stores (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  loja_id bigint NOT NULL REFERENCES public.lojas(idloja) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, loja_id)
);

CREATE INDEX IF NOT EXISTS idx_favorite_stores_user_id
  ON public.favorite_stores (user_id);

CREATE INDEX IF NOT EXISTS idx_favorite_stores_loja_id
  ON public.favorite_stores (loja_id);

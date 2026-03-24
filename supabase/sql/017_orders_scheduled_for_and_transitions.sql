ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS aceite_em timestamptz NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS atribuido_em timestamptz NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS recolhido_em timestamptz NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS entregue_em timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_orders_scheduled_for
  ON public.orders (scheduled_for);

CREATE INDEX IF NOT EXISTS idx_orders_aceite_em
  ON public.orders (aceite_em);

CREATE INDEX IF NOT EXISTS idx_orders_atribuido_em
  ON public.orders (atribuido_em);

CREATE INDEX IF NOT EXISTS idx_orders_recolhido_em
  ON public.orders (recolhido_em);

CREATE INDEX IF NOT EXISTS idx_orders_entregue_em
  ON public.orders (entregue_em);

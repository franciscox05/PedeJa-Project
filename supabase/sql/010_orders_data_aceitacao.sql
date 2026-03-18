ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS data_aceitacao timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_orders_data_aceitacao
  ON public.orders (data_aceitacao);

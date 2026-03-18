ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text NULL,
  ADD COLUMN IF NOT EXISTS payment_label text NULL;

CREATE INDEX IF NOT EXISTS idx_orders_payment_method
  ON public.orders (payment_method);

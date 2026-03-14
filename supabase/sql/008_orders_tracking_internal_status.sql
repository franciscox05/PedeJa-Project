-- Fase 1: tracking bidirecional PedeJa <-> Shipday
-- Adiciona campos de estado interno + tracking na tabela principal de pedidos (orders)

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS estado_interno varchar(32) NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS shipday_order_id varchar(80),
  ADD COLUMN IF NOT EXISTS shipday_tracking_url text,
  ADD COLUMN IF NOT EXISTS driver_name varchar(120),
  ADD COLUMN IF NOT EXISTS driver_phone varchar(40);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_estado_interno_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_estado_interno_check
      CHECK (
        estado_interno IN (
          'pendente',
          'aceite',
          'em_preparacao',
          'pronto_recolha',
          'recolhido',
          'a_caminho',
          'entregue',
          'cancelado'
        )
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_orders_estado_interno ON public.orders (estado_interno);
CREATE INDEX IF NOT EXISTS idx_orders_shipday_order_id ON public.orders (shipday_order_id);

-- Backfill leve para alinhar dados antigos (status legado -> estado_interno)
UPDATE public.orders
SET estado_interno = CASE UPPER(COALESCE(status, ''))
  WHEN 'PENDING' THEN 'pendente'
  WHEN 'PENDING_PAYMENT' THEN 'pendente'
  WHEN 'CONFIRMED' THEN 'aceite'
  WHEN 'ACCEPTED' THEN 'aceite'
  WHEN 'PREPARING' THEN 'em_preparacao'
  WHEN 'READY_FOR_PICKUP' THEN 'pronto_recolha'
  WHEN 'PICKED_UP' THEN 'recolhido'
  WHEN 'OUT_FOR_DELIVERY' THEN 'a_caminho'
  WHEN 'STARTED' THEN 'a_caminho'
  WHEN 'DELIVERED' THEN 'entregue'
  WHEN 'FAILED' THEN 'cancelado'
  WHEN 'CANCELLED' THEN 'cancelado'
  ELSE estado_interno
END
WHERE status IS NOT NULL
  AND (
    estado_interno IS NULL
    OR TRIM(estado_interno) = ''
    OR (
      estado_interno = 'pendente'
      AND UPPER(status) NOT IN ('PENDING', 'PENDING_PAYMENT')
    )
  );

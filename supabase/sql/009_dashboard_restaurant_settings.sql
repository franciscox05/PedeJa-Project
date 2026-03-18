-- Dashboard settings for restaurant operations controls
ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS aceitacao_automatica_pedidos boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS comissao_pedeja_percent numeric(5,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lojas_comissao_pedeja_percent_check'
  ) THEN
    ALTER TABLE public.lojas
      ADD CONSTRAINT lojas_comissao_pedeja_percent_check
      CHECK (comissao_pedeja_percent >= 0 AND comissao_pedeja_percent <= 100);
  END IF;
END $$;

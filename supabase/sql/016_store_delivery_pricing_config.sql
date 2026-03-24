alter table public.lojas
  add column if not exists configuracao_entrega jsonb;

comment on column public.lojas.configuracao_entrega is
  'Configuracao do preco de entrega por km: base_fee, included_km, extra_per_km e max_km.';

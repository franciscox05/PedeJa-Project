alter table public.orders
  add column if not exists previsao_entrega text;

alter table public.orders
  add column if not exists veiculo_estafeta text;

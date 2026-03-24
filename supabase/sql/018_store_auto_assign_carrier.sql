alter table if exists public.lojas
  add column if not exists atribuicao_automatica_estafeta boolean not null default false;

comment on column public.lojas.atribuicao_automatica_estafeta is
  'Quando ativa, o sistema tenta atribuir automaticamente o melhor estafeta assim que o pedido entra na fila imediata.';

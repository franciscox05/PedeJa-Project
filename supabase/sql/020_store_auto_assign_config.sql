alter table if exists public.lojas
  add column if not exists configuracao_auto_assign jsonb;

comment on column public.lojas.configuracao_auto_assign is
  'Configuracao granular da atribuicao automatica de estafetas por loja, incluindo criterios de ranking e override local.';

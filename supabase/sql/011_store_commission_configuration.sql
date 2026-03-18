alter table public.lojas
add column if not exists configuracoes_comissao jsonb not null default '{}'::jsonb;

alter table public.menus
  add column if not exists visivel boolean not null default true;

alter table public.menus
  add column if not exists configuracao_opcoes jsonb not null default '[]'::jsonb;

alter table public.order_items
  add column if not exists opcoes_selecionadas jsonb not null default '[]'::jsonb;

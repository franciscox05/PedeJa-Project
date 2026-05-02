alter table if exists public.menu_option_groups
  add column if not exists depends_on_option_ids jsonb not null default '[]'::jsonb;

create index if not exists idx_menu_option_groups_depends
  on public.menu_option_groups using gin (depends_on_option_ids);

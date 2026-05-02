alter table if exists public.menu_option_groups
  add column if not exists min_selecoes integer not null default 0;

update public.menu_option_groups
set min_selecoes = case
  when obrigatorio then greatest(1, least(coalesce(max_selecoes, 1), 1))
  else 0
end
where min_selecoes is null;

alter table if exists public.menu_option_group_links
  add column if not exists sort_order integer not null default 0;

with ranked_links as (
  select
    id,
    row_number() over (partition by idmenu order by created_at asc, id asc) - 1 as computed_sort_order
  from public.menu_option_group_links
)
update public.menu_option_group_links target
set sort_order = ranked_links.computed_sort_order
from ranked_links
where target.id = ranked_links.id;

alter table if exists public.menu_option_items
  add column if not exists depends_on_option_ids jsonb not null default '[]'::jsonb;

create index if not exists idx_menu_option_group_links_menu_sort
  on public.menu_option_group_links (idmenu, sort_order, id);

create index if not exists idx_menu_option_items_depends
  on public.menu_option_items using gin (depends_on_option_ids);

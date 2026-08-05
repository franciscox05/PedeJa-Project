-- Reconstruido a partir da BD real (migration remota 20260724134649_avaliacoes_pedido)
-- Nao existia ficheiro local correspondente no repo; ver nota no commit desta reconstrucao.

create table if not exists public.avaliacoes_pedido (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id),
  loja_id bigint not null references public.lojas(idloja),
  customer_user_id text,
  classificacao integer not null check (classificacao >= 1 and classificacao <= 5),
  comentario text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint avaliacoes_pedido_order_id_key unique (order_id)
);

alter table public.avaliacoes_pedido enable row level security;
-- Sem policies: acesso exclusivamente via RPCs SECURITY DEFINER abaixo.

create or replace function public.customer_rate_order(
  caller_user_id integer,
  order_id_input bigint,
  classificacao_input integer,
  comentario_input text default null
)
returns public.avaliacoes_pedido
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_order public.orders;
  v_avaliacao public.avaliacoes_pedido;
begin
  if classificacao_input is null or classificacao_input < 1 or classificacao_input > 5 then
    raise exception 'A classificacao deve ser entre 1 e 5.' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = order_id_input;
  if v_order is null then
    raise exception 'Pedido nao encontrado.' using errcode = 'P0002';
  end if;

  if v_order.customer_user_id is distinct from caller_user_id::text then
    raise exception 'Sem permissao para avaliar este pedido.' using errcode = '42501';
  end if;

  if v_order.estado_interno <> 'entregue' then
    raise exception 'So podes avaliar depois de o pedido ser entregue.' using errcode = 'P0002';
  end if;

  insert into public.avaliacoes_pedido (order_id, loja_id, customer_user_id, classificacao, comentario)
  values (order_id_input, v_order.loja_id, caller_user_id::text, classificacao_input, nullif(trim(comentario_input), ''))
  on conflict (order_id) do update set
    classificacao = excluded.classificacao,
    comentario = excluded.comentario,
    atualizado_em = now()
  returning * into v_avaliacao;

  return v_avaliacao;
end;
$function$;

create or replace function public.get_my_order_rating(
  caller_user_id integer,
  order_id_input bigint
)
returns public.avaliacoes_pedido
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select a.* from public.avaliacoes_pedido a
  join public.orders o on o.id = a.order_id
  where a.order_id = order_id_input and o.customer_user_id = caller_user_id::text
  limit 1;
$function$;

grant execute on function public.customer_rate_order(integer, bigint, integer, text) to anon, authenticated;
grant execute on function public.get_my_order_rating(integer, bigint) to anon, authenticated;

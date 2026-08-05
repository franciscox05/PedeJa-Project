-- Reconstruido a partir da BD real (migration remota 20260724134837_fix_admin_list_order_reviews_cast)
-- Nao existia ficheiro local correspondente no repo; ver nota no commit desta reconstrucao.

create or replace function public.admin_list_order_reviews(caller_user_id integer)
returns table(
  id bigint,
  order_id bigint,
  loja_id bigint,
  loja_nome text,
  customer_nome text,
  classificacao integer,
  comentario text,
  criado_em timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
begin
  if not public.is_platform_admin(caller_user_id) then
    raise exception 'Apenas administradores podem ver as avaliacoes.' using errcode = '42501';
  end if;

  return query
  select
    ap.id,
    ap.order_id,
    ap.loja_id,
    l.nome::text as loja_nome,
    o.customer_nome::text,
    ap.classificacao,
    ap.comentario,
    ap.criado_em
  from public.avaliacoes_pedido ap
  join public.lojas l on l.idloja = ap.loja_id
  join public.orders o on o.id = ap.order_id
  order by ap.criado_em desc;
end;
$function$;

grant execute on function public.admin_list_order_reviews(integer) to anon, authenticated;

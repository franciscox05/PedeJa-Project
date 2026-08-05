-- Permite ao dono/staff de uma loja ver as avaliacoes deixadas pelos
-- clientes sobre essa loja (equivalente ao RestaurantReviews.jsx do
-- projeto de referencia base44). Ate agora so o admin via avaliacoes
-- (admin_list_order_reviews); esta versao e scoped por loja usando
-- is_loja_authorized, o mesmo helper ja usado noutras RPCs do dashboard
-- do restaurante.

create or replace function public.restaurant_list_own_reviews(caller_user_id integer, loja_id_input bigint)
returns table(
  id bigint,
  order_id bigint,
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
  if not public.is_loja_authorized(caller_user_id, loja_id_input) then
    raise exception 'Sem permissao para ver as avaliacoes desta loja.' using errcode = '42501';
  end if;

  return query
  select
    ap.id,
    ap.order_id,
    o.customer_nome::text,
    ap.classificacao,
    ap.comentario,
    ap.criado_em
  from public.avaliacoes_pedido ap
  join public.orders o on o.id = ap.order_id
  where ap.loja_id = loja_id_input
  order by ap.criado_em desc;
end;
$function$;

grant execute on function public.restaurant_list_own_reviews(integer, bigint) to anon, authenticated;

-- Fase 4 (backlog): tracking em tempo real para pedidos com dispatch interno.
-- Substitui o iframe do Shipday quando lojas.dispatch_interno_ativo = true:
-- devolve as coordenadas da loja, do cliente e (se ja houver atribuicao) a
-- ultima localizacao GPS do estafeta, para o cliente ver o mapa in-house.

create or replace function public.get_order_tracking_info(caller_user_id integer, order_id_input bigint)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_order public.orders;
  v_loja public.lojas;
  v_assignment record;
begin
  select * into v_order from public.orders where id = order_id_input;
  if v_order is null then
    raise exception 'Pedido nao encontrado.' using errcode = 'P0002';
  end if;

  if not (
    public.is_caller_admin(caller_user_id)
    or public.is_caller_restaurant_staff(caller_user_id, v_order.loja_id)
    or v_order.customer_user_id = caller_user_id::text
  ) then
    raise exception 'Sem permissao para ver o tracking deste pedido.' using errcode = '42501';
  end if;

  select * into v_loja from public.lojas where idloja = v_order.loja_id;

  if v_loja is null or not coalesce(v_loja.dispatch_interno_ativo, false) then
    return json_build_object('in_house_enabled', false);
  end if;

  select
    a.estafeta_id, a.ativo,
    e.nome as estafeta_nome, e.telefone as estafeta_telefone, e.veiculo as estafeta_veiculo,
    e.ultima_localizacao_lat, e.ultima_localizacao_lng, e.ultima_localizacao_em
    into v_assignment
    from public.atribuicoes_entrega a
    join public.estafetas e on e.id = a.estafeta_id
    where a.order_id = order_id_input
    order by a.ativo desc, a.criado_em desc
    limit 1;

  return json_build_object(
    'in_house_enabled', true,
    'estado_interno', v_order.estado_interno,
    'store', json_build_object('lat', v_loja.latitude, 'lng', v_loja.longitude, 'nome', v_loja.nome),
    'customer', json_build_object('lat', v_order.customer_lat, 'lng', v_order.customer_lng),
    'estafeta', case when v_assignment.estafeta_id is null then null else json_build_object(
      'nome', v_assignment.estafeta_nome,
      'telefone', v_assignment.estafeta_telefone,
      'veiculo', v_assignment.estafeta_veiculo,
      'lat', v_assignment.ultima_localizacao_lat,
      'lng', v_assignment.ultima_localizacao_lng,
      'localizacao_em', v_assignment.ultima_localizacao_em,
      'ativo', v_assignment.ativo
    ) end
  );
end;
$function$;

revoke all on function public.get_order_tracking_info(integer, bigint) from public;
grant execute on function public.get_order_tracking_info(integer, bigint) to anon, authenticated, postgres, service_role;

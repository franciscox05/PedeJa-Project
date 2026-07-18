-- Fase 0 do dispatch interno de estafetas: RPCs de leitura (RLS de
-- estafetas/atribuicoes_entrega nao tem policies diretas, tal como orders).

create or replace function public.estafeta_get_my_state(caller_user_id integer)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_estafeta public.estafetas;
  v_pending json;
  v_active json;
begin
  select * into v_estafeta from public.estafetas where idutilizador = caller_user_id and eliminado = false;
  if v_estafeta is null then
    return null;
  end if;

  select row_to_json(a) into v_pending
  from (
    select ae.*, o.customer_nome, o.customer_address, o.total, o.loja_id
    from public.atribuicoes_entrega ae
    join public.orders o on o.id = ae.order_id
    where ae.estafeta_id = v_estafeta.id and ae.ativo = true and ae.aceite_em is null
    order by ae.atribuido_em desc
    limit 1
  ) a;

  select row_to_json(a) into v_active
  from (
    select ae.*, o.customer_nome, o.customer_address, o.customer_lat, o.customer_lng, o.total, o.loja_id, o.estado_interno
    from public.atribuicoes_entrega ae
    join public.orders o on o.id = ae.order_id
    where ae.estafeta_id = v_estafeta.id and ae.ativo = true and ae.aceite_em is not null
    order by ae.atribuido_em desc
    limit 1
  ) a;

  return json_build_object(
    'estafeta', row_to_json(v_estafeta),
    'pending_assignment', v_pending,
    'active_assignment', v_active
  );
end;
$function$;

create or replace function public.estafeta_get_my_history(caller_user_id integer, limit_input integer default 50)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_estafeta public.estafetas;
  v_result json;
begin
  select * into v_estafeta from public.estafetas where idutilizador = caller_user_id and eliminado = false;
  if v_estafeta is null then
    return '[]'::json;
  end if;

  select coalesce(json_agg(a), '[]'::json) into v_result
  from (
    select ae.*, o.customer_nome, o.customer_address, o.total, o.loja_id
    from public.atribuicoes_entrega ae
    join public.orders o on o.id = ae.order_id
    where ae.estafeta_id = v_estafeta.id and ae.ativo = false
    order by ae.criado_em desc
    limit greatest(1, least(coalesce(limit_input, 50), 200))
  ) a;

  return v_result;
end;
$function$;

create or replace function public.list_estafetas_for_dispatch(caller_user_id integer)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_result json;
begin
  if not public.is_caller_admin(caller_user_id) then
    raise exception 'Sem permissao.' using errcode = '42501';
  end if;

  select coalesce(json_agg(e order by e.nome asc), '[]'::json) into v_result
  from public.estafetas e
  where e.eliminado = false;

  return v_result;
end;
$function$;

create or replace function public.list_active_atribuicoes(caller_user_id integer, loja_id_input bigint default null)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_is_admin boolean;
  v_result json;
begin
  v_is_admin := public.is_caller_admin(caller_user_id);

  if not v_is_admin and (loja_id_input is null or not public.is_caller_restaurant_staff(caller_user_id, loja_id_input)) then
    raise exception 'Sem permissao.' using errcode = '42501';
  end if;

  select coalesce(json_agg(a), '[]'::json) into v_result
  from (
    select ae.*, o.loja_id, o.estado_interno, o.customer_nome, o.customer_address, o.customer_lat, o.customer_lng, o.total
    from public.atribuicoes_entrega ae
    join public.orders o on o.id = ae.order_id
    where ae.ativo = true
      and (v_is_admin or o.loja_id = loja_id_input)
      and (loja_id_input is null or o.loja_id = loja_id_input)
    order by ae.atribuido_em desc
  ) a;

  return v_result;
end;
$function$;

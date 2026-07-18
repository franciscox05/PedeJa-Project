-- Fase 4 (continuacao): fecha lacunas encontradas na auditoria --
-- pedidos presos sem timeout, admin sem forma de intervir numa entrega
-- em curso.

-- ============================================================================
-- Expira atribuicoes sem resposta do estafeta ao fim de 3 minutos,
-- devolvendo o pedido ao pool para a proxima ronda de auto_assign_deliveries
-- (ou atribuicao manual) o apanhar. Mesma logica de "ASSIGNING_TIMEOUT_MS"
-- que a app Base44 tinha, adaptada.
-- ============================================================================

create or replace function public.expire_stale_assignments()
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_assignment record;
  v_expired_count integer := 0;
begin
  for v_assignment in
    select ae.id, ae.order_id, ae.estafeta_id
    from public.atribuicoes_entrega ae
    where ae.ativo = true
      and ae.aceite_em is null
      and ae.atribuido_em < now() - interval '3 minutes'
  loop
    update public.atribuicoes_entrega set
      ativo = false,
      rejeitado_em = now(),
      motivo_cancelamento = 'Expirado automaticamente - sem resposta do estafeta'
    where id = v_assignment.id;

    update public.orders set
      estado_interno = 'aceite',
      driver_name = null,
      driver_phone = null,
      veiculo_estafeta = null,
      atribuido_em = null,
      updated_at = now()
    where id = v_assignment.order_id
      and estado_interno = 'atribuindo_estafeta';

    update public.estafetas set
      disponivel = online,
      pedido_atual_id = null,
      atualizado_em = now()
    where id = v_assignment.estafeta_id
      and pedido_atual_id = v_assignment.order_id;

    v_expired_count := v_expired_count + 1;
  end loop;

  return json_build_object('expired', v_expired_count);
end;
$function$;

revoke all on function public.expire_stale_assignments() from public;
grant execute on function public.expire_stale_assignments() to postgres, service_role;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'expire-stale-assignments') then
    perform cron.schedule(
      'expire-stale-assignments',
      '* * * * *',
      $sql$select public.expire_stale_assignments();$sql$
    );
  end if;
end
$do$;

-- ============================================================================
-- Intervencao do admin numa entrega ja em curso: forcar como entregue
-- (estafeta incontactavel) ou reatribuir a outro estafeta.
-- ============================================================================

create or replace function public.admin_force_deliver_assignment(caller_user_id integer, assignment_id_input bigint)
returns public.atribuicoes_entrega
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_assignment public.atribuicoes_entrega;
begin
  if not public.is_caller_admin(caller_user_id) then
    raise exception 'Sem permissao.' using errcode = '42501';
  end if;

  select * into v_assignment from public.atribuicoes_entrega where id = assignment_id_input for update;
  if v_assignment is null or not v_assignment.ativo then
    raise exception 'Atribuicao nao encontrada ou ja terminada.' using errcode = 'P0002';
  end if;

  update public.atribuicoes_entrega set
    ativo = false,
    entregue_em = now()
  where id = assignment_id_input
  returning * into v_assignment;

  update public.orders set
    estado_interno = 'entregue',
    entregue_em = now(),
    updated_at = now()
  where id = v_assignment.order_id;

  update public.estafetas set
    total_entregas = total_entregas + 1,
    total_ganhos = total_ganhos + coalesce(v_assignment.valor_estafeta, 0),
    disponivel = online,
    pedido_atual_id = null,
    atualizado_em = now()
  where id = v_assignment.estafeta_id;

  return v_assignment;
end;
$function$;

create or replace function public.admin_reassign_delivery(
  caller_user_id integer,
  assignment_id_input bigint,
  new_estafeta_id_input bigint
) returns public.atribuicoes_entrega
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_old_assignment public.atribuicoes_entrega;
  v_new_assignment public.atribuicoes_entrega;
  v_loja public.lojas;
  v_estafeta public.estafetas;
  v_distancia numeric;
begin
  if not public.is_caller_admin(caller_user_id) then
    raise exception 'Sem permissao.' using errcode = '42501';
  end if;

  select * into v_old_assignment from public.atribuicoes_entrega where id = assignment_id_input for update;
  if v_old_assignment is null or not v_old_assignment.ativo then
    raise exception 'Atribuicao nao encontrada ou ja terminada.' using errcode = 'P0002';
  end if;

  update public.atribuicoes_entrega set
    ativo = false,
    cancelado_em = now(),
    motivo_cancelamento = 'Reatribuido pelo admin',
    reatribuido_para_id = new_estafeta_id_input
  where id = assignment_id_input;

  update public.estafetas set
    disponivel = online,
    pedido_atual_id = null,
    atualizado_em = now()
  where id = v_old_assignment.estafeta_id
    and pedido_atual_id = v_old_assignment.order_id;

  update public.orders set
    estado_interno = 'aceite',
    driver_name = null,
    driver_phone = null,
    veiculo_estafeta = null,
    atribuido_em = null,
    updated_at = now()
  where id = v_old_assignment.order_id;

  select * into v_loja from public.lojas l join public.orders o on o.loja_id = l.idloja where o.id = v_old_assignment.order_id;
  select * into v_estafeta from public.estafetas where id = new_estafeta_id_input;
  v_distancia := public.estafeta_haversine_km(v_loja.latitude, v_loja.longitude, v_estafeta.ultima_localizacao_lat, v_estafeta.ultima_localizacao_lng);

  v_new_assignment := public._assign_delivery_unchecked(v_old_assignment.order_id, new_estafeta_id_input, v_distancia);

  update public.atribuicoes_entrega set reatribuido_de_id = v_old_assignment.estafeta_id where id = v_new_assignment.id;

  return v_new_assignment;
end;
$function$;

revoke all on function public.admin_force_deliver_assignment(integer, bigint) from public;
revoke all on function public.admin_reassign_delivery(integer, bigint, bigint) from public;
grant execute on function public.admin_force_deliver_assignment(integer, bigint) to anon, authenticated, postgres, service_role;
grant execute on function public.admin_reassign_delivery(integer, bigint, bigint) to anon, authenticated, postgres, service_role;

-- Fase 0 do dispatch interno de estafetas: RPCs SECURITY DEFINER.
-- Segue o mesmo padrao de orders_apply_authorized_patch (caller_user_id explicito,
-- verificacao de papel dentro da funcao, RLS das tabelas base fechada por omissao).

-- ============================================================================
-- Helpers
-- ============================================================================

create or replace function public.estafeta_haversine_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 6371 * 2 * asin(sqrt(
      sin(radians(lat2 - lat1) / 2) ^ 2
      + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2
    ))
  end;
$$;

create or replace function public.is_caller_admin(caller_user_id integer)
returns boolean
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select exists(
    select 1 from public.app_admins where user_id = caller_user_id::text
    union
    select 1 from public.utilizadorespermissoes up
      join public.permissoes p on p.idpermissao = up.idpermissao
      where up.idutilizador = caller_user_id and p.permissao = 'admin'
  );
$$;

create or replace function public.is_caller_restaurant_staff(caller_user_id integer, loja_id_input bigint)
returns boolean
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select exists(
    select 1 from public.lojas l where l.idloja = loja_id_input and l.idutilizador = caller_user_id
    union
    select 1 from public.restaurant_staff_access rsa where rsa.loja_id = loja_id_input and rsa.user_id = caller_user_id::text
  );
$$;

-- Mutacao interna partilhada por assign_delivery (manual) e auto_assign_deliveries
-- (sistema). Nao verifica autorizacao -- quem chama e responsavel por isso.
create or replace function public._assign_delivery_unchecked(
  order_id_input bigint,
  estafeta_id_input bigint,
  distancia_km_input numeric
) returns public.atribuicoes_entrega
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_order public.orders;
  v_estafeta public.estafetas;
  v_assignment public.atribuicoes_entrega;
begin
  select * into v_order from public.orders where id = order_id_input for update;
  if v_order is null then
    raise exception 'Pedido nao encontrado.' using errcode = 'P0002';
  end if;

  select * into v_estafeta from public.estafetas where id = estafeta_id_input for update;
  if v_estafeta is null or v_estafeta.eliminado or not v_estafeta.ativo then
    raise exception 'Estafeta invalido ou inativo.' using errcode = '42501';
  end if;

  if exists(select 1 from public.atribuicoes_entrega where order_id = order_id_input and ativo = true) then
    raise exception 'Este pedido ja tem um estafeta atribuido.' using errcode = 'P0002';
  end if;

  insert into public.atribuicoes_entrega (order_id, estafeta_id, distancia_km, valor_estafeta)
  values (order_id_input, estafeta_id_input, distancia_km_input, coalesce(v_order.taxa_entrega, 0))
  returning * into v_assignment;

  update public.orders set
    estado_interno = case when estado_interno in ('pendente', 'aceite') then 'atribuindo_estafeta' else estado_interno end,
    driver_name = v_estafeta.nome,
    driver_phone = v_estafeta.telefone,
    veiculo_estafeta = v_estafeta.veiculo,
    atribuido_em = now(),
    updated_at = now()
  where id = order_id_input;

  update public.estafetas set
    disponivel = false,
    pedido_atual_id = order_id_input,
    atualizado_em = now()
  where id = estafeta_id_input;

  return v_assignment;
end;
$function$;

-- Nota: "revoke ... from public" so afeta o pseudo-role PUBLIC. O Supabase
-- concede EXECUTE a anon/authenticated via default privileges do schema
-- independentemente disso, por isso o revoke explicito por role acontece
-- mais abaixo (mesma secao do auto_assign_deliveries).
revoke all on function public._assign_delivery_unchecked(bigint, bigint, numeric) from public;

-- ============================================================================
-- Gestao de conta do estafeta (admin)
-- ============================================================================

create or replace function public.admin_create_estafeta(
  caller_user_id integer,
  nome_input text,
  email_input text,
  telemovel_input text,
  veiculo_input text default 'mota'
) returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_novo_id integer;
  v_estafeta_id bigint;
  v_temp_password text;
begin
  if not public.is_caller_admin(caller_user_id) then
    raise exception 'Sem permissao para criar contas de estafeta.' using errcode = '42501';
  end if;

  if exists(select 1 from public.utilizadores where email = email_input) then
    raise exception 'Ja existe uma conta com este email.' using errcode = 'P0002';
  end if;

  v_temp_password := 'PedeJa#' || upper(substr(md5(random()::text), 1, 6));

  insert into public.utilizadores (username, email, telemovel, dataregisto)
  values (nome_input, email_input, telemovel_input, date_trunc('minute', current_timestamp))
  returning idutilizador into v_novo_id;

  insert into private.utilizador_credenciais (idutilizador, password)
  values (v_novo_id, crypt(v_temp_password, gen_salt('bf')));

  insert into public.estafetas (idutilizador, nome, email, telefone, veiculo, ativo, password_temporaria)
  values (v_novo_id, nome_input, email_input, telemovel_input, coalesce(veiculo_input, 'mota'), true, true)
  returning id into v_estafeta_id;

  return json_build_object(
    'estafeta_id', v_estafeta_id,
    'idutilizador', v_novo_id,
    'email', email_input,
    'password_temporaria', v_temp_password
  );
end;
$function$;

create or replace function public.admin_set_estafeta_ativo(
  caller_user_id integer,
  estafeta_id_input bigint,
  ativo_input boolean
) returns public.estafetas
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_estafeta public.estafetas;
begin
  if not public.is_caller_admin(caller_user_id) then
    raise exception 'Sem permissao.' using errcode = '42501';
  end if;

  update public.estafetas set
    ativo = ativo_input,
    disponivel = case when not ativo_input then false else disponivel end,
    online = case when not ativo_input then false else online end,
    atualizado_em = now()
  where id = estafeta_id_input
  returning * into v_estafeta;

  if v_estafeta is null then
    raise exception 'Estafeta nao encontrado.' using errcode = 'P0002';
  end if;

  return v_estafeta;
end;
$function$;

-- ============================================================================
-- Auto-servico do estafeta (a app do estafeta usa estas 4 funcoes)
-- ============================================================================

create or replace function public.estafeta_toggle_online(caller_user_id integer, online_input boolean)
returns public.estafetas
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_estafeta public.estafetas;
begin
  update public.estafetas set
    online = online_input,
    disponivel = case when not online_input then false else disponivel end,
    ultima_atividade_em = now(),
    atualizado_em = now()
  where idutilizador = caller_user_id and eliminado = false and ativo = true
  returning * into v_estafeta;

  if v_estafeta is null then
    raise exception 'Conta de estafeta nao encontrada ou inativa.' using errcode = 'P0002';
  end if;

  return v_estafeta;
end;
$function$;

create or replace function public.estafeta_set_disponivel(caller_user_id integer, disponivel_input boolean)
returns public.estafetas
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_estafeta public.estafetas;
begin
  update public.estafetas set
    disponivel = disponivel_input and online and pedido_atual_id is null,
    ultima_atividade_em = now(),
    atualizado_em = now()
  where idutilizador = caller_user_id and eliminado = false and ativo = true
  returning * into v_estafeta;

  if v_estafeta is null then
    raise exception 'Conta de estafeta nao encontrada ou inativa.' using errcode = 'P0002';
  end if;

  return v_estafeta;
end;
$function$;

create or replace function public.estafeta_update_location(caller_user_id integer, lat_input double precision, lng_input double precision)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
begin
  update public.estafetas set
    ultima_localizacao_lat = lat_input,
    ultima_localizacao_lng = lng_input,
    ultima_localizacao_em = now(),
    ultima_atividade_em = now(),
    atualizado_em = now()
  where idutilizador = caller_user_id and eliminado = false;

  if not found then
    raise exception 'Conta de estafeta nao encontrada.' using errcode = 'P0002';
  end if;
end;
$function$;

create or replace function public.estafeta_change_password(
  caller_user_id integer,
  current_password text,
  new_password text
) returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_credenciais record;
begin
  select * into v_credenciais from private.utilizador_credenciais where idutilizador = caller_user_id;
  if v_credenciais is null or v_credenciais.password != crypt(current_password, v_credenciais.password) then
    raise exception 'Password atual incorreta.' using errcode = '28P01';
  end if;

  if length(coalesce(new_password, '')) < 6 then
    raise exception 'A nova password deve ter pelo menos 6 caracteres.' using errcode = '22023';
  end if;

  update private.utilizador_credenciais set password = crypt(new_password, gen_salt('bf'))
  where idutilizador = caller_user_id;

  update public.estafetas set password_temporaria = false, atualizado_em = now()
  where idutilizador = caller_user_id;
end;
$function$;

-- ============================================================================
-- Atribuicao manual (admin ou staff da loja)
-- ============================================================================

create or replace function public.assign_delivery(
  caller_user_id integer,
  order_id_input bigint,
  estafeta_id_input bigint
) returns public.atribuicoes_entrega
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_order public.orders;
  v_loja public.lojas;
  v_estafeta public.estafetas;
  v_distancia numeric;
begin
  select * into v_order from public.orders where id = order_id_input;
  if v_order is null then
    raise exception 'Pedido nao encontrado.' using errcode = 'P0002';
  end if;

  if not (public.is_caller_admin(caller_user_id) or public.is_caller_restaurant_staff(caller_user_id, v_order.loja_id)) then
    raise exception 'Sem permissao para atribuir estafeta a este pedido.' using errcode = '42501';
  end if;

  select * into v_loja from public.lojas where idloja = v_order.loja_id;
  select * into v_estafeta from public.estafetas where id = estafeta_id_input;

  v_distancia := public.estafeta_haversine_km(v_loja.latitude, v_loja.longitude, v_estafeta.ultima_localizacao_lat, v_estafeta.ultima_localizacao_lng);

  return public._assign_delivery_unchecked(order_id_input, estafeta_id_input, v_distancia);
end;
$function$;

-- ============================================================================
-- Fluxo do lado do estafeta: aceitar/rejeitar, avancar estado, cancelar
-- ============================================================================

create or replace function public.estafeta_accept_or_reject_assignment(
  caller_user_id integer,
  assignment_id_input bigint,
  accept_input boolean,
  motivo_input text default null
) returns public.atribuicoes_entrega
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_assignment public.atribuicoes_entrega;
  v_estafeta public.estafetas;
begin
  select a.* into v_assignment from public.atribuicoes_entrega a where a.id = assignment_id_input for update;
  if v_assignment is null then
    raise exception 'Atribuicao nao encontrada.' using errcode = 'P0002';
  end if;

  select * into v_estafeta from public.estafetas where id = v_assignment.estafeta_id;

  if v_estafeta.idutilizador != caller_user_id and not public.is_caller_admin(caller_user_id) then
    raise exception 'Sem permissao sobre esta atribuicao.' using errcode = '42501';
  end if;

  if not v_assignment.ativo or v_assignment.aceite_em is not null then
    raise exception 'Esta atribuicao ja foi respondida.' using errcode = 'P0002';
  end if;

  if accept_input then
    update public.atribuicoes_entrega set aceite_em = now() where id = assignment_id_input returning * into v_assignment;
    update public.orders set estado_interno = 'estafeta_aceitou', updated_at = now() where id = v_assignment.order_id;
  else
    update public.atribuicoes_entrega set
      ativo = false,
      rejeitado_em = now(),
      motivo_cancelamento = motivo_input
    where id = assignment_id_input
    returning * into v_assignment;

    update public.orders set
      estado_interno = 'aceite',
      driver_name = null,
      driver_phone = null,
      veiculo_estafeta = null,
      atribuido_em = null,
      updated_at = now()
    where id = v_assignment.order_id;

    update public.estafetas set
      disponivel = online,
      pedido_atual_id = null,
      atualizado_em = now()
    where id = v_assignment.estafeta_id;
  end if;

  return v_assignment;
end;
$function$;

create or replace function public.estafeta_advance_status(
  caller_user_id integer,
  assignment_id_input bigint,
  new_estado_input text
) returns public.atribuicoes_entrega
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_assignment public.atribuicoes_entrega;
  v_estafeta public.estafetas;
  v_order public.orders;
  v_allowed_next text[];
begin
  select a.* into v_assignment from public.atribuicoes_entrega a where a.id = assignment_id_input for update;
  if v_assignment is null or not v_assignment.ativo then
    raise exception 'Atribuicao nao encontrada ou ja terminada.' using errcode = 'P0002';
  end if;

  select * into v_estafeta from public.estafetas where id = v_assignment.estafeta_id;
  if v_estafeta.idutilizador != caller_user_id and not public.is_caller_admin(caller_user_id) then
    raise exception 'Sem permissao sobre esta atribuicao.' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = v_assignment.order_id;

  v_allowed_next := case v_order.estado_interno
    when 'estafeta_aceitou' then array['iniciado', 'recolhido']
    when 'em_preparacao' then array['recolhido']
    when 'pronto_recolha' then array['recolhido']
    when 'iniciado' then array['recolhido']
    when 'recolhido' then array['pronto_entregar', 'a_caminho']
    when 'pronto_entregar' then array['a_caminho']
    when 'a_caminho' then array['entregue']
    else array[]::text[]
  end;

  if not public.is_caller_admin(caller_user_id) and not (new_estado_input = any(v_allowed_next)) then
    raise exception 'Transicao % nao permitida a partir de %.', new_estado_input, v_order.estado_interno using errcode = '42501';
  end if;

  update public.orders set
    estado_interno = new_estado_input,
    recolhido_em = case when new_estado_input = 'recolhido' then now() else recolhido_em end,
    entregue_em = case when new_estado_input = 'entregue' then now() else entregue_em end,
    updated_at = now()
  where id = v_assignment.order_id;

  update public.atribuicoes_entrega set
    recolhido_em = case when new_estado_input = 'recolhido' then now() else recolhido_em end,
    a_caminho_em = case when new_estado_input = 'a_caminho' then now() else a_caminho_em end,
    entregue_em = case when new_estado_input = 'entregue' then now() else entregue_em end,
    ativo = case when new_estado_input = 'entregue' then false else ativo end
  where id = assignment_id_input
  returning * into v_assignment;

  if new_estado_input = 'entregue' then
    update public.estafetas set
      total_entregas = total_entregas + 1,
      total_ganhos = total_ganhos + coalesce(v_assignment.valor_estafeta, 0),
      disponivel = online,
      pedido_atual_id = null,
      atualizado_em = now()
    where id = v_assignment.estafeta_id;
  end if;

  return v_assignment;
end;
$function$;

create or replace function public.cancel_delivery_assignment(
  caller_user_id integer,
  assignment_id_input bigint,
  motivo_input text default null
) returns public.atribuicoes_entrega
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_assignment public.atribuicoes_entrega;
  v_estafeta public.estafetas;
  v_order public.orders;
begin
  select a.* into v_assignment from public.atribuicoes_entrega a where a.id = assignment_id_input for update;
  if v_assignment is null or not v_assignment.ativo then
    raise exception 'Atribuicao nao encontrada ou ja terminada.' using errcode = 'P0002';
  end if;

  select * into v_estafeta from public.estafetas where id = v_assignment.estafeta_id;
  select * into v_order from public.orders where id = v_assignment.order_id;

  if not (
    public.is_caller_admin(caller_user_id)
    or public.is_caller_restaurant_staff(caller_user_id, v_order.loja_id)
    or v_estafeta.idutilizador = caller_user_id
  ) then
    raise exception 'Sem permissao para cancelar esta atribuicao.' using errcode = '42501';
  end if;

  update public.atribuicoes_entrega set
    ativo = false,
    cancelado_em = now(),
    motivo_cancelamento = motivo_input
  where id = assignment_id_input
  returning * into v_assignment;

  update public.orders set estado_interno = 'cancelado', updated_at = now() where id = v_assignment.order_id;

  update public.estafetas set
    disponivel = online,
    pedido_atual_id = null,
    atualizado_em = now()
  where id = v_assignment.estafeta_id;

  return v_assignment;
end;
$function$;

-- ============================================================================
-- Auto-atribuicao (sistema: pg_cron + create-order). Nao exposta ao frontend.
-- Porta a logica de shipdayService.pickBestCarrierForOrder/compareCarrierRank
-- para correr sobre a tabela estafetas.
-- ============================================================================

create or replace function public.auto_assign_deliveries()
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_loja record;
  v_order record;
  v_criteria jsonb;
  v_best_estafeta_id bigint;
  v_best_distancia numeric;
  v_assigned_count integer := 0;
  v_total_count integer := 0;
  v_global_enabled boolean;
  v_global_criteria jsonb;
begin
  select coalesce((valor->>'enabled')::boolean, false), coalesce(valor->'criteria', '{}'::jsonb)
    into v_global_enabled, v_global_criteria
    from public.configuracoes_plataforma where chave = 'auto_assign_carriers_default';

  for v_loja in
    select l.idloja, l.latitude, l.longitude, l.atribuicao_automatica_estafeta, l.configuracao_auto_assign
    from public.lojas l
    where l.dispatch_interno_ativo = true
      and (
        coalesce(v_global_enabled, false)
        or l.atribuicao_automatica_estafeta
        or coalesce((l.configuracao_auto_assign->>'enabled')::boolean, false)
      )
  loop
    v_criteria := case
      when coalesce(v_global_enabled, false) then coalesce(v_global_criteria, '{}'::jsonb)
      else coalesce(v_loja.configuracao_auto_assign->'criteria', '{}'::jsonb)
    end;

    for v_order in
      select o.id, o.taxa_entrega
      from public.orders o
      where o.loja_id = v_loja.idloja
        and o.estado_interno in ('pendente', 'aceite')
        and not exists(select 1 from public.atribuicoes_entrega a where a.order_id = o.id and a.ativo = true)
      order by o.created_at asc
    loop
      v_total_count := v_total_count + 1;

      select e.id, public.estafeta_haversine_km(v_loja.latitude, v_loja.longitude, e.ultima_localizacao_lat, e.ultima_localizacao_lng)
        into v_best_estafeta_id, v_best_distancia
        from public.estafetas e
        where e.ativo = true and e.eliminado = false and e.online = true and e.disponivel = true
          and (e.ultima_atividade_em is null or e.ultima_atividade_em > now() - interval '90 seconds')
        order by
          case when coalesce((v_criteria->>'workload')::boolean, true) then (
            select count(*) from public.atribuicoes_entrega a2 where a2.estafeta_id = e.id and a2.ativo = true
          ) else 0 end asc,
          case when coalesce((v_criteria->>'proximity')::boolean, true)
            then coalesce(public.estafeta_haversine_km(v_loja.latitude, v_loja.longitude, e.ultima_localizacao_lat, e.ultima_localizacao_lng), 999999)
            else 0
          end asc,
          e.nome asc
        limit 1;

      if v_best_estafeta_id is not null then
        begin
          perform public._assign_delivery_unchecked(v_order.id, v_best_estafeta_id, v_best_distancia);
          v_assigned_count := v_assigned_count + 1;
        exception when others then
          -- Nao deixar uma falha num pedido (ex: corrida perdida por concorrencia)
          -- abortar o resto da ronda de auto-atribuicao.
          null;
        end;
      end if;

      v_best_estafeta_id := null;
    end loop;
  end loop;

  return json_build_object('assigned', v_assigned_count, 'total', v_total_count);
end;
$function$;

revoke all on function public.auto_assign_deliveries() from public;
grant execute on function public.auto_assign_deliveries() to postgres, service_role;

-- Supabase concede EXECUTE a anon/authenticated por default privileges do
-- schema public, independentemente do revoke acima (que so afeta PUBLIC).
-- Fechar explicitamente as duas funcoes internas nao pensadas para o frontend.
revoke execute on function public._assign_delivery_unchecked(bigint, bigint, numeric) from anon, authenticated;
revoke execute on function public.auto_assign_deliveries() from anon, authenticated;

-- Agendamento: varredura de auto-atribuicao a cada minuto. Sem efeito enquanto
-- nenhuma loja tiver dispatch_interno_ativo = true.
create extension if not exists pg_cron;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'auto-assign-deliveries') then
    perform cron.schedule(
      'auto-assign-deliveries',
      '* * * * *',
      $sql$select public.auto_assign_deliveries();$sql$
    );
  end if;
end
$do$;

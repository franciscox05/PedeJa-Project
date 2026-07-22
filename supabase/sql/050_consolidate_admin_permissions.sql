-- Consolida os DOIS sistemas paralelos de "e admin?" (tabela app_admins +
-- tabela utilizadorespermissoes) num so metodo: utilizadorespermissoes
-- (permissao = 'admin'). A tabela app_admins so tinha uma conta de teste
-- la dentro (ja removida) -- o admin real (Afonso Faria) sempre esteve em
-- utilizadorespermissoes, que passa a ser a UNICA fonte de verdade.
--
-- is_caller_admin() e is_platform_admin() eram duas funcoes identicas (a
-- segunda nunca foi consolidada na primeira); 13 outras funcoes repetiam a
-- mesma logica de uniao inline em vez de reutilizar uma delas. Isto fecha
-- os dois problemas: uma unica funcao fonte-de-verdade, e todas as outras
-- 32 funcoes (19 que ja chamavam is_platform_admin + 13 que inlinavam a
-- logica) passam a delegar nela.

-- 1) Fonte de verdade unica.
create or replace function public.is_caller_admin(caller_user_id integer)
returns boolean
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select exists(
    select 1 from public.utilizadorespermissoes up
      join public.permissoes p on p.idpermissao = up.idpermissao
      where up.idutilizador = caller_user_id and p.permissao = 'admin'
  );
$$;

-- 2) Mantido como wrapper fino (19 funcoes ja chamam este nome) -- deixa de
--    ter logica propria, so delega na fonte de verdade unica.
create or replace function public.is_platform_admin(caller_user_id integer)
returns boolean
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select public.is_caller_admin(caller_user_id);
$$;

-- 3) As 13 funcoes que inlinavam a logica em vez de reutilizar uma das
--    duas acima -- passam a delegar em is_caller_admin().

create or replace function public.admin_provision_store_from_signup(caller_user_id integer, loja_id_input bigint, payload jsonb)
returns public.lojas
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  is_admin boolean;
  allowed_keys text[] := array['nome','contacto','nif','morada_completa','horario_funcionamento','latitude','longitude','place_id','idtipoloja','imagemfundo','icon','idmorada','ativo','idutilizador'];
  patch_key text;
  target_loja public.lojas;
begin
  is_admin := public.is_caller_admin(caller_user_id);

  if not is_admin then
    raise exception 'Apenas administradores podem provisionar lojas.' using errcode = '42501';
  end if;

  for patch_key in select jsonb_object_keys(payload) loop
    if not (patch_key = any(allowed_keys)) then
      raise exception 'Campo % nao permitido nesta operacao.', patch_key using errcode = '42501';
    end if;
  end loop;

  if loja_id_input is not null then
    update public.lojas set
      nome = case when payload ? 'nome' then payload->>'nome' else nome end,
      contacto = case when payload ? 'contacto' then payload->>'contacto' else contacto end,
      nif = case when payload ? 'nif' then payload->>'nif' else nif end,
      morada_completa = case when payload ? 'morada_completa' then payload->>'morada_completa' else morada_completa end,
      horario_funcionamento = case when payload ? 'horario_funcionamento' then payload->'horario_funcionamento' else horario_funcionamento end,
      latitude = case when payload ? 'latitude' then (payload->>'latitude')::double precision else latitude end,
      longitude = case when payload ? 'longitude' then (payload->>'longitude')::double precision else longitude end,
      place_id = case when payload ? 'place_id' then payload->>'place_id' else place_id end,
      idtipoloja = case when payload ? 'idtipoloja' then (payload->>'idtipoloja')::integer else idtipoloja end,
      imagemfundo = case when payload ? 'imagemfundo' then payload->>'imagemfundo' else imagemfundo end,
      icon = case when payload ? 'icon' then payload->>'icon' else icon end,
      idmorada = case when payload ? 'idmorada' then (payload->>'idmorada')::integer else idmorada end,
      ativo = case when payload ? 'ativo' then (payload->>'ativo')::boolean else ativo end,
      idutilizador = case when payload ? 'idutilizador' then (payload->>'idutilizador')::integer else idutilizador end
    where idloja = loja_id_input
    returning * into target_loja;

    if target_loja is null then
      raise exception 'Loja nao encontrada.' using errcode = 'P0002';
    end if;
  else
    insert into public.lojas (
      nome, contacto, nif, morada_completa, horario_funcionamento, latitude, longitude, place_id,
      idtipoloja, imagemfundo, icon, idmorada, ativo, idutilizador
    ) values (
      payload->>'nome', payload->>'contacto', payload->>'nif', payload->>'morada_completa',
      payload->'horario_funcionamento',
      (payload->>'latitude')::double precision, (payload->>'longitude')::double precision, payload->>'place_id',
      (payload->>'idtipoloja')::integer, payload->>'imagemfundo', payload->>'icon',
      (payload->>'idmorada')::integer, coalesce((payload->>'ativo')::boolean, true),
      (payload->>'idutilizador')::integer
    )
    returning * into target_loja;
  end if;

  return target_loja;
end;
$function$;

create or replace function public.admin_associate_restaurant_to_user(caller_user_id integer, target_user_id integer, loja_id_input integer)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_is_admin boolean;
  restaurante_permissao_id integer;
  existing_staff_id bigint;
  utilizador_alvo record;
  loja_alvo record;
begin
  v_is_admin := public.is_caller_admin(caller_user_id);

  if not v_is_admin then
    raise exception 'Apenas administradores podem associar restaurantes.' using errcode = '42501';
  end if;

  select * into utilizador_alvo from public.utilizadores where idutilizador = target_user_id;
  if utilizador_alvo is null then
    raise exception 'Utilizador nao encontrado.';
  end if;

  select * into loja_alvo from public.lojas where idloja = loja_id_input;
  if loja_alvo is null then
    raise exception 'Loja nao encontrada.';
  end if;

  select idpermissao into restaurante_permissao_id from public.permissoes where permissao = 'restaurante' limit 1;

  insert into public.utilizadorespermissoes (idutilizador, idpermissao)
  values (target_user_id, restaurante_permissao_id)
  on conflict (idutilizador, idpermissao) do nothing;

  select id into existing_staff_id
  from public.restaurant_staff_access
  where user_id = target_user_id::text and loja_id = loja_id_input
  limit 1;

  if existing_staff_id is not null then
    update public.restaurant_staff_access set role = 'OWNER' where id = existing_staff_id;
  else
    insert into public.restaurant_staff_access (user_id, loja_id, role)
    values (target_user_id::text, loja_id_input, 'OWNER');
  end if;

  update public.lojas set idutilizador = target_user_id where idloja = loja_id_input;

  return json_build_object(
    'user', json_build_object('idutilizador', utilizador_alvo.idutilizador, 'username', utilizador_alvo.username, 'email', utilizador_alvo.email),
    'store', json_build_object('idloja', loja_alvo.idloja, 'nome', loja_alvo.nome)
  );
end;
$function$;

create or replace function public.admin_get_restaurant_signup_request(caller_user_id integer, request_id_input uuid)
returns public.restaurant_signup_requests
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_is_admin boolean;
  result_row public.restaurant_signup_requests;
begin
  v_is_admin := public.is_caller_admin(caller_user_id);

  if not v_is_admin then
    raise exception 'Apenas administradores podem ver esta candidatura.' using errcode = '42501';
  end if;

  select * into result_row from public.restaurant_signup_requests where id = request_id_input;

  if result_row is null then
    raise exception 'Candidatura nao encontrada.';
  end if;

  return result_row;
end;
$function$;

create or replace function public.admin_list_restaurant_signup_requests(caller_user_id integer, status_filter text default 'PENDING'::text)
returns setof public.restaurant_signup_requests
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_is_admin boolean;
begin
  v_is_admin := public.is_caller_admin(caller_user_id);

  if not v_is_admin then
    raise exception 'Apenas administradores podem listar candidaturas.' using errcode = '42501';
  end if;

  return query
    select * from public.restaurant_signup_requests r
    where status_filter is null or r.status = status_filter
    order by r.created_at asc;
end;
$function$;

create or replace function public.admin_update_restaurant_signup_request_status(caller_user_id integer, request_id_input uuid, new_status text, loja_id_input bigint default null::bigint)
returns public.restaurant_signup_requests
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_is_admin boolean;
  result_row public.restaurant_signup_requests;
begin
  v_is_admin := public.is_caller_admin(caller_user_id);

  if not v_is_admin then
    raise exception 'Apenas administradores podem rever candidaturas.' using errcode = '42501';
  end if;

  update public.restaurant_signup_requests
  set status = new_status,
      reviewed_at = now(),
      reviewed_by = caller_user_id::text,
      loja_id = coalesce(loja_id_input, loja_id)
  where id = request_id_input
  returning * into result_row;

  if result_row is null then
    raise exception 'Candidatura nao encontrada.';
  end if;

  return result_row;
end;
$function$;

create or replace function public.orders_apply_authorized_patch(caller_user_id integer, order_id_input bigint, patch jsonb)
returns public.orders
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  is_admin boolean;
  is_restaurant_staff boolean;
  is_customer_owner boolean;
  target_order public.orders;
  allowed_keys text[] := array['estado_interno','status','updated_at','aceite_em','atribuido_em','recolhido_em','entregue_em','driver_name','driver_phone','veiculo_estafeta','shipday_tracking_url'];
  patch_key text;
  patch_estado text;
  customer_base_time timestamptz;
  customer_cancelable_estados text[] := array['pendente','aceite','atribuindo_estafeta','estafeta_aceitou','em_preparacao','pronto_recolha'];
begin
  select * into target_order from public.orders where id = order_id_input;
  if target_order is null then
    raise exception 'Pedido nao encontrado.' using errcode = 'P0002';
  end if;

  for patch_key in select jsonb_object_keys(patch) loop
    if not (patch_key = any(allowed_keys)) then
      raise exception 'Campo % nao permitido nesta atualizacao.', patch_key using errcode = '42501';
    end if;
  end loop;

  is_admin := public.is_caller_admin(caller_user_id);

  select exists(
    select 1 from public.lojas l where l.idloja = target_order.loja_id and l.idutilizador = caller_user_id
    union
    select 1 from public.restaurant_staff_access rsa where rsa.loja_id = target_order.loja_id and rsa.user_id = caller_user_id::text
  ) into is_restaurant_staff;

  is_customer_owner := (target_order.customer_user_id is not null and target_order.customer_user_id = caller_user_id::text);

  if is_admin or is_restaurant_staff then
    null;
  elsif is_customer_owner then
    patch_estado := patch->>'estado_interno';
    if patch_estado is distinct from 'cancelado' then
      raise exception 'Clientes so podem cancelar o proprio pedido.' using errcode = '42501';
    end if;

    if not (target_order.estado_interno = any(customer_cancelable_estados)) then
      raise exception 'Este pedido ja avancou demasiado para ser cancelado.' using errcode = '42501';
    end if;

    customer_base_time := coalesce(target_order.submitted_at, target_order.created_at);
    if customer_base_time is null or (customer_base_time + interval '5 minutes') < now() then
      raise exception 'A janela de cancelamento de 5 minutos ja terminou.' using errcode = '42501';
    end if;
  else
    raise exception 'Sem permissao para atualizar este pedido.' using errcode = '42501';
  end if;

  update public.orders set
    estado_interno = case when patch ? 'estado_interno' then patch->>'estado_interno' else estado_interno end,
    status = case when patch ? 'status' then patch->>'status' else status end,
    updated_at = case when patch ? 'updated_at' then (patch->>'updated_at')::timestamptz else updated_at end,
    aceite_em = case when patch ? 'aceite_em' then (patch->>'aceite_em')::timestamptz else aceite_em end,
    atribuido_em = case when patch ? 'atribuido_em' then (patch->>'atribuido_em')::timestamptz else atribuido_em end,
    recolhido_em = case when patch ? 'recolhido_em' then (patch->>'recolhido_em')::timestamptz else recolhido_em end,
    entregue_em = case when patch ? 'entregue_em' then (patch->>'entregue_em')::timestamptz else entregue_em end,
    driver_name = case when patch ? 'driver_name' then patch->>'driver_name' else driver_name end,
    driver_phone = case when patch ? 'driver_phone' then patch->>'driver_phone' else driver_phone end,
    veiculo_estafeta = case when patch ? 'veiculo_estafeta' then patch->>'veiculo_estafeta' else veiculo_estafeta end,
    shipday_tracking_url = case when patch ? 'shipday_tracking_url' then patch->>'shipday_tracking_url' else shipday_tracking_url end
  where id = order_id_input
  returning * into target_order;

  return target_order;
end;
$function$;

create or replace function public.is_loja_authorized(caller_user_id integer, loja_id_check bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  is_admin boolean;
  is_owner_or_staff boolean;
begin
  is_admin := public.is_caller_admin(caller_user_id);

  if is_admin then
    return true;
  end if;

  select exists(
    select 1 from public.lojas l where l.idloja = loja_id_check and l.idutilizador = caller_user_id
    union
    select 1 from public.restaurant_staff_access rsa where rsa.loja_id = loja_id_check and rsa.user_id = caller_user_id::text
  ) into is_owner_or_staff;

  return is_owner_or_staff;
end;
$function$;

create or replace function public.admin_upsert_platform_setting(caller_user_id integer, chave_input text, valor_input jsonb)
returns public.configuracoes_plataforma
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  is_admin boolean;
  target_row public.configuracoes_plataforma;
begin
  is_admin := public.is_caller_admin(caller_user_id);

  if not is_admin then
    raise exception 'Apenas administradores podem alterar configuracoes da plataforma.' using errcode = '42501';
  end if;

  insert into public.configuracoes_plataforma (chave, valor, updated_at)
  values (chave_input, valor_input, now())
  on conflict (chave) do update set valor = excluded.valor, updated_at = now()
  returning * into target_row;

  return target_row;
end;
$function$;

create or replace function public.admin_save_address(caller_user_id integer, morada_input text, latitude_input double precision, longitude_input double precision, place_id_input text, nome_input text)
returns public.moradas
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  is_admin boolean;
  target_row public.moradas;
begin
  is_admin := public.is_caller_admin(caller_user_id);

  if not is_admin then
    raise exception 'Apenas administradores podem provisionar moradas de lojas.' using errcode = '42501';
  end if;

  insert into public.moradas (morada, latitude, longitude, place_id, nome, data_criacao)
  values (morada_input, latitude_input, longitude_input, place_id_input, nome_input, now())
  returning * into target_row;

  return target_row;
end;
$function$;

create or replace function public.stores_apply_authorized_patch(caller_user_id integer, loja_id_input bigint, patch jsonb)
returns public.lojas
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  is_admin boolean;
  owner_keys text[] := array['nome','contacto','nif','morada_completa','horario_funcionamento','latitude','longitude','place_id','idtipoloja','imagemfundo','icon','idmorada','ativo'];
  admin_only_keys text[] := array['aceitacao_automatica_pedidos','atribuicao_automatica_estafeta','configuracao_auto_assign','comissao_pedeja_percent','configuracoes_comissao','configuracao_entrega','taxaentrega','dispatch_interno_ativo'];
  allowed_keys text[] := owner_keys || admin_only_keys;
  patch_key text;
  target_loja public.lojas;
begin
  is_admin := public.is_caller_admin(caller_user_id);

  if not is_admin and not public.is_loja_authorized(caller_user_id, loja_id_input) then
    raise exception 'Sem permissao para atualizar esta loja.' using errcode = '42501';
  end if;

  for patch_key in select jsonb_object_keys(patch) loop
    if not (patch_key = any(allowed_keys)) then
      raise exception 'Campo % nao permitido nesta atualizacao.', patch_key using errcode = '42501';
    end if;

    if (patch_key = any(admin_only_keys)) and not is_admin then
      raise exception 'Campo % so pode ser alterado por administradores.', patch_key using errcode = '42501';
    end if;
  end loop;

  update public.lojas set
    nome = case when patch ? 'nome' then patch->>'nome' else nome end,
    contacto = case when patch ? 'contacto' then patch->>'contacto' else contacto end,
    nif = case when patch ? 'nif' then patch->>'nif' else nif end,
    morada_completa = case when patch ? 'morada_completa' then patch->>'morada_completa' else morada_completa end,
    horario_funcionamento = case when patch ? 'horario_funcionamento' then patch->'horario_funcionamento' else horario_funcionamento end,
    latitude = case when patch ? 'latitude' then (patch->>'latitude')::double precision else latitude end,
    longitude = case when patch ? 'longitude' then (patch->>'longitude')::double precision else longitude end,
    place_id = case when patch ? 'place_id' then patch->>'place_id' else place_id end,
    idtipoloja = case when patch ? 'idtipoloja' then (patch->>'idtipoloja')::integer else idtipoloja end,
    imagemfundo = case when patch ? 'imagemfundo' then patch->>'imagemfundo' else imagemfundo end,
    icon = case when patch ? 'icon' then patch->>'icon' else icon end,
    idmorada = case when patch ? 'idmorada' then (patch->>'idmorada')::integer else idmorada end,
    ativo = case when patch ? 'ativo' then (patch->>'ativo')::boolean else ativo end,
    aceitacao_automatica_pedidos = case when patch ? 'aceitacao_automatica_pedidos' then (patch->>'aceitacao_automatica_pedidos')::boolean else aceitacao_automatica_pedidos end,
    atribuicao_automatica_estafeta = case when patch ? 'atribuicao_automatica_estafeta' then (patch->>'atribuicao_automatica_estafeta')::boolean else atribuicao_automatica_estafeta end,
    configuracao_auto_assign = case when patch ? 'configuracao_auto_assign' then patch->'configuracao_auto_assign' else configuracao_auto_assign end,
    comissao_pedeja_percent = case when patch ? 'comissao_pedeja_percent' then (patch->>'comissao_pedeja_percent')::numeric else comissao_pedeja_percent end,
    configuracoes_comissao = case when patch ? 'configuracoes_comissao' then patch->'configuracoes_comissao' else configuracoes_comissao end,
    configuracao_entrega = case when patch ? 'configuracao_entrega' then patch->'configuracao_entrega' else configuracao_entrega end,
    taxaentrega = case when patch ? 'taxaentrega' then (patch->>'taxaentrega')::numeric else taxaentrega end,
    dispatch_interno_ativo = case when patch ? 'dispatch_interno_ativo' then (patch->>'dispatch_interno_ativo')::boolean else dispatch_interno_ativo end
  where idloja = loja_id_input
  returning * into target_loja;

  if target_loja is null then
    raise exception 'Loja nao encontrada.' using errcode = 'P0002';
  end if;

  return target_loja;
end;
$function$;

create or replace function public.admin_search_users_for_association(caller_user_id integer, term text default ''::text, limit_input integer default 20)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_result json;
  v_wildcard text;
  v_limit integer;
  v_term text;
begin
  if not public.is_caller_admin(caller_user_id) then
    raise exception 'Sem permissao.' using errcode = '42501';
  end if;

  v_limit := greatest(1, least(coalesce(limit_input, 20), 100));
  v_term := coalesce(trim(term), '');
  v_wildcard := '%' || v_term || '%';

  with matched_users as (
    select u.idutilizador, u.username, u.email, u.telemovel, u.dataregisto
    from public.utilizadores u
    where v_term = ''
       or u.email ilike v_wildcard
       or u.username ilike v_wildcard
       or u.telemovel ilike v_wildcard
    order by u.idutilizador desc
    limit v_limit
  ),
  enriched as (
    select
      mu.idutilizador,
      mu.username,
      mu.email,
      mu.telemovel,
      mu.dataregisto,
      public.is_caller_admin(mu.idutilizador) as is_admin,
      (
        select array_agg(distinct p.permissao)
        from public.utilizadorespermissoes up
        join public.permissoes p on p.idpermissao = up.idpermissao
        where up.idutilizador = mu.idutilizador
      ) as permission_labels,
      (select l.idloja from public.lojas l where l.idutilizador = mu.idutilizador limit 1) as owner_loja_id,
      (select l.nome from public.lojas l where l.idutilizador = mu.idutilizador limit 1) as owner_loja_nome,
      (select rsa.loja_id from public.restaurant_staff_access rsa where rsa.user_id = mu.idutilizador::text limit 1) as staff_loja_id
    from matched_users mu
  ),
  resolved as (
    select
      e.idutilizador,
      e.username,
      e.email,
      e.telemovel,
      e.dataregisto,
      case
        when e.is_admin then 'admin'
        when e.permission_labels is not null and array_length(e.permission_labels, 1) > 0 then (
          select label from (
            select unnest(e.permission_labels) as raw_label
          ) t
          cross join lateral (
            select case
              when raw_label ilike '%admin%' then 'admin'
              when raw_label ilike '%dev%' or raw_label ilike '%tecnico%' or raw_label ilike '%ops%' then 'dev'
              when raw_label ilike '%restaur%' or raw_label ilike '%loja%' or raw_label ilike '%merchant%' then 'restaurant'
              else 'customer'
            end as label
          ) mapped
          order by case label when 'admin' then 4 when 'dev' then 3 when 'restaurant' then 2 else 1 end desc
          limit 1
        )
        when coalesce(e.owner_loja_id, e.staff_loja_id) is not null then 'restaurant'
        else 'customer'
      end as role,
      coalesce(e.owner_loja_id, e.staff_loja_id) as loja_id,
      e.owner_loja_nome as loja_nome
    from enriched e
  )
  select coalesce(json_agg(row_to_json(resolved)), '[]'::json) into v_result from resolved;

  return v_result;
end;
$function$;

-- 4) Tabela deixa de ter qualquer funcao/policy/view a apontar para ela --
--    seguro remover.
drop table if exists public.app_admins;

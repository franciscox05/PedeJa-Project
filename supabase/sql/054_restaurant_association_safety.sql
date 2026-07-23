-- Corrige um bug real: associar um restaurante a uma conta nunca verificava
-- se a loja ja tinha outra conta associada -- reatribuir sobrescrevia
-- lojas.idutilizador silenciosamente, mas nunca retirava a permissao
-- 'restaurante' nem a linha em restaurant_staff_access da conta antiga, por
-- isso as duas contas (a antiga e a nova) ficavam com acesso ao dashboard da
-- mesma loja ao mesmo tempo. Agora bloqueia a reatribuicao e identifica a
-- conta atual, e ganha uma funcao para remover a associacao explicitamente
-- antes de associar outra conta.

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
  utilizador_atual record;
  v_already_associated boolean := false;
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

  if loja_alvo.idutilizador is not null and loja_alvo.idutilizador = target_user_id then
    v_already_associated := true;
  end if;

  if loja_alvo.idutilizador is not null and loja_alvo.idutilizador <> target_user_id then
    select * into utilizador_atual from public.utilizadores where idutilizador = loja_alvo.idutilizador;
    raise exception 'Esta loja ja esta associada a %. Remove essa associacao primeiro.',
      coalesce(utilizador_atual.email, utilizador_atual.username, 'outro utilizador')
      using errcode = 'P0002';
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
    'store', json_build_object('idloja', loja_alvo.idloja, 'nome', loja_alvo.nome),
    'already_associated', v_already_associated
  );
end;
$function$;

-- Desassocia a conta atual de uma loja, para se poder associar outra
-- depois. So retira a permissao 'restaurante' dessa conta se ela nao ficar
-- com mais nenhuma loja (dono ou staff) -- evita tirar acesso a outros
-- restaurantes que a mesma conta ainda possa gerir.
create or replace function public.admin_remove_restaurant_association(caller_user_id integer, loja_id_input integer)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_is_admin boolean;
  loja_alvo public.lojas;
  removed_user_id integer;
  restaurante_permissao_id integer;
  remaining_stores integer;
begin
  v_is_admin := public.is_caller_admin(caller_user_id);
  if not v_is_admin then
    raise exception 'Apenas administradores podem remover associacoes de restaurantes.' using errcode = '42501';
  end if;

  select * into loja_alvo from public.lojas where idloja = loja_id_input;
  if loja_alvo is null then
    raise exception 'Loja nao encontrada.';
  end if;

  removed_user_id := loja_alvo.idutilizador;

  if removed_user_id is null then
    return json_build_object('removed', false, 'loja_id', loja_id_input);
  end if;

  update public.lojas set idutilizador = null where idloja = loja_id_input;

  delete from public.restaurant_staff_access
  where loja_id = loja_id_input and user_id = removed_user_id::text;

  select count(*) into remaining_stores
  from (
    select idloja from public.lojas where idutilizador = removed_user_id
    union
    select loja_id from public.restaurant_staff_access where user_id = removed_user_id::text
  ) remaining;

  if remaining_stores = 0 then
    select idpermissao into restaurante_permissao_id from public.permissoes where permissao = 'restaurante' limit 1;
    delete from public.utilizadorespermissoes
    where idutilizador = removed_user_id and idpermissao = restaurante_permissao_id;
  end if;

  return json_build_object('removed', true, 'loja_id', loja_id_input, 'previous_user_id', removed_user_id);
end;
$function$;

-- Consulta quem esta associado a uma loja neste momento (para o admin ver
-- antes de tentar associar outra conta).
create or replace function public.admin_get_store_association(caller_user_id integer, loja_id_input integer)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_is_admin boolean;
  loja_alvo public.lojas;
  utilizador_atual record;
begin
  v_is_admin := public.is_caller_admin(caller_user_id);
  if not v_is_admin then
    raise exception 'Apenas administradores podem consultar associacoes de restaurantes.' using errcode = '42501';
  end if;

  select * into loja_alvo from public.lojas where idloja = loja_id_input;
  if loja_alvo is null then
    raise exception 'Loja nao encontrada.';
  end if;

  if loja_alvo.idutilizador is null then
    return json_build_object('associated', false);
  end if;

  select * into utilizador_atual from public.utilizadores where idutilizador = loja_alvo.idutilizador;

  return json_build_object(
    'associated', true,
    'user', json_build_object(
      'idutilizador', utilizador_atual.idutilizador,
      'username', utilizador_atual.username,
      'email', utilizador_atual.email
    )
  );
end;
$function$;

-- Permite ao admin repor a password de um estafeta quando este a perde/esquece,
-- sem depender de estafeta_change_password (que exige saber a password atual).
-- Mesmo padrao de admin_create_estafeta: gera password temporaria aleatoria,
-- devolve-a uma unica vez na resposta (nunca fica guardada em texto simples).

create or replace function public.admin_reset_estafeta_password(
  caller_user_id integer,
  estafeta_id_input bigint
) returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_estafeta public.estafetas;
  v_temp_password text;
begin
  if not public.is_caller_admin(caller_user_id) then
    raise exception 'Sem permissao para repor password de estafeta.' using errcode = '42501';
  end if;

  select * into v_estafeta from public.estafetas where id = estafeta_id_input and not eliminado;
  if v_estafeta is null then
    raise exception 'Estafeta nao encontrado.' using errcode = 'P0002';
  end if;

  v_temp_password := 'PedeJa#' || upper(substr(md5(random()::text), 1, 6));

  update private.utilizador_credenciais
  set password = crypt(v_temp_password, gen_salt('bf'))
  where idutilizador = v_estafeta.idutilizador;

  if not found then
    raise exception 'Credenciais do estafeta nao encontradas.' using errcode = 'P0002';
  end if;

  update public.estafetas set
    password_temporaria = true,
    atualizado_em = now()
  where id = estafeta_id_input;

  return json_build_object(
    'estafeta_id', v_estafeta.id,
    'email', v_estafeta.email,
    'password_temporaria', v_temp_password
  );
end;
$function$;

revoke all on function public.admin_reset_estafeta_password(integer, bigint) from public;
grant execute on function public.admin_reset_estafeta_password(integer, bigint) to anon, authenticated, postgres, service_role;

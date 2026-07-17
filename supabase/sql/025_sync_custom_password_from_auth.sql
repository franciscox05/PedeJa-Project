create or replace function public.sync_custom_password_from_auth(nova_senha text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  auth_email text;
  target_id integer;
begin
  auth_email := auth.email();

  if auth_email is null then
    raise exception 'Sem sessao autenticada.' using errcode = 'P0003';
  end if;

  select idutilizador into target_id
  from public.utilizadores
  where email = auth_email;

  if target_id is null then
    raise exception 'Nao existe conta correspondente a este email.' using errcode = 'P0004';
  end if;

  update private.utilizador_credenciais
  set password = crypt(nova_senha, gen_salt('bf'))
  where idutilizador = target_id;

  if not found then
    insert into private.utilizador_credenciais (idutilizador, password)
    values (target_id, crypt(nova_senha, gen_salt('bf')));
  end if;
end;
$function$;

grant execute on function public.sync_custom_password_from_auth(text) to authenticated;

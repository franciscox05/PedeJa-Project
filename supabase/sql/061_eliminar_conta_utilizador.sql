-- Permite ao cliente eliminar (desativar) a propria conta a partir do
-- perfil (equivalente ao ProfileDelete.jsx do base44). Segue o mesmo
-- padrao de confirmacao por password de atualizar_utilizador, e reusa a
-- flag "ativo" ja existente e ja respeitada pelo login_utilizador (uma
-- conta com ativo = false ja fica bloqueada no login). E uma desativacao
-- reversivel via suporte, nao um hard delete -- preserva o historico de
-- pedidos e evita quebrar referencias de chave estrangeira.

create or replace function public.eliminar_conta_utilizador(caller_user_id integer, id_user integer, current_password text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_credenciais record;
begin
  if caller_user_id is null or caller_user_id <> id_user then
    raise exception 'Sem permissao para eliminar esta conta.' using errcode = '42501';
  end if;

  select * into v_credenciais from private.utilizador_credenciais where idutilizador = id_user;
  if v_credenciais is null or v_credenciais.password != crypt(coalesce(current_password, ''), v_credenciais.password) then
    raise exception 'Password incorreta.' using errcode = '28P01';
  end if;

  update public.utilizadores
  set ativo = false
  where idutilizador = id_user;

  return true;
end;
$function$;

grant execute on function public.eliminar_conta_utilizador(integer, integer, text) to anon, authenticated;

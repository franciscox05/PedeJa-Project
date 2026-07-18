-- CRITICAL SECURITY FIX (auditoria geral): atualizar_utilizador(id_user, ...)
-- estava exposta a anon/authenticated SEM qualquer verificacao de que quem
-- chama e o proprio dono da conta -- qualquer pessoa (mesmo sem sessao) podia
-- invocar a RPC diretamente com qualquer idutilizador e definir uma password
-- nova, tomando conta de qualquer utilizador (incluindo admins). Alem disso
-- nao pedia a password atual para trocar a password.
--
-- Esta migration:
--   1. Remove a assinatura antiga (insegura) da funcao.
--   2. Recria com um caller_user_id explicito, so permitindo id_user = caller_user_id.
--   3. Exige a password atual (verificada via crypt) sempre que uma nova_senha
--      e definida, e impoe um comprimento minimo de 6 caracteres.

drop function if exists public.atualizar_utilizador(integer, text, text, text, text);

create or replace function public.atualizar_utilizador(
  caller_user_id integer,
  id_user integer,
  novo_nome text,
  novo_email text,
  novo_telemovel text,
  nova_senha text default null,
  current_password text default null
) returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  dados_atualizados record;
  v_credenciais record;
begin
  if caller_user_id is null or caller_user_id <> id_user then
    raise exception 'Sem permissao para atualizar este utilizador.' using errcode = '42501';
  end if;

  if nova_senha is not null and length(nova_senha) > 0 then
    if length(nova_senha) < 6 then
      raise exception 'A nova password deve ter pelo menos 6 caracteres.' using errcode = '22023';
    end if;

    select * into v_credenciais from private.utilizador_credenciais where idutilizador = id_user;
    if v_credenciais is null or v_credenciais.password != crypt(coalesce(current_password, ''), v_credenciais.password) then
      raise exception 'Password atual incorreta.' using errcode = '28P01';
    end if;
  end if;

  update public.utilizadores
  set
    username = novo_nome,
    email = novo_email,
    telemovel = novo_telemovel
  where idutilizador = id_user
  returning idutilizador, username, email, telemovel, dataregisto into dados_atualizados;

  if nova_senha is not null and length(nova_senha) > 0 then
    update private.utilizador_credenciais
    set password = crypt(nova_senha, gen_salt('bf'))
    where idutilizador = id_user;
  end if;

  return row_to_json(dados_atualizados);
end;
$function$;

revoke all on function public.atualizar_utilizador(integer, integer, text, text, text, text, text) from public;
grant execute on function public.atualizar_utilizador(integer, integer, text, text, text, text, text) to anon, authenticated, postgres, service_role;

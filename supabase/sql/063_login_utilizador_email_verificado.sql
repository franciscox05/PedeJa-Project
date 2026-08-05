-- Acrescenta email_verificado ao payload devolvido por login_utilizador,
-- para o frontend poder mostrar o estado de verificacao sem uma query
-- extra. Depende da coluna adicionada em 062_email_verificado.sql.

create or replace function public.login_utilizador(input_identificador text, input_senha text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  utilizador_encontrado record;
  credenciais record;
  match_count integer;
begin
  select * into utilizador_encontrado
  from public.utilizadores
  where email = input_identificador;

  if utilizador_encontrado is null then
    select count(*) into match_count
    from public.utilizadores
    where telemovel = input_identificador;

    if match_count = 0 then
      return null;
    elsif match_count > 1 then
      raise exception 'Este numero de telemovel esta associado a mais do que uma conta. Inicia sessao com o teu email.' using errcode = 'P0002';
    else
      select * into utilizador_encontrado
      from public.utilizadores
      where telemovel = input_identificador;
    end if;
  end if;

  select * into credenciais
  from private.utilizador_credenciais
  where idutilizador = utilizador_encontrado.idutilizador;

  if credenciais is null then
    return null;
  end if;

  if credenciais.password = crypt(input_senha, credenciais.password) then
     if utilizador_encontrado.ativo is not true then
       raise exception 'Esta conta foi desativada. Contacta o suporte para a reativar.' using errcode = 'P0001';
     end if;

     return json_build_object(
       'id', utilizador_encontrado.idutilizador,
       'username', utilizador_encontrado.username,
       'email', utilizador_encontrado.email,
       'telemovel', utilizador_encontrado.telemovel,
       'dataregisto', utilizador_encontrado.dataregisto,
       'email_verificado', utilizador_encontrado.email_verificado
     );
  else
     return null;
  end if;
end;
$function$;

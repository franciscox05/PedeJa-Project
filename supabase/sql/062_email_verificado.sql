-- Verificacao de email para o cliente (equivalente ao VerifyEmail.jsx do
-- base44), implementada de forma nao-bloqueante: nao mexe no login
-- customizado (login_utilizador continua a ser o unico gate de acesso).
-- Fluxo: o frontend usa supabase.auth.signInWithOtp + verifyOtp para
-- confirmar a posse do email (codigo de 6 digitos enviado pelo proprio
-- Supabase Auth); depois desta RPC marca a conta como verificada,
-- identificando o email pela sessao de auth ja validada (auth.email()),
-- nunca por um parametro vindo do cliente -- mesmo padrao ja usado em
-- sync_custom_password_from_auth.

alter table public.utilizadores
  add column if not exists email_verificado boolean not null default false;

create or replace function public.marcar_email_verificado()
returns boolean
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

  update public.utilizadores
  set email_verificado = true
  where idutilizador = target_id;

  return true;
end;
$function$;

grant execute on function public.marcar_email_verificado() to anon, authenticated;

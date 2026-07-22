-- Pagamentos/liquidacao de estafetas: o admin "fecha" as entregas ja feitas e
-- ainda nao pagas de um estafeta, registando o valor total e ficando com
-- historico. Nao substitui um sistema de pagamentos real (nao move dinheiro)
-- -- e so o registo formal de que aquele lote de entregas foi liquidado.

create table if not exists public.estafeta_liquidacoes (
  id bigint generated always as identity primary key,
  estafeta_id bigint not null references public.estafetas(id),
  valor_total numeric not null default 0,
  entregas_incluidas integer not null default 0,
  notas text,
  criado_por integer,
  criado_em timestamptz not null default now()
);

alter table public.estafeta_liquidacoes enable row level security;

alter table public.atribuicoes_entrega
  add column if not exists liquidacao_id bigint references public.estafeta_liquidacoes(id);

create index if not exists idx_atribuicoes_entrega_liquidacao_id
  on public.atribuicoes_entrega(liquidacao_id);

create or replace function public.admin_get_estafeta_pending_payout(caller_user_id integer, estafeta_id_input bigint)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_total numeric;
  v_count integer;
begin
  if not public.is_caller_admin(caller_user_id) then
    raise exception 'Sem permissao.' using errcode = '42501';
  end if;

  select coalesce(sum(valor_estafeta), 0), count(*)
  into v_total, v_count
  from public.atribuicoes_entrega
  where estafeta_id = estafeta_id_input and entregue_em is not null and liquidacao_id is null;

  return json_build_object('valor_pendente', v_total, 'entregas_pendentes', v_count);
end;
$function$;

create or replace function public.admin_create_estafeta_liquidacao(
  caller_user_id integer,
  estafeta_id_input bigint,
  notas_input text default null
) returns public.estafeta_liquidacoes
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_liquidacao public.estafeta_liquidacoes;
  v_ids bigint[];
  v_total numeric;
  v_count integer;
begin
  if not public.is_caller_admin(caller_user_id) then
    raise exception 'Sem permissao.' using errcode = '42501';
  end if;

  with locked as (
    select id, valor_estafeta
    from public.atribuicoes_entrega
    where estafeta_id = estafeta_id_input and entregue_em is not null and liquidacao_id is null
    for update
  )
  select array_agg(id), coalesce(sum(valor_estafeta), 0), count(*)
  into v_ids, v_total, v_count
  from locked;

  if v_count = 0 then
    raise exception 'Sem entregas pendentes de pagamento para este estafeta.' using errcode = 'P0002';
  end if;

  insert into public.estafeta_liquidacoes (estafeta_id, valor_total, entregas_incluidas, notas, criado_por)
  values (estafeta_id_input, v_total, v_count, notas_input, caller_user_id)
  returning * into v_liquidacao;

  update public.atribuicoes_entrega set liquidacao_id = v_liquidacao.id
  where id = any(v_ids);

  return v_liquidacao;
end;
$function$;

create or replace function public.admin_list_estafeta_liquidacoes(caller_user_id integer, estafeta_id_input bigint)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_result json;
begin
  if not public.is_caller_admin(caller_user_id) then
    raise exception 'Sem permissao.' using errcode = '42501';
  end if;

  select coalesce(json_agg(l order by l.criado_em desc), '[]'::json) into v_result
  from public.estafeta_liquidacoes l
  where l.estafeta_id = estafeta_id_input;

  return v_result;
end;
$function$;

create or replace function public.estafeta_get_my_liquidacoes(caller_user_id integer)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_estafeta public.estafetas;
  v_result json;
begin
  select * into v_estafeta from public.estafetas where idutilizador = caller_user_id and eliminado = false;
  if v_estafeta is null then
    return '[]'::json;
  end if;

  select coalesce(json_agg(l order by l.criado_em desc), '[]'::json) into v_result
  from public.estafeta_liquidacoes l
  where l.estafeta_id = v_estafeta.id;

  return v_result;
end;
$function$;

revoke all on function public.admin_get_estafeta_pending_payout(integer, bigint) from public;
revoke all on function public.admin_create_estafeta_liquidacao(integer, bigint, text) from public;
revoke all on function public.admin_list_estafeta_liquidacoes(integer, bigint) from public;
grant execute on function public.admin_get_estafeta_pending_payout(integer, bigint) to anon, authenticated, postgres, service_role;
grant execute on function public.admin_create_estafeta_liquidacao(integer, bigint, text) to anon, authenticated, postgres, service_role;
grant execute on function public.admin_list_estafeta_liquidacoes(integer, bigint) to anon, authenticated, postgres, service_role;

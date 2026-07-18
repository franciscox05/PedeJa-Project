-- Fase 4 (backlog): grafico de ganhos do estafeta por periodo.
-- Devolve totais diarios; o frontend agrega em "esta semana"/"este mes"
-- fatiando este array, sem precisar de mais RPCs.

create or replace function public.estafeta_get_earnings_by_day(caller_user_id integer, days_input integer default 35)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_estafeta_id bigint;
  v_result json;
begin
  select id into v_estafeta_id from public.estafetas where idutilizador = caller_user_id and eliminado = false;
  if v_estafeta_id is null then
    return '[]'::json;
  end if;

  select coalesce(json_agg(t order by t.dia), '[]'::json) into v_result
  from (
    select
      date_trunc('day', entregue_em)::date as dia,
      coalesce(sum(valor_estafeta), 0) as total,
      count(*) as entregas
    from public.atribuicoes_entrega
    where estafeta_id = v_estafeta_id
      and entregue_em is not null
      and entregue_em >= now() - (greatest(1, least(coalesce(days_input, 35), 180)) || ' days')::interval
    group by 1
  ) t;

  return v_result;
end;
$function$;

revoke all on function public.estafeta_get_earnings_by_day(integer, integer) from public;
grant execute on function public.estafeta_get_earnings_by_day(integer, integer) to anon, authenticated, postgres, service_role;

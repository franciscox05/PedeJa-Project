-- Relatorio de operacao de entregas para o admin: ranking de estafetas,
-- entregas falhadas/canceladas e taxa de entregas "a tempo" (limiar
-- configuravel, default 45 min entre criacao do pedido e entrega).

create or replace function public.admin_get_delivery_ops_report(
  caller_user_id integer,
  days_input integer default 30,
  on_time_threshold_minutes_input integer default 45
) returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_since timestamptz;
  v_leaderboard json;
  v_failed json;
  v_on_time_count integer;
  v_total_delivered integer;
  v_threshold integer;
begin
  if not public.is_caller_admin(caller_user_id) then
    raise exception 'Sem permissao.' using errcode = '42501';
  end if;

  v_since := now() - make_interval(days => greatest(1, coalesce(days_input, 30)));
  v_threshold := greatest(1, coalesce(on_time_threshold_minutes_input, 45));

  select coalesce(json_agg(t order by t.entregas_concluidas desc), '[]'::json) into v_leaderboard
  from (
    select
      e.id as estafeta_id,
      e.nome,
      e.avaliacao_media,
      count(*) filter (where ae.entregue_em is not null) as entregas_concluidas,
      count(*) filter (where ae.cancelado_em is not null) as entregas_canceladas,
      count(*) filter (where ae.rejeitado_em is not null) as pedidos_rejeitados,
      round(avg(extract(epoch from (ae.entregue_em - ae.atribuido_em)) / 60.0) filter (where ae.entregue_em is not null)::numeric, 1) as tempo_medio_min
    from public.estafetas e
    left join public.atribuicoes_entrega ae on ae.estafeta_id = e.id and ae.criado_em >= v_since
    where e.eliminado = false
    group by e.id, e.nome, e.avaliacao_media
  ) t;

  select coalesce(json_agg(f), '[]'::json) into v_failed
  from (
    select ae.id, ae.order_id, e.nome as estafeta_nome, ae.cancelado_em, ae.motivo_cancelamento, o.customer_nome
    from public.atribuicoes_entrega ae
    join public.estafetas e on e.id = ae.estafeta_id
    join public.orders o on o.id = ae.order_id
    where ae.cancelado_em is not null and ae.criado_em >= v_since
    order by ae.cancelado_em desc
    limit 50
  ) f;

  select
    count(*) filter (where ae.entregue_em is not null and (ae.entregue_em - o.created_at) <= make_interval(mins => v_threshold)),
    count(*) filter (where ae.entregue_em is not null)
  into v_on_time_count, v_total_delivered
  from public.atribuicoes_entrega ae
  join public.orders o on o.id = ae.order_id
  where ae.criado_em >= v_since;

  return json_build_object(
    'leaderboard', v_leaderboard,
    'failed_deliveries', v_failed,
    'on_time_rate_percent', case when v_total_delivered > 0 then round(100.0 * v_on_time_count / v_total_delivered, 1) else null end,
    'on_time_threshold_minutes', v_threshold,
    'total_delivered', v_total_delivered,
    'period_days', greatest(1, coalesce(days_input, 30))
  );
end;
$function$;

revoke all on function public.admin_get_delivery_ops_report(integer, integer, integer) from public;
grant execute on function public.admin_get_delivery_ops_report(integer, integer, integer) to anon, authenticated, postgres, service_role;

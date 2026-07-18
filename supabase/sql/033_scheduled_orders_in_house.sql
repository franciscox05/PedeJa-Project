-- Migra os pedidos agendados para o dispatch 100% interno nas lojas com
-- dispatch_interno_ativo=true. Ate agora, mesmo nessas lojas, um pedido
-- agendado so era "libertado" para o Shipday se alguem tivesse o dashboard
-- aberto (o auto-assign so corria no cliente, disparado ao clicar
-- "aceitar"). Isto porta essa janela de libertacao (30 min antes da hora
-- marcada, mesma constante SCHEDULED_RELEASE_WINDOW_MS ja usada no
-- frontend) para dentro de auto_assign_deliveries(), que ja corre a cada
-- minuto via pg_cron independentemente de haver alguem a olhar para o
-- dashboard.

create or replace function public.auto_assign_deliveries()
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_loja record;
  v_order record;
  v_criteria jsonb;
  v_best_estafeta_id bigint;
  v_best_distancia numeric;
  v_assigned_count integer := 0;
  v_total_count integer := 0;
  v_global_enabled boolean;
  v_global_criteria jsonb;
begin
  select coalesce((valor->>'enabled')::boolean, false), coalesce(valor->'criteria', '{}'::jsonb)
    into v_global_enabled, v_global_criteria
    from public.configuracoes_plataforma where chave = 'auto_assign_carriers_default';

  for v_loja in
    select l.idloja, l.latitude, l.longitude, l.atribuicao_automatica_estafeta, l.configuracao_auto_assign
    from public.lojas l
    where l.dispatch_interno_ativo = true
      and (
        coalesce(v_global_enabled, false)
        or l.atribuicao_automatica_estafeta
        or coalesce((l.configuracao_auto_assign->>'enabled')::boolean, false)
      )
  loop
    v_criteria := case
      when coalesce(v_global_enabled, false) then coalesce(v_global_criteria, '{}'::jsonb)
      else coalesce(v_loja.configuracao_auto_assign->'criteria', '{}'::jsonb)
    end;

    for v_order in
      select o.id, o.taxa_entrega
      from public.orders o
      where o.loja_id = v_loja.idloja
        and o.estado_interno in ('pendente', 'aceite')
        and not exists(select 1 from public.atribuicoes_entrega a where a.order_id = o.id and a.ativo = true)
        and (
          upper(coalesce(o.order_timing_mode, 'ASAP')) <> 'SCHEDULED'
          or o.scheduled_for is null
          or o.scheduled_for <= now() + interval '30 minutes'
        )
      order by o.created_at asc
    loop
      v_total_count := v_total_count + 1;

      select e.id, public.estafeta_haversine_km(v_loja.latitude, v_loja.longitude, e.ultima_localizacao_lat, e.ultima_localizacao_lng)
        into v_best_estafeta_id, v_best_distancia
        from public.estafetas e
        where e.ativo = true and e.eliminado = false and e.online = true and e.disponivel = true
          and (e.ultima_atividade_em is null or e.ultima_atividade_em > now() - interval '90 seconds')
        order by
          case when coalesce((v_criteria->>'workload')::boolean, true) then (
            select count(*) from public.atribuicoes_entrega a2 where a2.estafeta_id = e.id and a2.ativo = true
          ) else 0 end asc,
          case when coalesce((v_criteria->>'proximity')::boolean, true)
            then coalesce(public.estafeta_haversine_km(v_loja.latitude, v_loja.longitude, e.ultima_localizacao_lat, e.ultima_localizacao_lng), 999999)
            else 0
          end asc,
          e.nome asc
        limit 1;

      if v_best_estafeta_id is not null then
        begin
          perform public._assign_delivery_unchecked(v_order.id, v_best_estafeta_id, v_best_distancia);
          v_assigned_count := v_assigned_count + 1;
        exception when others then
          null;
        end;
      end if;

      v_best_estafeta_id := null;
    end loop;
  end loop;

  return json_build_object('assigned', v_assigned_count, 'total', v_total_count);
end;
$function$;

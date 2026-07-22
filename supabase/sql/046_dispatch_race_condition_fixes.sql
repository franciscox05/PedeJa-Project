-- Corrige 2 condicoes de corrida reais encontradas em auditoria (cron corre
-- auto_assign_deliveries + expire_stale_assignments a cada minuto, ambos
-- capazes de colidir com atribuicao manual/aceitacao do estafeta):
--
-- 1. _assign_delivery_unchecked bloqueava a linha do estafeta (FOR UPDATE)
--    mas nunca revalidava disponivel/pedido_atual_id depois de a obter --
--    duas atribuicoes concorrentes ao mesmo estafeta ocioso podiam ambas
--    passar, a segunda sobrepondo pedido_atual_id da primeira em silencio
--    (estafeta fica com 2 entregas ativas, pedido_atual_id so reflete uma).
--
-- 2. expire_stale_assignments fazia SELECT sem lock e so depois um UPDATE
--    por id, sem revalidar ativo/aceite_em no WHERE do UPDATE -- se o
--    estafeta aceitasse a atribuicao exatamente nesse intervalo, o expire
--    marcava-a como rejeitada/expirada por cima da aceitacao, fazendo a
--    entrega desaparecer da app do estafeta com o pedido preso sem
--    atribuicao ativa (auto-assign so apanha 'pendente'/'aceite', nao
--    'estafeta_aceitou').

create or replace function public._assign_delivery_unchecked(
  order_id_input bigint,
  estafeta_id_input bigint,
  distancia_km_input numeric
) returns public.atribuicoes_entrega
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_order public.orders;
  v_estafeta public.estafetas;
  v_assignment public.atribuicoes_entrega;
begin
  select * into v_order from public.orders where id = order_id_input for update;
  if v_order is null then
    raise exception 'Pedido nao encontrado.' using errcode = 'P0002';
  end if;

  select * into v_estafeta from public.estafetas where id = estafeta_id_input for update;
  if v_estafeta is null or v_estafeta.eliminado or not v_estafeta.ativo then
    raise exception 'Estafeta invalido ou inativo.' using errcode = '42501';
  end if;

  -- Revalida disponibilidade DEPOIS de obter o lock -- fecha a janela em que
  -- duas atribuicoes concorrentes liam "disponivel=true" antes de qualquer
  -- uma commitar.
  if not v_estafeta.disponivel or v_estafeta.pedido_atual_id is not null then
    raise exception 'Estafeta ja esta ocupado com outra entrega.' using errcode = 'P0002';
  end if;

  if exists(select 1 from public.atribuicoes_entrega where order_id = order_id_input and ativo = true) then
    raise exception 'Este pedido ja tem um estafeta atribuido.' using errcode = 'P0002';
  end if;

  insert into public.atribuicoes_entrega (order_id, estafeta_id, distancia_km, valor_estafeta)
  values (order_id_input, estafeta_id_input, distancia_km_input, coalesce(v_order.taxa_entrega, 0))
  returning * into v_assignment;

  update public.orders set
    estado_interno = case when estado_interno in ('pendente', 'aceite') then 'atribuindo_estafeta' else estado_interno end,
    driver_name = v_estafeta.nome,
    driver_phone = v_estafeta.telefone,
    veiculo_estafeta = v_estafeta.veiculo,
    atribuido_em = now(),
    updated_at = now()
  where id = order_id_input;

  update public.estafetas set
    disponivel = false,
    pedido_atual_id = order_id_input,
    atualizado_em = now()
  where id = estafeta_id_input;

  perform public.notify_estafeta_new_assignment(estafeta_id_input, order_id_input);
  perform public.notify_customer_delivery_update(order_id_input, 'atribuido');

  return v_assignment;
end;
$function$;

revoke all on function public._assign_delivery_unchecked(bigint, bigint, numeric) from public;
revoke execute on function public._assign_delivery_unchecked(bigint, bigint, numeric) from anon, authenticated;

-- Reescreve como UPDATE...RETURNING atomico (o proprio UPDATE re-executa o
-- WHERE ao adquirir o lock de cada linha), eliminando a janela entre o
-- SELECT de candidatos e o UPDATE por id que existia antes.
create or replace function public.expire_stale_assignments()
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_assignment record;
  v_expired_count integer := 0;
begin
  for v_assignment in
    update public.atribuicoes_entrega set
      ativo = false,
      rejeitado_em = now(),
      motivo_cancelamento = 'Expirado automaticamente - sem resposta do estafeta'
    where ativo = true
      and aceite_em is null
      and atribuido_em < now() - interval '3 minutes'
    returning id, order_id, estafeta_id
  loop
    update public.orders set
      estado_interno = 'aceite',
      driver_name = null,
      driver_phone = null,
      veiculo_estafeta = null,
      atribuido_em = null,
      updated_at = now()
    where id = v_assignment.order_id
      and estado_interno = 'atribuindo_estafeta';

    update public.estafetas set
      disponivel = online,
      pedido_atual_id = null,
      atualizado_em = now()
    where id = v_assignment.estafeta_id
      and pedido_atual_id = v_assignment.order_id;

    v_expired_count := v_expired_count + 1;
  end loop;

  return json_build_object('expired', v_expired_count);
end;
$function$;

revoke all on function public.expire_stale_assignments() from public;
grant execute on function public.expire_stale_assignments() to postgres, service_role;

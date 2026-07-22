-- Liga a notificacao push ao cliente ao momento em que o estafeta marca
-- "a caminho" (redefine estafeta_advance_status, ja com o parametro
-- foto_url_input introduzido em 041 -- so acrescenta o perform da notificacao).

create or replace function public.estafeta_advance_status(
  caller_user_id integer,
  assignment_id_input bigint,
  new_estado_input text,
  foto_url_input text default null
) returns public.atribuicoes_entrega
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_assignment public.atribuicoes_entrega;
  v_estafeta public.estafetas;
  v_order public.orders;
  v_allowed_next text[];
  v_is_admin boolean;
begin
  select a.* into v_assignment from public.atribuicoes_entrega a where a.id = assignment_id_input for update;
  if v_assignment is null or not v_assignment.ativo then
    raise exception 'Atribuicao nao encontrada ou ja terminada.' using errcode = 'P0002';
  end if;

  select * into v_estafeta from public.estafetas where id = v_assignment.estafeta_id;
  v_is_admin := public.is_caller_admin(caller_user_id);

  if v_estafeta.idutilizador != caller_user_id and not v_is_admin then
    raise exception 'Sem permissao sobre esta atribuicao.' using errcode = '42501';
  end if;

  if new_estado_input = 'entregue' and not v_is_admin and (foto_url_input is null or length(trim(foto_url_input)) = 0) then
    raise exception 'Foto de prova de entrega obrigatoria.' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = v_assignment.order_id;

  v_allowed_next := case v_order.estado_interno
    when 'estafeta_aceitou' then array['iniciado', 'recolhido']
    when 'em_preparacao' then array['recolhido']
    when 'pronto_recolha' then array['recolhido']
    when 'iniciado' then array['recolhido']
    when 'recolhido' then array['pronto_entregar', 'a_caminho']
    when 'pronto_entregar' then array['a_caminho']
    when 'a_caminho' then array['entregue']
    else array[]::text[]
  end;

  if not v_is_admin and not (new_estado_input = any(v_allowed_next)) then
    raise exception 'Transicao % nao permitida a partir de %.', new_estado_input, v_order.estado_interno using errcode = '42501';
  end if;

  update public.orders set
    estado_interno = new_estado_input,
    recolhido_em = case when new_estado_input = 'recolhido' then now() else recolhido_em end,
    entregue_em = case when new_estado_input = 'entregue' then now() else entregue_em end,
    updated_at = now()
  where id = v_assignment.order_id;

  update public.atribuicoes_entrega set
    recolhido_em = case when new_estado_input = 'recolhido' then now() else recolhido_em end,
    a_caminho_em = case when new_estado_input = 'a_caminho' then now() else a_caminho_em end,
    entregue_em = case when new_estado_input = 'entregue' then now() else entregue_em end,
    prova_entrega_foto_url = case when new_estado_input = 'entregue' then foto_url_input else prova_entrega_foto_url end,
    ativo = case when new_estado_input = 'entregue' then false else ativo end
  where id = assignment_id_input
  returning * into v_assignment;

  if new_estado_input = 'entregue' then
    update public.estafetas set
      total_entregas = total_entregas + 1,
      total_ganhos = total_ganhos + coalesce(v_assignment.valor_estafeta, 0),
      disponivel = online,
      pedido_atual_id = null,
      atualizado_em = now()
    where id = v_assignment.estafeta_id;
  end if;

  if new_estado_input = 'a_caminho' then
    perform public.notify_customer_delivery_update(v_assignment.order_id, 'a_caminho');
  end if;

  return v_assignment;
end;
$function$;

-- Permite ao estafeta desfazer um clique errado nos 2 avancos de estado que
-- ele proprio controla (recolhido, a caminho) -- nao cobre "entregue" de
-- proposito, porque essa transicao fecha a atribuicao, credita ganhos ao
-- estafeta e exige prova de foto; desfazer isso e um caso raro que deve
-- passar por um admin (ja existe admin_reassign_delivery/admin_force_deliver
-- para intervencao manual nesses casos).

create or replace function public.estafeta_revert_status(
  caller_user_id integer,
  assignment_id_input bigint
) returns public.atribuicoes_entrega
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_assignment public.atribuicoes_entrega;
  v_estafeta public.estafetas;
  v_order public.orders;
  v_previous_estado text;
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

  select * into v_order from public.orders where id = v_assignment.order_id;

  v_previous_estado := case v_order.estado_interno
    when 'recolhido' then 'estafeta_aceitou'
    when 'pronto_entregar' then 'estafeta_aceitou'
    when 'a_caminho' then 'recolhido'
    else null
  end;

  if v_previous_estado is null then
    raise exception 'Nao e possivel voltar atras a partir do estado atual.' using errcode = 'P0002';
  end if;

  update public.orders set
    estado_interno = v_previous_estado,
    recolhido_em = case when v_previous_estado <> 'recolhido' then null else recolhido_em end,
    updated_at = now()
  where id = v_assignment.order_id;

  update public.atribuicoes_entrega set
    recolhido_em = case when v_previous_estado <> 'recolhido' then null else recolhido_em end,
    a_caminho_em = null
  where id = assignment_id_input
  returning * into v_assignment;

  return v_assignment;
end;
$function$;

revoke all on function public.estafeta_revert_status(integer, bigint) from public;
grant execute on function public.estafeta_revert_status(integer, bigint) to anon, authenticated, postgres, service_role;

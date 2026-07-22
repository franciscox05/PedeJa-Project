-- Enriquece estafeta_get_my_state com o que o estafeta precisa para trabalhar
-- sem ter de adivinhar: loja de origem (nome/contacto/morada/coords), horas do
-- pedido, itens a recolher e notas do cliente. Aditivo -- os campos ja
-- existentes (customer_nome, customer_address, total, etc.) mantem-se, so
-- acrescenta campos novos ao mesmo nivel do objeto.

create or replace function public.estafeta_get_my_state(caller_user_id integer)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_estafeta public.estafetas;
  v_pending json;
  v_active json;
begin
  select * into v_estafeta from public.estafetas where idutilizador = caller_user_id and eliminado = false;
  if v_estafeta is null then
    return null;
  end if;

  select row_to_json(a) into v_pending
  from (
    select
      ae.*,
      o.customer_nome, o.customer_phone, o.customer_address, o.customer_address_label,
      o.customer_notes, o.customer_lat, o.customer_lng,
      o.total, o.loja_id, o.estado_interno,
      o.created_at as order_created_at, o.scheduled_for, o.previsao_entrega,
      l.nome as store_nome, l.contacto as store_contacto, l.morada_completa as store_morada,
      l.latitude as store_lat, l.longitude as store_lng,
      coalesce((
        select json_agg(json_build_object(
          'nome', oi.nome,
          'quantidade', oi.quantidade,
          'preco_unitario', oi.preco_unitario,
          'subtotal', oi.subtotal,
          'opcoes_selecionadas', oi.opcoes_selecionadas
        ) order by oi.id)
        from public.order_items oi where oi.order_id = o.id
      ), '[]'::json) as items
    from public.atribuicoes_entrega ae
    join public.orders o on o.id = ae.order_id
    left join public.lojas l on l.idloja = o.loja_id
    where ae.estafeta_id = v_estafeta.id and ae.ativo = true and ae.aceite_em is null
    order by ae.atribuido_em desc
    limit 1
  ) a;

  select row_to_json(a) into v_active
  from (
    select
      ae.*,
      o.customer_nome, o.customer_phone, o.customer_address, o.customer_address_label,
      o.customer_notes, o.customer_lat, o.customer_lng,
      o.total, o.loja_id, o.estado_interno,
      o.created_at as order_created_at, o.scheduled_for, o.previsao_entrega,
      l.nome as store_nome, l.contacto as store_contacto, l.morada_completa as store_morada,
      l.latitude as store_lat, l.longitude as store_lng,
      coalesce((
        select json_agg(json_build_object(
          'nome', oi.nome,
          'quantidade', oi.quantidade,
          'preco_unitario', oi.preco_unitario,
          'subtotal', oi.subtotal,
          'opcoes_selecionadas', oi.opcoes_selecionadas
        ) order by oi.id)
        from public.order_items oi where oi.order_id = o.id
      ), '[]'::json) as items
    from public.atribuicoes_entrega ae
    join public.orders o on o.id = ae.order_id
    left join public.lojas l on l.idloja = o.loja_id
    where ae.estafeta_id = v_estafeta.id and ae.ativo = true and ae.aceite_em is not null
    order by ae.atribuido_em desc
    limit 1
  ) a;

  return json_build_object(
    'estafeta', row_to_json(v_estafeta),
    'pending_assignment', v_pending,
    'active_assignment', v_active
  );
end;
$function$;

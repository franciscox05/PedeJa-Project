-- Historico do estafeta ganha o nome da loja (para mostrar "de X para Y"),
-- aditivo -- os campos existentes (customer_nome, customer_address, total,
-- loja_id, distancia_km, todos os *_em) mantem-se inalterados.

create or replace function public.estafeta_get_my_history(caller_user_id integer, limit_input integer default 50)
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

  select coalesce(json_agg(a), '[]'::json) into v_result
  from (
    select ae.*, o.customer_nome, o.customer_address, o.total, o.loja_id, l.nome as store_nome
    from public.atribuicoes_entrega ae
    join public.orders o on o.id = ae.order_id
    left join public.lojas l on l.idloja = o.loja_id
    where ae.estafeta_id = v_estafeta.id and ae.ativo = false
    order by ae.criado_em desc
    limit greatest(1, least(coalesce(limit_input, 50), 200))
  ) a;

  return v_result;
end;
$function$;

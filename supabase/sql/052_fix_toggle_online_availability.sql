-- Corrige um bug real de dispatch: ao ficar online, estafeta_toggle_online
-- nunca repunha disponivel=true (so forcava disponivel=false ao ficar
-- offline, e no caminho inverso mantinha o valor anterior). Um estafeta que
-- ficasse offline e depois voltasse a ficar online ficava com disponivel
-- preso a false para sempre -- invisivel tanto no auto-assign como no
-- dropdown de atribuicao manual do admin, mesmo sem nenhuma entrega em
-- curso (pedido_atual_id null). Agora disponivel acompanha online sempre
-- que nao ha entrega ativa.

create or replace function public.estafeta_toggle_online(caller_user_id integer, online_input boolean)
returns public.estafetas
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_estafeta public.estafetas;
begin
  update public.estafetas set
    online = online_input,
    disponivel = online_input and pedido_atual_id is null,
    ultima_atividade_em = now(),
    atualizado_em = now()
  where idutilizador = caller_user_id and eliminado = false and ativo = true
  returning * into v_estafeta;

  if v_estafeta is null then
    raise exception 'Conta de estafeta nao encontrada ou inativa.' using errcode = 'P0002';
  end if;

  return v_estafeta;
end;
$function$;

-- Repara estafetas ja presos neste estado inconsistente (online mas
-- indisponivel sem nenhuma entrega a decorrer).
update public.estafetas
set disponivel = true, atualizado_em = now()
where online = true and disponivel = false and pedido_atual_id is null and eliminado = false and ativo = true;

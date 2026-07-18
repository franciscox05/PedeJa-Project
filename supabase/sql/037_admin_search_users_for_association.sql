-- Auditoria geral: corrige a pesquisa de utilizadores para associar a um
-- restaurante (AdminRestaurantAssociation.jsx), que ate agora fazia leituras
-- diretas a app_admins (RLS sem policy -> devolve sempre vazio) em vez de
-- passar por uma RPC SECURITY DEFINER, quebrando o padrao usado no resto da
-- app e fazendo o utilizador nunca aparecer corretamente como "admin" nesta
-- pesquisa.

create or replace function public.admin_search_users_for_association(
  caller_user_id integer,
  term text default '',
  limit_input integer default 20
) returns json
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_result json;
  v_wildcard text;
  v_limit integer;
  v_term text;
begin
  if not public.is_caller_admin(caller_user_id) then
    raise exception 'Sem permissao.' using errcode = '42501';
  end if;

  v_limit := greatest(1, least(coalesce(limit_input, 20), 100));
  v_term := coalesce(trim(term), '');
  v_wildcard := '%' || v_term || '%';

  with matched_users as (
    select u.idutilizador, u.username, u.email, u.telemovel, u.dataregisto
    from public.utilizadores u
    where v_term = ''
       or u.email ilike v_wildcard
       or u.username ilike v_wildcard
       or u.telemovel ilike v_wildcard
    order by u.idutilizador desc
    limit v_limit
  ),
  enriched as (
    select
      mu.idutilizador,
      mu.username,
      mu.email,
      mu.telemovel,
      mu.dataregisto,
      exists(select 1 from public.app_admins aa where aa.user_id = mu.idutilizador::text) as is_admin,
      (
        select array_agg(distinct p.permissao)
        from public.utilizadorespermissoes up
        join public.permissoes p on p.idpermissao = up.idpermissao
        where up.idutilizador = mu.idutilizador
      ) as permission_labels,
      (select l.idloja from public.lojas l where l.idutilizador = mu.idutilizador limit 1) as owner_loja_id,
      (select l.nome from public.lojas l where l.idutilizador = mu.idutilizador limit 1) as owner_loja_nome,
      (select rsa.loja_id from public.restaurant_staff_access rsa where rsa.user_id = mu.idutilizador::text limit 1) as staff_loja_id
    from matched_users mu
  ),
  resolved as (
    select
      e.idutilizador,
      e.username,
      e.email,
      e.telemovel,
      e.dataregisto,
      case
        when e.is_admin then 'admin'
        when e.permission_labels is not null and array_length(e.permission_labels, 1) > 0 then (
          select label from (
            select unnest(e.permission_labels) as raw_label
          ) t
          cross join lateral (
            select case
              when raw_label ilike '%admin%' then 'admin'
              when raw_label ilike '%dev%' or raw_label ilike '%tecnico%' or raw_label ilike '%ops%' then 'dev'
              when raw_label ilike '%restaur%' or raw_label ilike '%loja%' or raw_label ilike '%merchant%' then 'restaurant'
              else 'customer'
            end as label
          ) mapped
          order by case label when 'admin' then 4 when 'dev' then 3 when 'restaurant' then 2 else 1 end desc
          limit 1
        )
        when coalesce(e.owner_loja_id, e.staff_loja_id) is not null then 'restaurant'
        else 'customer'
      end as role,
      coalesce(e.owner_loja_id, e.staff_loja_id) as loja_id,
      e.owner_loja_nome as loja_nome
    from enriched e
  )
  select coalesce(json_agg(row_to_json(resolved)), '[]'::json) into v_result from resolved;

  return v_result;
end;
$function$;

revoke all on function public.admin_search_users_for_association(integer, text, integer) from public;
grant execute on function public.admin_search_users_for_association(integer, text, integer) to anon, authenticated, postgres, service_role;

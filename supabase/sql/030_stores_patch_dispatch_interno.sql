-- Fase 2: permite ao admin ligar/desligar o dispatch interno por loja
-- atraves da mesma RPC ja usada para as restantes definicoes de loja.

create or replace function public.stores_apply_authorized_patch(caller_user_id integer, loja_id_input bigint, patch jsonb)
 returns lojas
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  is_admin boolean;
  owner_keys text[] := array['nome','contacto','nif','morada_completa','horario_funcionamento','latitude','longitude','place_id','idtipoloja','imagemfundo','icon','idmorada','ativo'];
  admin_only_keys text[] := array['aceitacao_automatica_pedidos','atribuicao_automatica_estafeta','configuracao_auto_assign','comissao_pedeja_percent','configuracoes_comissao','configuracao_entrega','taxaentrega','dispatch_interno_ativo'];
  allowed_keys text[] := owner_keys || admin_only_keys;
  patch_key text;
  target_loja public.lojas;
begin
  select exists(
    select 1 from public.app_admins where user_id = caller_user_id::text
    union
    select 1 from public.utilizadorespermissoes up
      join public.permissoes p on p.idpermissao = up.idpermissao
      where up.idutilizador = caller_user_id and p.permissao = 'admin'
  ) into is_admin;

  if not is_admin and not public.is_loja_authorized(caller_user_id, loja_id_input) then
    raise exception 'Sem permissao para atualizar esta loja.' using errcode = '42501';
  end if;

  for patch_key in select jsonb_object_keys(patch) loop
    if not (patch_key = any(allowed_keys)) then
      raise exception 'Campo % nao permitido nesta atualizacao.', patch_key using errcode = '42501';
    end if;

    if (patch_key = any(admin_only_keys)) and not is_admin then
      raise exception 'Campo % so pode ser alterado por administradores.', patch_key using errcode = '42501';
    end if;
  end loop;

  update public.lojas set
    nome = case when patch ? 'nome' then patch->>'nome' else nome end,
    contacto = case when patch ? 'contacto' then patch->>'contacto' else contacto end,
    nif = case when patch ? 'nif' then patch->>'nif' else nif end,
    morada_completa = case when patch ? 'morada_completa' then patch->>'morada_completa' else morada_completa end,
    horario_funcionamento = case when patch ? 'horario_funcionamento' then patch->'horario_funcionamento' else horario_funcionamento end,
    latitude = case when patch ? 'latitude' then (patch->>'latitude')::double precision else latitude end,
    longitude = case when patch ? 'longitude' then (patch->>'longitude')::double precision else longitude end,
    place_id = case when patch ? 'place_id' then patch->>'place_id' else place_id end,
    idtipoloja = case when patch ? 'idtipoloja' then (patch->>'idtipoloja')::integer else idtipoloja end,
    imagemfundo = case when patch ? 'imagemfundo' then patch->>'imagemfundo' else imagemfundo end,
    icon = case when patch ? 'icon' then patch->>'icon' else icon end,
    idmorada = case when patch ? 'idmorada' then (patch->>'idmorada')::integer else idmorada end,
    ativo = case when patch ? 'ativo' then (patch->>'ativo')::boolean else ativo end,
    aceitacao_automatica_pedidos = case when patch ? 'aceitacao_automatica_pedidos' then (patch->>'aceitacao_automatica_pedidos')::boolean else aceitacao_automatica_pedidos end,
    atribuicao_automatica_estafeta = case when patch ? 'atribuicao_automatica_estafeta' then (patch->>'atribuicao_automatica_estafeta')::boolean else atribuicao_automatica_estafeta end,
    configuracao_auto_assign = case when patch ? 'configuracao_auto_assign' then patch->'configuracao_auto_assign' else configuracao_auto_assign end,
    comissao_pedeja_percent = case when patch ? 'comissao_pedeja_percent' then (patch->>'comissao_pedeja_percent')::numeric else comissao_pedeja_percent end,
    configuracoes_comissao = case when patch ? 'configuracoes_comissao' then patch->'configuracoes_comissao' else configuracoes_comissao end,
    configuracao_entrega = case when patch ? 'configuracao_entrega' then patch->'configuracao_entrega' else configuracao_entrega end,
    taxaentrega = case when patch ? 'taxaentrega' then (patch->>'taxaentrega')::numeric else taxaentrega end,
    dispatch_interno_ativo = case when patch ? 'dispatch_interno_ativo' then (patch->>'dispatch_interno_ativo')::boolean else dispatch_interno_ativo end
  where idloja = loja_id_input
  returning * into target_loja;

  if target_loja is null then
    raise exception 'Loja nao encontrada.' using errcode = 'P0002';
  end if;

  return target_loja;
end;
$function$;

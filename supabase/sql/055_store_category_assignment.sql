-- A pagina de admin "Categorias" (tabela categorias/categoriaslojas -- tags
-- de classificacao como "Sushi", "Pizza") sempre disse ao admin que a
-- atribuicao de tags a uma loja "continua a ser feita na gestao de cada
-- loja", mas essa funcionalidade nunca existiu em lado nenhum do frontend --
-- so 2 linhas em categoriaslojas em toda a plataforma. Esta funcao permite
-- finalmente atribuir/desatribuir tags a uma loja (admin ou o proprio dono
-- da loja, via is_loja_authorized, o mesmo padrao usado nas outras funcoes
-- de gestao de loja).
create or replace function public.set_store_categories(caller_user_id integer, loja_id_input integer, category_ids integer[])
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
begin
  if not public.is_loja_authorized(caller_user_id, loja_id_input) then
    raise exception 'Sem permissao para gerir categorias desta loja.' using errcode = '42501';
  end if;

  delete from public.categoriaslojas where idloja = loja_id_input;

  if category_ids is not null and array_length(category_ids, 1) > 0 then
    insert into public.categoriaslojas (idloja, idcategoria)
    select loja_id_input, cat_id
    from unnest(category_ids) as cat_id
    where exists (select 1 from public.categorias c where c.idcategoria = cat_id);
  end if;
end;
$function$;

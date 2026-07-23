-- tiposmenu (categorias de pratos dentro do menu de cada loja, ex: "Entradas",
-- "Pizzas") era uma tabela GLOBAL sem coluna de loja nenhuma. Para simular
-- que uma categoria "pertencia" a uma loja, o codigo codificava o id da loja
-- dentro do proprio texto do nome: "__store_menu__42::Entradas". Categorias
-- antigas (criadas antes deste hack existir) nao tinham essa codificacao e
-- ficavam literalmente partilhadas entre lojas diferentes -- ex: a categoria
-- "ENTRADAS" (id 120) era usada ao mesmo tempo por pratos da Loja 2 e da
-- Loja 3, sem que nenhum dos dois donos soubesse.
--
-- Esta migracao acrescenta uma coluna idloja a serio, migra todos os dados
-- existentes (incluindo separar/"clonar" categorias antigas partilhadas
-- entre varias lojas para cada loja ficar com a sua propria linha
-- independente), remove o hack de texto, e garante uma categoria por
-- loja+nome com uma constraint unica.

-- 1) Nova coluna, ainda opcional (preenchida nos passos seguintes)
alter table public.tiposmenu add column if not exists idloja integer references public.lojas(idloja);

-- 1b) Algumas categorias "scoped" pelo hack antigo apontam para lojas de
--     teste que ja foram apagadas (ids 34/35, sem nenhum prato associado) --
--     lixo organico de testes manuais, sem dono valido possivel.
delete from public.tiposmenu tm
where tm.tipomenu like '__store_menu__%'
  and not exists (
    select 1 from public.lojas l
    where l.idloja = substring(tm.tipomenu from '^__store_menu__(\d+)::')::integer
  )
  and not exists (select 1 from public.menus m where m.idtipomenu = tm.idtipomenu);

-- 2) Linhas ja "scoped" pelo hack antigo: extrai o idloja do prefixo e limpa
--    o nome (deixa de ter "__store_menu__42::" a mais).
update public.tiposmenu
set idloja = substring(tipomenu from '^__store_menu__(\d+)::')::integer,
    tipomenu = trim(substring(tipomenu from '^__store_menu__\d+::(.+)$'))
where tipomenu like '__store_menu__%';

-- 3) Linhas antigas (sem hack) usadas por uma unica loja: essa loja passa a
--    ser a dona direta, sem qualquer ambiguidade.
with single_store as (
  select tm.idtipomenu, (array_agg(distinct m.idloja))[1] as only_loja
  from public.tiposmenu tm
  join public.menus m on m.idtipomenu = tm.idtipomenu
  where tm.idloja is null
  group by tm.idtipomenu
  having count(distinct m.idloja) = 1
)
update public.tiposmenu tm
set idloja = ss.only_loja
from single_store ss
where tm.idtipomenu = ss.idtipomenu;

-- 4) Linhas antigas partilhadas por varias lojas ao mesmo tempo: a linha
--    original fica com a loja "principal" (a de menor id, so para ter um
--    criterio deterministico), e cada uma das outras lojas que a usava
--    ganha a sua PROPRIA linha nova com o mesmo nome, com os pratos dessa
--    loja repontados para a nova linha -- deixam de ficar amarradas.
with shared as (
  select tm.idtipomenu as old_id, tm.tipomenu as label, min(m.idloja) as primary_loja
  from public.tiposmenu tm
  join public.menus m on m.idtipomenu = tm.idtipomenu
  where tm.idloja is null
  group by tm.idtipomenu, tm.tipomenu
  having count(distinct m.idloja) > 1
)
update public.tiposmenu tm
set idloja = shared.primary_loja
from shared
where tm.idtipomenu = shared.old_id;

do $$
declare
  rec record;
  new_id integer;
begin
  for rec in
    select distinct m.idloja as loja_id, m.idtipomenu as old_id, tm.tipomenu as label
    from public.menus m
    join public.tiposmenu tm on tm.idtipomenu = m.idtipomenu
    where tm.idloja is not null and tm.idloja <> m.idloja
  loop
    insert into public.tiposmenu (tipomenu, idloja)
    values (rec.label, rec.loja_id)
    returning idtipomenu into new_id;

    update public.menus
    set idtipomenu = new_id
    where idloja = rec.loja_id and idtipomenu = rec.old_id;
  end loop;
end $$;

-- 5) Categorias antigas sem qualquer prato associado (nem antes nem depois
--    dos passos acima) sao lixo organico acumulado ao longo do tempo
--    (duplicados, erros de escrita) sem dono possivel -- eliminam-se.
delete from public.tiposmenu where idloja is null;

-- 6) A partir daqui toda a linha tem sempre uma loja dona.
alter table public.tiposmenu alter column idloja set not null;

-- 7) Uma categoria por loja+nome (comparacao sem maiusculas/espacos a mais),
--    para o proprio schema impedir duplicados -- antes so havia uma
--    verificacao no lado do JS, sem nada a garantir isso na base de dados.
create unique index if not exists tiposmenu_idloja_label_unique
  on public.tiposmenu (idloja, lower(btrim(tipomenu)));

-- 8) RPCs reescritas para a coluna idloja a serio, sem o hack de texto.
create or replace function public.menu_manager_upsert_category(caller_user_id integer, loja_id_input bigint, tipo_id_input integer, label text)
returns tiposmenu
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  target_row public.tiposmenu;
  clean_label text := trim(label);
begin
  if not public.is_loja_authorized(caller_user_id, loja_id_input) then
    raise exception 'Sem permissao para gerir categorias desta loja.' using errcode = '42501';
  end if;

  if clean_label = '' then
    raise exception 'Nome de categoria invalido.';
  end if;

  if exists (
    select 1 from public.tiposmenu
    where idloja = loja_id_input
      and lower(btrim(tipomenu)) = lower(clean_label)
      and idtipomenu is distinct from tipo_id_input
  ) then
    raise exception 'Ja existe uma categoria com esse nome nesta loja.' using errcode = '23505';
  end if;

  if tipo_id_input is not null then
    select * into target_row from public.tiposmenu where idtipomenu = tipo_id_input;
    if target_row is null then
      raise exception 'Categoria nao encontrada.' using errcode = 'P0002';
    end if;
    if target_row.idloja <> loja_id_input then
      raise exception 'Esta categoria nao pertence a esta loja.' using errcode = '42501';
    end if;

    update public.tiposmenu set tipomenu = clean_label
    where idtipomenu = tipo_id_input
    returning * into target_row;
  else
    insert into public.tiposmenu (tipomenu, idloja)
    values (clean_label, loja_id_input)
    returning * into target_row;
  end if;

  return target_row;
end;
$function$;

create or replace function public.menu_manager_delete_category(caller_user_id integer, loja_id_input bigint, tipo_id_input integer)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  target_row public.tiposmenu;
begin
  if not public.is_loja_authorized(caller_user_id, loja_id_input) then
    raise exception 'Sem permissao para gerir categorias desta loja.' using errcode = '42501';
  end if;

  select * into target_row from public.tiposmenu where idtipomenu = tipo_id_input;
  if target_row is null then
    raise exception 'Categoria nao encontrada.' using errcode = 'P0002';
  end if;
  if target_row.idloja <> loja_id_input then
    raise exception 'Esta categoria nao pertence a esta loja.' using errcode = '42501';
  end if;

  update public.menus set idtipomenu = null
  where idloja = loja_id_input and idtipomenu = tipo_id_input;

  delete from public.tiposmenu where idtipomenu = tipo_id_input;
end;
$function$;

-- Ja nao ha "categorias legadas partilhadas" para reatribuir -- cada loja
-- tem sempre as suas proprias linhas a partir de agora.
drop function if exists public.menu_manager_reassign_category(integer, bigint, integer, integer);

-- Introduz uma comissao base de plataforma real (hoje so existe comissao por
-- loja, sem nenhum valor por defeito para lojas ainda nao configuradas -- uma
-- loja nova fica silenciosamente a 0%). lojas.comissao_pedeja_percent passa a
-- poder ser NULL: NULL significa "sem override, herda o valor de plataforma";
-- qualquer numero (incluindo 0) continua a ser um override explicito da loja,
-- exactamente como hoje. Categoria/prato dentro da loja nao mudam nada.
--
-- Tambem acrescenta a cada order_item a comissao realmente aplicada nesse
-- pedido, para os relatorios de comissao deixarem de ser recalculados a
-- partir da configuracao *atual* (o que fazia numeros do passado mudarem
-- sozinhos sempre que a comissao ou o preco de um prato mudava).

alter table public.lojas
  drop constraint if exists lojas_comissao_pedeja_percent_check;

alter table public.lojas
  alter column comissao_pedeja_percent drop not null,
  alter column comissao_pedeja_percent drop default;

alter table public.lojas
  add constraint lojas_comissao_pedeja_percent_check
  check (comissao_pedeja_percent is null or (comissao_pedeja_percent >= 0 and comissao_pedeja_percent <= 100));

-- So lojas nunca tocadas (comissao continua no default antigo de 0% e nenhum
-- override de categoria/prato foi configurado) passam a herdar a plataforma.
-- Uma loja que tenha sido deliberadamente posta a 0% junto com overrides de
-- categoria/prato mantem-se inalterada.
update public.lojas
set comissao_pedeja_percent = null
where comissao_pedeja_percent = 0
  and (configuracoes_comissao is null or configuracoes_comissao = '{}'::jsonb);

alter table public.order_items
  add column if not exists preco_base_unitario numeric(10,2) null,
  add column if not exists comissao_percent_aplicada numeric(5,2) null;

insert into public.configuracoes_plataforma (chave, valor, updated_at)
values ('comissao_global_default', jsonb_build_object('percent', 10), now())
on conflict (chave) do nothing;

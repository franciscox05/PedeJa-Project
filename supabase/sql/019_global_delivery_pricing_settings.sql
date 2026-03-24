create table if not exists public.configuracoes_plataforma (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.configuracoes_plataforma is
  'Configuracoes globais da plataforma, incluindo a politica geral de entrega por raio/km.';

comment on column public.configuracoes_plataforma.chave is
  'Identificador unico da configuracao global.';

comment on column public.configuracoes_plataforma.valor is
  'Payload JSON da configuracao.';

insert into public.configuracoes_plataforma (chave, valor)
values (
  'delivery_pricing_default',
  jsonb_build_object(
    'mode', 'per_km',
    'base_fee', 2.8,
    'included_km', 2,
    'extra_per_km', 0.5,
    'max_km', 17
  )
)
on conflict (chave) do nothing;

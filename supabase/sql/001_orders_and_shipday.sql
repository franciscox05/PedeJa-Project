-- Base schema for checkout + Shipday integration
create extension if not exists "pgcrypto";

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  loja_id bigint not null,
  customer_user_id text null,
  customer_nome text not null,
  customer_phone text not null,
  customer_email text null,
  customer_address text not null,
  customer_notes text null,
  subtotal numeric(10,2) not null default 0,
  taxa_entrega numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  status text not null default 'PENDING_PAYMENT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id bigserial primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_id bigint null,
  nome text not null,
  quantidade integer not null check (quantidade > 0),
  preco_unitario numeric(10,2) not null default 0,
  subtotal numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'SHIPDAY',
  external_delivery_id text null,
  tracking_url text null,
  status text not null default 'CREATED',
  provider_payload jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_delivery_id)
);

create table if not exists public.delivery_events (
  id bigserial primary key,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  event_id text not null,
  event_type text not null,
  payload_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (event_id)
);

create index if not exists idx_orders_loja_id on public.orders(loja_id);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_deliveries_order_id on public.deliveries(order_id);
create index if not exists idx_deliveries_external_id on public.deliveries(external_delivery_id);
create index if not exists idx_delivery_events_delivery_id on public.delivery_events(delivery_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_events enable row level security;

-- Basic policies for authenticated users to read their own orders.
-- Adjust according to your auth model.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders' and policyname = 'users_read_own_orders'
  ) then
    create policy users_read_own_orders
      on public.orders
      for select
      to authenticated
      using (customer_user_id = auth.uid());
  end if;
end$$;


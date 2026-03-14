-- Security and growth layer: roles, restaurant approval, saved addresses
create table if not exists public.restaurant_signup_requests (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null,
  telefone text null,
  restaurante_nome text not null,
  nif text null,
  cidade text null,
  status text not null default 'PENDING',
  reviewed_by text null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  label text not null default 'Casa',
  address_line text not null,
  lat numeric(10,7) null,
  lng numeric(10,7) null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.app_admins (
  user_id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_staff_access (
  id bigserial primary key,
  user_id text not null,
  loja_id bigint not null,
  role text not null default 'MANAGER',
  created_at timestamptz not null default now(),
  unique (user_id, loja_id)
);

alter table public.restaurant_signup_requests enable row level security;
alter table public.user_addresses enable row level security;
alter table public.app_admins enable row level security;
alter table public.restaurant_staff_access enable row level security;

-- Anyone can submit a restaurant request (public sign-up flow)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='restaurant_signup_requests' and policyname='public_insert_signup_requests'
  ) then
    create policy public_insert_signup_requests
      on public.restaurant_signup_requests
      for insert
      to anon, authenticated
      with check (true);
  end if;
end$$;

-- Only admins can read/update signup requests
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='restaurant_signup_requests' and policyname='admin_manage_signup_requests'
  ) then
    create policy admin_manage_signup_requests
      on public.restaurant_signup_requests
      for all
      to authenticated
      using (exists(select 1 from public.app_admins a where a.user_id = auth.uid()))
      with check (exists(select 1 from public.app_admins a where a.user_id = auth.uid()));
  end if;
end$$;

-- Address privacy: user can only manage own addresses
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_addresses' and policyname='user_manage_own_addresses'
  ) then
    create policy user_manage_own_addresses
      on public.user_addresses
      for all
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end$$;

-- Restrict orders visibility by assigned stores or admin role
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='orders' and policyname='orders_admin_or_store_access'
  ) then
    create policy orders_admin_or_store_access
      on public.orders
      for select
      to authenticated
      using (
        exists(select 1 from public.app_admins a where a.user_id = auth.uid())
        or exists(
          select 1
          from public.restaurant_staff_access rsa
          where rsa.user_id = auth.uid() and rsa.loja_id = orders.loja_id
        )
        or customer_user_id = auth.uid()
      );
  end if;
end$$;

-- Restrict deliveries visibility by linked order -> assigned store
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='deliveries' and policyname='deliveries_admin_or_store_access'
  ) then
    create policy deliveries_admin_or_store_access
      on public.deliveries
      for select
      to authenticated
      using (
        exists(select 1 from public.app_admins a where a.user_id = auth.uid())
        or exists(
          select 1
          from public.orders o
          join public.restaurant_staff_access rsa on rsa.loja_id = o.loja_id
          where o.id = deliveries.order_id and rsa.user_id = auth.uid()
        )
      );
  end if;
end$$;


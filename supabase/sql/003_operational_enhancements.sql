-- Operational enhancements: geodata + strict store isolation policies
alter table public.orders
  add column if not exists customer_address_label text null,
  add column if not exists customer_lat numeric(10,7) null,
  add column if not exists customer_lng numeric(10,7) null;

alter table public.deliveries
  add column if not exists shipday_error text null;

-- Update permissions: only admin or assigned restaurant staff can update store orders
-- (customers keep read-only access through previous policy)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='orders' and policyname='orders_update_admin_or_store_access'
  ) then
    create policy orders_update_admin_or_store_access
      on public.orders
      for update
      to authenticated
      using (
        exists(select 1 from public.app_admins a where a.user_id = auth.uid())
        or exists(
          select 1
          from public.restaurant_staff_access rsa
          where rsa.user_id = auth.uid() and rsa.loja_id = orders.loja_id
        )
      )
      with check (
        exists(select 1 from public.app_admins a where a.user_id = auth.uid())
        or exists(
          select 1
          from public.restaurant_staff_access rsa
          where rsa.user_id = auth.uid() and rsa.loja_id = orders.loja_id
        )
      );
  end if;
end$$;

-- Explicit select for delivery_events only for admins and assigned stores
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='delivery_events' and policyname='delivery_events_admin_or_store_access'
  ) then
    create policy delivery_events_admin_or_store_access
      on public.delivery_events
      for select
      to authenticated
      using (
        exists(select 1 from public.app_admins a where a.user_id = auth.uid())
        or exists(
          select 1
          from public.deliveries d
          join public.orders o on o.id = d.order_id
          join public.restaurant_staff_access rsa on rsa.loja_id = o.loja_id
          where d.id = delivery_events.delivery_id
            and rsa.user_id = auth.uid()
        )
      );
  end if;
end$$;

-- Signup request enhancements
alter table public.restaurant_signup_requests add column if not exists user_id text null;
alter table public.restaurant_signup_requests add column if not exists loja_id bigint null;


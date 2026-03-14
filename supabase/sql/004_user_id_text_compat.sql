-- Align custom RPC auth model: all user_id-like columns as TEXT

alter table if exists public.orders
  alter column customer_user_id type text using customer_user_id::text;

alter table if exists public.user_addresses
  alter column user_id type text using user_id::text;

alter table if exists public.app_admins
  alter column user_id type text using user_id::text;

alter table if exists public.restaurant_staff_access
  alter column user_id type text using user_id::text;

alter table if exists public.restaurant_signup_requests
  alter column reviewed_by type text using reviewed_by::text;

alter table if exists public.restaurant_signup_requests
  add column if not exists user_id text null;

alter table if exists public.restaurant_signup_requests
  add column if not exists loja_id bigint null;

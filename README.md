# PedeJa Platform

Website de entregas com fluxo de checkout, operacao em tempo real e dashboards por papel.

## Perfis
- Cliente
- Admin
- Restaurante
- DevOps

## Funcionalidades chave
- Checkout com despacho para Shipday
- Dashboard Admin enterprise (KPIs, alertas SLA, top lojas, aprovacoes)
- Dashboard Restaurante (fila operacional + SLA + analytics)
- Dashboard DevOps (webhooks e monitor de integracoes)
- Registo com pedido de perfil restaurante (aprovacao admin)
- Moradas do perfil com label (Casa/Trabalho/Outro) + autocomplete + default
- Carrinho com selecao automatica de moradas guardadas

## Stack
- React + Vite
- Supabase (DB + Edge Functions)
- Shipday Drive

## Arranque local
```bash
npm install
npm run dev
```

## Env frontend
Copiar `.env.example` para `.env` e preencher:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GEOCODING_API_URL` (opcional; default Nominatim)

## SQL migrations a aplicar (ordem)
1. `supabase/sql/001_orders_and_shipday.sql`
2. `supabase/sql/002_security_profiles_addresses.sql`
3. `supabase/sql/003_operational_enhancements.sql`\n4. `supabase/sql/004_user_id_text_compat.sql`

## Edge functions
- `supabase/functions/create-order/index.ts`
- `supabase/functions/shipday-webhook/index.ts`

## Rotas principais
- `/dashboard/admin`
- `/dashboard/restaurante`
- `/dashboard/dev`
\n\n## Shipday payload\nA function create-order envia para Shipday: estaurantName, estaurantAddress, estaurantPhoneNumber e orderItem (name/unitPrice/quantity), alem dos dados do cliente e totais.\n

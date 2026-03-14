# Integracao Shipday + Supabase

## 1) Aplicar schema SQL
1. Abre o SQL Editor no Supabase.
2. Executa o ficheiro `supabase/sql/001_orders_and_shipday.sql`.

## 2) Publicar Edge Functions
Com Supabase CLI instalado:

```bash
supabase functions deploy create-order
supabase functions deploy shipday-webhook
```

## 3) Configurar secrets das functions
```bash
supabase secrets set SHIPDAY_API_KEY=coloca_aqui
supabase secrets set SHIPDAY_CREATE_URL=https://api.shipday.com/orders
supabase secrets set SHIPDAY_WEBHOOK_TOKEN=token_forte
```

## 4) Configurar webhook no Shipday
No painel do Shipday, aponta o webhook para:

`https://<PROJECT_REF>.functions.supabase.co/shipday-webhook`

Envia o header `x-shipday-token` com o mesmo valor de `SHIPDAY_WEBHOOK_TOKEN`.

## 5) Fluxo implementado
1. Frontend chama function `create-order` ao finalizar carrinho.
2. Function cria `orders` e `order_items`.
3. Function tenta criar entrega no Shipday e grava em `deliveries`.
4. Shipday envia atualizacoes para `shipday-webhook`.
5. Webhook grava em `delivery_events` e atualiza status de `deliveries` e `orders`.

## 6) Nota importante
O payload exato do Shipday pode variar por conta/plano. Se o campo de ID/status vier com nome diferente, ajusta o parsing em:
- `supabase/functions/create-order/index.ts`
- `supabase/functions/shipday-webhook/index.ts`

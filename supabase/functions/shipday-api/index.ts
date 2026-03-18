import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function toText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJsonSafely(rawText: string) {
  if (!rawText || !rawText.trim()) return null;
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function getShipdayAuthHeader(shipdayApiKey: string) {
  return shipdayApiKey.startsWith("Basic ") ? shipdayApiKey : `Basic ${shipdayApiKey}`;
}

function getShipdayErrorMessage(status: number, statusText: string, rawText: string, parsed: any) {
  const parsedMessage = parsed?.message || parsed?.error || parsed?.detail || parsed?.status;
  if (parsedMessage) return String(parsedMessage);

  const trimmed = toText(rawText);
  if (trimmed) return trimmed;

  return `Shipday HTTP ${status}${statusText ? ` ${statusText}` : ""}`;
}

async function callShipday({
  shipdayBaseUrl,
  shipdayApiKey,
  method,
  endpoint,
  body,
}: {
  shipdayBaseUrl: string;
  shipdayApiKey: string;
  method: "GET" | "PUT" | "POST";
  endpoint: string;
  body?: Record<string, unknown> | null;
}) {
  const response = await fetch(`${shipdayBaseUrl}${endpoint}`, {
    method,
    headers: {
      Authorization: getShipdayAuthHeader(shipdayApiKey),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const rawText = await response.text();
  const parsed = parseJsonSafely(rawText);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: getShipdayErrorMessage(response.status, response.statusText, rawText, parsed),
      payload: parsed ?? rawText ?? null,
    };
  }

  return {
    ok: true,
    status: response.status,
    payload: parsed ?? rawText ?? null,
  };
}

function pickFirstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const parsed = toText(value);
    if (parsed) return parsed;
  }
  return "";
}

function toDateChunk(value: number) {
  return String(value).padStart(2, "0");
}

function formatShipdayDate(date: Date) {
  return `${date.getFullYear()}-${toDateChunk(date.getMonth() + 1)}-${toDateChunk(date.getDate())}`;
}

function formatShipdayTime(date: Date) {
  return `${toDateChunk(date.getHours())}:${toDateChunk(date.getMinutes())}:${toDateChunk(date.getSeconds())}`;
}

function resolveShipdayOrderId(payload: any): string {
  return pickFirstNonEmpty(
    payload?.orderId,
    payload?.id,
    payload?.data?.orderId,
    payload?.data?.id,
    payload?.result?.orderId,
    payload?.result?.id,
  );
}

function resolveShipdayTrackingUrl(payload: any): string {
  return pickFirstNonEmpty(
    payload?.trackingUrl,
    payload?.trackingLink,
    payload?.data?.trackingUrl,
    payload?.data?.trackingLink,
  );
}

function resolveShipdayDeliveryId(payload: any): string {
  return pickFirstNonEmpty(
    payload?.deliveryId,
    payload?.externalDeliveryId,
    payload?.data?.deliveryId,
    payload?.id,
    payload?.orderId,
  );
}

function normalizePaymentCode(value: unknown): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function mapToShipdayPaymentMethod(value: unknown): string {
  const code = normalizePaymentCode(value);
  if (code === "MBWAY") return "CREDIT_CARD";
  if (code === "CASH" || code === "CREDIT_CARD") return code;
  return "CASH";
}

async function fetchOrderForShipdayCreate(
  supabase: ReturnType<typeof createClient>,
  orderId: number,
) {
  let response = await supabase
    .from("orders")
    .select("id, loja_id, customer_nome, customer_phone, customer_email, customer_address, customer_notes, customer_user_id, customer_lat, customer_lng, subtotal, taxa_entrega, total, shipday_order_id, payment_method, payment_label")
    .eq("id", orderId)
    .maybeSingle();

  if (response.error && /payment_method|payment_label/i.test(String(response.error.message || ""))) {
    response = await supabase
      .from("orders")
      .select("id, loja_id, customer_nome, customer_phone, customer_email, customer_address, customer_notes, customer_user_id, customer_lat, customer_lng, subtotal, taxa_entrega, total, shipday_order_id")
      .eq("id", orderId)
      .maybeSingle();
  }

  return response;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const shipdayApiKey = Deno.env.get("SHIPDAY_API_KEY");
  const shipdayBaseUrl = (Deno.env.get("SHIPDAY_BASE_URL") || "https://api.shipday.com").replace(/\/+$/, "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!shipdayApiKey) {
    return json({ error: "SHIPDAY_API_KEY em falta no ambiente" }, 500);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON invalido" }, 400);
  }

  const action = toText(body?.action).toLowerCase();

  try {
    if (action === "get_carriers") {
      const shipday = await callShipday({
        shipdayBaseUrl,
        shipdayApiKey,
        method: "GET",
        endpoint: "/carriers",
      });

      if (!shipday.ok) {
        return json(
          {
            error: shipday.error,
            shipday_status: shipday.status,
            payload: shipday.payload,
          },
          502,
        );
      }

      return json({
        ok: true,
        action,
        data: shipday.payload,
      });
    }

    if (action === "assign_order") {
      const shipdayOrderId = toText(body?.shipdayOrderId || body?.shipday_order_id || body?.orderId || body?.order_id);
      const carrierId = toText(body?.carrierId || body?.carrier_id);

      if (!shipdayOrderId) return json({ error: "shipdayOrderId em falta" }, 400);
      if (!carrierId) return json({ error: "carrierId em falta" }, 400);

      const shipday = await callShipday({
        shipdayBaseUrl,
        shipdayApiKey,
        method: "PUT",
        endpoint: `/orders/assign/${encodeURIComponent(shipdayOrderId)}/${encodeURIComponent(carrierId)}`,
      });

      if (!shipday.ok) {
        return json(
          {
            error: shipday.error,
            shipday_status: shipday.status,
            payload: shipday.payload,
          },
          502,
        );
      }

      return json({
        ok: true,
        action,
        data: shipday.payload,
      });
    }

    if (action === "create_order") {
      const orderId = toNumber(body?.orderId || body?.order_id);
      if (!orderId || orderId <= 0) {
        return json({ error: "orderId invalido" }, 400);
      }

      if (!supabaseUrl || !serviceRoleKey) {
        return json({ error: "Missing Supabase service credentials" }, 500);
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey);

      const { data: order, error: orderError } = await fetchOrderForShipdayCreate(supabase, orderId);

      if (orderError) return json({ error: orderError.message }, 500);
      if (!order) return json({ error: "Pedido nao encontrado" }, 404);

      if (toText(order.shipday_order_id)) {
        return json({
          ok: true,
          action,
          skipped: true,
          reason: "order_already_linked_to_shipday",
          order_id: order.id,
          shipday_order_id: order.shipday_order_id,
        });
      }

      const { data: orderItems, error: orderItemsError } = await supabase
        .from("order_items")
        .select("nome, quantidade, preco_unitario")
        .eq("order_id", order.id)
        .order("id", { ascending: true });

      if (orderItemsError) return json({ error: orderItemsError.message }, 500);
      if (!orderItems || orderItems.length === 0) {
        return json({ error: "Pedido sem items para enviar ao Shipday" }, 400);
      }

      const { data: loja, error: lojaError } = await supabase
        .from("lojas")
        .select("idloja, nome, contacto, morada_completa, latitude, longitude, idmorada")
        .eq("idloja", order.loja_id)
        .maybeSingle();

      if (lojaError) return json({ error: lojaError.message }, 500);
      if (!loja) return json({ error: "Loja do pedido nao encontrada" }, 404);

      let moradaDaLoja: any = null;
      if (loja.idmorada) {
        const { data: moradaData } = await supabase
          .from("moradas")
          .select("morada, latitude, longitude")
          .eq("idmorada", loja.idmorada)
          .maybeSingle();
        moradaDaLoja = moradaData || null;
      }

      const restaurantName = pickFirstNonEmpty(loja.nome, `Loja ${order.loja_id}`);
      const restaurantAddress = pickFirstNonEmpty(loja.morada_completa, moradaDaLoja?.morada);
      const restaurantPhoneNumber = pickFirstNonEmpty(loja.contacto);

      const missingStoreFields: string[] = [];
      if (!restaurantName) missingStoreFields.push("restaurantName");
      if (!restaurantAddress) missingStoreFields.push("restaurantAddress");
      if (!restaurantPhoneNumber) missingStoreFields.push("restaurantPhoneNumber");

      if (missingStoreFields.length > 0) {
        return json({ error: `Dados da loja incompletos para Shipday: ${missingStoreFields.join(", ")}` }, 400);
      }

      const now = new Date();
      const expectedDelivery = new Date(now.getTime() + 45 * 60000);
      const expectedPickup = new Date(now.getTime() + 25 * 60000);

      const pickupLat = toNumber(loja.latitude ?? moradaDaLoja?.latitude);
      const pickupLng = toNumber(loja.longitude ?? moradaDaLoja?.longitude);
      const deliveryLat = toNumber(order.customer_lat);
      const deliveryLng = toNumber(order.customer_lng);

      const shipdayPayloadRequest: Record<string, unknown> = {
        orderNumber: String(order.id) + "-" + Date.now(),
        customerName: order.customer_nome,
        customerAddress: order.customer_address,
        customerEmail: toText(order.customer_email),
        customerPhoneNumber: order.customer_phone,
        restaurantName,
        restaurantAddress,
        restaurantPhoneNumber,
        expectedDeliveryDate: formatShipdayDate(expectedDelivery),
        expectedDeliveryTime: formatShipdayTime(expectedDelivery),
        expectedPickupTime: formatShipdayTime(expectedPickup),
        tips: 0,
        tax: 0,
        discountAmount: 0,
        deliveryFee: Number(order.taxa_entrega || 0),
        totalOrderCost: Number(order.total || 0),
        deliveryInstruction: toText(order.customer_notes),
        orderSource: "PedeJa",
        additionalId: toText(order.customer_user_id),
        clientRestaurantId: order.loja_id,
        paymentMethod: mapToShipdayPaymentMethod(
          body?.paymentLabel
          || body?.paymentMethod
          || order.payment_label
          || order.payment_method
          || "CASH",
        ),
        orderItem: orderItems.map((item) => ({
          name: item.nome,
          unitPrice: Number(item.preco_unitario || 0),
          quantity: Number(item.quantidade || 1),
        })),
      };

      if (pickupLat !== null && pickupLng !== null) {
        shipdayPayloadRequest.pickupLatLong = [pickupLat, pickupLng];
      }

      if (deliveryLat !== null && deliveryLng !== null) {
        shipdayPayloadRequest.deliveryLatLong = [deliveryLat, deliveryLng];
      }

      const shipday = await callShipday({
        shipdayBaseUrl,
        shipdayApiKey,
        method: "POST",
        endpoint: "/orders",
        body: shipdayPayloadRequest,
      });

      if (!shipday.ok) {
        return json(
          {
            error: shipday.error,
            shipday_status: shipday.status,
            payload: shipday.payload,
          },
          502,
        );
      }

      const shipdayOrderId = resolveShipdayOrderId(shipday.payload);
      if (!shipdayOrderId) {
        return json({ error: "Shipday nao devolveu orderId" }, 502);
      }

      const shipdayTrackingUrl = resolveShipdayTrackingUrl(shipday.payload) || null;
      const shipdayDeliveryId = resolveShipdayDeliveryId(shipday.payload) || null;

      const { error: updateOrderError } = await supabase
        .from("orders")
        .update({
          shipday_order_id: shipdayOrderId,
          shipday_tracking_url: shipdayTrackingUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (updateOrderError) {
        return json({ error: updateOrderError.message }, 500);
      }

      const { error: deliveryInsertError } = await supabase.from("deliveries").insert({
        order_id: order.id,
        provider: "SHIPDAY",
        external_delivery_id: shipdayDeliveryId,
        tracking_url: shipdayTrackingUrl,
        status: "DISPATCHED",
        provider_payload: shipday.payload ?? null,
      });

      if (deliveryInsertError) {
        console.error("shipday-api create_order delivery insert failed", {
          orderId: order.id,
          message: deliveryInsertError.message,
        });
      }

      return json({
        ok: true,
        action,
        order_id: order.id,
        shipday_order_id: shipdayOrderId,
        shipday_tracking_url: shipdayTrackingUrl,
        data: shipday.payload,
      });
    }

    if (action === "ready_for_pickup") {
      const requestedShipdayOrderId = toText(body?.shipdayOrderId || body?.shipday_order_id);
      const orderId = toNumber(body?.orderId || body?.order_id);
      let finalShipdayOrderId = requestedShipdayOrderId;

      if (!finalShipdayOrderId && orderId && orderId > 0) {
        if (!supabaseUrl || !serviceRoleKey) {
          return json({ ok: true, warning: "Sem ID do Shipday, ignorado." });
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const { data: orderLookup, error: orderLookupError } = await supabase
          .from("orders")
          .select("shipday_order_id")
          .eq("id", orderId)
          .maybeSingle();

        if (orderLookupError) {
          return json({
            ok: true,
            warning: "Sem ID do Shipday, ignorado.",
            erro: orderLookupError.message,
            order_id: orderId,
          });
        }

        finalShipdayOrderId = toText(orderLookup?.shipday_order_id);
      }

      if (!finalShipdayOrderId) {
        return json({
          ok: true,
          warning: "Sem ID do Shipday, ignorado.",
          order_id: orderId || null,
        });
      }

      const shipday = await callShipday({
        shipdayBaseUrl,
        shipdayApiKey,
        method: "PUT",
        endpoint: `/orders/${encodeURIComponent(finalShipdayOrderId)}/ready`,
        body: {},
      });

      if (!shipday.ok) {
        return json({
          ok: true,
          warning: "Shipday rejeitou o ready",
          erro: shipday.error,
          shipday_status: shipday.status,
          payload: shipday.payload,
          shipday_order_id: finalShipdayOrderId,
          order_id: orderId || null,
        });
      }

      return json({
        ok: true,
        action,
        shipday_order_id: finalShipdayOrderId,
        order_id: orderId || null,
        data: shipday.payload,
      });
    }

    if (action === "update_status") {
      const shipdayOrderId = toText(body?.shipdayOrderId || body?.shipday_order_id || body?.orderId || body?.order_id);
      const shipdayState = toText(body?.shipdayState || body?.shipday_state || body?.orderStatus);

      if (!shipdayOrderId) return json({ error: "shipdayOrderId em falta" }, 400);
      if (!shipdayState) return json({ error: "shipdayState em falta" }, 400);

      const shipday = await callShipday({
        shipdayBaseUrl,
        shipdayApiKey,
        method: "PUT",
        endpoint: `/orders/${encodeURIComponent(shipdayOrderId)}/status`,
        body: { orderStatus: shipdayState },
      });

      if (!shipday.ok) {
        return json({
          ok: true,
          action,
          warning: "Shipday nao aceitou a transicao, mas o PedeJa avancou",
          shipday_status: shipday.status,
          shipday_error: shipday.error,
          payload: shipday.payload,
        });
      }

      return json({
        ok: true,
        action,
        data: shipday.payload,
      });
    }

    return json({
      error: "Action invalida. Usa 'get_carriers', 'assign_order', 'create_order', 'ready_for_pickup' ou 'update_status'.",
    }, 400);
  } catch (error: any) {
    return json({ error: error?.message || "Erro interno shipday-api" }, 500);
  }
});

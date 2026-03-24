import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  BARCELOS_CENTER,
  computeDeliveryQuoteByDistance,
  resolveEffectiveDeliveryPricingConfig,
} from "../_shared/deliveryPricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePaymentCode(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");

  if (!normalized) return "";
  if (normalized === "DINHEIRO") return "CASH";
  if (normalized === "MB_WAY") return "MBWAY";
  return normalized;
}

function paymentCodeToLabel(value: unknown) {
  const code = normalizePaymentCode(value);
  if (code === "CASH") return "Dinheiro";
  if (code === "MBWAY") return "MB WAY";
  if (code === "CREDIT_CARD") return "Cartao";
  return code || null;
}

function parseJsonSafely(rawText: string) {
  if (!rawText || !rawText.trim()) return null;
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function isMissingOrderColumnError(error: { message?: string } | null | undefined, columnName: string) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("column")
    && message.includes("orders")
    && message.includes(String(columnName || "").toLowerCase());
}

function isMissingOrderItemsColumnError(error: { message?: string } | null | undefined, columnName: string) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("column")
    && message.includes("order_items")
    && message.includes(String(columnName || "").toLowerCase());
}

function isMissingStoreColumnError(error: { message?: string } | null | undefined, columnName: string) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("column")
    && message.includes("lojas")
    && message.includes(String(columnName || "").toLowerCase());
}

function isMissingPlatformSettingsTableError(error: { message?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("configuracoes_plataforma")
    && (
      message.includes("does not exist")
      || message.includes("relation")
      || message.includes("table")
    );
}

function stripUnsupportedOrderColumns(
  orderPayload: Record<string, unknown>,
  error: { message?: string } | null | undefined,
) {
  const message = String(error?.message || "").toLowerCase();
  const nextPayload = { ...orderPayload };

  ["data_aceitacao", "aceite_em", "submitted_at", "order_timing_mode", "payment_method", "payment_label", "scheduled_for"].forEach((columnName) => {
    if (message.includes("column") && message.includes("orders") && message.includes(columnName)) {
      delete nextPayload[columnName];
    }
  });

  return nextPayload;
}

async function invokeInternalFunction(
  supabaseUrl: string,
  serviceRoleKey: string,
  functionName: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  const parsed = parseJsonSafely(rawText);

  if (!response.ok) {
    const message = parsed?.error || parsed?.message || rawText || `Function ${functionName} HTTP ${response.status}`;
    throw new Error(String(message));
  }

  if (parsed?.error) {
    throw new Error(String(parsed.error));
  }

  return parsed;
}

async function insertOrderWithCompatibility(
  supabase: ReturnType<typeof createClient>,
  orderPayload: Record<string, unknown>,
) {
  let response = await supabase
    .from("orders")
    .insert(orderPayload)
    .select("id")
    .single();

  const shouldRetryCompatibility = response.error && (
    isMissingOrderColumnError(response.error, "data_aceitacao")
    || isMissingOrderColumnError(response.error, "aceite_em")
    || isMissingOrderColumnError(response.error, "submitted_at")
    || isMissingOrderColumnError(response.error, "order_timing_mode")
    || isMissingOrderColumnError(response.error, "payment_method")
    || isMissingOrderColumnError(response.error, "payment_label")
    || isMissingOrderColumnError(response.error, "scheduled_for")
  );

  if (shouldRetryCompatibility) {
    console.warn("create-order newer orders columns missing, retrying insert in compatibility mode");

    const fallbackPayload = stripUnsupportedOrderColumns(orderPayload, response.error);

    response = await supabase
      .from("orders")
      .insert(fallbackPayload)
      .select("id")
      .single();
  }

  return response;
}

async function insertOrderItemsWithCompatibility(
  supabase: ReturnType<typeof createClient>,
  orderItemsPayload: Record<string, unknown>[],
) {
  let response = await supabase
    .from("order_items")
    .insert(orderItemsPayload);

  if (response.error && isMissingOrderItemsColumnError(response.error, "opcoes_selecionadas")) {
    console.warn("create-order newer order_items columns missing, retrying insert in compatibility mode");
    const fallbackPayload = orderItemsPayload.map(({ opcoes_selecionadas, ...item }) => item);
    response = await supabase
      .from("order_items")
      .insert(fallbackPayload);
  }

  return response;
}

async function calculateDrivingDistanceKm(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  apiKey: string,
) {
  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destinations", `${destination.lat},${destination.lng}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("language", "pt-PT");
  url.searchParams.set("region", "pt");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Distance Matrix HTTP ${response.status}`);
  }

  const payload = await response.json();
  const apiStatus = String(payload?.status || "");
  if (apiStatus !== "OK") {
    throw new Error(`Distance Matrix status invalido: ${apiStatus}`);
  }

  const element = payload?.rows?.[0]?.elements?.[0];
  const elementStatus = String(element?.status || "");
  if (elementStatus !== "OK") {
    throw new Error(`Distance Matrix sem rota valida: ${elementStatus}`);
  }

  const meters = Number(element?.distance?.value);
  if (!Number.isFinite(meters)) {
    throw new Error("Distance Matrix devolveu distancia invalida.");
  }

  return meters / 1000;
}

async function fetchGlobalDeliveryPricingConfig(
  supabase: ReturnType<typeof createClient>,
) {
  const response = await supabase
    .from("configuracoes_plataforma")
    .select("valor")
    .eq("chave", "delivery_pricing_default")
    .maybeSingle();

  if (response.error) {
    if (isMissingPlatformSettingsTableError(response.error)) {
      return null;
    }

    throw response.error;
  }

  return response.data?.valor ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const googleMapsApiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Missing Supabase service credentials" }, 500);
  }
  if (!googleMapsApiKey) {
    return json({ error: "Missing GOOGLE_MAPS_API_KEY for delivery distance validation." }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const payload = await req.json();
    const lojaId = payload?.loja_id;
    const customer = payload?.customer;
    const items = payload?.items;

    if (!lojaId || !customer?.nome || !customer?.telefone || !customer?.morada) {
      return json({ error: "Missing required customer fields" }, 400);
    }

    if (!Array.isArray(items) || items.length === 0) {
      return json({ error: "Missing order items" }, 400);
    }

    const customerLat = toNullableNumber(customer?.lat);
    const customerLng = toNullableNumber(customer?.lng);
    if (customerLat === null || customerLng === null) {
      return json({ error: "Morada sem coordenadas. Marca o ponto no mapa para continuar." }, 400);
    }

    let lojaResponse = await supabase
      .from("lojas")
      .select("idloja, nome, taxaentrega, aceitacao_automatica_pedidos, configuracao_entrega")
      .eq("idloja", lojaId)
      .maybeSingle();

    if (lojaResponse.error && isMissingStoreColumnError(lojaResponse.error, "configuracao_entrega")) {
      lojaResponse = await supabase
        .from("lojas")
        .select("idloja, nome, taxaentrega, aceitacao_automatica_pedidos")
        .eq("idloja", lojaId)
        .maybeSingle();
    }

    const { data: loja, error: lojaError } = lojaResponse;

    if (lojaError) {
      return json({ error: lojaError.message }, 500);
    }
    if (!loja) {
      return json({ error: "Loja nao encontrada." }, 400);
    }

    console.log("create-order auto-accept flag", {
      loja_id: lojaId,
      loja_nome: loja.nome || null,
      aceitacao_automatica_pedidos: loja.aceitacao_automatica_pedidos,
    });

    const globalDeliveryPricingConfig = await fetchGlobalDeliveryPricingConfig(supabase);
    const effectiveDeliveryPricingConfig = resolveEffectiveDeliveryPricingConfig(
      loja.configuracao_entrega ?? null,
      globalDeliveryPricingConfig,
      loja.taxaentrega ?? null,
    );

    const drivingDistanceKm = await calculateDrivingDistanceKm(
      BARCELOS_CENTER,
      { lat: customerLat, lng: customerLng },
      googleMapsApiKey,
    );

    const deliveryQuote = computeDeliveryQuoteByDistance(
      drivingDistanceKm,
      effectiveDeliveryPricingConfig,
      loja.taxaentrega ?? null,
    );
    if (!deliveryQuote.deliverable) {
      return json({
        error: deliveryQuote.reason || "Morada fora da zona de entrega.",
        code: "OUT_OF_DELIVERY_ZONE",
      }, 400);
    }

    const subtotal = toNumber(payload.subtotal, 0);
    const taxaEntrega = toNumber(deliveryQuote.fee, 0);
    const total = subtotal + taxaEntrega;
    const submittedAt = new Date().toISOString();
    const storedPaymentMethod = normalizePaymentCode(payload?.payment_label || payload?.payment_method || "CASH") || "CASH";
    const storedPaymentLabel = paymentCodeToLabel(storedPaymentMethod) || "Dinheiro";
    const scheduledForRaw = String(payload?.scheduled_for || "").trim();
    const scheduledForDate = scheduledForRaw ? new Date(scheduledForRaw) : null;
    const isScheduledOrder = Boolean(
      String(payload?.order_timing_mode || "").toUpperCase() === "SCHEDULED"
      && scheduledForDate
      && !Number.isNaN(scheduledForDate.getTime())
      && scheduledForDate.getTime() > Date.now(),
    );
    const scheduledForIso = isScheduledOrder && scheduledForDate
      ? scheduledForDate.toISOString()
      : null;
    const autoAcceptEnabled = Boolean(loja.aceitacao_automatica_pedidos);
    const shouldCreateShipdayImmediately = autoAcceptEnabled && !isScheduledOrder;
    const initialStatus = autoAcceptEnabled ? "CONFIRMED" : "PENDING";
    const initialEstadoInterno = autoAcceptEnabled ? "aceite" : "pendente";
    const acceptedAt = autoAcceptEnabled ? submittedAt : null;

    const orderInsertPayload = {
      loja_id: lojaId,
      customer_nome: customer.nome,
      customer_phone: customer.telefone,
      customer_address: customer.morada,
      customer_address_label: customer.address_label || null,
      customer_lat: customerLat,
      customer_lng: customerLng,
      customer_notes: customer.notas || null,
      customer_email: customer.email || null,
      customer_user_id: customer.user_id || null,
      subtotal,
      taxa_entrega: taxaEntrega,
      total,
      payment_method: storedPaymentMethod,
      payment_label: storedPaymentLabel,
      status: initialStatus,
      estado_interno: initialEstadoInterno,
      data_aceitacao: acceptedAt,
      aceite_em: acceptedAt,
      submitted_at: submittedAt,
      order_timing_mode: isScheduledOrder ? "SCHEDULED" : "ASAP",
      scheduled_for: scheduledForIso,
      created_at: submittedAt,
      updated_at: submittedAt,
    };

    const { data: insertedOrder, error: orderError } = await insertOrderWithCompatibility(
      supabase,
      orderInsertPayload,
    );

    if (orderError) {
      return json({ error: orderError.message }, 500);
    }

    const orderId = insertedOrder.id;

    const orderItems = items.map((item: any) => ({
      order_id: orderId,
      menu_id: item.menu_id ?? null,
      nome: item.nome,
      quantidade: toNumber(item.quantidade, 1),
      preco_unitario: toNumber(item.preco_unitario, 0),
      subtotal: toNumber(item.subtotal, 0),
      opcoes_selecionadas: Array.isArray(item?.opcoes_selecionadas) ? item.opcoes_selecionadas : [],
    }));

    const { error: itemsError } = await insertOrderItemsWithCompatibility(supabase, orderItems);
    if (itemsError) {
      await supabase.from("orders").delete().eq("id", orderId);
      return json({ error: itemsError.message }, 500);
    }

    let shipdayResult: any = null;
    let shipdayErrorMessage: string | null = null;

    if (shouldCreateShipdayImmediately) {
      try {
        shipdayResult = await invokeInternalFunction(supabaseUrl, serviceRoleKey, "shipday-api", {
          action: "create_order",
          orderId,
          paymentMethod: storedPaymentMethod,
          paymentLabel: storedPaymentLabel,
        });
      } catch (shipdayError: any) {
        shipdayErrorMessage = String(
          shipdayError?.message || "Falha ao criar registo Shipday para auto-aceitacao.",
        );
        console.error("create-order auto-accept Shipday sync failed", {
          order_id: orderId,
          loja_id: lojaId,
          message: shipdayErrorMessage,
        });
      }
    }

    return json({
      ok: true,
      order_id: orderId,
      estado_interno: initialEstadoInterno,
      status: initialStatus,
      taxa_entrega: taxaEntrega,
      total,
      distancia_km: drivingDistanceKm,
      auto_accept_enabled: Boolean(loja.aceitacao_automatica_pedidos),
      auto_accept_applied: autoAcceptEnabled,
      shipday_auto_created: shouldCreateShipdayImmediately,
      data_aceitacao: acceptedAt,
      submitted_at: submittedAt,
      order_timing_mode: isScheduledOrder ? "SCHEDULED" : "ASAP",
      scheduled_for: scheduledForIso,
      shipday_error: shipdayErrorMessage,
      shipday_order_id: shipdayResult?.shipday_order_id || null,
      shipday_tracking_url: shipdayResult?.shipday_tracking_url || null,
    });
  } catch (error: any) {
    return json({ error: error?.message || "Unexpected server error" }, 500);
  }
});

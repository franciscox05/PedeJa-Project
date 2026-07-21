import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BARCELOS_CENTER = Object.freeze({
  lat: 41.537678,
  lng: -8.616016,
});

const BARCELOS_DELIVERY_TIERS = Object.freeze([
  { maxKm: 2, fee: 2.8 },
  { maxKm: 3, fee: 3.0 },
  { maxKm: 5, fee: 4.0 },
  { maxKm: 7, fee: 5.2 },
  { maxKm: 9, fee: 5.9 },
  { maxKm: 13, fee: 8.0 },
  { maxKm: 17, fee: 9.6 },
]);

const DEFAULT_PER_KM_DELIVERY_CONFIG = Object.freeze({
  mode: "per_km",
  base_fee: 2.8,
  included_km: 2,
  extra_per_km: 0.5,
  max_km: 17,
});

const MAX_BARCELOS_RADIUS_KM = BARCELOS_DELIVERY_TIERS[BARCELOS_DELIVERY_TIERS.length - 1].maxKm;

type DeliveryPricingConfig = {
  mode: "per_km";
  base_fee: number;
  included_km: number;
  extra_per_km: number;
  max_km: number;
};

function toPositiveNumber(value: unknown, fallback: number, min = 0) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Number(parsed.toFixed(2));
}

function parseJsonObject(value: unknown) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function resolveTier(distanceKm: number | null) {
  if (!Number.isFinite(distanceKm) || (distanceKm as number) < 0) return null;
  return BARCELOS_DELIVERY_TIERS.find((tier) => (distanceKm as number) <= tier.maxKm) || null;
}

function sanitizeDeliveryPricingConfig(rawConfig: unknown, fallbackBaseFee: unknown = null): DeliveryPricingConfig | null {
  const parsed = parseJsonObject(rawConfig);
  if (!parsed) return null;

  const baseFeeFallback = toPositiveNumber(
    fallbackBaseFee,
    DEFAULT_PER_KM_DELIVERY_CONFIG.base_fee,
    0,
  );
  const baseFee = toPositiveNumber(
    parsed.base_fee ?? parsed.min_fee ?? parsed.minimum_fee,
    baseFeeFallback,
    0,
  );
  const includedKm = toPositiveNumber(
    parsed.included_km ?? parsed.base_km ?? parsed.min_km,
    DEFAULT_PER_KM_DELIVERY_CONFIG.included_km,
    0,
  );
  const extraPerKm = toPositiveNumber(
    parsed.extra_per_km ?? parsed.extra_km_price ?? parsed.price_per_km,
    DEFAULT_PER_KM_DELIVERY_CONFIG.extra_per_km,
    0,
  );
  const maxKmRaw = toPositiveNumber(
    parsed.max_km ?? parsed.maximum_km ?? parsed.delivery_radius_km,
    DEFAULT_PER_KM_DELIVERY_CONFIG.max_km,
    0.1,
  );
  const maxKm = Number(Math.max(maxKmRaw, includedKm || 0).toFixed(2));

  return {
    mode: "per_km",
    base_fee: baseFee,
    included_km: includedKm,
    extra_per_km: extraPerKm,
    max_km: maxKm,
  };
}

function resolveEffectiveDeliveryPricingConfig(
  storePricingConfig: unknown = null,
  globalPricingConfig: unknown = null,
  fallbackBaseFee: unknown = null,
): DeliveryPricingConfig | null {
  const storeConfig = sanitizeDeliveryPricingConfig(storePricingConfig, fallbackBaseFee);
  if (storeConfig) return storeConfig;

  const globalConfig = sanitizeDeliveryPricingConfig(globalPricingConfig, fallbackBaseFee);
  if (globalConfig) return globalConfig;

  return null;
}

function computeDeliveryQuoteByDistance(distanceKm: number | null, pricingConfig: unknown = null, fallbackBaseFee: unknown = null) {
  if (!Number.isFinite(distanceKm)) {
    return {
      deliverable: false,
      fee: 0,
      distanceKm: null,
      tier: null,
      pricingModel: null,
      reason: "Nao foi possivel validar a distancia de entrega.",
    };
  }

  const config = sanitizeDeliveryPricingConfig(pricingConfig, fallbackBaseFee);
  if (!config) {
    const tier = resolveTier(distanceKm);
    if (!tier) {
      return {
        deliverable: false,
        fee: 0,
        distanceKm,
        tier: null,
        pricingModel: "legacy_tiers",
        reason: `Fora da zona de entrega. Limite maximo: ${MAX_BARCELOS_RADIUS_KM} km.`,
      };
    }

    return {
      deliverable: true,
      fee: tier.fee,
      distanceKm,
      tier,
      pricingModel: "legacy_tiers",
      reason: "",
    };
  }

  if ((distanceKm as number) > config.max_km) {
    return {
      deliverable: false,
      fee: 0,
      distanceKm,
      tier: null,
      pricingModel: "per_km",
      pricingConfig: config,
      reason: `Fora da zona de entrega. Limite maximo: ${config.max_km.toFixed(0)} km.`,
    };
  }

  const extraDistance = Math.max(0, (distanceKm as number) - config.included_km);
  const fee = Number((config.base_fee + (extraDistance * config.extra_per_km)).toFixed(2));

  return {
    deliverable: true,
    fee,
    distanceKm,
    tier: null,
    pricingModel: "per_km",
    pricingConfig: config,
    extraDistanceKm: Number(extraDistance.toFixed(2)),
    reason: "",
  };
}

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

async function fetchGlobalAutoAssignConfig(
  supabase: ReturnType<typeof createClient>,
) {
  const response = await supabase
    .from("configuracoes_plataforma")
    .select("valor")
    .eq("chave", "auto_assign_carriers_default")
    .maybeSingle();

  if (response.error) {
    if (isMissingPlatformSettingsTableError(response.error)) {
      return null;
    }

    throw response.error;
  }

  return response.data?.valor ?? null;
}

function resolveEffectiveAutoAssignEnabled(
  loja: Record<string, unknown> | null | undefined,
  globalAutoAssignConfig: unknown,
) {
  const globalEnabled = typeof globalAutoAssignConfig === "boolean"
    ? globalAutoAssignConfig
    : Boolean(
      globalAutoAssignConfig
      && typeof globalAutoAssignConfig === "object"
      && (globalAutoAssignConfig as Record<string, unknown>).enabled === true,
    );

  const storeConfig = loja?.configuracao_auto_assign;
  const storeConfigEnabled = typeof storeConfig === "boolean"
    ? storeConfig
    : Boolean(
      storeConfig
      && typeof storeConfig === "object"
      && (storeConfig as Record<string, unknown>).enabled === true,
    );

  const storeEnabled = Boolean(loja?.atribuicao_automatica_estafeta) || storeConfigEnabled;

  return globalEnabled || storeEnabled;
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
      .select("idloja, nome, taxaentrega, aceitacao_automatica_pedidos, atribuicao_automatica_estafeta, configuracao_auto_assign, configuracao_entrega, dispatch_interno_ativo")
      .eq("idloja", lojaId)
      .maybeSingle();

    if (
      lojaResponse.error
      && (
        isMissingStoreColumnError(lojaResponse.error, "configuracao_entrega")
        || isMissingStoreColumnError(lojaResponse.error, "configuracao_auto_assign")
        || isMissingStoreColumnError(lojaResponse.error, "atribuicao_automatica_estafeta")
        || isMissingStoreColumnError(lojaResponse.error, "dispatch_interno_ativo")
      )
    ) {
      lojaResponse = await supabase
        .from("lojas")
        .select("idloja, nome, taxaentrega, aceitacao_automatica_pedidos, atribuicao_automatica_estafeta, configuracao_auto_assign")
        .eq("idloja", lojaId)
        .maybeSingle();

      if (
        lojaResponse.error
        && (
          isMissingStoreColumnError(lojaResponse.error, "configuracao_auto_assign")
          || isMissingStoreColumnError(lojaResponse.error, "atribuicao_automatica_estafeta")
        )
      ) {
        lojaResponse = await supabase
          .from("lojas")
          .select("idloja, nome, taxaentrega, aceitacao_automatica_pedidos")
          .eq("idloja", lojaId)
          .maybeSingle();
      }
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

    const couponCode = String(payload?.coupon_code || "").trim();
    let discountAmount = 0;
    if (couponCode) {
      if (!customer?.user_id) {
        return json({ error: "Inicia sessao para usar um cupao de desconto." }, 400);
      }

      const { data: couponValidation, error: couponError } = await supabase.rpc("validate_coupon", {
        caller_user_id: Number(customer.user_id),
        code_input: couponCode,
        order_subtotal: subtotal,
      });

      if (couponError) {
        return json({ error: couponError.message || "Cupao invalido." }, 400);
      }

      const validationRow = Array.isArray(couponValidation) ? couponValidation[0] : couponValidation;
      discountAmount = toNumber(validationRow?.discount_amount, 0);
    }

    const total = subtotal + taxaEntrega - discountAmount;
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
    const globalAutoAssignConfig = await fetchGlobalAutoAssignConfig(supabase);
    const autoAcceptEnabled = Boolean(loja.aceitacao_automatica_pedidos);
    const autoAssignEnabled = resolveEffectiveAutoAssignEnabled(loja, globalAutoAssignConfig);
    const dispatchInternoAtivo = Boolean(loja.dispatch_interno_ativo);
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
      discount_amount: discountAmount,
      coupon_code: couponCode || null,
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

    if (couponCode && customer?.user_id) {
      const { error: redeemError } = await supabase.rpc("redeem_coupon", {
        caller_user_id: Number(customer.user_id),
        code_input: couponCode,
        order_id_input: orderId,
      });

      if (redeemError) {
        console.error("create-order coupon redemption failed", {
          order_id: orderId,
          coupon_code: couponCode,
          message: redeemError.message,
        });
      }
    }

    let autoAssignResult: Record<string, unknown> | null = null;
    let autoAssignErrorMessage: string | null = null;
    const shouldAttemptAutoAssignNow = Boolean(
      autoAssignEnabled
      && autoAcceptEnabled
      && !isScheduledOrder,
    );

    // Dispatch interno (estafetas proprios): dispara a varredura de
    // auto-atribuicao (public.auto_assign_deliveries) assim que o pedido e
    // criado. O pg_cron tambem a corre a cada minuto, por isso uma falha
    // aqui nao deixa o pedido preso -- e so uma tentativa imediata.
    if (dispatchInternoAtivo && shouldAttemptAutoAssignNow) {
      try {
        const { data: internalAssignResult, error: internalAssignError } = await supabase.rpc(
          "auto_assign_deliveries",
        );

        if (internalAssignError) {
          autoAssignErrorMessage = internalAssignError.message || "Falha na auto-atribuicao interna.";
        } else {
          autoAssignResult = { ok: true, internal: true, ...(internalAssignResult || {}) };
        }
      } catch (internalAssignException: any) {
        autoAssignErrorMessage = String(
          internalAssignException?.message || "Falha na auto-atribuicao interna.",
        );
      }

      if (autoAssignErrorMessage) {
        console.error("create-order dispatch interno auto-assign failed", {
          order_id: orderId,
          loja_id: lojaId,
          message: autoAssignErrorMessage,
        });
      }
    }

    if (shouldAttemptAutoAssignNow && !autoAssignResult?.ok && !autoAssignErrorMessage) {
      autoAssignErrorMessage = "Falha na atribuicao automatica de estafeta.";
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
      auto_assign_enabled: autoAssignEnabled,
      dispatch_interno_ativo: dispatchInternoAtivo,
      global_auto_assign_enabled: Boolean(
        typeof globalAutoAssignConfig === "boolean"
          ? globalAutoAssignConfig
          : globalAutoAssignConfig
          && typeof globalAutoAssignConfig === "object"
          && (globalAutoAssignConfig as Record<string, unknown>).enabled === true,
      ),
      data_aceitacao: acceptedAt,
      submitted_at: submittedAt,
      order_timing_mode: isScheduledOrder ? "SCHEDULED" : "ASAP",
      scheduled_for: scheduledForIso,
      auto_assign_applied: Boolean(autoAssignResult?.ok),
      auto_assign_error: autoAssignErrorMessage,
      auto_assign_result: autoAssignResult,
    });
  } catch (error: any) {
    return json({ error: error?.message || "Unexpected server error" }, 500);
  }
});

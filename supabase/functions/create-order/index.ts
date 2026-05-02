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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function invokeShipdayCreateOrderWithRetry(
  supabaseUrl: string,
  serviceRoleKey: string,
  body: Record<string, unknown>,
  options: { attempts?: number; baseDelayMs?: number } = {},
) {
  const attempts = Math.max(1, Number(options.attempts || 6));
  const baseDelayMs = Math.max(100, Number(options.baseDelayMs || 900));
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await invokeInternalFunction(supabaseUrl, serviceRoleKey, "shipday-api", body);
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error?.message || error));
      if (attempt < attempts) {
        await sleep(baseDelayMs * attempt);
      }
    }
  }

  throw lastError || new Error("Falha ao sincronizar pedido com Shipday.");
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

function parseShipdayCarriersPayload(payload: any) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.carriers)) return payload.carriers;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.data?.carriers)) return payload.data.carriers;
  return [];
}

function toTruthyFlag(value: unknown, fallback = true) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "y", "sim"].includes(normalized);
}

function toFiniteCoordinate(value: unknown) {
  const parsed = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeVehicleSegment(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text
    .replace(/\bmotorcycle\b/gi, "Mota")
    .replace(/\bbike\b/gi, "Bicicleta")
    .replace(/\bbicycle\b/gi, "Bicicleta")
    .replace(/\bcar\b/gi, "Carro")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCarrierVehicleSummary(carrier: Record<string, unknown>) {
  const type = normalizeVehicleSegment(
    carrier?.vehicle_type
      || carrier?.vehicleType
      || carrier?.type
      || (carrier?.vehicle as Record<string, unknown> | undefined)?.type,
  );
  const make = normalizeVehicleSegment(
    carrier?.vehicle_make
      || carrier?.vehicleMake
      || carrier?.make
      || (carrier?.vehicle as Record<string, unknown> | undefined)?.make,
  );
  const model = normalizeVehicleSegment(
    carrier?.vehicle_model
      || carrier?.vehicleModel
      || carrier?.model
      || (carrier?.vehicle as Record<string, unknown> | undefined)?.model,
  );
  const plate = String(
    carrier?.license_plate
      || carrier?.licensePlate
      || carrier?.plate_number
      || carrier?.plateNumber
      || carrier?.plate
      || carrier?.registration
      || (carrier?.vehicle as Record<string, unknown> | undefined)?.license_plate
      || (carrier?.vehicle as Record<string, unknown> | undefined)?.licensePlate
      || (carrier?.vehicle as Record<string, unknown> | undefined)?.plate_number
      || (carrier?.vehicle as Record<string, unknown> | undefined)?.plateNumber
      || (carrier?.vehicle as Record<string, unknown> | undefined)?.plate
      || (carrier?.vehicle as Record<string, unknown> | undefined)?.registration
      || "",
  ).replace(/\s+/g, "").toUpperCase();

  const parts = [type, make, model].filter(Boolean);
  const base = parts.join(" ").trim();
  if (base && plate) return `${base} (${plate})`;
  return base || plate || null;
}

function normalizeCarrierForAutoAssign(carrierRaw: any, index: number) {
  const id = String(
    carrierRaw?.id
      || carrierRaw?.carrierId
      || carrierRaw?.driverId
      || carrierRaw?.userId
      || carrierRaw?.employeeId
      || "",
  ).trim();

  if (!id) return null;

  const firstName = String(carrierRaw?.firstName || "").trim();
  const lastName = String(carrierRaw?.lastName || "").trim();
  const fullName = `${firstName} ${lastName}`.trim();
  const name = String(
    carrierRaw?.name
      || carrierRaw?.fullName
      || carrierRaw?.driverName
      || fullName
      || `Estafeta ${index + 1}`,
  ).trim();

  const phone = String(
    carrierRaw?.phone
      || carrierRaw?.phoneNumber
      || carrierRaw?.mobile
      || carrierRaw?.mobileNumber
      || carrierRaw?.driverPhoneNumber
      || "",
  ).trim();

  const status = String(
    carrierRaw?.status
      || carrierRaw?.availability
      || carrierRaw?.state
      || (carrierRaw?.active === false ? "INACTIVE" : "ACTIVE"),
  ).trim().toUpperCase();

  const explicitAvailable = carrierRaw?.isAvailable ?? carrierRaw?.available ?? carrierRaw?.online ?? carrierRaw?.is_available;
  const explicitOnShift = carrierRaw?.isOnShift ?? carrierRaw?.onShift ?? carrierRaw?.is_on_shift;
  const explicitActive = carrierRaw?.isActive ?? carrierRaw?.active ?? carrierRaw?.is_active;

  const statusUnavailable = ["INACTIVE", "OFFLINE", "UNAVAILABLE", "BUSY"].includes(status);
  const isAvailable = explicitAvailable === null || explicitAvailable === undefined
    ? !statusUnavailable
    : toTruthyFlag(explicitAvailable, true);
  const isOnShift = explicitOnShift === null || explicitOnShift === undefined
    ? true
    : toTruthyFlag(explicitOnShift, true);
  const isActive = explicitActive === null || explicitActive === undefined
    ? true
    : toTruthyFlag(explicitActive, true);

  const lat = toFiniteCoordinate(
    carrierRaw?.latitude
      ?? carrierRaw?.lat
      ?? carrierRaw?.last_location?.latitude
      ?? carrierRaw?.last_location?.lat
      ?? carrierRaw?.location?.latitude
      ?? carrierRaw?.location?.lat,
  );
  const lng = toFiniteCoordinate(
    carrierRaw?.longitude
      ?? carrierRaw?.lng
      ?? carrierRaw?.lon
      ?? carrierRaw?.last_location?.longitude
      ?? carrierRaw?.last_location?.lng
      ?? carrierRaw?.location?.longitude
      ?? carrierRaw?.location?.lng,
  );

  return {
    id,
    name: name || `Estafeta ${id}`,
    phone,
    status,
    isAvailable,
    isOnShift,
    isActive,
    lat,
    lng,
    vehicle: buildCarrierVehicleSummary(carrierRaw),
  };
}

function pickBestCarrierForAutoAssign(carriersRaw: any[]) {
  const candidates = (carriersRaw || [])
    .map((carrierRaw, index) => normalizeCarrierForAutoAssign(carrierRaw, index))
    .filter(Boolean) as Array<{
    id: string;
    name: string;
    phone: string;
    status: string;
    isAvailable: boolean;
    isOnShift: boolean;
    isActive: boolean;
    lat: number | null;
    lng: number | null;
    vehicle: string | null;
  }>;

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const rankA = a.isActive && a.isOnShift && a.isAvailable ? 0 : a.isAvailable ? 1 : 2;
    const rankB = b.isActive && b.isOnShift && b.isAvailable ? 0 : b.isAvailable ? 1 : 2;
    if (rankA !== rankB) return rankA - rankB;
    return a.name.localeCompare(b.name, "pt-PT");
  });

  return candidates[0] || null;
}

function isMissingAssignOrderColumnError(error: { message?: string } | null | undefined, columnName: string) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("column")
    && message.includes("orders")
    && message.includes(String(columnName || "").toLowerCase());
}

function stripUnsupportedAssignColumns(
  patch: Record<string, unknown>,
  error: { message?: string } | null | undefined,
) {
  const message = String(error?.message || "").toLowerCase();
  const nextPatch = { ...patch };
  ["driver_name", "driver_phone", "veiculo_estafeta", "atribuido_em"].forEach((columnName) => {
    if (message.includes("column") && message.includes("orders") && message.includes(columnName)) {
      delete nextPatch[columnName];
    }
  });
  return nextPatch;
}

async function persistAutoAssignedCarrierOnOrder(
  supabase: ReturnType<typeof createClient>,
  orderId: number,
  patch: Record<string, unknown>,
) {
  let response = await supabase
    .from("orders")
    .update(patch)
    .eq("id", orderId);

  if (
    response.error
    && (
      isMissingAssignOrderColumnError(response.error, "driver_name")
      || isMissingAssignOrderColumnError(response.error, "driver_phone")
      || isMissingAssignOrderColumnError(response.error, "veiculo_estafeta")
      || isMissingAssignOrderColumnError(response.error, "atribuido_em")
    )
  ) {
    const fallbackPatch = stripUnsupportedAssignColumns(patch, response.error);
    response = await supabase
      .from("orders")
      .update(fallbackPatch)
      .eq("id", orderId);
  }

  return response;
}

function resolveShipdayOrderIdFromCreateResult(result: any) {
  return String(
    result?.shipday_order_id
      || result?.data?.orderId
      || result?.data?.id
      || result?.orderId
      || result?.id
      || "",
  ).trim();
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
      .select("idloja, nome, taxaentrega, aceitacao_automatica_pedidos, atribuicao_automatica_estafeta, configuracao_auto_assign, configuracao_entrega")
      .eq("idloja", lojaId)
      .maybeSingle();

    if (
      lojaResponse.error
      && (
        isMissingStoreColumnError(lojaResponse.error, "configuracao_entrega")
        || isMissingStoreColumnError(lojaResponse.error, "configuracao_auto_assign")
        || isMissingStoreColumnError(lojaResponse.error, "atribuicao_automatica_estafeta")
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
    const globalAutoAssignConfig = await fetchGlobalAutoAssignConfig(supabase);
    const autoAcceptEnabled = Boolean(loja.aceitacao_automatica_pedidos);
    const autoAssignEnabled = resolveEffectiveAutoAssignEnabled(loja, globalAutoAssignConfig);
    const shouldCreateShipdayImmediately = autoAcceptEnabled || autoAssignEnabled;
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
    let autoAssignResult: Record<string, unknown> | null = null;
    let autoAssignErrorMessage: string | null = null;
    const shouldAttemptAutoAssignNow = Boolean(
      autoAssignEnabled
      && autoAcceptEnabled
      && !isScheduledOrder,
    );

    if (shouldCreateShipdayImmediately) {
      try {
        shipdayResult = await invokeShipdayCreateOrderWithRetry(supabaseUrl, serviceRoleKey, {
          action: "create_order",
          orderId,
          paymentMethod: storedPaymentMethod,
          paymentLabel: storedPaymentLabel,
          autoAssign: shouldAttemptAutoAssignNow,
        }, {
          attempts: 8,
          baseDelayMs: 1000,
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

    const createdShipdayOrderId = resolveShipdayOrderIdFromCreateResult(shipdayResult);
    const initialAutoAssignResult = shipdayResult?.auto_assign && typeof shipdayResult.auto_assign === "object"
      ? shipdayResult.auto_assign as Record<string, unknown>
      : null;

    if (shouldAttemptAutoAssignNow && initialAutoAssignResult) {
      autoAssignResult = initialAutoAssignResult;
    }

    if (shouldAttemptAutoAssignNow && !autoAssignResult?.ok && createdShipdayOrderId) {
      const maxAutoAssignAttempts = 4;

      for (let attempt = 1; attempt <= maxAutoAssignAttempts; attempt += 1) {
        try {
          const assignResult = await invokeInternalFunction(
            supabaseUrl,
            serviceRoleKey,
            "shipday-api",
            {
              action: "auto_assign_order",
              orderId,
              shipdayOrderId: createdShipdayOrderId,
            },
          );

          autoAssignResult = assignResult && typeof assignResult === "object"
            ? assignResult as Record<string, unknown>
            : null;

          if (autoAssignResult?.ok || autoAssignResult?.skipped) {
            break;
          }

          autoAssignErrorMessage = String(
            autoAssignResult?.error
            || autoAssignResult?.reason
            || "Falha na atribuicao automatica de estafeta.",
          );
        } catch (autoAssignError: any) {
          autoAssignErrorMessage = String(
            autoAssignError?.message || "Falha na atribuicao automatica de estafeta.",
          );
        }

        if (attempt < maxAutoAssignAttempts) {
          await sleep(1000 * attempt);
        }
      }
    }

    if (shouldAttemptAutoAssignNow && !autoAssignResult?.ok && !autoAssignResult?.skipped && !autoAssignErrorMessage) {
      autoAssignErrorMessage = "Falha na atribuicao automatica de estafeta.";
    }

    const autoAssignedCarrier = autoAssignResult?.carrier && typeof autoAssignResult.carrier === "object"
      ? {
        carrier_id: String((autoAssignResult.carrier as Record<string, unknown>).id || "").trim() || null,
        carrier_name: String((autoAssignResult.carrier as Record<string, unknown>).name || "").trim() || null,
        carrier_phone: String((autoAssignResult.carrier as Record<string, unknown>).phone || "").trim() || null,
        carrier_vehicle: String((autoAssignResult.carrier as Record<string, unknown>).vehicle || "").trim() || null,
      }
      : null;

    if (shouldAttemptAutoAssignNow && autoAssignErrorMessage) {
      console.error("create-order auto-assign failed", {
        order_id: orderId,
        loja_id: lojaId,
        shipday_order_id: createdShipdayOrderId || null,
        message: autoAssignErrorMessage,
      });
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
      global_auto_assign_enabled: Boolean(
        typeof globalAutoAssignConfig === "boolean"
          ? globalAutoAssignConfig
          : globalAutoAssignConfig
          && typeof globalAutoAssignConfig === "object"
          && (globalAutoAssignConfig as Record<string, unknown>).enabled === true,
      ),
      shipday_auto_created: shouldCreateShipdayImmediately,
      data_aceitacao: acceptedAt,
      submitted_at: submittedAt,
      order_timing_mode: isScheduledOrder ? "SCHEDULED" : "ASAP",
      scheduled_for: scheduledForIso,
      shipday_error: shipdayErrorMessage,
      shipday_order_id: createdShipdayOrderId || null,
      shipday_tracking_url: shipdayResult?.shipday_tracking_url || shipdayResult?.data?.trackingUrl || shipdayResult?.data?.trackingLink || null,
      auto_assign_applied: Boolean(autoAssignResult?.ok && autoAssignedCarrier?.carrier_id),
      auto_assign_error: autoAssignErrorMessage,
      auto_assigned_carrier: autoAssignedCarrier,
      auto_assign_result: autoAssignResult,
    });
  } catch (error: any) {
    return json({ error: error?.message || "Unexpected server error" }, 500);
  }
});

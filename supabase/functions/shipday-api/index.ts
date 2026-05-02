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

function toTruthyFlag(value: unknown, fallback = true) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "y", "sim"].includes(normalized);
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
  method: "GET" | "PUT" | "POST" | "DELETE";
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMissingOrderItemsColumnError(error: { message?: string } | null | undefined, columnName: string) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("column")
    && message.includes("order_items")
    && message.includes(String(columnName || "").toLowerCase());
}

function ensureArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const parsed = parseJsonSafely(value);
    return Array.isArray(parsed) ? parsed : [];
  }
  return [];
}

function parseShipdayCarriersPayload(payload: any) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.carriers)) return payload.carriers;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.data?.carriers)) return payload.data.carriers;
  return [];
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
  const vehicle = carrier?.vehicle as Record<string, unknown> | undefined;

  const type = normalizeVehicleSegment(
    carrier?.vehicle_type
      || carrier?.vehicleType
      || carrier?.type
      || vehicle?.type,
  );
  const make = normalizeVehicleSegment(
    carrier?.vehicle_make
      || carrier?.vehicleMake
      || carrier?.make
      || vehicle?.make,
  );
  const model = normalizeVehicleSegment(
    carrier?.vehicle_model
      || carrier?.vehicleModel
      || carrier?.model
      || vehicle?.model,
  );
  const plate = String(
    carrier?.license_plate
      || carrier?.licensePlate
      || carrier?.plate_number
      || carrier?.plateNumber
      || carrier?.plate
      || carrier?.registration
      || vehicle?.license_plate
      || vehicle?.licensePlate
      || vehicle?.plate_number
      || vehicle?.plateNumber
      || vehicle?.plate
      || vehicle?.registration
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

  return {
    id,
    name: name || `Estafeta ${id}`,
    phone,
    status,
    isAvailable,
    isOnShift,
    isActive,
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

function isMissingOrdersColumnError(error: { message?: string } | null | undefined, columnName: string) {
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
  [
    "driver_name",
    "driver_phone",
    "shipday_driver_name",
    "shipday_driver_phone",
    "veiculo_estafeta",
    "atribuido_em",
  ].forEach((columnName) => {
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

  const shouldRetryCompatibility = response.error && (
    isMissingOrdersColumnError(response.error, "driver_name")
    || isMissingOrdersColumnError(response.error, "driver_phone")
    || isMissingOrdersColumnError(response.error, "shipday_driver_name")
    || isMissingOrdersColumnError(response.error, "shipday_driver_phone")
    || isMissingOrdersColumnError(response.error, "veiculo_estafeta")
    || isMissingOrdersColumnError(response.error, "atribuido_em")
  );

  if (shouldRetryCompatibility) {
    const fallbackPatch = stripUnsupportedAssignColumns(patch, response.error);
    response = await supabase
      .from("orders")
      .update(fallbackPatch)
      .eq("id", orderId);
  }

  return response;
}

async function runAutoAssignForOrder(
  supabase: ReturnType<typeof createClient>,
  shipdayBaseUrl: string,
  shipdayApiKey: string,
  order: Record<string, unknown>,
  explicitShipdayOrderId?: string,
) {
  const orderId = Number(order?.id || 0);
  const shipdayOrderId = toText(explicitShipdayOrderId || order?.shipday_order_id);
  if (!orderId || !shipdayOrderId) {
    return { ok: false, skipped: true, reason: "order_or_shipday_id_missing" };
  }

  const hasDriver = Boolean(
    toText(order?.driver_name)
    || toText(order?.driver_phone)
    || toText(order?.shipday_driver_name)
    || toText(order?.shipday_driver_phone),
  );
  if (hasDriver) {
    return { ok: true, skipped: true, reason: "already_has_driver" };
  }

  let selectedCarrier: ReturnType<typeof normalizeCarrierForAutoAssign> = null;
  let carriersResult: Awaited<ReturnType<typeof callShipday>> | null = null;
  const maxCarrierAttempts = 3;

  for (let attempt = 1; attempt <= maxCarrierAttempts; attempt += 1) {
    carriersResult = await callShipday({
      shipdayBaseUrl,
      shipdayApiKey,
      method: "GET",
      endpoint: "/carriers",
    });

    if (!carriersResult.ok) {
      if (attempt < maxCarrierAttempts) {
        await sleep(800 * attempt);
        continue;
      }

      return {
        ok: false,
        skipped: false,
        reason: "get_carriers_failed",
        error: carriersResult.error,
        shipday_status: carriersResult.status,
        payload: carriersResult.payload,
      };
    }

    const carriersRaw = parseShipdayCarriersPayload(carriersResult.payload);
    selectedCarrier = pickBestCarrierForAutoAssign(carriersRaw);
    if (selectedCarrier?.id) break;

    if (attempt < maxCarrierAttempts) {
      await sleep(800 * attempt);
    }
  }

  if (!selectedCarrier?.id) {
    return {
      ok: false,
      skipped: true,
      reason: "no_available_carrier",
      error: "Sem estafetas disponiveis para atribuicao automatica.",
    };
  }

  let assignResult: Awaited<ReturnType<typeof callShipday>> | null = null;
  const maxAssignAttempts = 4;

  for (let attempt = 1; attempt <= maxAssignAttempts; attempt += 1) {
    assignResult = await callShipday({
      shipdayBaseUrl,
      shipdayApiKey,
      method: "PUT",
      endpoint: `/orders/assign/${encodeURIComponent(shipdayOrderId)}/${encodeURIComponent(selectedCarrier.id)}`,
    });

    if (assignResult.ok) break;

    const shouldRetryAssign = attempt < maxAssignAttempts
      && (
        [408, 409, 423, 425, 429, 500, 502, 503, 504].includes(Number(assignResult.status))
        || String(assignResult.error || "").toLowerCase().includes("not found")
        || String(assignResult.error || "").toLowerCase().includes("try again")
        || String(assignResult.error || "").toLowerCase().includes("tempor")
      );

    if (!shouldRetryAssign) break;
    await sleep(900 * attempt);
  }

  if (!assignResult?.ok) {
    return {
      ok: false,
      skipped: false,
      reason: "assign_failed",
      error: assignResult?.error || "Falha ao atribuir no Shipday.",
      shipday_status: assignResult?.status || null,
      payload: assignResult?.payload || null,
      carrier_id: selectedCarrier.id,
    };
  }

  const assignedAt = new Date().toISOString();
  const persistPatch = {
    estado_interno: "atribuindo_estafeta",
    status: "ASSIGNED",
    driver_name: selectedCarrier.name || null,
    driver_phone: selectedCarrier.phone || null,
    shipday_driver_name: selectedCarrier.name || null,
    shipday_driver_phone: selectedCarrier.phone || null,
    veiculo_estafeta: selectedCarrier.vehicle || null,
    atribuido_em: assignedAt,
    updated_at: assignedAt,
  };

  const persistResult = await persistAutoAssignedCarrierOnOrder(supabase, orderId, persistPatch);
  if (persistResult.error) {
    return {
      ok: false,
      skipped: false,
      reason: "persist_failed",
      error: persistResult.error.message,
      carrier_id: selectedCarrier.id,
    };
  }

  return {
    ok: true,
    skipped: false,
    shipday_order_id: shipdayOrderId,
    carrier: {
      id: selectedCarrier.id,
      name: selectedCarrier.name,
      phone: selectedCarrier.phone || null,
      vehicle: selectedCarrier.vehicle || null,
    },
    data: assignResult.payload,
  };
}

function extractModifiersAndNotes(selectedOptionsRaw: unknown) {
  const selectedOptions = ensureArray(selectedOptionsRaw);
  const modifiers: string[] = [];
  const notes: string[] = [];
  const seenModifiers = new Set<string>();
  const seenNotes = new Set<string>();

  selectedOptions.forEach((entry: any) => {
    const optionName = pickFirstNonEmpty(
      entry?.option_name,
      entry?.optionName,
      entry?.nome,
      entry?.name,
      entry?.label,
    );
    if (!optionName) return;

    const groupTitle = pickFirstNonEmpty(
      entry?.group_title,
      entry?.groupTitle,
      entry?.grupo,
      entry?.group_name,
      entry?.groupName,
    );
    const groupType = pickFirstNonEmpty(entry?.group_type, entry?.groupType, entry?.tipo).toLowerCase();
    const groupId = pickFirstNonEmpty(entry?.group_id, entry?.groupId).toLowerCase();
    const optionId = pickFirstNonEmpty(entry?.option_id, entry?.optionId).toLowerCase();
    const groupTitleLower = groupTitle.toLowerCase();

    const isSpecialInstruction = groupId === "special_instructions"
      || groupType.includes("observ")
      || groupTitleLower.includes("instr")
      || optionId.startsWith("note-");

    if (isSpecialInstruction) {
      if (!seenNotes.has(optionName)) {
        seenNotes.add(optionName);
        notes.push(optionName);
      }
      return;
    }

    const display = optionName;
    if (!seenModifiers.has(display)) {
      seenModifiers.add(display);
      modifiers.push(display);
    }
  });

  return { modifiers, notes };
}

function buildShipdayItemName(baseNameRaw: unknown) {
  const baseName = pickFirstNonEmpty(baseNameRaw, "Item");
  return baseName;
}

function buildShipdayItemAddOns(selectedOptionsRaw: unknown) {
  const { modifiers, notes } = extractModifiersAndNotes(selectedOptionsRaw);

  const addOns = modifiers
    .map((entry) => toText(entry))
    .filter(Boolean);

  const noteLines = notes
    .map((entry) => toText(entry))
    .filter(Boolean)
    .map((entry) => `OBS: ${entry}`);

  const combined = [...addOns, ...noteLines];
  return combined.slice(0, 25);
}

function buildShipdayItemNameWithInlineLines(baseNameRaw: unknown, selectedOptionsRaw: unknown) {
  const baseName = pickFirstNonEmpty(baseNameRaw, "Item");
  const { modifiers, notes } = extractModifiersAndNotes(selectedOptionsRaw);
  const detailLines = modifiers
    .map((entry) => toText(entry))
    .filter(Boolean)
    .map((entry) => `+ ${entry}`);

  const noteLines = notes
    .map((entry) => toText(entry))
    .filter(Boolean)
    .map((entry) => `OBS: ${entry}`);

  const composed = [baseName, ...detailLines, ...noteLines].join("\n");
  if (composed.length <= 700) return composed;
  return `${composed.slice(0, 697)}...`;
}

function shouldRetryWithoutAddOns(shipdayErrorText: string) {
  const normalized = String(shipdayErrorText || "").toLowerCase();
  return normalized.includes("invalid payload")
    || normalized.includes("addons")
    || normalized.includes("add-ons")
    || normalized.includes("unknown field");
}

function buildShipdayOrderItems(
  orderItems: Array<Record<string, unknown>>,
  mode: "addons" | "inline",
) {
  return orderItems.map((item, index) => {
    const baseName = buildShipdayItemName(
      pickFirstNonEmpty(
        item?.nome,
        item?.name,
        item?.title,
        `Item ${index + 1}`,
      ),
    );

    const basePayload: Record<string, unknown> = {
      name: mode === "inline"
        ? buildShipdayItemNameWithInlineLines(baseName, item?.opcoes_selecionadas)
        : baseName,
      unitPrice: Number(item?.preco_unitario || 0),
      quantity: Number(item?.quantidade || 1),
    };

    if (mode === "addons") {
      const addOns = buildShipdayItemAddOns(item?.opcoes_selecionadas);
      if (addOns.length > 0) {
        basePayload.addOns = addOns;
      }
    }

    return basePayload;
  });
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

async function fetchOrderForAutoAssign(
  supabase: ReturnType<typeof createClient>,
  orderId: number,
) {
  let response = await supabase
    .from("orders")
    .select("id, loja_id, shipday_order_id, estado_interno, status, driver_name, driver_phone, shipday_driver_name, shipday_driver_phone")
    .eq("id", orderId)
    .maybeSingle();

  if (
    response.error
    && /shipday_driver_name|shipday_driver_phone/i.test(String(response.error.message || ""))
  ) {
    response = await supabase
      .from("orders")
      .select("id, loja_id, shipday_order_id, estado_interno, status, driver_name, driver_phone")
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

    if (action === "cancel_order") {
      const shipdayOrderId = toText(body?.shipdayOrderId || body?.shipday_order_id || body?.orderId || body?.order_id);

      if (!shipdayOrderId) return json({ error: "shipdayOrderId em falta" }, 400);

      const shipday = await callShipday({
        shipdayBaseUrl,
        shipdayApiKey,
        method: "DELETE",
        endpoint: `/orders/${encodeURIComponent(shipdayOrderId)}`,
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
        shipday_order_id: shipdayOrderId,
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

      let orderItemsResponse = await supabase
        .from("order_items")
        .select("nome, quantidade, preco_unitario, opcoes_selecionadas")
        .eq("order_id", order.id)
        .order("id", { ascending: true });

      if (orderItemsResponse.error && isMissingOrderItemsColumnError(orderItemsResponse.error, "opcoes_selecionadas")) {
        orderItemsResponse = await supabase
          .from("order_items")
          .select("nome, quantidade, preco_unitario")
          .eq("order_id", order.id)
          .order("id", { ascending: true });
      }

      const { data: orderItems, error: orderItemsError } = orderItemsResponse;

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
        orderItem: buildShipdayOrderItems(orderItems, "addons"),
      };

      if (pickupLat !== null && pickupLng !== null) {
        shipdayPayloadRequest.pickupLatLong = [pickupLat, pickupLng];
      }

      if (deliveryLat !== null && deliveryLng !== null) {
        shipdayPayloadRequest.deliveryLatLong = [deliveryLat, deliveryLng];
      }

      let shipday = await callShipday({
        shipdayBaseUrl,
        shipdayApiKey,
        method: "POST",
        endpoint: "/orders",
        body: shipdayPayloadRequest,
      });

      // Compatibilidade: algumas contas antigas rejeitam addOns no endpoint /orders.
      // Nesse caso, refazemos apenas o bloco de items como texto inline (nome + linhas com '+').
      if (!shipday.ok && shouldRetryWithoutAddOns(shipday.error)) {
        const fallbackPayloadRequest = {
          ...shipdayPayloadRequest,
          orderItem: buildShipdayOrderItems(orderItems, "inline"),
        };

        shipday = await callShipday({
          shipdayBaseUrl,
          shipdayApiKey,
          method: "POST",
          endpoint: "/orders",
          body: fallbackPayloadRequest,
        });
      }

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

      const shouldAttemptAutoAssign = Boolean(
        body?.autoAssign === true
        || body?.auto_assign === true
        || String(body?.autoAssign || body?.auto_assign || "").toLowerCase() === "true",
      );
      let autoAssignResult: Record<string, unknown> | null = null;

      if (shouldAttemptAutoAssign) {
        try {
          autoAssignResult = await runAutoAssignForOrder(
            supabase,
            shipdayBaseUrl,
            shipdayApiKey,
            {
              id: order.id,
              shipday_order_id: shipdayOrderId,
              estado_interno: order.estado_interno,
              status: order.status,
              driver_name: order.driver_name,
              driver_phone: order.driver_phone,
              shipday_driver_name: order.shipday_driver_name,
              shipday_driver_phone: order.shipday_driver_phone,
            },
            shipdayOrderId,
          );
        } catch (autoAssignError: any) {
          autoAssignResult = {
            ok: false,
            skipped: false,
            reason: "auto_assign_exception",
            error: String(autoAssignError?.message || "Falha na atribuicao automatica."),
          };
        }
      }

      return json({
        ok: true,
        action,
        order_id: order.id,
        shipday_order_id: shipdayOrderId,
        shipday_tracking_url: shipdayTrackingUrl,
        auto_assign: autoAssignResult,
        data: shipday.payload,
      });
    }

    if (action === "auto_assign_order") {
      const orderId = toNumber(body?.orderId || body?.order_id);
      const providedShipdayOrderId = toText(body?.shipdayOrderId || body?.shipday_order_id);
      if (!orderId || orderId <= 0) {
        return json({ error: "orderId invalido" }, 400);
      }

      if (!supabaseUrl || !serviceRoleKey) {
        return json({ error: "Missing Supabase service credentials" }, 500);
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const { data: order, error: orderError } = await fetchOrderForAutoAssign(supabase, orderId);
      if (orderError) return json({ error: orderError.message }, 500);
      if (!order) return json({ error: "Pedido nao encontrado" }, 404);

      const currentEstado = toText(order?.estado_interno || order?.status).toLowerCase();
      if (["entregue", "cancelado"].includes(currentEstado)) {
        return json({
          ok: true,
          action,
          skipped: true,
          reason: "order_already_terminal",
          order_id: orderId,
        });
      }

      const shipdayOrderId = toText(providedShipdayOrderId || order?.shipday_order_id);
      if (!shipdayOrderId) {
        return json({
          ok: true,
          action,
          skipped: true,
          reason: "shipday_order_id_missing",
          order_id: orderId,
        });
      }

      const result = await runAutoAssignForOrder(
        supabase,
        shipdayBaseUrl,
        shipdayApiKey,
        order as Record<string, unknown>,
        shipdayOrderId,
      );

      return json({
        ok: Boolean(result?.ok),
        action,
        order_id: orderId,
        shipday_order_id: shipdayOrderId,
        ...result,
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
      error: "Action invalida. Usa 'get_carriers', 'assign_order', 'cancel_order', 'create_order', 'auto_assign_order', 'ready_for_pickup' ou 'update_status'.",
    }, 400);
  } catch (error: any) {
    return json({ error: error?.message || "Erro interno shipday-api" }, 500);
  }
});

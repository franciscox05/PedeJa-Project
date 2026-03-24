import { supabase } from "./supabaseClient";
import { mapEstadoInternoToShipdayState, normalizeEstadoInterno } from "./orderStatusMapper";
import { buildSupabaseFunctionHeaders, getSupabaseFunctionUrl } from "./supabaseClient";
import { haversineDistanceKm } from "./deliveryZoneService";
import { sanitizeAutoAssignCriteria } from "./autoAssignConfig";

const SHIPDAY_API_FUNCTION = "shipday-api";
const SHIPDAY_STATUS_FUNCTION = "update-shipday-status";
const SHIPDAY_ASSIGN_ORDER_ENDPOINT = (orderId, carrierId) => `/orders/assign/${encodeURIComponent(orderId)}/${encodeURIComponent(carrierId)}`;

function toText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseJsonSafely(rawText) {
  if (!rawText || !String(rawText).trim()) return null;
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function isCarrierAlreadyUnassignedError(value) {
  return String(value || "").toLowerCase().includes("no carrier is assigned");
}

function isTruthyFlag(value) {
  if (value === true) return true;
  return String(value || "").trim().toLowerCase() === "true";
}

function normalizeCarrierName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeCarrierPhone(value) {
  return String(value || "").replace(/\D+/g, "");
}

function toFiniteCoordinate(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractCarrierCoordinates(carrier = {}) {
  const candidates = [
    carrier,
    carrier?.last_location,
    carrier?.lastLocation,
    carrier?.location,
    carrier?.current_location,
    carrier?.currentLocation,
    carrier?.gps,
    carrier?.coordinates,
    carrier?.coordinate,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const lat = toFiniteCoordinate(candidate?.latitude ?? candidate?.lat ?? candidate?.y);
    const lng = toFiniteCoordinate(candidate?.longitude ?? candidate?.lng ?? candidate?.lon ?? candidate?.x);

    if (lat !== null && lng !== null) {
      return { lat, lng };
    }
  }

  return { lat: null, lng: null };
}

function normalizeVehicleSegment(value) {
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

function normalizeVehiclePlate(value) {
  const text = toText(value);
  return text ? text.replace(/\s+/g, "").toUpperCase() : "";
}

function buildCarrierVehicleSummary(carrier = {}) {
  const type = normalizeVehicleSegment(
    carrier?.vehicle_type
    || carrier?.vehicleType
    || carrier?.type
    || carrier?.vehicle?.type,
  );
  const make = normalizeVehicleSegment(
    carrier?.vehicle_make
    || carrier?.vehicleMake
    || carrier?.make
    || carrier?.vehicle?.make,
  );
  const model = normalizeVehicleSegment(
    carrier?.vehicle_model
    || carrier?.vehicleModel
    || carrier?.model
    || carrier?.vehicle?.model,
  );
  const plate = normalizeVehiclePlate(
    carrier?.license_plate
    || carrier?.licensePlate
    || carrier?.plate_number
    || carrier?.plateNumber
    || carrier?.plate
    || carrier?.registration
    || carrier?.vehicle?.license_plate
    || carrier?.vehicle?.licensePlate
    || carrier?.vehicle?.plate_number
    || carrier?.vehicle?.plateNumber
    || carrier?.vehicle?.plate
    || carrier?.vehicle?.registration,
  );
  const description = normalizeVehicleSegment(
    carrier?.vehicle_description
    || carrier?.vehicleDescription
    || (typeof carrier?.vehicle === "string" ? carrier.vehicle : "")
    || carrier?.vehicle?.description
    || carrier?.vehicle?.vehicle_description
    || carrier?.vehicle?.vehicleDescription,
  );

  const parts = [];
  const seen = new Set();
  [type, make, model].filter(Boolean).forEach((part) => {
    const key = part.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    parts.push(part);
  });

  const base = parts.join(" ").trim();
  if (base && plate) return `${base} (${plate})`;
  if (base) return base;
  if (description && plate) return description.includes(plate) ? description : `${description} (${plate})`;
  return description || plate || "";
}

async function invokeEdgeFunction(functionName, payload = {}) {
  if (!supabase || !supabase.auth) {
    throw new Error("Cliente Supabase indisponivel no Shipday service.");
  }

  const headers = await buildSupabaseFunctionHeaders();

  const response = await fetch(getSupabaseFunctionUrl(functionName), {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  const data = parseJsonSafely(rawText);
  const isExpectedUnassignNoCarrier =
    functionName === SHIPDAY_STATUS_FUNCTION
    && payload?.new_status === "desassociar"
    && isCarrierAlreadyUnassignedError(data?.error || data?.message || rawText);

  if (!response.ok) {
    if (!isExpectedUnassignNoCarrier) {
      console.error("Falha ao invocar edge function Shipday", {
        functionName,
        status: response.status,
        payload,
        response: data || rawText || null,
      });
    }
    throw new Error(
      String(
        data?.error
        || data?.message
        || rawText
        || `Falha ao invocar ${functionName} (${response.status}).`,
      ),
    );
  }

  return data;
}

async function invokeShipdayApi(action, payload = {}) {
  const data = await invokeEdgeFunction(SHIPDAY_API_FUNCTION, {
    action,
    ...payload,
  });

  if (data?.error) {
    throw new Error(String(data.error));
  }

  return data;
}

function normalizeCarriersPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.carriers)) return payload.carriers;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

function normalizeCarrier(carrier, index) {
  const id = carrier?.id
    ?? carrier?.carrierId
    ?? carrier?.driverId
    ?? carrier?.userId
    ?? carrier?.employeeId
    ?? null;

  const firstName = toText(carrier?.firstName);
  const lastName = toText(carrier?.lastName);
  const fullNameFromParts = `${firstName} ${lastName}`.trim();

  const name = toText(
    carrier?.name
    || carrier?.fullName
    || carrier?.driverName
    || fullNameFromParts
    || `Estafeta ${index + 1}`,
  );

  const phone = toText(
    carrier?.phone
    || carrier?.phoneNumber
    || carrier?.mobile
    || carrier?.mobileNumber
    || carrier?.driverPhoneNumber
    || "",
  );

  const status = toText(
    carrier?.status
    || carrier?.availability
    || carrier?.state
    || (carrier?.active === false ? "INACTIVE" : "ACTIVE"),
  ).toUpperCase();

  const explicitAvailable = carrier?.isAvailable ?? carrier?.available ?? carrier?.online;
  const statusUnavailable = ["INACTIVE", "OFFLINE", "UNAVAILABLE", "BUSY"].includes(status);
  const isAvailable = explicitAvailable === null || explicitAvailable === undefined
    ? !statusUnavailable
    : Boolean(explicitAvailable);
  const isOnShift = isTruthyFlag(carrier?.isOnShift);
  const isActive = isTruthyFlag(carrier?.isActive) || isTruthyFlag(carrier?.active);
  const coordinates = extractCarrierCoordinates(carrier);

  return {
    id: id !== null && id !== undefined ? String(id) : "",
    name,
    phone,
    vehicle: buildCarrierVehicleSummary(carrier),
    status,
    is_on_shift: isOnShift,
    is_active: isActive,
    is_available: isAvailable,
    lat: coordinates.lat,
    lng: coordinates.lng,
    raw: carrier,
  };
}

function isTerminalOrder(order) {
  const estado = normalizeEstadoInterno(order?.estado_interno || order?.status);
  return ["entregue", "cancelado"].includes(estado);
}

function doesOrderBelongToCarrier(order, carrier) {
  const orderPhone = normalizeCarrierPhone(order?.driver_phone || order?.shipday_driver_phone);
  const carrierPhone = normalizeCarrierPhone(carrier?.phone);
  if (orderPhone && carrierPhone && orderPhone === carrierPhone) return true;

  const orderName = normalizeCarrierName(order?.driver_name || order?.shipday_driver_name);
  const carrierName = normalizeCarrierName(carrier?.name);
  if (orderName && carrierName && orderName === carrierName) return true;

  return false;
}

function getCarrierActiveOrdersCount(carrier, orders = []) {
  return (orders || []).filter((order) => {
    if (!doesOrderBelongToCarrier(order, carrier)) return false;
    return !isTerminalOrder(order);
  }).length;
}

function getCarrierDailyOrdersCount(carrier, orders = [], now = new Date()) {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const dayStartTimestamp = startOfDay.getTime();

  return (orders || []).filter((order) => {
    if (!doesOrderBelongToCarrier(order, carrier)) return false;
    const timestamp = new Date(order?.submitted_at || order?.created_at || 0).getTime();
    return Number.isFinite(timestamp) && timestamp >= dayStartTimestamp;
  }).length;
}

function resolveCarrierDistanceToStoreKm(carrier, storeLocation = null) {
  const carrierLat = toFiniteCoordinate(carrier?.lat);
  const carrierLng = toFiniteCoordinate(carrier?.lng);
  const storeLat = toFiniteCoordinate(storeLocation?.lat);
  const storeLng = toFiniteCoordinate(storeLocation?.lng);

  if (carrierLat === null || carrierLng === null || storeLat === null || storeLng === null) {
    return null;
  }

  return haversineDistanceKm(
    { lat: carrierLat, lng: carrierLng },
    { lat: storeLat, lng: storeLng },
  );
}

function compareCarrierRank(a, b, criteria = sanitizeAutoAssignCriteria()) {
  if (criteria.availability && a.availabilityRank !== b.availabilityRank) {
    return a.availabilityRank - b.availabilityRank;
  }

  if (criteria.workload && a.activeOrdersCount !== b.activeOrdersCount) {
    return a.activeOrdersCount - b.activeOrdersCount;
  }

  if (criteria.workload && a.dailyOrdersCount !== b.dailyOrdersCount) {
    return a.dailyOrdersCount - b.dailyOrdersCount;
  }

  if (criteria.proximity) {
    const distanceA = Number.isFinite(a.distanceKm) ? a.distanceKm : Number.POSITIVE_INFINITY;
    const distanceB = Number.isFinite(b.distanceKm) ? b.distanceKm : Number.POSITIVE_INFINITY;
    if (distanceA !== distanceB) {
      return distanceA - distanceB;
    }
  }

  return String(a.carrier?.name || "").localeCompare(String(b.carrier?.name || ""), "pt-PT");
}

function resolveBoardCarrierStatus(order) {
  const estado = normalizeEstadoInterno(order?.estado_interno || order?.status);

  if (!order) return "available";
  if (["recolhido", "a_caminho", "entregue"].includes(estado)) return "delivery";
  return "pickup";
}

function resolveBoardCarrierCoordinates(carrier, activeOrder, storesById = new Map()) {
  const carrierLat = toFiniteCoordinate(carrier?.lat);
  const carrierLng = toFiniteCoordinate(carrier?.lng);

  if (carrierLat !== null && carrierLng !== null) {
    return { lat: carrierLat, lng: carrierLng, source: "carrier" };
  }

  if (!activeOrder) {
    return { lat: null, lng: null, source: "unavailable" };
  }

  const boardStatus = resolveBoardCarrierStatus(activeOrder);
  if (boardStatus === "delivery") {
    const customerLat = toFiniteCoordinate(activeOrder?.customer_lat || activeOrder?.lat);
    const customerLng = toFiniteCoordinate(activeOrder?.customer_lng || activeOrder?.lng);
    if (customerLat !== null && customerLng !== null) {
      return { lat: customerLat, lng: customerLng, source: "customer" };
    }
  }

  const store = storesById.get(String(activeOrder?.loja_id || ""));
  const storeLat = toFiniteCoordinate(store?.latitude || store?.lat);
  const storeLng = toFiniteCoordinate(store?.longitude || store?.lng);
  if (storeLat !== null && storeLng !== null) {
    return { lat: storeLat, lng: storeLng, source: "store" };
  }

  const fallbackCustomerLat = toFiniteCoordinate(activeOrder?.customer_lat || activeOrder?.lat);
  const fallbackCustomerLng = toFiniteCoordinate(activeOrder?.customer_lng || activeOrder?.lng);
  if (fallbackCustomerLat !== null && fallbackCustomerLng !== null) {
    return { lat: fallbackCustomerLat, lng: fallbackCustomerLng, source: "customer" };
  }

  return { lat: null, lng: null, source: "unavailable" };
}

export async function retrieveShipdayCarriers() {
  const response = await invokeShipdayApi("get_carriers");
  const rawCarriers = normalizeCarriersPayload(response?.data ?? response);

  const carriers = rawCarriers
    .map((carrier, index) => normalizeCarrier(carrier, index))
    .filter((carrier) => carrier.id && carrier.is_on_shift && carrier.is_active);

  return carriers;
}

export function pickBestCarrierForOrder({
  carriers = [],
  orders = [],
  storeLocation = null,
  now = new Date(),
  criteriaConfig = null,
} = {}) {
  const criteria = sanitizeAutoAssignCriteria(criteriaConfig);
  const rankedCarriers = (carriers || [])
    .filter((carrier) => carrier?.id)
    .map((carrier) => {
      const activeOrdersCount = getCarrierActiveOrdersCount(carrier, orders);
      const dailyOrdersCount = getCarrierDailyOrdersCount(carrier, orders, now);
      const distanceKm = resolveCarrierDistanceToStoreKm(carrier, storeLocation);
      const availabilityRank = carrier?.is_available
        ? (activeOrdersCount === 0 ? 0 : 1)
        : 2;

      return {
        carrier,
        activeOrdersCount,
        dailyOrdersCount,
        distanceKm,
        availabilityRank,
        shipdayAvailabilityPenalty: carrier?.is_available ? 0 : 1,
      };
    })
    .sort((a, b) => compareCarrierRank(a, b, criteria));

  return {
    best: rankedCarriers[0] || null,
    rankedCarriers,
  };
}

export function buildLiveCarrierBoardEntries({
  carriers = [],
  orders = [],
  stores = [],
} = {}) {
  const storesById = new Map((stores || []).map((store) => [String(store?.idloja || store?.id || ""), store]));

  return (carriers || [])
    .map((carrier) => {
      const activeOrder = (orders || []).find((order) => {
        if (isTerminalOrder(order)) return false;
        return doesOrderBelongToCarrier(order, carrier);
      }) || null;

      const boardStatus = resolveBoardCarrierStatus(activeOrder);
      const coordinates = resolveBoardCarrierCoordinates(carrier, activeOrder, storesById);

      return {
        id: String(carrier?.id || ""),
        name: carrier?.name || "",
        phone: carrier?.phone || "",
        lat: coordinates.lat,
        lng: coordinates.lng,
        status: boardStatus,
        coordsSource: coordinates.source,
        orderId: activeOrder?.id || null,
        orderEstado: activeOrder ? normalizeEstadoInterno(activeOrder?.estado_interno || activeOrder?.status) : null,
        lojaId: activeOrder?.loja_id || null,
        lojaNome: activeOrder
          ? (storesById.get(String(activeOrder?.loja_id || ""))?.nome || `Loja ${activeOrder?.loja_id || "-"}`)
          : null,
        raw: carrier?.raw || null,
      };
    })
    .filter((carrier) => Number.isFinite(carrier.lat) && Number.isFinite(carrier.lng));
}

export async function assignShipdayOrder({ shipdayOrderId, carrierId }) {
  const orderId = toText(shipdayOrderId);
  const targetCarrierId = toText(carrierId);

  if (!orderId) {
    throw new Error("ID do pedido Shipday em falta para atribuir estafeta.");
  }

  if (!targetCarrierId) {
    throw new Error("ID do estafeta em falta.");
  }

  const response = await invokeShipdayApi("assign_order", {
    shipdayOrderId: orderId,
    carrierId: targetCarrierId,
  });

  return {
    ok: true,
    endpoint: SHIPDAY_ASSIGN_ORDER_ENDPOINT(orderId, targetCarrierId),
    data: response?.data ?? response,
  };
}

export async function assignOrderToShipdayCarrier({ order, carrier }) {
  if (!order?.id) {
    throw new Error("Pedido invalido para atribuicao.");
  }

  if (!carrier?.id) {
    throw new Error("Estafeta invalido para atribuicao.");
  }

  const shipdayOrderId = toText(order.shipday_order_id) || toText(order.id);
  const assignResponse = await assignShipdayOrder({
    shipdayOrderId,
    carrierId: carrier.id,
  });

  return {
    ...assignResponse,
    orderId: order.id,
    shipdayOrderId,
    carrier: {
      id: carrier.id,
      name: carrier.name || "",
      phone: carrier.phone || "",
      vehicle: carrier.vehicle || "",
    },
  };
}

export async function persistAssignedCarrierSelection({
  orderId,
  carrier,
  nextEstado = "atribuindo_estafeta",
  nextStatus = "ASSIGNED",
  updatedAt = new Date().toISOString(),
}) {
  const normalizedOrderId = toText(orderId);
  if (!normalizedOrderId) {
    throw new Error("orderId em falta para guardar estafeta atribuido.");
  }

  const patch = {
    estado_interno: nextEstado,
    status: nextStatus,
    updated_at: updatedAt,
    driver_name: toText(carrier?.name) || null,
    driver_phone: toText(carrier?.phone) || null,
    veiculo_estafeta: toText(carrier?.vehicle) || null,
  };

  const { data, error } = await supabase
    .from("orders")
    .update(patch)
    .eq("id", normalizedOrderId)
    .select("id, driver_name, driver_phone, veiculo_estafeta, estado_interno, status, updated_at")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    patch,
    order: data || {
      id: normalizedOrderId,
      ...patch,
    },
  };
}

export async function unassignOrderToShipdayCarrier({
  shipdayOrderId,
  orderId = null,
  lojaId = null,
}) {
  return updateShipdayOrderStatus({
    shipdayOrderId,
    newStatus: "desassociar",
    orderId,
    lojaId,
  });
}

export async function createShipdayOrderForOrder({ orderId }) {
  const normalizedOrderId = toText(orderId);

  if (!normalizedOrderId) {
    throw new Error("orderId em falta para criar pedido no Shipday.");
  }

  const response = await invokeShipdayApi("create_order", {
    orderId: normalizedOrderId,
  });

  return {
    ok: true,
    action: "create_order",
    orderId: normalizedOrderId,
    shipdayOrderId: toText(response?.shipday_order_id || response?.data?.orderId || response?.data?.id || ""),
    data: response?.data ?? response,
  };
}

export async function cancelShipdayOrder({
  shipdayOrderId,
  orderId = null,
  lojaId = null,
}) {
  const normalizedShipdayOrderId = toText(shipdayOrderId);

  if (!normalizedShipdayOrderId) {
    return {
      ok: false,
      skipped: true,
      reason: "shipday_order_id_ausente",
    };
  }

  try {
    const response = await invokeShipdayApi("cancel_order", {
      shipdayOrderId: normalizedShipdayOrderId,
      orderId: orderId ?? undefined,
      lojaId: lojaId ?? undefined,
    });

    return {
      ok: true,
      skipped: false,
      action: "cancel_order",
      shipdayOrderId: normalizedShipdayOrderId,
      data: response?.data ?? response,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      action: "cancel_order",
      shipdayOrderId: normalizedShipdayOrderId,
      error: String(error?.message || "Falha ao cancelar pedido no Shipday"),
    };
  }
}

export async function markShipdayOrderReadyForPickup({ shipdayOrderId, orderId = null }) {
  const normalizedShipdayOrderId = toText(shipdayOrderId);
  const normalizedOrderId = toText(orderId);

  if (!normalizedShipdayOrderId && !normalizedOrderId) {
    throw new Error("shipdayOrderId/orderId em falta para marcar pronto para recolha.");
  }

  const response = await invokeShipdayApi("ready_for_pickup", {
    shipdayOrderId: normalizedShipdayOrderId || undefined,
    orderId: normalizedOrderId || undefined,
  });

  return {
    ok: true,
    action: "ready_for_pickup",
    shipdayOrderId: toText(response?.shipday_order_id || normalizedShipdayOrderId || ""),
    orderId: normalizedOrderId || "",
    warning: response?.warning || null,
    data: response?.data ?? response,
  };
}

export async function updateShipdayOrderStatus({
  shipdayOrderId,
  newStatus,
  orderId = null,
  lojaId = null,
}) {
  const normalizedShipdayOrderId = toText(shipdayOrderId);
  const normalizedNewStatus = toText(newStatus);

  if (!normalizedShipdayOrderId) {
    return {
      ok: false,
      skipped: true,
      reason: "shipday_order_id_ausente",
    };
  }

  if (!normalizedNewStatus) {
    return {
      ok: false,
      skipped: true,
      reason: "new_status_ausente",
    };
  }

  try {
    const data = await invokeEdgeFunction(SHIPDAY_STATUS_FUNCTION, {
      shipday_order_id: normalizedShipdayOrderId,
      new_status: normalizedNewStatus,
      order_id: orderId ?? undefined,
      loja_id: lojaId ?? undefined,
    });

    const functionOk = data?.ok === true || data?.success === true;

    if (!functionOk) {
      return {
        ok: false,
        skipped: false,
        functionName: SHIPDAY_STATUS_FUNCTION,
        error: String(data?.error || "Shipday rejeitou atualizacao de estado"),
        data,
      };
    }

    return {
      ok: true,
      skipped: false,
      functionName: SHIPDAY_STATUS_FUNCTION,
      message: data?.message || null,
      data,
    };
  } catch (error) {
    if (normalizedNewStatus === "desassociar" && isCarrierAlreadyUnassignedError(error?.message || error)) {
      return {
        ok: true,
        skipped: false,
        tolerated: true,
        functionName: SHIPDAY_STATUS_FUNCTION,
        message: "Shipday indica que ja nao existe estafeta atribuido. Estado tratado como desassociado.",
        reason: "carrier_already_unassigned",
      };
    }

    return {
      ok: false,
      skipped: false,
      functionName: SHIPDAY_STATUS_FUNCTION,
      error: String(error?.message || "Falha ao atualizar estado no Shipday"),
    };
  }
}
export async function syncOrderStatusWithShipday({
  orderId,
  lojaId = null,
  shipdayOrderId,
  estadoInterno,
}) {
  const normalizedEstado = normalizeEstadoInterno(estadoInterno);
  const shipdayState = mapEstadoInternoToShipdayState(normalizedEstado);

  if (!normalizedEstado || !shipdayState) {
    return {
      ok: false,
      skipped: true,
      reason: "estado_sem_mapeamento_shipday",
    };
  }

  if (!shipdayOrderId) {
    return {
      ok: false,
      skipped: true,
      reason: "shipday_order_id_ausente",
    };
  }

  try {
    const data = await invokeShipdayApi("update_status", {
      shipdayOrderId: String(shipdayOrderId),
      shipdayState,
      orderId,
      lojaId,
      estadoInterno: normalizedEstado,
    });

    return {
      ok: true,
      skipped: false,
      functionName: SHIPDAY_API_FUNCTION,
      shipdayState,
      warning: data?.warning || null,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      shipdayState,
      error: String(error?.message || "Falha ao sincronizar estado no Shipday"),
    };
  }
}



import { supabase } from "./supabaseClient";
import { mapEstadoInternoToShipdayState, normalizeEstadoInterno, resolveOrderEstadoInterno } from "./orderStatusMapper";
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
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const normalized = raw.replace(",", ".");
  if (/^-?\d+(\.\d+)?$/.test(normalized)) {
    const direct = Number(normalized);
    return Number.isFinite(direct) ? direct : null;
  }

  const matches = normalized.match(/-?\d+(?:\.\d+)?/g) || [];
  if (matches.length !== 1) return null;

  const parsed = Number(matches[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOrderReference(value) {
  const normalized = toText(value);
  if (!normalized) return "";
  return normalized.split("-")[0].split("_")[0].trim();
}

function collectCarrierOrderRefs(carrier = {}) {
  const refs = new Set();
  const pushRef = (value) => {
    const normalized = normalizeOrderReference(value);
    if (normalized) refs.add(normalized);
  };

  pushRef(carrier?.orderId);
  pushRef(carrier?.order_id);
  pushRef(carrier?.currentOrderId);
  pushRef(carrier?.current_order_id);
  pushRef(carrier?.activeOrderId);
  pushRef(carrier?.active_order_id);
  pushRef(carrier?.assignedOrderId);
  pushRef(carrier?.assigned_order_id);
  pushRef(carrier?.taskId);
  pushRef(carrier?.task_id);
  pushRef(carrier?.orderNumber);
  pushRef(carrier?.order_number);
  pushRef(carrier?.activeOrderNumber);
  pushRef(carrier?.active_order_number);
  pushRef(carrier?.lastOrderId);
  pushRef(carrier?.last_order_id);
  pushRef(carrier?.order?.id);
  pushRef(carrier?.order?.orderId);
  pushRef(carrier?.order?.order_id);
  pushRef(carrier?.order?.orderNumber);
  pushRef(carrier?.order?.order_number);
  pushRef(carrier?.orderDetails?.id);
  pushRef(carrier?.orderDetails?.orderId);
  pushRef(carrier?.orderDetails?.order_id);
  pushRef(carrier?.orderDetails?.orderNumber);
  pushRef(carrier?.orderDetails?.order_number);
  pushRef(carrier?.currentTask?.orderId);
  pushRef(carrier?.currentTask?.order_id);
  pushRef(carrier?.currentTask?.orderNumber);
  pushRef(carrier?.currentTask?.order_number);
  pushRef(carrier?.raw?.orderId);
  pushRef(carrier?.raw?.order_id);
  pushRef(carrier?.raw?.orderNumber);
  pushRef(carrier?.raw?.order_number);
  pushRef(carrier?.raw?.currentOrderId);
  pushRef(carrier?.raw?.current_order_id);
  pushRef(carrier?.raw?.currentOrderNumber);
  pushRef(carrier?.raw?.current_order_number);
  pushRef(carrier?.raw?.activeOrderId);
  pushRef(carrier?.raw?.active_order_id);
  pushRef(carrier?.raw?.activeOrderNumber);
  pushRef(carrier?.raw?.active_order_number);
  pushRef(carrier?.raw?.assignedOrderId);
  pushRef(carrier?.raw?.assigned_order_id);
  pushRef(carrier?.raw?.taskId);
  pushRef(carrier?.raw?.task_id);
  pushRef(carrier?.raw?.order?.id);
  pushRef(carrier?.raw?.order?.orderId);
  pushRef(carrier?.raw?.order?.order_id);
  pushRef(carrier?.raw?.order?.orderNumber);
  pushRef(carrier?.raw?.order?.order_number);

  return refs;
}

function resolveCarrierStoreId(carrier = {}) {
  return toText(
    carrier?.lojaId
    || carrier?.loja_id
    || carrier?.storeId
    || carrier?.store_id
    || carrier?.restaurantId
    || carrier?.restaurant_id
    || carrier?.raw?.lojaId
    || carrier?.raw?.loja_id
    || carrier?.raw?.storeId
    || carrier?.raw?.store_id
    || carrier?.raw?.restaurantId
    || carrier?.raw?.restaurant_id,
  );
}

function extractCarrierCoordinates(carrier = {}) {
  const candidates = [
    carrier,
    carrier?.last_location,
    carrier?.lastLocation,
    carrier?.lastKnownLocation,
    carrier?.last_known_location,
    carrier?.location,
    carrier?.current_location,
    carrier?.currentLocation,
    carrier?.currentGps,
    carrier?.current_gps,
    carrier?.gps,
    carrier?.coordinates,
    carrier?.coordinate,
    carrier?.geo,
    carrier?.geoLocation,
    carrier?.geo_location,
    carrier?.position,
    carrier?.raw?.last_location,
    carrier?.raw?.lastLocation,
    carrier?.raw?.lastKnownLocation,
    carrier?.raw?.location,
    carrier?.raw?.current_location,
    carrier?.raw?.currentLocation,
    carrier?.raw?.gps,
    carrier?.raw?.coordinates,
    carrier?.raw?.coordinate,
    carrier?.raw?.geo,
    carrier?.raw?.geoLocation,
    carrier?.raw?.position,
    carrier?.raw?.lastKnownPosition,
    carrier?.raw?.lastPosition,
    carrier?.raw?.currentPosition,
    carrier?.raw?.task?.location,
    carrier?.raw?.task?.current_location,
    carrier?.raw?.task?.currentLocation,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const lat = toFiniteCoordinate(
      candidate?.latitude
      ?? candidate?.lat
      ?? candidate?.y
      ?? candidate?.latitudine
      ?? candidate?.latitute
      ?? candidate?.gpsLat
      ?? candidate?.gps_lat
      ?? candidate?.latDeg
      ?? candidate?.lat_deg
      ?? candidate?.currentLatitude
      ?? candidate?.lastLatitude
      ?? candidate?.current_lat
      ?? candidate?.last_lat
      ?? candidate?.locationLat
      ?? candidate?.location_lat,
    );
    const lng = toFiniteCoordinate(
      candidate?.longitude
      ?? candidate?.lng
      ?? candidate?.lon
      ?? candidate?.x
      ?? candidate?.longitudine
      ?? candidate?.longitute
      ?? candidate?.gpsLng
      ?? candidate?.gps_lng
      ?? candidate?.lngDeg
      ?? candidate?.lng_deg
      ?? candidate?.currentLongitude
      ?? candidate?.lastLongitude
      ?? candidate?.current_lng
      ?? candidate?.last_lng
      ?? candidate?.locationLng
      ?? candidate?.location_lng,
    );

    if (lat !== null && lng !== null) {
      return { lat, lng };
    }

    const rawCoords = Array.isArray(candidate?.coordinates)
      ? candidate.coordinates
      : Array.isArray(candidate?.coordinate)
        ? candidate.coordinate
        : null;

    if (rawCoords && rawCoords.length >= 2) {
      const geoJsonLat = toFiniteCoordinate(rawCoords[1]);
      const geoJsonLng = toFiniteCoordinate(rawCoords[0]);
      if (geoJsonLat !== null && geoJsonLng !== null) {
        return { lat: geoJsonLat, lng: geoJsonLng };
      }

      const swappedLat = toFiniteCoordinate(rawCoords[0]);
      const swappedLng = toFiniteCoordinate(rawCoords[1]);
      if (swappedLat !== null && swappedLng !== null) {
        return { lat: swappedLat, lng: swappedLng };
      }
    }

    if (typeof candidate?.coordinates === "string") {
      const parts = candidate.coordinates.split(/[;, ]+/).filter(Boolean);
      if (parts.length >= 2) {
        const latFromString = toFiniteCoordinate(parts[0]);
        const lngFromString = toFiniteCoordinate(parts[1]);
        if (latFromString !== null && lngFromString !== null) {
          return { lat: latFromString, lng: lngFromString };
        }
      }
    }

    if (typeof candidate?.location === "string") {
      const parts = candidate.location.split(/[;, ]+/).filter(Boolean);
      if (parts.length >= 2) {
        const latFromString = toFiniteCoordinate(parts[0]);
        const lngFromString = toFiniteCoordinate(parts[1]);
        if (latFromString !== null && lngFromString !== null) {
          return { lat: latFromString, lng: lngFromString };
        }
      }
    }
  }

  return { lat: null, lng: null };
}

function resolveCarrierCoordinatesFromTrackingUrl(rawUrl) {
  const urlText = toText(rawUrl);
  if (!urlText) return null;

  try {
    const parsedUrl = new URL(urlText);
    const coordinateKeyPairs = [
      ["lat", "lng"],
      ["latitude", "longitude"],
      ["driverLat", "driverLng"],
      ["driver_lat", "driver_lng"],
      ["driverLatitude", "driverLongitude"],
      ["dlat", "dlng"],
    ];

    for (const [latKey, lngKey] of coordinateKeyPairs) {
      const lat = toFiniteCoordinate(parsedUrl.searchParams.get(latKey));
      const lng = toFiniteCoordinate(parsedUrl.searchParams.get(lngKey));
      if (lat !== null && lng !== null) return { lat, lng };
    }

    const atCoordinates = parsedUrl.href.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (atCoordinates) {
      const lat = toFiniteCoordinate(atCoordinates[1]);
      const lng = toFiniteCoordinate(atCoordinates[2]);
      if (lat !== null && lng !== null) return { lat, lng };
    }

    const pairCoordinates = parsedUrl.href.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (pairCoordinates) {
      const lat = toFiniteCoordinate(pairCoordinates[1]);
      const lng = toFiniteCoordinate(pairCoordinates[2]);
      if (lat !== null && lng !== null) return { lat, lng };
    }
  } catch {
    return null;
  }

  return null;
}

function resolveCarrierCoordinatesFromDelivery(delivery = {}) {
  const payload = delivery?.provider_payload && typeof delivery.provider_payload === "object"
    ? delivery.provider_payload
    : null;

  const explicitDriverCoords = {
    lat:
      delivery?.driverLat
      ?? delivery?.driver_lat
      ?? delivery?.driverLatitude
      ?? payload?.driverLat
      ?? payload?.driver_lat
      ?? payload?.driverLatitude
      ?? payload?.carrierLat
      ?? payload?.carrier_lat
      ?? payload?.carrierLatitude,
    lng:
      delivery?.driverLng
      ?? delivery?.driver_lng
      ?? delivery?.driverLongitude
      ?? payload?.driverLng
      ?? payload?.driver_lng
      ?? payload?.driverLongitude
      ?? payload?.carrierLng
      ?? payload?.carrier_lng
      ?? payload?.carrierLongitude,
  };

  const candidates = [
    explicitDriverCoords,
    delivery?.carrier,
    delivery?.driver,
    delivery?.assignedCarrier,
    delivery?.tracking,
    payload?.carrier,
    payload?.driver,
    payload?.assignedCarrier,
    payload?.order?.carrier,
    payload?.order?.driver,
    payload?.tracking,
    payload?.tracking?.carrier,
    payload?.tracking?.driver,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const coordinates = extractCarrierCoordinates(candidate);
    if (coordinates?.lat !== null && coordinates?.lng !== null) {
      return { ...coordinates, source: "delivery_payload" };
    }
  }

  const trackingCoords = resolveCarrierCoordinatesFromTrackingUrl(
    delivery?.tracking_url
    || payload?.trackingUrl
    || payload?.trackingLink
    || payload?.order?.trackingUrl
    || payload?.order?.trackingLink
    || null,
  );

  if (trackingCoords) {
    return { ...trackingCoords, source: "tracking_url" };
  }

  return null;
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
    ?? carrier?.carrier_id
    ?? carrier?.driverId
    ?? carrier?.driver_id
    ?? carrier?.userId
    ?? carrier?.user_id
    ?? carrier?.employeeId
    ?? carrier?.employee_id
    ?? carrier?.resourceId
    ?? carrier?.resource_id
    ?? carrier?.uuid
    ?? carrier?._id
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

  const explicitAvailable = carrier?.isAvailable ?? carrier?.available ?? carrier?.online ?? carrier?.is_available;
  const statusUnavailable = ["INACTIVE", "OFFLINE", "UNAVAILABLE", "BUSY"].includes(status);
  const isAvailable = explicitAvailable === null || explicitAvailable === undefined
    ? !statusUnavailable
    : Boolean(explicitAvailable);
  const explicitOnShift = carrier?.isOnShift ?? carrier?.onShift ?? carrier?.is_on_shift;
  const explicitActive = carrier?.isActive ?? carrier?.active ?? carrier?.is_active;
  const isOnShift = explicitOnShift === null || explicitOnShift === undefined
    ? true
    : isTruthyFlag(explicitOnShift);
  const isActive = explicitActive === null || explicitActive === undefined
    ? true
    : isTruthyFlag(explicitActive);
  const coordinates = extractCarrierCoordinates(carrier);
  const carrierOrderRefs = Array.from(collectCarrierOrderRefs(carrier));
  const lojaId = resolveCarrierStoreId(carrier);
  const fallbackIdSeed = normalizeCarrierPhone(phone) || normalizeCarrierName(name).replace(/\s+/g, "-");
  const resolvedId = id !== null && id !== undefined && String(id).trim()
    ? String(id).trim()
    : `shipday-carrier-${fallbackIdSeed || index + 1}`;

  return {
    id: resolvedId,
    name,
    phone,
    vehicle: buildCarrierVehicleSummary(carrier),
    status,
    board_status: resolveBoardCarrierStatus(carrier),
    is_on_shift: isOnShift,
    is_active: isActive,
    is_available: isAvailable,
    lat: coordinates.lat,
    lng: coordinates.lng,
    lojaId: lojaId || null,
    orderId: carrierOrderRefs[0] || null,
    orderShipdayId: carrierOrderRefs.find((ref) => ref !== carrierOrderRefs[0]) || carrierOrderRefs[0] || null,
    orderRefs: carrierOrderRefs,
    raw: carrier,
  };
}

function isTerminalOrder(order) {
  const estado = resolveOrderEstadoInterno(order);
  return ["entregue", "cancelado"].includes(estado);
}

function hasDriverSignal(order) {
  return Boolean(
    toText(order?.driver_name)
    || toText(order?.driver_phone)
    || toText(order?.shipday_driver_name)
    || toText(order?.shipday_driver_phone),
  );
}

function doesOrderBelongToCarrier(order, carrier) {
  const orderLocalId = normalizeOrderReference(order?.id);
  const orderShipdayId = normalizeOrderReference(order?.shipday_order_id);
  const carrierRefs = collectCarrierOrderRefs(carrier);
  if (carrierRefs.size > 0) {
    return (
      (orderLocalId && carrierRefs.has(orderLocalId))
      || (orderShipdayId && carrierRefs.has(orderShipdayId))
      || false
    );
  }

  const orderPhone = normalizeCarrierPhone(order?.driver_phone || order?.shipday_driver_phone);
  const carrierPhone = normalizeCarrierPhone(carrier?.phone);
  if (orderPhone && carrierPhone && orderPhone === carrierPhone) return true;

  const orderName = normalizeCarrierName(order?.driver_name || order?.shipday_driver_name);
  const carrierName = normalizeCarrierName(carrier?.name);
  if (orderName && carrierName && orderName === carrierName) return true;

  return false;
}

function findActiveOrderForCarrier(carrier, orders = []) {
  const activeOrders = (orders || []).filter((order) => !isTerminalOrder(order));
  if (activeOrders.length === 0) return null;

  const refs = collectCarrierOrderRefs(carrier);
  if (refs.size > 0) {
    const byRef = activeOrders.find((order) => {
      const localRef = normalizeOrderReference(order?.id);
      const shipdayRef = normalizeOrderReference(order?.shipday_order_id);
      return (localRef && refs.has(localRef)) || (shipdayRef && refs.has(shipdayRef));
    });
    if (byRef) return byRef;
  }

  const carrierPhone = normalizeCarrierPhone(carrier?.phone);
  if (carrierPhone) {
    const byPhone = activeOrders.filter((order) => {
      const orderPhone = normalizeCarrierPhone(order?.driver_phone || order?.shipday_driver_phone);
      return orderPhone && orderPhone === carrierPhone;
    });
    if (byPhone.length > 0) {
      return byPhone.sort((a, b) => new Date(b?.updated_at || b?.created_at || 0).getTime() - new Date(a?.updated_at || a?.created_at || 0).getTime())[0];
    }
  }

  const carrierName = normalizeCarrierName(carrier?.name);
  if (carrierName) {
    const byName = activeOrders.filter((order) => {
      const orderName = normalizeCarrierName(order?.driver_name || order?.shipday_driver_name);
      return orderName && orderName === carrierName;
    });
    if (byName.length > 0) {
      return byName.sort((a, b) => new Date(b?.updated_at || b?.created_at || 0).getTime() - new Date(a?.updated_at || a?.created_at || 0).getTime())[0];
    }
  }

  return null;
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
  const estado = resolveOrderEstadoInterno(order);

  if (!order) return "available";
  if (["recolhido", "a_caminho", "entregue"].includes(estado)) return "delivery";
  return "pickup";
}

function offsetStoreFallbackCoordinates(lat, lng, seedValue) {
  const baseLat = toFiniteCoordinate(lat);
  const baseLng = toFiniteCoordinate(lng);
  if (baseLat === null || baseLng === null) return { lat: null, lng: null };

  const rawSeed = Number(String(seedValue || "").replace(/\D+/g, "")) || 1;
  const angle = (rawSeed % 360) * (Math.PI / 180);
  const radiusKm = 0.45;
  const latOffset = (radiusKm / 111) * Math.cos(angle);
  const lngOffset = (radiusKm / (111 * Math.max(Math.cos((baseLat * Math.PI) / 180), 0.35))) * Math.sin(angle);

  return {
    lat: baseLat + latOffset,
    lng: baseLng + lngOffset,
  };
}

function resolveBoardCarrierCoordinates(carrier, activeOrder, storesById = new Map(), mode = "admin") {
  const carrierLat = toFiniteCoordinate(carrier?.lat);
  const carrierLng = toFiniteCoordinate(carrier?.lng);

  if (carrierLat !== null && carrierLng !== null) {
    return { lat: carrierLat, lng: carrierLng, source: "carrier" };
  }

  if (!activeOrder) {
    return { lat: null, lng: null, source: "unavailable" };
  }

  const boardStatus = resolveBoardCarrierStatus(activeOrder);
  if (boardStatus === "delivery" && mode !== "restaurant") {
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
    const offsetCoords = offsetStoreFallbackCoordinates(storeLat, storeLng, activeOrder?.id || carrier?.id);
    if (offsetCoords.lat !== null && offsetCoords.lng !== null) {
      return { lat: offsetCoords.lat, lng: offsetCoords.lng, source: "store_fallback" };
    }

    return { lat: storeLat, lng: storeLng, source: "store" };
  }

  if (mode !== "restaurant") {
    const fallbackCustomerLat = toFiniteCoordinate(activeOrder?.customer_lat || activeOrder?.lat);
    const fallbackCustomerLng = toFiniteCoordinate(activeOrder?.customer_lng || activeOrder?.lng);
    if (fallbackCustomerLat !== null && fallbackCustomerLng !== null) {
      return { lat: fallbackCustomerLat, lng: fallbackCustomerLng, source: "customer" };
    }
  }

  return { lat: null, lng: null, source: "unavailable" };
}

export async function retrieveShipdayCarriers() {
  const response = await invokeShipdayApi("get_carriers");
  const rawCarriers = normalizeCarriersPayload(response?.data ?? response);

  const carriers = rawCarriers
    .map((carrier, index) => normalizeCarrier(carrier, index))
    .filter((carrier) => carrier.id);

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
  deliveries = [],
  mode = "admin",
} = {}) {
  try {
    const safeStores = Array.isArray(stores) ? stores : [];
    const safeOrders = Array.isArray(orders) ? orders : [];
    const safeDeliveries = Array.isArray(deliveries) ? deliveries : [];
    const safeCarriers = Array.isArray(carriers) ? carriers : [];

    const storesById = new Map(safeStores.map((store) => [String(store?.idloja || store?.id || ""), store]));
    const latestDeliveryByOrderId = new Map(
      safeDeliveries
        .filter((delivery) => Number.isFinite(Number(delivery?.order_id)))
        .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
        .map((delivery) => [String(delivery.order_id), delivery]),
    );
    const normalizedCarriers = safeCarriers
      .map((carrier) => {
        const activeOrder = findActiveOrderForCarrier(carrier, safeOrders);

        const boardStatus = resolveBoardCarrierStatus(activeOrder);
        const deliveryCoords = activeOrder
          ? resolveCarrierCoordinatesFromDelivery(latestDeliveryByOrderId.get(String(activeOrder?.id || "")))
          : null;
        const coordinates = deliveryCoords?.lat !== null && deliveryCoords?.lng !== null
          ? { lat: deliveryCoords.lat, lng: deliveryCoords.lng, source: deliveryCoords.source || "delivery_payload" }
          : resolveBoardCarrierCoordinates(carrier, activeOrder, storesById, mode);

        const resolvedEstado = activeOrder ? resolveOrderEstadoInterno(activeOrder) : null;

        return {
          id: String(carrier?.id || ""),
          name: carrier?.name || "",
          phone: carrier?.phone || "",
          lat: coordinates.lat,
          lng: coordinates.lng,
          status: boardStatus,
          coordsSource: coordinates.source,
          orderId: activeOrder?.id || null,
          orderShipdayId: activeOrder?.shipday_order_id || null,
          orderEstado: resolvedEstado,
          lojaId: activeOrder?.loja_id || carrier?.lojaId || carrier?.raw?.lojaId || null,
          lojaNome: activeOrder
            ? (storesById.get(String(activeOrder?.loja_id || ""))?.nome || `Loja ${activeOrder?.loja_id || "-"}`)
            : null,
          raw: carrier?.raw || null,
        };
      })
      .filter((carrier) => Number.isFinite(carrier.lat) && Number.isFinite(carrier.lng));

    const linkedOrderRefs = new Set(
      normalizedCarriers
        .flatMap((carrier) => ([
          normalizeOrderReference(carrier?.orderId),
          normalizeOrderReference(carrier?.orderShipdayId),
        ]))
        .filter(Boolean),
    );

    const fallbackEntries = safeOrders
      .filter((order) => !isTerminalOrder(order))
      .filter((order) => {
        const estado = resolveOrderEstadoInterno(order);
        const legacyStatus = String(order?.status || "").trim().toUpperCase();
        const hasTracking = toText(order?.shipday_tracking_url);
        const hasShipdayLink = normalizeOrderReference(order?.shipday_order_id);
        const hasAssignmentState = [
          "atribuindo_estafeta",
          "estafeta_aceitou",
          "iniciado",
          "em_preparacao",
          "pronto_recolha",
          "recolhido",
          "a_caminho",
        ].includes(estado);
        const hasLegacyAssignmentState = [
          "ASSIGNED",
          "STARTED",
          "PICKED_UP",
          "READY_FOR_PICKUP",
          "OUT_FOR_DELIVERY",
          "ON_THE_WAY",
        ].includes(legacyStatus);
        const shouldExposeFallback = hasDriverSignal(order) || Boolean(hasTracking) || Boolean(hasShipdayLink) || hasAssignmentState;
        const shouldExposeByLegacy = hasLegacyAssignmentState || (legacyStatus === "CONFIRMED" && hasShipdayLink);
        if (!shouldExposeFallback && !shouldExposeByLegacy) return false;

        const orderRefs = [
          normalizeOrderReference(order?.id),
          normalizeOrderReference(order?.shipday_order_id),
        ].filter(Boolean);

        if (orderRefs.length === 0) return false;
        return orderRefs.every((reference) => !linkedOrderRefs.has(reference));
      })
      .map((order, index) => {
        const deliveryCoords = resolveCarrierCoordinatesFromDelivery(latestDeliveryByOrderId.get(String(order?.id || "")));
        const coordinates = deliveryCoords?.lat !== null && deliveryCoords?.lng !== null
          ? { lat: deliveryCoords.lat, lng: deliveryCoords.lng, source: deliveryCoords.source || "delivery_payload" }
          : resolveBoardCarrierCoordinates({}, order, storesById, mode);
        if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) return null;
        const fallbackName = String(
          order?.driver_name
          || order?.shipday_driver_name
          || (order?.shipday_order_id ? "Estafeta Shipday" : "Estafeta atribuido"),
        );
        return {
          id: `fallback-${order?.id || index}`,
          name: fallbackName,
          phone: String(order?.driver_phone || order?.shipday_driver_phone || ""),
          lat: coordinates.lat,
          lng: coordinates.lng,
          status: resolveBoardCarrierStatus(order),
          coordsSource: coordinates.source || "fallback",
          orderId: order?.id || null,
          orderShipdayId: order?.shipday_order_id || null,
          orderEstado: resolveOrderEstadoInterno(order),
          lojaId: order?.loja_id || null,
          lojaNome: storesById.get(String(order?.loja_id || ""))?.nome || `Loja ${order?.loja_id || "-"}`,
          raw: null,
          isFallback: true,
        };
      })
      .filter(Boolean);

    return [...normalizedCarriers, ...fallbackEntries];
  } catch (error) {
    console.error("Falha ao construir entradas do Live Geo Board", error);
    return [];
  }
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

export async function createShipdayOrderForOrder({ orderId, autoAssign = false } = {}) {
  const normalizedOrderId = toText(orderId);

  if (!normalizedOrderId) {
    throw new Error("orderId em falta para criar pedido no Shipday.");
  }

  const response = await invokeShipdayApi("create_order", {
    orderId: normalizedOrderId,
    autoAssign,
  });

  return {
    ok: true,
    action: "create_order",
    orderId: normalizedOrderId,
    shipdayOrderId: toText(response?.shipday_order_id || response?.data?.orderId || response?.data?.id || ""),
    autoAssign: response?.auto_assign || null,
    data: response?.data ?? response,
  };
}

export async function autoAssignOrderInShipday({
  orderId,
  shipdayOrderId = null,
} = {}) {
  const normalizedOrderId = toText(orderId);
  const normalizedShipdayOrderId = toText(shipdayOrderId);

  if (!normalizedOrderId) {
    throw new Error("orderId em falta para auto-atribuicao.");
  }

  const response = await invokeShipdayApi("auto_assign_order", {
    orderId: normalizedOrderId,
    shipdayOrderId: normalizedShipdayOrderId || undefined,
  });

  return {
    ok: response?.ok === true,
    skipped: response?.skipped === true,
    reason: response?.reason || null,
    shipdayOrderId: toText(response?.shipday_order_id || normalizedShipdayOrderId),
    carrier: response?.carrier || null,
    error: response?.error || null,
    data: response,
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



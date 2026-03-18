import { supabase } from "./supabaseClient";
import { extractRestaurantId, extractUserId, resolveUserRole } from "../utils/roles";
import { getEstadoInternoLabelPt, getEstadoInternoTone, resolveOrderEstadoInterno } from "./orderStatusMapper";

const TERMINAL_ESTADO_INTERNO = new Set(["entregue", "cancelado"]);
const TERMINAL_DELIVERY_STATUS = new Set(["DELIVERED", "FAILED", "CANCELLED"]);

const WORKFLOW_STEPS = [
  "pendente",
  "aceite",
  "estafeta_aceitou",
  "em_preparacao",
  "pronto_recolha",
  "recolhido",
  "a_caminho",
  "entregue",
];

const WORKFLOW_INDEX_BY_ESTADO = {
  pendente: 0,
  aceite: 1,
  atribuindo_estafeta: 2,
  estafeta_aceitou: 2,
  iniciado: 2,
  em_preparacao: 3,
  pronto_recolha: 4,
  recolhido: 5,
  a_caminho: 6,
  entregue: 7,
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeStatus(value, fallback = "PENDING") {
  const text = String(value || fallback).trim().toUpperCase();
  return text || fallback;
}

function statusLabelPt(status) {
  const key = normalizeStatus(status);
  const map = {
    PENDING_PAYMENT: "Pagamento pendente",
    PENDING: "Pendente",
    CREATED: "Criado",
    CONFIRMED: "Confirmado",
    PREPARING: "Em preparacao",
    READY_FOR_PICKUP: "Pronto para recolha",
    OUT_FOR_DELIVERY: "Em entrega",
    DISPATCHED: "Enviado",
    DELIVERED: "Entregue",
    CANCELLED: "Cancelado",
    FAILED: "Falhada",
    APPROVED: "Aprovado",
    REJECTED: "Rejeitado",
    ON_THE_WAY: "A caminho",
    PICKED_UP: "Recolhido",
  };
  return map[key] || key;
}

function statusTone(status) {
  const key = normalizeStatus(status);
  if (["DELIVERED", "CONFIRMED", "APPROVED"].includes(key)) return "success";
  if (["FAILED", "CANCELLED", "REJECTED"].includes(key)) return "danger";
  return "warning";
}

function mapEstadoToneToUi(tone) {
  if (tone === "ok") return "success";
  if (tone === "bad") return "danger";
  return "warning";
}

function buildWorkflowProgress(estadoInterno) {
  const normalizedEstado = resolveOrderEstadoInterno({ estado_interno: estadoInterno });
  const rawCurrentIndex = WORKFLOW_INDEX_BY_ESTADO[normalizedEstado] ?? 0;
  const acceptedIndex = WORKFLOW_INDEX_BY_ESTADO.aceite ?? 1;
  const effectiveCurrentIndex = normalizedEstado === "atribuindo_estafeta"
    ? acceptedIndex
    : rawCurrentIndex;

  return {
    estado_interno: normalizedEstado,
    current_label: getEstadoInternoLabelPt(normalizedEstado),
    is_canceled: normalizedEstado === "cancelado",
    steps: WORKFLOW_STEPS.map((step, index) => ({
      key: step,
      label: getEstadoInternoLabelPt(step),
      index,
      is_current: normalizedEstado !== "cancelado" && index === effectiveCurrentIndex,
      is_completed: normalizedEstado !== "cancelado" && index <= effectiveCurrentIndex,
      is_pending: normalizedEstado === "cancelado" ? index > 0 : index > effectiveCurrentIndex,
    })),
  };
}
function byLatest(a, b) {
  const aDate = new Date(a?.updated_at || a?.created_at || 0).getTime();
  const bDate = new Date(b?.updated_at || b?.created_at || 0).getTime();
  return bDate - aDate;
}

function parsePayload(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getByPath(obj, path = []) {
  let current = obj;
  for (const segment of path) {
    if (!current || typeof current !== "object") return null;
    current = current[segment];
  }
  return current;
}

function pickFirstFromPaths(payloads, paths) {
  for (const payload of payloads) {
    for (const path of paths) {
      const value = toText(getByPath(payload, path));
      if (value) return value;
    }
  }
  return null;
}

function uniqueNonEmptyParts(parts = []) {
  const seen = new Set();
  const result = [];

  parts.forEach((part) => {
    const normalized = toText(part);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });

  return result;
}

function normalizeVehicleSegment(value) {
  const text = toText(value);
  if (!text) return null;

  return text
    .replace(/\bmotorcycle\b/gi, "Mota")
    .replace(/\bbike\b/gi, "Bicicleta")
    .replace(/\bbicycle\b/gi, "Bicicleta")
    .replace(/\bcar\b/gi, "Carro")
    .replace(/\s+/g, " ")
    .trim();
}

function _buildVehicleSummary(...parts) {
  const normalizedParts = uniqueNonEmptyParts(parts.map((part) => normalizeVehicleSegment(part)));
  return normalizedParts.length ? normalizedParts.join(" • ") : null;
}

function normalizeVehiclePlate(value) {
  const text = toText(value);
  if (!text) return null;
  return text.replace(/\s+/g, "").toUpperCase();
}

function isVehiclePlateLike(value) {
  const text = normalizeVehiclePlate(value);
  if (!text) return false;
  return /^[A-Z0-9]{2}-?[A-Z0-9]{2}-?[A-Z0-9]{2}$/.test(text);
}

function composeVehicleSummary({ description, type, make, model, plate } = {}) {
  const normalizedDescription = normalizeVehicleSegment(description);
  const normalizedType = normalizeVehicleSegment(type);
  const normalizedMake = normalizeVehicleSegment(make);
  const normalizedModel = normalizeVehicleSegment(model);
  const normalizedPlate = normalizeVehiclePlate(plate);

  const baseParts = uniqueNonEmptyParts([normalizedType, normalizedMake, normalizedModel]);
  const baseSummary = baseParts.join(" ").trim();
  const descriptionLooksLikePlate = isVehiclePlateLike(normalizedDescription);
  const descriptionWithoutPlate = normalizedDescription
    && !descriptionLooksLikePlate
    && normalizeVehiclePlate(normalizedDescription) !== normalizedPlate
    ? normalizedDescription
    : null;

  if (baseSummary && normalizedPlate) return `${baseSummary} (${normalizedPlate})`;
  if (baseSummary) return baseSummary;

  if (descriptionWithoutPlate && normalizedPlate) {
    return descriptionWithoutPlate.includes(normalizedPlate)
      ? descriptionWithoutPlate
      : `${descriptionWithoutPlate} (${normalizedPlate})`;
  }

  if (descriptionWithoutPlate) return descriptionWithoutPlate;
  if (normalizedPlate) return normalizedPlate;
  return normalizedDescription || null;
}

function scoreVehicleSummary(value) {
  const text = normalizeVehicleSegment(value);
  if (!text) return -1;

  let score = text.length;
  if (/\([A-Z0-9-]+\)/.test(text)) score += 40;
  if (/\b(Mota|Bicicleta|Carro)\b/i.test(text)) score += 25;
  if (text.split(/\s+/).length >= 2) score += 20;
  if (isVehiclePlateLike(text)) score -= 30;

  return score;
}

function formatVehicleDisplayValue(value) {
  const text = normalizeVehicleSegment(value);
  if (!text) return null;

  if (isVehiclePlateLike(text)) {
    const plate = normalizeVehiclePlate(text);
    return plate ? `(Matricula: ${plate})` : null;
  }

  return text;
}

function pickBestVehicleSummary(...values) {
  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  values.forEach((value) => {
    const text = normalizeVehicleSegment(value);
    if (!text) return;
    let score = scoreVehicleSummary(text);
    if (isVehiclePlateLike(text)) {
      score = Math.max(score, 1);
    }
    if (score > bestScore) {
      best = text;
      bestScore = score;
    }
  });

  return formatVehicleDisplayValue(best);
}

function resolveDriverInfo(payloads) {
  const name = pickFirstFromPaths(payloads, [
    ["driverName"],
    ["driver", "name"],
    ["driver", "fullName"],
    ["driver_info", "name"],
    ["assignedDriverName"],
    ["assignedDriver", "name"],
    ["assignedCarrier", "name"],
    ["assignedCarrier", "fullName"],
    ["courierName"],
    ["riderName"],
  ]);

  const phone = pickFirstFromPaths(payloads, [
    ["driverPhoneNumber"],
    ["driver", "phone"],
    ["driver", "phoneNumber"],
    ["driver_info", "phone"],
    ["assignedDriverPhoneNumber"],
    ["assignedDriver", "phone"],
    ["assignedCarrier", "phone"],
    ["assignedCarrier", "phoneNumber"],
    ["courierPhone"],
    ["riderPhone"],
  ]);

  const vehicleDescription = pickFirstFromPaths(payloads, [
    ["carrier", "vehicle_description"],
    ["carrier", "vehicleDescription"],
    ["carrier", "vehicle"],
    ["carrier", "vehicleType"],
    ["carrier", "vehicle_type"],
    ["delivery_details", "vehicle_description"],
    ["delivery_details", "vehicleDescription"],
    ["delivery_details", "vehicle"],
    ["delivery_details", "carrier", "vehicle_description"],
    ["delivery_details", "carrier", "vehicleDescription"],
    ["delivery_details", "carrier", "vehicle"],
    ["deliveryDetails", "vehicle_description"],
    ["deliveryDetails", "vehicleDescription"],
    ["deliveryDetails", "vehicle"],
    ["deliveryDetails", "carrier", "vehicle_description"],
    ["deliveryDetails", "carrier", "vehicleDescription"],
    ["deliveryDetails", "carrier", "vehicle"],
    ["driverVehicle"],
    ["driver", "vehicle"],
    ["driver", "vehicle_description"],
    ["driver", "vehicleDescription"],
    ["driver", "vehicleType"],
    ["driver", "vehicle_type"],
    ["driverVehicleNumber"],
    ["vehicleNumber"],
    ["vehicleType"],
    ["assignedDriver", "vehicle_description"],
    ["assignedDriver", "vehicleDescription"],
    ["assignedDriver", "vehicle"],
    ["assignedCarrier", "vehicle_description"],
    ["assignedCarrier", "vehicleDescription"],
    ["assignedCarrier", "vehicle"],
  ]);
  const vehicleType = pickFirstFromPaths(payloads, [
    ["carrier", "vehicle_type"],
    ["carrier", "vehicleType"],
    ["carrier", "type"],
    ["delivery_details", "vehicle_type"],
    ["delivery_details", "vehicleType"],
    ["delivery_details", "type"],
    ["delivery_details", "carrier", "vehicle_type"],
    ["delivery_details", "carrier", "vehicleType"],
    ["delivery_details", "carrier", "type"],
    ["deliveryDetails", "vehicle_type"],
    ["deliveryDetails", "vehicleType"],
    ["deliveryDetails", "type"],
    ["deliveryDetails", "carrier", "vehicle_type"],
    ["deliveryDetails", "carrier", "vehicleType"],
    ["deliveryDetails", "carrier", "type"],
    ["driver", "vehicle_type"],
    ["driver", "vehicleType"],
    ["driver", "type"],
    ["assignedDriver", "vehicle_type"],
    ["assignedDriver", "vehicleType"],
    ["assignedDriver", "type"],
    ["assignedCarrier", "vehicle_type"],
    ["assignedCarrier", "vehicleType"],
    ["assignedCarrier", "type"],
  ]);
  const vehicleMake = pickFirstFromPaths(payloads, [
    ["carrier", "vehicle_make"],
    ["carrier", "vehicleMake"],
    ["carrier", "make"],
    ["delivery_details", "vehicle_make"],
    ["delivery_details", "vehicleMake"],
    ["delivery_details", "make"],
    ["delivery_details", "carrier", "vehicle_make"],
    ["delivery_details", "carrier", "vehicleMake"],
    ["delivery_details", "carrier", "make"],
    ["deliveryDetails", "vehicle_make"],
    ["deliveryDetails", "vehicleMake"],
    ["deliveryDetails", "make"],
    ["deliveryDetails", "carrier", "vehicle_make"],
    ["deliveryDetails", "carrier", "vehicleMake"],
    ["deliveryDetails", "carrier", "make"],
    ["driver", "vehicle_make"],
    ["driver", "vehicleMake"],
    ["driver", "make"],
    ["assignedDriver", "vehicle_make"],
    ["assignedDriver", "vehicleMake"],
    ["assignedDriver", "make"],
    ["assignedCarrier", "vehicle_make"],
    ["assignedCarrier", "vehicleMake"],
    ["assignedCarrier", "make"],
  ]);
  const vehicleModel = pickFirstFromPaths(payloads, [
    ["carrier", "vehicle_model"],
    ["carrier", "vehicleModel"],
    ["carrier", "model"],
    ["delivery_details", "vehicle_model"],
    ["delivery_details", "vehicleModel"],
    ["delivery_details", "model"],
    ["delivery_details", "carrier", "vehicle_model"],
    ["delivery_details", "carrier", "vehicleModel"],
    ["delivery_details", "carrier", "model"],
    ["deliveryDetails", "vehicle_model"],
    ["deliveryDetails", "vehicleModel"],
    ["deliveryDetails", "model"],
    ["deliveryDetails", "carrier", "vehicle_model"],
    ["deliveryDetails", "carrier", "vehicleModel"],
    ["deliveryDetails", "carrier", "model"],
    ["driver", "vehicle_model"],
    ["driver", "vehicleModel"],
    ["driver", "model"],
    ["assignedDriver", "vehicle_model"],
    ["assignedDriver", "vehicleModel"],
    ["assignedDriver", "model"],
    ["assignedCarrier", "vehicle_model"],
    ["assignedCarrier", "vehicleModel"],
    ["assignedCarrier", "model"],
  ]);
  const vehiclePlate = pickFirstFromPaths(payloads, [
    ["carrier", "license_plate"],
    ["carrier", "licensePlate"],
    ["carrier", "plate_number"],
    ["carrier", "plateNumber"],
    ["carrier", "plate"],
    ["carrier", "registration"],
    ["delivery_details", "license_plate"],
    ["delivery_details", "licensePlate"],
    ["delivery_details", "plate_number"],
    ["delivery_details", "plateNumber"],
    ["delivery_details", "plate"],
    ["delivery_details", "registration"],
    ["delivery_details", "carrier", "license_plate"],
    ["delivery_details", "carrier", "licensePlate"],
    ["delivery_details", "carrier", "plate_number"],
    ["delivery_details", "carrier", "plateNumber"],
    ["delivery_details", "carrier", "plate"],
    ["delivery_details", "carrier", "registration"],
    ["deliveryDetails", "license_plate"],
    ["deliveryDetails", "licensePlate"],
    ["deliveryDetails", "plate_number"],
    ["deliveryDetails", "plateNumber"],
    ["deliveryDetails", "plate"],
    ["deliveryDetails", "registration"],
    ["deliveryDetails", "carrier", "license_plate"],
    ["deliveryDetails", "carrier", "licensePlate"],
    ["deliveryDetails", "carrier", "plate_number"],
    ["deliveryDetails", "carrier", "plateNumber"],
    ["deliveryDetails", "carrier", "plate"],
    ["deliveryDetails", "carrier", "registration"],
    ["driver", "license_plate"],
    ["driver", "licensePlate"],
    ["driver", "plate_number"],
    ["driver", "plateNumber"],
    ["driver", "plate"],
    ["driver", "registration"],
    ["assignedDriver", "license_plate"],
    ["assignedDriver", "licensePlate"],
    ["assignedDriver", "plate_number"],
    ["assignedDriver", "plateNumber"],
    ["assignedDriver", "plate"],
    ["assignedDriver", "registration"],
    ["assignedCarrier", "license_plate"],
    ["assignedCarrier", "licensePlate"],
    ["assignedCarrier", "plate_number"],
    ["assignedCarrier", "plateNumber"],
    ["assignedCarrier", "plate"],
    ["assignedCarrier", "registration"],
  ]);
  const vehicle = composeVehicleSummary({
    description: vehicleDescription,
    type: vehicleType,
    make: vehicleMake,
    model: vehicleModel,
    plate: vehiclePlate,
  });

  return {
    name,
    phone,
    vehicle,
  };
}

function resolveTrackingUrl(deliveries = [], payloads = [], fallbackTrackingUrl = null) {
  const direct = deliveries.find((item) => toText(item?.tracking_url))?.tracking_url;
  if (toText(direct)) return direct;

  const fromPayload = pickFirstFromPaths(payloads, [
    ["trackingUrl"],
    ["tracking_url"],
    ["trackingURL"],
    ["trackingLink"],
    ["publicTrackingLink"],
    ["tracking", "url"],
    ["tracking", "trackingUrl"],
  ]);

  return fromPayload || toText(fallbackTrackingUrl) || null;
}

function resolveEstimatedDelivery(payloads = []) {
  const date = pickFirstFromPaths(payloads, [
    ["expectedDeliveryDate"],
    ["deliveryDate"],
    ["etaDate"],
  ]);
  const time = pickFirstFromPaths(payloads, [
    ["eta"],
    ["expected_delivery_time"],
    ["expectedDeliveryTime"],
    ["expectedDeliveryTime"],
    ["deliveryTime"],
    ["etaTime"],
  ]);

  if (date && time) return `${date} ${time}`;
  return date || time || null;
}

function formatEstimatedDelivery(value) {
  const text = toText(value);
  if (!text) return null;

  if (/^\d{1,2}:\d{2}$/.test(text)) {
    return `~ ${text.padStart(5, "0")}`;
  }

  const numericTimestamp = /^\d{13}$/.test(text)
    ? Number(text)
    : (/^\d{10}$/.test(text) ? Number(text) * 1000 : null);
  const parsed = numericTimestamp ?? Date.parse(text);

  if (!Number.isFinite(parsed)) return null;

  return `~ ${new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(parsed))}`;
}

function resolvePaymentMethod(order, payloads = []) {
  const direct = toText(order?.payment_label)
    || toText(order?.paymentLabel)
    || toText(order?.payment_method)
    || toText(order?.paymentMethod);
  const fromPayload = pickFirstFromPaths(payloads, [
    ["paymentLabel"],
    ["payment_label"],
    ["paymentMethod"],
    ["payment_method"],
    ["payment", "method"],
  ]);
  const value = String(direct || fromPayload || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");

  if (!value) return null;
  if (value === "CASH" || value === "DINHEIRO") return "Dinheiro";
  if (value === "MBWAY") return "MB WAY";
  if (value === "CREDIT_CARD") return "Cartao";
  return value;
}

function canUserAccessOrder(order, user, { allowGuestState = false } = {}) {
  if (!order) return false;

  const role = resolveUserRole(user);
  if (role === "admin" || role === "dev") return true;

  if (role === "restaurant") {
    const restaurantStoreId = extractRestaurantId(user);
    return String(restaurantStoreId || "") === String(order.loja_id || "");
  }

  const userId = extractUserId(user);
  const orderUserId = toText(order.customer_user_id);
  if (userId && orderUserId && String(userId) === String(orderUserId)) {
    return true;
  }

  const userEmail = normalizeEmail(user?.email);
  const orderEmail = normalizeEmail(order.customer_email);
  if (userEmail && orderEmail && userEmail === orderEmail) {
    return true;
  }

  return Boolean(allowGuestState);
}

function buildTimeline({ order, deliveries = [], events = [] }) {
  const timeline = [];

  timeline.push({
    type: "ORDER_CREATED",
    label: "Pedido criado",
    status: normalizeStatus(order?.status),
    created_at: order?.created_at,
    payload: null,
  });

  deliveries.forEach((delivery) => {
    timeline.push({
      type: "DELIVERY_STATUS",
      label: `Entrega: ${statusLabelPt(delivery.status)}`,
      status: normalizeStatus(delivery.status),
      created_at: delivery.updated_at || delivery.created_at,
      payload: parsePayload(delivery.provider_payload),
    });
  });

  events.forEach((event) => {
    timeline.push({
      type: "SHIPDAY_EVENT",
      label: `Shipday: ${statusLabelPt(event.event_type)}`,
      status: normalizeStatus(event.event_type),
      created_at: event.created_at,
      payload: parsePayload(event.payload),
    });
  });

  return timeline.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

async function fetchOrderRecordWithCompatibility(normalizedOrderId) {
  const selectWithTiming = `
      id,
      loja_id,
      customer_user_id,
      customer_nome,
      customer_phone,
      customer_email,
      customer_address,
      customer_address_label,
      customer_notes,
      subtotal,
      taxa_entrega,
      total,
      payment_method,
      payment_label,
      status,
      estado_interno,
      shipday_order_id,
      shipday_tracking_url,
      previsao_entrega,
      veiculo_estafeta,
      driver_name,
      driver_phone,
      created_at,
      updated_at,
      submitted_at,
      order_timing_mode
    `;

  const selectLegacy = `
      id,
      loja_id,
      customer_user_id,
      customer_nome,
      customer_phone,
      customer_email,
      customer_address,
      customer_address_label,
      customer_notes,
      subtotal,
      taxa_entrega,
      total,
      payment_method,
      payment_label,
      status,
      estado_interno,
      shipday_order_id,
      shipday_tracking_url,
      previsao_entrega,
      veiculo_estafeta,
      driver_name,
      driver_phone,
      created_at,
      updated_at
    `;

  let response = await supabase
    .from("orders")
    .select(selectWithTiming)
    .eq("id", normalizedOrderId)
    .maybeSingle();

  if (response.error && /submitted_at|order_timing_mode|payment_method|payment_label|previsao_entrega|veiculo_estafeta/i.test(String(response.error.message || ""))) {
    response = await supabase
      .from("orders")
      .select(selectLegacy)
      .eq("id", normalizedOrderId)
      .maybeSingle();
  }

  return response;
}

async function fetchDeliveryEvents(deliveryIds = []) {
  if (!deliveryIds.length) return [];

  const baseSelect = "id, delivery_id, event_type, event_id, created_at";

  const withRawPayload = await supabase
    .from("delivery_events")
    .select(`${baseSelect}, raw_payload`)
    .in("delivery_id", deliveryIds)
    .order("created_at", { ascending: false });

  if (!withRawPayload.error) {
    return (withRawPayload.data || []).map((event) => ({
      ...event,
      payload: event.raw_payload || null,
    }));
  }

  const withPayloadJson = await supabase
    .from("delivery_events")
    .select(`${baseSelect}, payload_json`)
    .in("delivery_id", deliveryIds)
    .order("created_at", { ascending: false });

  if (!withPayloadJson.error) {
    return (withPayloadJson.data || []).map((event) => ({
      ...event,
      payload: event.payload_json || null,
    }));
  }

  console.error("Erro ao buscar eventos da entrega:", withRawPayload.error || withPayloadJson.error);
  return [];
}

export async function fetchOrderDetails(orderId, { user = null, allowGuestState = false, fallbackTrackingUrl = null } = {}) {
  const normalizedOrderId = Number(orderId);
  if (!Number.isFinite(normalizedOrderId)) {
    throw new Error("ID de pedido invalido.");
  }

  const { data: order, error: orderError } = await fetchOrderRecordWithCompatibility(normalizedOrderId);

  if (orderError) throw orderError;
  if (!order) throw new Error("Pedido nao encontrado.");

  if (!canUserAccessOrder(order, user, { allowGuestState })) {
    throw new Error("Sem permissao para ver este pedido.");
  }

  const [itemsRes, lojaRes, deliveriesRes] = await Promise.all([
    supabase
      .from("order_items")
      .select("id, order_id, menu_id, nome, quantidade, preco_unitario, subtotal, created_at")
      .eq("order_id", normalizedOrderId)
      .order("created_at", { ascending: true }),
    supabase
      .from("lojas")
      .select("idloja, nome, contacto, morada_completa, icon")
      .eq("idloja", Number(order.loja_id))
      .maybeSingle(),
    supabase
      .from("deliveries")
      .select("id, order_id, provider, external_delivery_id, tracking_url, status, provider_payload, shipday_error, created_at, updated_at")
      .eq("order_id", normalizedOrderId)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (itemsRes.error) throw itemsRes.error;
  if (lojaRes.error) throw lojaRes.error;
  if (deliveriesRes.error) throw deliveriesRes.error;

  const deliveries = (deliveriesRes.data || []).sort(byLatest);
  const latestDelivery = deliveries[0] || null;

  const deliveryIds = deliveries.map((item) => item.id).filter(Boolean);
  const events = await fetchDeliveryEvents(deliveryIds);

  const payloads = [
    ...deliveries.map((item) => parsePayload(item.provider_payload)).filter(Boolean),
    ...events.map((event) => parsePayload(event.payload)).filter(Boolean),
  ];

  const trackingUrl = resolveTrackingUrl(
    deliveries,
    payloads,
    toText(order.shipday_tracking_url) || fallbackTrackingUrl,
  );
  const payloadDriver = resolveDriverInfo(payloads);
  const driver = {
    name: toText(order.driver_name) || payloadDriver.name,
    phone: toText(order.driver_phone) || payloadDriver.phone,
    vehicle: pickBestVehicleSummary(payloadDriver.vehicle, toText(order.veiculo_estafeta)),
  };
  const estimatedDelivery = formatEstimatedDelivery(toText(order.previsao_entrega) || resolveEstimatedDelivery(payloads));
  const paymentMethodLabel = resolvePaymentMethod(order, payloads);

  const orderStatus = normalizeStatus(order.status);
  const orderEstadoInterno = resolveOrderEstadoInterno(order);
  const orderEstadoTone = mapEstadoToneToUi(getEstadoInternoTone(orderEstadoInterno));
  const deliveryStatus = normalizeStatus(latestDelivery?.status || "");
  const forcedDelivered = orderEstadoInterno === "entregue";
  const forcedCanceled = orderEstadoInterno === "cancelado";
  const deliveryStatusLabel = forcedDelivered
    ? "Concluida"
    : (forcedCanceled ? "Cancelada" : statusLabelPt(deliveryStatus));
  const deliveryStatusTone = forcedDelivered
    ? "success"
    : (forcedCanceled ? "danger" : statusTone(deliveryStatus));

  return {
    order: {
      ...order,
      subtotal: toNumber(order.subtotal, 0),
      taxa_entrega: toNumber(order.taxa_entrega, 0),
      total: toNumber(order.total, 0),
      submitted_at: order.submitted_at || null,
      order_timing_mode: order.order_timing_mode || "ASAP",
      status: orderStatus,
      status_legacy_label: statusLabelPt(orderStatus),
      estado_interno: orderEstadoInterno,
      status_label: getEstadoInternoLabelPt(orderEstadoInterno),
      status_tone: orderEstadoTone,
    },
    items: (itemsRes.data || []).map((item) => ({
      ...item,
      quantidade: toNumber(item.quantidade, 1),
      preco_unitario: toNumber(item.preco_unitario, 0),
      subtotal: toNumber(item.subtotal, 0),
    })),
    store: lojaRes.data
      ? {
        id: lojaRes.data.idloja,
        nome: lojaRes.data.nome || `Loja ${order.loja_id}`,
        contacto: toText(lojaRes.data.contacto),
        morada: toText(lojaRes.data.morada_completa),
        icon: toText(lojaRes.data.icon),
      }
      : {
        id: order.loja_id,
        nome: `Loja ${order.loja_id}`,
        contacto: null,
        morada: null,
        icon: null,
      },
    deliveries,
    latest_delivery: latestDelivery
      ? {
        ...latestDelivery,
        status: deliveryStatus,
        status_label: deliveryStatusLabel,
        status_tone: deliveryStatusTone,
      }
      : null,
    events,
    timeline: buildTimeline({ order, deliveries, events }),
    workflow: buildWorkflowProgress(orderEstadoInterno),
    tracking_url: trackingUrl,
    shipday_delivery_id: toText(latestDelivery?.external_delivery_id)
      || pickFirstFromPaths(payloads, [["deliveryId"], ["orderId"]]),
    shipday_error: toText(latestDelivery?.shipday_error),
    driver,
    estimated_delivery: estimatedDelivery,
    payment_method_label: paymentMethodLabel,
    is_live: !TERMINAL_ESTADO_INTERNO.has(orderEstadoInterno) && (!deliveryStatus || !TERMINAL_DELIVERY_STATUS.has(deliveryStatus)),
  };
}

export function getStatusLabelPt(status) {
  return statusLabelPt(status);
}

export function getStatusTone(status) {
  return statusTone(status);
}











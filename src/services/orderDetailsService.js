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
    DISPATCHED: "Em distribuicao",
    DELIVERED: "Entregue",
    CANCELLED: "Cancelado",
    FAILED: "Falhado",
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
  const currentIndex = WORKFLOW_INDEX_BY_ESTADO[normalizedEstado] ?? 0;

  return {
    estado_interno: normalizedEstado,
    current_label: getEstadoInternoLabelPt(normalizedEstado),
    is_canceled: normalizedEstado === "cancelado",
    steps: WORKFLOW_STEPS.map((step, index) => ({
      key: step,
      label: getEstadoInternoLabelPt(step),
      index,
      is_current: normalizedEstado !== "cancelado" && index === currentIndex,
      is_completed: normalizedEstado !== "cancelado" && index <= currentIndex,
      is_pending: normalizedEstado === "cancelado" ? index > 0 : index > currentIndex,
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

function resolveDriverInfo(payloads) {
  const name = pickFirstFromPaths(payloads, [
    ["driverName"],
    ["driver", "name"],
    ["driver", "fullName"],
    ["driver_info", "name"],
    ["assignedDriverName"],
    ["assignedDriver", "name"],
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
    ["courierPhone"],
    ["riderPhone"],
  ]);

  const vehicle = pickFirstFromPaths(payloads, [
    ["driverVehicle"],
    ["driver", "vehicle"],
    ["driverVehicleNumber"],
    ["vehicleNumber"],
    ["vehicleType"],
    ["assignedDriver", "vehicle"],
  ]);

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
    ["expectedDeliveryTime"],
    ["deliveryTime"],
    ["etaTime"],
  ]);

  if (date && time) return `${date} ${time}`;
  return date || time || null;
}

function resolvePaymentMethod(order, payloads = []) {
  const direct = toText(order?.payment_method) || toText(order?.paymentMethod);
  const fromPayload = pickFirstFromPaths(payloads, [
    ["paymentMethod"],
    ["payment_method"],
    ["payment", "method"],
  ]);
  const value = (direct || fromPayload || "").toUpperCase();

  if (!value) return null;
  if (value === "CASH") return "Dinheiro";
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

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(`
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
      status,
      estado_interno,
      shipday_order_id,
      shipday_tracking_url,
      driver_name,
      driver_phone,
      created_at,
      updated_at
    `)
    .eq("id", normalizedOrderId)
    .maybeSingle();

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
    vehicle: payloadDriver.vehicle,
  };
  const estimatedDelivery = resolveEstimatedDelivery(payloads);
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











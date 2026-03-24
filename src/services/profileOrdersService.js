import { supabase } from "./supabaseClient";
import { extractUserId } from "../utils/roles";
import {
  getEstadoInternoLabelPt,
  getEstadoInternoTone,
  mapLegacyStatusToEstadoInterno,
  resolveOrderEstadoInterno,
} from "./orderStatusMapper";

const EMPTY_SUMMARY = {
  totalOrders: 0,
  openOrders: 0,
  completedOrders: 0,
  canceledOrders: 0,
  totalSpent: 0,
  averageTicket: 0,
};

const PROFILE_ORDER_SELECT_WITH_TIMING = "id, loja_id, subtotal, taxa_entrega, total, status, estado_interno, created_at, updated_at, customer_user_id, customer_email, submitted_at, order_timing_mode, scheduled_for";
const PROFILE_ORDER_SELECT_LEGACY = "id, loja_id, subtotal, taxa_entrega, total, status, estado_interno, created_at, updated_at, customer_user_id, customer_email";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStatus(rawStatus) {
  const status = String(rawStatus || "PENDING").toUpperCase();

  if (status.includes("CANCEL") || status.includes("REJECT") || status.includes("FAILED")) {
    return { label: "Cancelado", tone: "danger", group: "CANCELED", raw: status };
  }

  if (
    status.includes("DELIVER")
    || status.includes("COMPLETE")
    || status.includes("DONE")
    || status.includes("SUCCESS")
  ) {
    return { label: "Concluido", tone: "success", group: "COMPLETED", raw: status };
  }

  return { label: "Em curso", tone: "warning", group: "OPEN", raw: status };
}

function isCanceledDeliveryStatus(status) {
  const key = String(status || "").toUpperCase();
  return key.includes("CANCEL") || key.includes("REJECT") || key.includes("FAILED");
}

function isDeliveredDeliveryStatus(status) {
  const key = String(status || "").toUpperCase();
  return key.includes("DELIVER") || key.includes("COMPLETE") || key.includes("DONE") || key.includes("SUCCESS");
}

function mapEstadoToneToUi(tone) {
  if (tone === "ok") return "success";
  if (tone === "bad") return "danger";
  return "warning";
}

function buildSummary(orders = []) {
  if (!orders.length) return EMPTY_SUMMARY;

  const billableOrders = orders.filter((order) => order.status_group !== "CANCELED");
  const totalSpent = billableOrders.reduce((sum, order) => sum + toNumber(order.total, 0), 0);
  const openOrders = orders.filter((order) => order.status_group === "OPEN").length;
  const completedOrders = orders.filter((order) => order.status_group === "COMPLETED").length;
  const canceledOrders = orders.filter((order) => order.status_group === "CANCELED").length;

  return {
    totalOrders: orders.length,
    openOrders,
    completedOrders,
    canceledOrders,
    totalSpent,
    averageTicket: billableOrders.length ? totalSpent / billableOrders.length : 0,
  };
}

function byNewest(a, b) {
  return new Date(b.submitted_at || b.created_at || 0).getTime() - new Date(a.submitted_at || a.created_at || 0).getTime();
}

function uniqueOrderRows(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    if (!row?.id) return;
    map.set(String(row.id), row);
  });
  return Array.from(map.values()).sort(byNewest);
}

function pickLatestDeliveries(deliveryRows = []) {
  const map = new Map();
  deliveryRows.forEach((row) => {
    const key = String(row.order_id || "");
    if (!key) return;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      return;
    }

    const existingDate = new Date(existing.updated_at || existing.created_at || 0).getTime();
    const nextDate = new Date(row.updated_at || row.created_at || 0).getTime();

    if (nextDate >= existingDate) {
      map.set(key, row);
    }
  });

  return map;
}

function normalizeOrderRow(order, lojaNameMap, latestDeliveryMap) {
  const resolvedEstadoInterno = resolveOrderEstadoInterno(order);
  const delivery = latestDeliveryMap.get(String(order?.id || ""));
  const deliveryRawStatus = String(delivery?.status || "").toUpperCase();
  const deliveryEstadoInterno = mapLegacyStatusToEstadoInterno(deliveryRawStatus);

  const isCanceled = resolvedEstadoInterno === "cancelado"
    || deliveryEstadoInterno === "cancelado"
    || isCanceledDeliveryStatus(deliveryRawStatus);
  const isDelivered = !isCanceled && (
    resolvedEstadoInterno === "entregue"
    || deliveryEstadoInterno === "entregue"
    || isDeliveredDeliveryStatus(deliveryRawStatus)
  );

  const estadoInterno = isCanceled ? "cancelado" : (isDelivered ? "entregue" : resolvedEstadoInterno);
  const estadoTone = getEstadoInternoTone(estadoInterno);
  const statusInfo = {
    raw: String(order?.status || "").toUpperCase(),
    label: getEstadoInternoLabelPt(estadoInterno),
    tone: mapEstadoToneToUi(estadoTone),
    group: isDelivered ? "COMPLETED" : (isCanceled ? "CANCELED" : "OPEN"),
  };
  const fallbackDeliveryStatusInfo = normalizeStatus(delivery?.status);
  const deliveryStatusInfo = statusInfo.group === "COMPLETED"
    ? { raw: "DELIVERED", label: "Concluida", tone: "success", group: "COMPLETED" }
    : (statusInfo.group === "CANCELED"
      ? { raw: "CANCELLED", label: "Cancelada", tone: "danger", group: "CANCELED" }
      : fallbackDeliveryStatusInfo);

  return {
    id: order.id,
    loja_id: order.loja_id,
    loja_nome: lojaNameMap.get(String(order.loja_id)) || `Loja ${order.loja_id}`,
    subtotal: toNumber(order.subtotal, 0),
    taxa_entrega: toNumber(order.taxa_entrega, 0),
    total: toNumber(order.total, 0),
    created_at: order.created_at,
    updated_at: order.updated_at,
    submitted_at: order.submitted_at || null,
    order_timing_mode: order.order_timing_mode || "ASAP",
    scheduled_for: order.scheduled_for || (String(order.order_timing_mode || "").toUpperCase() === "SCHEDULED" ? order.created_at || null : null),
    status_raw: statusInfo.raw,
    status_label: statusInfo.label,
    status_tone: statusInfo.tone,
    status_group: statusInfo.group,
    delivery_status_raw: delivery ? deliveryStatusInfo.raw : null,
    delivery_status_label: delivery ? deliveryStatusInfo.label : null,
    delivery_status_tone: delivery ? deliveryStatusInfo.tone : null,
    tracking_url: delivery?.tracking_url || null,
    shipday_error: delivery?.shipday_error || null,
  };
}

async function fetchOrdersByUserId(userId, limit) {
  if (!userId) return [];

  let query = supabase
    .from("orders")
    .select(PROFILE_ORDER_SELECT_WITH_TIMING)
    .eq("customer_user_id", String(userId))
    .order("created_at", { ascending: false });

  if (Number.isFinite(limit) && Number(limit) > 0) {
    query = query.limit(Number(limit));
  }

  const { data, error } = await query;

  if (error) {
    if (/submitted_at|order_timing_mode|scheduled_for/i.test(String(error.message || ""))) {
      const fallback = await supabase
        .from("orders")
        .select(PROFILE_ORDER_SELECT_LEGACY)
        .eq("customer_user_id", String(userId))
        .order("created_at", { ascending: false })
        .limit(Number.isFinite(limit) && Number(limit) > 0 ? Number(limit) : 100);

      if (!fallback.error) {
        return fallback.data || [];
      }
    }

    console.error("Erro ao buscar pedidos por user id:", error);
    return [];
  }

  return data || [];
}

async function fetchOrdersByEmail(email, limit) {
  if (!email) return [];

  let query = supabase
    .from("orders")
    .select(PROFILE_ORDER_SELECT_WITH_TIMING)
    .ilike("customer_email", String(email).trim())
    .order("created_at", { ascending: false });

  if (Number.isFinite(limit) && Number(limit) > 0) {
    query = query.limit(Number(limit));
  }

  const { data, error } = await query;

  if (error) {
    if (/submitted_at|order_timing_mode|scheduled_for/i.test(String(error.message || ""))) {
      const fallback = await supabase
        .from("orders")
        .select(PROFILE_ORDER_SELECT_LEGACY)
        .ilike("customer_email", String(email).trim())
        .order("created_at", { ascending: false })
        .limit(Number.isFinite(limit) && Number(limit) > 0 ? Number(limit) : 100);

      if (!fallback.error) {
        return fallback.data || [];
      }
    }

    console.error("Erro ao buscar pedidos por email:", error);
    return [];
  }

  return data || [];
}

export async function fetchProfileOrders(user, { limit = 100 } = {}) {
  const userId = extractUserId(user);
  const email = String(user?.email || "").trim();

  if (!userId && !email) {
    return { summary: EMPTY_SUMMARY, orders: [] };
  }

  const [byUserId, byEmail] = await Promise.all([
    fetchOrdersByUserId(userId, limit),
    fetchOrdersByEmail(email, limit),
  ]);

  const orderRows = uniqueOrderRows([...(byUserId || []), ...(byEmail || [])]);

  if (!orderRows.length) {
    return { summary: EMPTY_SUMMARY, orders: [] };
  }

  const orderIds = orderRows.map((order) => order.id).filter((id) => id !== null && id !== undefined);
  const lojaIds = [...new Set(orderRows.map((order) => order.loja_id).filter(Boolean))];

  const [lojasResponse, deliveriesResponse] = await Promise.all([
    lojaIds.length
      ? supabase.from("lojas").select("idloja, nome").in("idloja", lojaIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase
        .from("deliveries")
        .select("order_id, status, tracking_url, shipday_error, updated_at, created_at")
        .in("order_id", orderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (lojasResponse?.error) {
    console.error("Erro ao buscar nomes das lojas:", lojasResponse.error);
  }

  if (deliveriesResponse?.error) {
    console.error("Erro ao buscar estado de entrega:", deliveriesResponse.error);
  }

  const lojaNameMap = new Map(
    (lojasResponse?.data || []).map((loja) => [String(loja.idloja), loja.nome || `Loja ${loja.idloja}`]),
  );

  const latestDeliveryMap = pickLatestDeliveries(deliveriesResponse?.data || []);

  const orders = orderRows.map((order) => normalizeOrderRow(order, lojaNameMap, latestDeliveryMap));
  const summary = buildSummary(orders);

  return { summary, orders };
}

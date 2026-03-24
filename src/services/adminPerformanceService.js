import { supabase } from "./supabaseClient";
import { resolveOrderEstadoInterno } from "./orderStatusMapper";

const ASSIGNMENT_EVENT_TYPES = new Set(["ASSIGNED", "ACTIVE", "STARTED"]);
const DELIVERY_EVENT_TYPES = new Set(["DELIVERED", "ALREADY_DELIVERED"]);

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function daysToIso(days) {
  const date = new Date();
  date.setDate(date.getDate() - Number(days || 7));
  return date.toISOString();
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDayBucket(date) {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatWeekBucket(date) {
  const current = new Date(date);
  const day = current.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  current.setDate(current.getDate() + diff);
  current.setHours(0, 0, 0, 0);

  const end = new Date(current);
  end.setDate(end.getDate() + 6);

  return `${formatDayBucket(current)} - ${formatDayBucket(end)}`;
}

function formatBucketLabel(date, granularity = "day") {
  return granularity === "week" ? formatWeekBucket(date) : formatDayBucket(date);
}

function getBucketDate(date, granularity = "day") {
  const current = new Date(date);
  if (Number.isNaN(current.getTime())) return null;

  if (granularity === "week") {
    const day = current.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    current.setDate(current.getDate() + diff);
  }

  current.setHours(0, 0, 0, 0);
  return current;
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

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function sortByCreatedAtAsc(rows = []) {
  return [...rows].sort(
    (a, b) => new Date(a?.created_at || 0).getTime() - new Date(b?.created_at || 0).getTime(),
  );
}

function getAnalyticsTimestamp(order) {
  const value = order?.submitted_at || order?.created_at || 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isWithinWindow(order, { since = null, until = null } = {}) {
  const timestamp = getAnalyticsTimestamp(order);
  if (!timestamp) return false;

  const sinceTs = since ? new Date(since).getTime() : null;
  const untilTs = until ? new Date(until).getTime() : null;

  if (Number.isFinite(sinceTs) && timestamp < sinceTs) return false;
  if (Number.isFinite(untilTs) && timestamp > untilTs) return false;

  return true;
}

async function fetchDeliveryEvents(deliveryIds = []) {
  if (!deliveryIds.length) return [];

  const baseSelect = "id, delivery_id, event_type, created_at";

  const withRawPayload = await supabase
    .from("delivery_events")
    .select(`${baseSelect}, raw_payload`)
    .in("delivery_id", deliveryIds)
    .order("created_at", { ascending: true });

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
    .order("created_at", { ascending: true });

  if (!withPayloadJson.error) {
    return (withPayloadJson.data || []).map((event) => ({
      ...event,
      payload: event.payload_json || null,
    }));
  }

  throw withRawPayload.error || withPayloadJson.error;
}

function buildRevenueSeries(orders = [], granularity = "day") {
  const bucketMap = new Map();

  orders.forEach((order) => {
    const createdAt = new Date(order.submitted_at || order.created_at || 0);
    if (Number.isNaN(createdAt.getTime())) return;

    const bucketDate = getBucketDate(createdAt, granularity);
    if (!bucketDate) return;

    const key = bucketDate.toISOString();
    const label = formatBucketLabel(bucketDate, granularity);
    if (!bucketMap.has(key)) {
      bucketMap.set(key, {
        date: key,
        label,
        revenue: 0,
        deliveryFees: 0,
        orders: 0,
      });
    }

    const entry = bucketMap.get(key);
    entry.revenue += toNumber(order.total, 0);
    entry.deliveryFees += toNumber(order.taxa_entrega, 0);
    entry.orders += 1;
  });

  return Array.from(bucketMap.values())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((entry) => ({
      ...entry,
      revenue: Number(entry.revenue.toFixed(2)),
      deliveryFees: Number(entry.deliveryFees.toFixed(2)),
    }));
}

function buildTopProducts(orderItems = []) {
  const productMap = new Map();

  orderItems.forEach((item) => {
    const label = String(item?.nome || "Produto sem nome").trim() || "Produto sem nome";

    if (!productMap.has(label)) {
      productMap.set(label, {
        name: label,
        quantity: 0,
        revenue: 0,
      });
    }

    const entry = productMap.get(label);
    entry.quantity += Math.max(1, toNumber(item.quantidade, 1));
    entry.revenue += toNumber(item.subtotal, 0);
  });

  return Array.from(productMap.values())
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, 5)
    .map((entry) => ({
      ...entry,
      revenue: Number(entry.revenue.toFixed(2)),
    }));
}

function resolveAssignmentAndDeliveryMoments({ order, delivery, events }) {
  const sortedEvents = sortByCreatedAtAsc(events);

  const assignmentEvent = sortedEvents.find((event) => ASSIGNMENT_EVENT_TYPES.has(normalizeStatus(event.event_type)));
  const deliveredEvent = [...sortedEvents].reverse().find((event) => DELIVERY_EVENT_TYPES.has(normalizeStatus(event.event_type)));

  const assignmentAt = order?.atribuido_em || assignmentEvent?.created_at || delivery?.created_at || order?.aceite_em || order?.created_at || null;
  const deliveredAt = order?.entregue_em || deliveredEvent?.created_at
    || (["DELIVERED", "ALREADY_DELIVERED"].includes(normalizeStatus(delivery?.status)) ? (delivery?.updated_at || order?.updated_at) : null)
    || (resolveOrderEstadoInterno(order) === "entregue" ? order?.updated_at : null);

  if (!assignmentAt || !deliveredAt) {
    return null;
  }

  const assignmentTime = new Date(assignmentAt).getTime();
  const deliveredTime = new Date(deliveredAt).getTime();

  if (!Number.isFinite(assignmentTime) || !Number.isFinite(deliveredTime) || deliveredTime < assignmentTime) {
    return null;
  }

  return {
    assignmentAt,
    deliveredAt,
    durationMinutes: (deliveredTime - assignmentTime) / 60000,
  };
}

function buildDeliveryTimeSeries(entries = [], granularity = "day") {
  const bucketMap = new Map();

  entries.forEach((entry) => {
    const deliveredDate = new Date(entry.deliveredAt || 0);
    if (Number.isNaN(deliveredDate.getTime())) return;

    const bucketDate = getBucketDate(deliveredDate, granularity);
    if (!bucketDate) return;

    const key = bucketDate.toISOString();
    const label = formatBucketLabel(bucketDate, granularity);
    if (!bucketMap.has(key)) {
      bucketMap.set(key, {
        date: key,
        label,
        count: 0,
        totalMinutes: 0,
      });
    }

    const bucket = bucketMap.get(key);
    bucket.count += 1;
    bucket.totalMinutes += entry.durationMinutes;
  });

  return Array.from(bucketMap.values())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((bucket) => ({
      date: bucket.date,
      label: bucket.label,
      avgMinutes: bucket.count ? Number((bucket.totalMinutes / bucket.count).toFixed(1)) : 0,
      count: bucket.count,
    }));
}

export async function fetchAdminPerformanceData({
  periodDays = 7,
  granularity = "day",
  dateFrom = null,
  dateTo = null,
} = {}) {
  const since = toIsoOrNull(dateFrom) || daysToIso(periodDays);
  const until = toIsoOrNull(dateTo);
  const fetchLimit = until || dateFrom ? 5000 : 1500;

  let ordersRes = await supabase
    .from("orders")
    .select("id, loja_id, total, taxa_entrega, created_at, updated_at, submitted_at, scheduled_for, status, estado_interno, aceite_em, atribuido_em, recolhido_em, entregue_em")
    .or(`submitted_at.gte.${since},and(submitted_at.is.null,created_at.gte.${since})`)
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  if (ordersRes.error && /submitted_at|scheduled_for|aceite_em|atribuido_em|recolhido_em|entregue_em/i.test(String(ordersRes.error.message || ""))) {
    ordersRes = await supabase
      .from("orders")
      .select("id, loja_id, total, taxa_entrega, created_at, updated_at, status, estado_interno")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(fetchLimit);
  }

  if (ordersRes.error) throw ordersRes.error;

  const allOrders = (ordersRes.data || []).filter((order) => isWithinWindow(order, { since, until }));
  const orders = allOrders.filter((order) => resolveOrderEstadoInterno(order) !== "cancelado");
  const orderIds = orders.map((order) => order.id).filter(Boolean);

  if (!orderIds.length) {
    return {
      periodDays,
      granularity,
      dateFrom: since,
      dateTo: until,
      overview: {
        totalRevenue: 0,
        totalDeliveryFees: 0,
        deliveredOrders: 0,
        averageAssignToDeliveredMinutes: 0,
      },
      revenueSeries: [],
      topProducts: [],
      deliveryPerformanceSeries: [],
    };
  }

  const [orderItemsRes, deliveriesRes] = await Promise.all([
    supabase
      .from("order_items")
      .select("id, order_id, nome, quantidade, subtotal")
      .in("order_id", orderIds),
    supabase
      .from("deliveries")
      .select("id, order_id, status, created_at, updated_at, provider_payload")
      .in("order_id", orderIds)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (orderItemsRes.error) throw orderItemsRes.error;
  if (deliveriesRes.error) throw deliveriesRes.error;

  const deliveries = deliveriesRes.data || [];
  const deliveryIds = deliveries.map((delivery) => delivery.id).filter(Boolean);
  const deliveryEvents = await fetchDeliveryEvents(deliveryIds);

  const eventsByDeliveryId = new Map();
  deliveryEvents.forEach((event) => {
    const key = String(event.delivery_id || "");
    if (!key) return;
    if (!eventsByDeliveryId.has(key)) {
      eventsByDeliveryId.set(key, []);
    }
    eventsByDeliveryId.get(key).push({
      ...event,
      payload: parsePayload(event.payload),
    });
  });

  const latestDeliveryByOrderId = new Map();
  deliveries.forEach((delivery) => {
    const key = String(delivery.order_id || "");
    if (!key || latestDeliveryByOrderId.has(key)) return;
    latestDeliveryByOrderId.set(key, delivery);
  });

  const deliveryPerformanceEntries = orders
    .map((order) => {
      const delivery = latestDeliveryByOrderId.get(String(order.id || ""));
      if (!delivery) return null;

      return resolveAssignmentAndDeliveryMoments({
        order,
        delivery,
        events: eventsByDeliveryId.get(String(delivery.id || "")) || [],
      });
    })
    .filter(Boolean);

  const deliveredOrders = orders.filter((order) => resolveOrderEstadoInterno(order) === "entregue").length;
  const totalRevenue = orders.reduce((sum, order) => sum + toNumber(order.total, 0), 0);
  const totalDeliveryFees = orders.reduce((sum, order) => sum + toNumber(order.taxa_entrega, 0), 0);
  const totalDurationMinutes = deliveryPerformanceEntries.reduce((sum, entry) => sum + entry.durationMinutes, 0);

  return {
    periodDays,
    granularity,
    dateFrom: since,
    dateTo: until,
    overview: {
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalDeliveryFees: Number(totalDeliveryFees.toFixed(2)),
      deliveredOrders,
      averageAssignToDeliveredMinutes: deliveryPerformanceEntries.length
        ? Number((totalDurationMinutes / deliveryPerformanceEntries.length).toFixed(1))
        : 0,
    },
    revenueSeries: buildRevenueSeries(orders, granularity),
    topProducts: buildTopProducts(orderItemsRes.data || []),
    deliveryPerformanceSeries: buildDeliveryTimeSeries(deliveryPerformanceEntries, granularity),
  };
}

import { resolveOrderEstadoInterno } from "../../services/orderStatusMapper";

export const ACCEPTED_WITHOUT_DRIVER_SLA_MS = 10 * 60 * 1000;

export function safeImage(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text) || text.startsWith("data:") || text.startsWith("blob:")) return text;
  if (text.startsWith("/")) return text;
  return text;
}

export function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

export function readUserFromStorageSafe(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function safeFixed(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Number(0).toFixed(digits);
  return numeric.toFixed(digits);
}

export function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function ensureObjectArray(value) {
  return ensureArray(value).filter((item) => item && typeof item === "object");
}

export function normalizeAdminMetrics(metrics = {}) {
  return {
    totalOrders: Number(metrics?.totalOrders || 0),
    scheduledOrders: Number(metrics?.scheduledOrders || 0),
    immediateOrders: Number(metrics?.immediateOrders || 0),
    totalRevenue: Number(metrics?.totalRevenue || 0),
    activeDeliveries: Number(metrics?.activeDeliveries || 0),
    deliveredRate: Number(metrics?.deliveredRate || 0),
    cancelRate: Number(metrics?.cancelRate || 0),
    avgTicket: Number(metrics?.avgTicket || 0),
  };
}

export function normalizeAdminDashboardData(data = {}) {
  return {
    orders: ensureObjectArray(data?.orders),
    immediateOrders: ensureObjectArray(data?.immediateOrders),
    scheduledOrders: ensureObjectArray(data?.scheduledOrders),
    deliveries: ensureObjectArray(data?.deliveries),
    stores: ensureObjectArray(data?.stores),
    storeTypes: ensureObjectArray(data?.storeTypes),
    requests: ensureObjectArray(data?.requests),
    metrics: normalizeAdminMetrics(data?.metrics),
    series: {
      byDay: ensureObjectArray(data?.series?.byDay),
      byHour: ensureObjectArray(data?.series?.byHour),
    },
    storePerformance: ensureObjectArray(data?.storePerformance),
    slaAlerts: ensureObjectArray(data?.slaAlerts),
    liveOrders: ensureObjectArray(data?.liveOrders),
    error: String(data?.error || ""),
  };
}

export function getToneTagClass(tone) {
  if (tone === "success") return "tag ok";
  if (tone === "danger") return "tag bad";
  return "tag warn";
}

export function getDeliveryStatusView(status) {
  const normalized = String(status || "").trim().toUpperCase();
  const labelMap = {
    CREATED: "Criada",
    PENDING: "Pendente",
    CONFIRMED: "Confirmada",
    ASSIGNED: "Atribuida",
    DISPATCHED: "Enviado",
    OUT_FOR_DELIVERY: "Em entrega",
    DELIVERED: "Entregue",
    FAILED: "Falhada",
    CANCELLED: "Cancelada",
  };
  const toneMap = {
    DELIVERED: "success",
    FAILED: "danger",
    CANCELLED: "danger",
  };

  return {
    label: labelMap[normalized] || normalized || "-",
    className: getToneTagClass(toneMap[normalized] || "warning"),
  };
}

export function handleRowKeyDown(event, action) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

export function formatOrderDeliverySlot(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getScheduledOperationalStateView(order) {
  const normalized = String(order?.scheduled_operational_state || "").trim().toLowerCase();
  if (!normalized) return null;

  const labelMap = {
    agendado: "Agendado",
    a_liberar: "A libertar",
    na_fila_imediata: "Na fila imediata",
  };

  const toneMap = {
    agendado: "warning",
    a_liberar: "warning",
    na_fila_imediata: "success",
  };

  return {
    label: labelMap[normalized] || normalized,
    className: getToneTagClass(toneMap[normalized] || "warning"),
  };
}

export function hasAssignedDriver(order) {
  return Boolean(String(order?.driver_name || "").trim());
}

export function isDriverAssignmentSlaBreached(order) {
  if (resolveOrderEstadoInterno(order) !== "aceite") return false;
  if (hasAssignedDriver(order)) return false;

  const acceptedAt = new Date(order?.aceite_em || order?.updated_at || order?.created_at || 0).getTime();
  if (!Number.isFinite(acceptedAt)) return false;

  return Date.now() - acceptedAt >= ACCEPTED_WITHOUT_DRIVER_SLA_MS;
}

export function buildWindowInput({ rangeMode, periodDays, customRange }) {
  if (rangeMode === "custom") {
    return {
      periodDays,
      dateFrom: customRange?.from || null,
      dateTo: customRange?.to || null,
    };
  }

  return periodDays;
}

export function buildPerformanceSearchParams({ periodDays, rangeMode, customRange, granularity = "day" }) {
  const params = new URLSearchParams();
  params.set("granularity", granularity);

  if (rangeMode === "custom") {
    params.set("mode", "custom");
    if (customRange?.from) params.set("from", customRange.from);
    if (customRange?.to) params.set("to", customRange.to);
    params.set("days", String(periodDays));
    return params.toString();
  }

  params.set("days", String(periodDays));
  return params.toString();
}

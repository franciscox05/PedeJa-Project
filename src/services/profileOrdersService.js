import { supabase } from "./supabaseClient";
import { extractUserId } from "../utils/roles";
import {
  getEstadoInternoLabelPt,
  getEstadoInternoTone,
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

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function normalizeOrderRow(order, lojaNameMap) {
  const estadoInterno = resolveOrderEstadoInterno(order);
  const estadoTone = getEstadoInternoTone(estadoInterno);
  const isCanceled = estadoInterno === "cancelado";
  const isDelivered = estadoInterno === "entregue";
  const statusInfo = {
    raw: String(order?.status || "").toUpperCase(),
    label: getEstadoInternoLabelPt(estadoInterno),
    tone: mapEstadoToneToUi(estadoTone),
    group: isDelivered ? "COMPLETED" : (isCanceled ? "CANCELED" : "OPEN"),
  };

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
  };
}

async function fetchOwnOrders(callerUserId, limit) {
  if (!Number.isFinite(callerUserId)) return [];

  const { data, error } = await supabase.rpc("customer_list_own_orders", {
    caller_user_id: callerUserId,
    limit_count: Number.isFinite(limit) && Number(limit) > 0 ? Number(limit) : 100,
  });

  if (error) {
    console.error("Erro ao buscar pedidos do cliente:", error);
    return [];
  }

  return data || [];
}

export async function fetchProfileOrders(user, { limit = 100 } = {}) {
  const callerUserId = Number(extractUserId(user));

  if (!Number.isFinite(callerUserId)) {
    return { summary: EMPTY_SUMMARY, orders: [] };
  }

  const orderRows = uniqueOrderRows(await fetchOwnOrders(callerUserId, limit));

  if (!orderRows.length) {
    return { summary: EMPTY_SUMMARY, orders: [] };
  }

  const lojaIds = [...new Set(orderRows.map((order) => order.loja_id).filter(Boolean))];

  const lojasResponse = lojaIds.length
    ? await supabase.from("lojas").select("idloja, nome").in("idloja", lojaIds)
    : { data: [], error: null };

  if (lojasResponse?.error) {
    console.error("Erro ao buscar nomes das lojas:", lojasResponse.error);
  }

  const lojaNameMap = new Map(
    (lojasResponse?.data || []).map((loja) => [String(loja.idloja), loja.nome || `Loja ${loja.idloja}`]),
  );

  const orders = orderRows.map((order) => normalizeOrderRow(order, lojaNameMap));
  const summary = buildSummary(orders);

  return { summary, orders };
}

import { supabase } from "./supabaseClient";
import { extractRestaurantId, extractUserId } from "../utils/roles";
import { assertSupabaseClientAvailable } from "./supabaseClient";
import { isStoreOpenNow } from "../utils/storeHours";
import { mapEstadoInternoToLegacyStatus, mapLegacyStatusToEstadoInterno, resolveOrderEstadoInterno } from "./orderStatusMapper";
import { createShipdayOrderForOrder, syncOrderStatusWithShipday, updateShipdayOrderStatus } from "./shipdayService";
import { sanitizeCommissionConfig } from "./pricingService";

const ORDER_SELECT_FULL = "id, loja_id, customer_nome, customer_address, customer_lat, customer_lng, total, status, estado_interno, shipday_order_id, shipday_tracking_url, driver_name, driver_phone, created_at, updated_at";
const ORDER_SELECT_BASIC = "id, loja_id, customer_nome, customer_address, total, status, estado_interno, shipday_order_id, shipday_tracking_url, driver_name, driver_phone, created_at, updated_at";
const ORDER_SELECT_FULL_LEGACY = "id, loja_id, customer_nome, customer_address, customer_lat, customer_lng, total, status, created_at, updated_at";
const ORDER_SELECT_BASIC_LEGACY = "id, loja_id, customer_nome, customer_address, total, status, created_at, updated_at";
const DELIVERY_SELECT_ADMIN = "id, order_id, external_delivery_id, status, tracking_url, shipday_error, provider_payload, created_at";
const DELIVERY_SELECT_RESTAURANT = "id, order_id, status, tracking_url, shipday_error, provider_payload, created_at";
const STORE_SELECT_WITH_SETTINGS = "idloja, nome, ativo, aceitacao_automatica_pedidos, comissao_pedeja_percent, configuracoes_comissao";
const STORE_SELECT_LEGACY_SETTINGS = "idloja, nome, ativo, aceitacao_automatica_pedidos, comissao_pedeja_percent";
const STORE_SELECT_BASIC = "idloja, nome, ativo";
const COMMISSION_MENU_SELECT = `
  idmenu,
  idloja,
  nome,
  idtipomenu,
  tiposmenu (
    tipomenu
  )
`;

function safeNumber(value) {
  return Number(value || 0);
}

function isMissingOrderColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("column")
    && message.includes("orders")
    && (
      message.includes("estado_interno")
      || message.includes("shipday_order_id")
      || message.includes("shipday_tracking_url")
      || message.includes("driver_name")
      || message.includes("driver_phone")
    );
}

function withOrderCompatibility(rows = []) {
  return (rows || []).map((order) => ({
    ...order,
    estado_interno: order?.estado_interno || mapLegacyStatusToEstadoInterno(order?.status) || "pendente",
    shipday_order_id: order?.shipday_order_id || null,
    shipday_tracking_url: order?.shipday_tracking_url || null,
    driver_name: order?.driver_name || null,
    driver_phone: order?.driver_phone || null,
  }));
}

function isMissingStoreSettingsColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("column")
    && (
      message.includes("aceitacao_automatica_pedidos")
      || message.includes("comissao_pedeja_percent")
      || message.includes("configuracoes_comissao")
    );
}

function withStoreSettingsCompatibility(rows = []) {
  return (rows || []).map((store) => {
    const commission = Number(store?.comissao_pedeja_percent);
    const normalizedCommission = Number.isFinite(commission) ? commission : 0;

    return {
      ...store,
      aceitacao_automatica_pedidos: Boolean(store?.aceitacao_automatica_pedidos),
      comissao_pedeja_percent: normalizedCommission,
      configuracoes_comissao: sanitizeCommissionConfig(store?.configuracoes_comissao, normalizedCommission),
    };
  });
}

function emptyMetrics() {
  return {
    totalOrders: 0,
    totalRevenue: 0,
    activeDeliveries: 0,
    deliveredRate: 0,
    cancelRate: 0,
    avgTicket: 0,
  };
}

function daysToIso(days) {
  const date = new Date();
  date.setDate(date.getDate() - Number(days || 7));
  return date.toISOString();
}

function formatDay(value) {
  return new Date(value).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

function formatHour(value) {
  return new Date(value).getHours();
}

function normalizeLojaId(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : String(value).trim();
}

function normalizeCommissionValue(value) {
  const parsed = Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error("A comissao PedeJa deve estar entre 0 e 100.");
  }

  return Number(parsed.toFixed(2));
}

function getOrderWorkflowStatus(order) {
  return resolveOrderEstadoInterno(order);
}

async function resolveDefaultRestaurantTypeId() {
  const { data, error } = await supabase
    .from("tiposloja")
    .select("idtipoloja, tipoloja, descricao")
    .order("idtipoloja", { ascending: true });

  if (error) throw error;

  const rows = data || [];
  const bySlug = rows.find((row) => /restaur/i.test(String(row.tipoloja || "")));
  if (bySlug?.idtipoloja) return Number(bySlug.idtipoloja);

  const byDesc = rows.find((row) => /restaur/i.test(String(row.descricao || "")));
  if (byDesc?.idtipoloja) return Number(byDesc.idtipoloja);

  return rows[0]?.idtipoloja ? Number(rows[0].idtipoloja) : null;
}

async function resolveStoreTypeIdForRequest(request) {
  const direct = Number(request?.idtipoloja);
  if (Number.isFinite(direct)) return direct;
  return resolveDefaultRestaurantTypeId();
}

export async function fetchStoresWithAdminSettings({ lojaId = null } = {}) {
  const normalizedLojaId = normalizeLojaId(lojaId);

  let storeQuery = supabase
    .from("lojas")
    .select(STORE_SELECT_WITH_SETTINGS)
    .order("idloja", { ascending: true });

  if (normalizedLojaId !== null) {
    storeQuery = storeQuery.eq("idloja", normalizedLojaId);
  }

  let response = await storeQuery;

  if (response.error && isMissingStoreSettingsColumnError(response.error)) {
    let fallbackQuery = supabase
      .from("lojas")
      .select(STORE_SELECT_LEGACY_SETTINGS)
      .order("idloja", { ascending: true });

    if (normalizedLojaId !== null) {
      fallbackQuery = fallbackQuery.eq("idloja", normalizedLojaId);
    }

    response = await fallbackQuery;

    if (response.error && isMissingStoreSettingsColumnError(response.error)) {
      let basicFallbackQuery = supabase
        .from("lojas")
        .select(STORE_SELECT_BASIC)
        .order("idloja", { ascending: true });

      if (normalizedLojaId !== null) {
        basicFallbackQuery = basicFallbackQuery.eq("idloja", normalizedLojaId);
      }

      response = await basicFallbackQuery;
    }
  }

  if (response.error) throw response.error;

  return withStoreSettingsCompatibility(response.data || []);
}

export async function updateRestaurantAdminSettings(lojaId, patch = {}) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  if (normalizedLojaId === null) {
    throw new Error("Loja invalida para atualizar configuracao.");
  }

  const updatePayload = {};

  if (Object.prototype.hasOwnProperty.call(patch, "aceitacao_automatica_pedidos")) {
    updatePayload.aceitacao_automatica_pedidos = Boolean(patch.aceitacao_automatica_pedidos);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "comissao_pedeja_percent")) {
    updatePayload.comissao_pedeja_percent = normalizeCommissionValue(patch.comissao_pedeja_percent);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "configuracoes_comissao")) {
    const fallbackGlobalPercent = Object.prototype.hasOwnProperty.call(updatePayload, "comissao_pedeja_percent")
      ? updatePayload.comissao_pedeja_percent
      : patch?.configuracoes_comissao?.global_percent;
    updatePayload.configuracoes_comissao = sanitizeCommissionConfig(
      patch.configuracoes_comissao,
      fallbackGlobalPercent ?? 0,
    );
  }

  if (Object.keys(updatePayload).length === 0) {
    return null;
  }

  const { data, error } = await supabase
    .from("lojas")
    .update(updatePayload)
    .eq("idloja", normalizedLojaId)
    .select(STORE_SELECT_WITH_SETTINGS)
    .maybeSingle();

  if (error) {
    if (isMissingStoreSettingsColumnError(error)) {
      throw new Error("As colunas de configuracao ainda nao existem. Executa a migration 009_dashboard_restaurant_settings.sql.");
    }

    throw error;
  }

  return withStoreSettingsCompatibility(data ? [data] : [])[0] || null;
}

export async function fetchStoreCommissionCatalog(lojaId) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  if (normalizedLojaId === null) {
    return { categories: [], items: [] };
  }

  const { data, error } = await supabase
    .from("menus")
    .select(COMMISSION_MENU_SELECT)
    .eq("idloja", normalizedLojaId)
    .order("idtipomenu", { ascending: true })
    .order("nome", { ascending: true });

  if (error) throw error;

  const categoryMap = new Map();
  const items = (data || []).map((menuItem) => {
    const relation = Array.isArray(menuItem?.tiposmenu)
      ? menuItem.tiposmenu[0]
      : menuItem?.tiposmenu;
    const categoryName = String(relation?.tipomenu || "Geral").trim() || "Geral";

    categoryMap.set(categoryName.toLowerCase(), categoryName);

    return {
      idmenu: menuItem.idmenu,
      nome: menuItem.nome || `Prato ${menuItem.idmenu}`,
      categoria: categoryName,
    };
  });

  return {
    categories: Array.from(categoryMap.values()).sort((a, b) => a.localeCompare(b, "pt-PT")),
    items,
  };
}

function buildMetrics(orders, deliveries) {
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((acc, order) => acc + safeNumber(order.total), 0);
  const deliveredOrders = orders.filter((order) => getOrderWorkflowStatus(order) === "entregue").length;
  const cancelledOrders = orders.filter((order) => getOrderWorkflowStatus(order) === "cancelado").length;

  return {
    totalOrders,
    totalRevenue,
    activeDeliveries: deliveries.filter((d) => !["DELIVERED", "FAILED", "CANCELLED"].includes(String(d.status || "").toUpperCase())).length,
    deliveredRate: totalOrders ? (deliveredOrders / totalOrders) * 100 : 0,
    cancelRate: totalOrders ? (cancelledOrders / totalOrders) * 100 : 0,
    avgTicket: totalOrders ? totalRevenue / totalOrders : 0,
  };
}

function buildSeries(orders) {
  const dailyMap = new Map();
  const hourlyMap = new Map();

  orders.forEach((order) => {
    const day = formatDay(order.created_at);
    const hour = formatHour(order.created_at);

    if (!dailyMap.has(day)) {
      dailyMap.set(day, { day, orders: 0, revenue: 0 });
    }

    if (!hourlyMap.has(hour)) {
      hourlyMap.set(hour, { hour, orders: 0 });
    }

    const dayEntry = dailyMap.get(day);
    dayEntry.orders += 1;
    dayEntry.revenue += safeNumber(order.total);

    const hourEntry = hourlyMap.get(hour);
    hourEntry.orders += 1;
  });

  const byDay = Array.from(dailyMap.values()).sort((a, b) => {
    const [da, ma] = a.day.split("/").map(Number);
    const [db, mb] = b.day.split("/").map(Number);
    return ma === mb ? da - db : ma - mb;
  });

  const byHour = Array.from({ length: 24 }, (_, hour) => {
    const current = hourlyMap.get(hour);
    return { hour, orders: current?.orders || 0 };
  });

  return { byDay, byHour };
}

function buildStorePerformance(orders, stores) {
  const storeMap = new Map((stores || []).map((store) => [String(store.idloja), store.nome]));
  const metricsByStore = new Map();

  orders.forEach((order) => {
    const key = String(order.loja_id || "unknown");
    if (!metricsByStore.has(key)) {
      metricsByStore.set(key, {
        lojaId: key,
        lojaNome: storeMap.get(key) || `Loja ${key}`,
        orders: 0,
        revenue: 0,
        delivered: 0,
      });
    }

    const item = metricsByStore.get(key);
    item.orders += 1;
    item.revenue += safeNumber(order.total);
    if (getOrderWorkflowStatus(order) === "entregue") item.delivered += 1;
  });

  return Array.from(metricsByStore.values())
    .map((store) => ({
      ...store,
      deliveredRate: store.orders ? (store.delivered / store.orders) * 100 : 0,
      avgTicket: store.orders ? store.revenue / store.orders : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
}

function buildSlaAlerts(orders) {
  const now = Date.now();
  const thresholds = {
    pendente: 15,
    aceite: 20,
    atribuindo_estafeta: 25,
    estafeta_aceitou: 30,
    em_preparacao: 35,
    pronto_recolha: 50,
    recolhido: 70,
    a_caminho: 80,
  };

  return orders
    .map((order) => ({ order, estado: getOrderWorkflowStatus(order) }))
    .filter((entry) => !["entregue", "cancelado"].includes(entry.estado))
    .map(({ order, estado }) => {
      const elapsedMinutes = Math.floor((now - new Date(order.created_at).getTime()) / 60000);
      const threshold = thresholds[estado] || 45;
      const breached = elapsedMinutes > threshold;
      return {
        id: order.id,
        customer_nome: order.customer_nome,
        loja_id: order.loja_id,
        status: estado,
        elapsedMinutes,
        threshold,
        breached,
      };
    })
    .filter((item) => item.breached)
    .sort((a, b) => b.elapsedMinutes - a.elapsedMinutes)
    .slice(0, 12);
}

function buildLiveOrders(orders, stores) {
  const storeMap = new Map((stores || []).map((store) => [String(store.idloja), store.nome]));

  return orders
    .filter((order) => !["entregue", "cancelado"].includes(getOrderWorkflowStatus(order)))
    .filter((order) => order.customer_lat !== null && order.customer_lng !== null)
    .map((order) => ({
      id: order.id,
      loja_id: order.loja_id,
      loja_nome: storeMap.get(String(order.loja_id)) || `Loja ${order.loja_id}`,
      customer_nome: order.customer_nome,
      status: getOrderWorkflowStatus(order),
      lat: safeNumber(order.customer_lat),
      lng: safeNumber(order.customer_lng),
      address: order.customer_address,
    }));
}

function withOrderFilters(query, { since = null, lojaId = null } = {}) {
  let nextQuery = query;

  if (since) {
    nextQuery = nextQuery.gte("created_at", since);
  }

  if (lojaId !== null && lojaId !== undefined && lojaId !== "") {
    nextQuery = nextQuery.eq("loja_id", normalizeLojaId(lojaId));
  }

  return nextQuery;
}

async function queryOrdersRaw({ since = null, lojaId = null, limit = 220, basic = false } = {}) {
  const select = basic ? ORDER_SELECT_BASIC : ORDER_SELECT_FULL;
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("orders")
    .select(select)
    .lte("created_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(limit);

  query = withOrderFilters(query, { since, lojaId });

  const response = await query;
  if (!response.error) {
    const normalizedRows = withOrderCompatibility(response.data || []);
    return basic
      ? {
        data: normalizedRows.map((order) => ({ ...order, customer_lat: null, customer_lng: null })),
        error: null,
      }
      : { data: normalizedRows, error: null };
  }

  if (isMissingOrderColumnError(response.error)) {
    const legacySelect = basic ? ORDER_SELECT_BASIC_LEGACY : ORDER_SELECT_FULL_LEGACY;

    let legacyQuery = supabase
      .from("orders")
      .select(legacySelect)
      .lte("created_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(limit);

    legacyQuery = withOrderFilters(legacyQuery, { since, lojaId });

    const legacyResponse = await legacyQuery;
    if (!legacyResponse.error) {
      const normalizedLegacyRows = withOrderCompatibility(legacyResponse.data || []);
      return basic
        ? {
          data: normalizedLegacyRows.map((order) => ({ ...order, customer_lat: null, customer_lng: null })),
          error: null,
        }
        : { data: normalizedLegacyRows, error: null };
    }
  }

  if (!basic) {
    return queryOrdersRaw({ since, lojaId, limit, basic: true });
  }

  return response;
}

async function fetchOrdersForDashboard({ since = null, lojaId = null, limit = 220 } = {}) {
  const withPeriod = await queryOrdersRaw({ since, lojaId, limit });
  if (withPeriod.error) return withPeriod;

  const scopedRows = withPeriod.data || [];
  if (scopedRows.length > 0 || !since) {
    return { data: scopedRows, error: null };
  }

  const withoutPeriod = await queryOrdersRaw({ since: null, lojaId, limit });
  if (withoutPeriod.error) return withoutPeriod;

  return { data: withoutPeriod.data || [], error: null };
}

async function fetchDeliveriesForDashboard({ since = null, limit = 220 } = {}) {
  let query = supabase
    .from("deliveries")
    .select(DELIVERY_SELECT_ADMIN)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (since) {
    query = query.gte("created_at", since);
  }

  const scoped = await query;
  if (scoped.error) return scoped;

  const scopedRows = scoped.data || [];
  if (scopedRows.length > 0 || !since) {
    return scoped;
  }

  return supabase
    .from("deliveries")
    .select(DELIVERY_SELECT_ADMIN)
    .order("created_at", { ascending: false })
    .limit(limit);
}

export async function resolveRestaurantStoreId(user) {
  const direct = extractRestaurantId(user);
  if (direct) return String(direct);

  const numericUserId = extractUserId(user);
  const normalizedNumericUserId = numericUserId ? Number(numericUserId) : null;

  if (Number.isFinite(normalizedNumericUserId)) {
    const { data: lojaByOwner, error: lojaByOwnerError } = await supabase
      .from("lojas")
      .select("idloja")
      .eq("idutilizador", normalizedNumericUserId)
      .order("idloja", { ascending: true })
      .limit(1);

    if (!lojaByOwnerError && lojaByOwner && lojaByOwner.length > 0) {
      return String(lojaByOwner[0].idloja);
    }
  }

  const candidateIds = Array.from(
    new Set(
      [
        extractUserId(user),
        user?.id,
        user?.idutilizador,
        user?.user_id,
        user?.email,
        user?.username,
      ]
        .filter(Boolean)
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  );

  for (const candidate of candidateIds) {
    const { data, error } = await supabase
      .from("restaurant_staff_access")
      .select("loja_id, created_at")
      .eq("user_id", candidate)
      .order("created_at", { ascending: true })
      .limit(1);

    if (!error && data && data.length > 0) {
      return String(data[0].loja_id);
    }
  }

  return null;
}

export async function fetchAdminDashboard(periodDays = 7) {
  const since = daysToIso(periodDays);

  try {
    const [ordersRes, deliveriesRes, storesRes, requestsRes, storeTypesRes] = await Promise.all([
      fetchOrdersForDashboard({ since, limit: 300 }),
      fetchDeliveriesForDashboard({ since, limit: 300 }),
      fetchStoresWithAdminSettings(),
      supabase
        .from("restaurant_signup_requests")
        .select("id, nome, email, telefone, restaurante_nome, nif, morada_completa, horario_funcionamento, latitude, longitude, place_id, user_id, idtipoloja, imagemfundo, icon, status, created_at")
        .eq("status", "PENDING")
        .order("created_at", { ascending: true }),
      supabase
        .from("tiposloja")
        .select("idtipoloja, tipoloja, descricao")
        .order("idtipoloja", { ascending: true }),
    ]);

    if (ordersRes.error) throw ordersRes.error;
    if (deliveriesRes.error) throw deliveriesRes.error;

    const orders = ordersRes.data || [];
    const deliveries = deliveriesRes.data || [];
    const stores = storesRes || [];

    return {
      orders,
      deliveries,
      stores,
      requests: requestsRes.error ? [] : (requestsRes.data || []),
      storeTypes: storeTypesRes.error ? [] : (storeTypesRes.data || []),
      metrics: buildMetrics(orders, deliveries),
      series: buildSeries(orders),
      storePerformance: buildStorePerformance(orders, stores),
      slaAlerts: buildSlaAlerts(orders),
      liveOrders: buildLiveOrders(orders, stores),
    };
  } catch (error) {
    return {
      orders: [],
      deliveries: [],
      stores: [],
      requests: [],
      storeTypes: [],
      metrics: emptyMetrics(),
      series: { byDay: [], byHour: [] },
      storePerformance: [],
      slaAlerts: [],
      liveOrders: [],
      error: error.message,
    };
  }
}

export async function fetchRestaurantDashboard({ lojaId, periodDays = 7 }) {
  const normalizedLojaId = normalizeLojaId(lojaId);

  if (!normalizedLojaId) {
    return {
      orders: [],
      deliveries: [],
      metrics: emptyMetrics(),
      series: { byDay: [], byHour: [] },
      slaAlerts: [],
      liveOrders: [],
    };
  }

  const since = daysToIso(periodDays);

  try {
    const ordersRes = await fetchOrdersForDashboard({ since, lojaId: normalizedLojaId, limit: 300 });
    if (ordersRes.error) throw ordersRes.error;

    const orders = ordersRes.data || [];
    const orderIds = orders.map((order) => order.id);

    let deliveries = [];
    if (orderIds.length > 0) {
      let deliveryQuery = supabase
        .from("deliveries")
        .select(DELIVERY_SELECT_RESTAURANT)
        .in("order_id", orderIds)
        .order("created_at", { ascending: false })
        .limit(300);

      if (since) {
        deliveryQuery = deliveryQuery.gte("created_at", since);
      }

      const scopedDeliveries = await deliveryQuery;
      if (scopedDeliveries.error) throw scopedDeliveries.error;

      deliveries = scopedDeliveries.data || [];

      if (deliveries.length === 0 && since) {
        const fallbackDeliveries = await supabase
          .from("deliveries")
          .select(DELIVERY_SELECT_RESTAURANT)
          .in("order_id", orderIds)
          .order("created_at", { ascending: false })
          .limit(300);

        if (!fallbackDeliveries.error) {
          deliveries = fallbackDeliveries.data || [];
        }
      }
    }

    return {
      orders,
      deliveries,
      metrics: buildMetrics(orders, deliveries),
      series: buildSeries(orders),
      slaAlerts: buildSlaAlerts(orders),
      liveOrders: buildLiveOrders(orders, [{ idloja: normalizedLojaId, nome: `Loja ${normalizedLojaId}` }]),
    };
  } catch (error) {
    return {
      orders: [],
      deliveries: [],
      metrics: emptyMetrics(),
      series: { byDay: [], byHour: [] },
      slaAlerts: [],
      liveOrders: [],
      error: error.message,
    };
  }
}

export async function updateOrderWorkflowStatus(orderId, estadoInterno, lojaId = null, options = {}) {
  assertSupabaseClientAvailable("opsDashboardService.updateOrderWorkflowStatus");

  const mappedFromLegacy = mapLegacyStatusToEstadoInterno(estadoInterno);
  const normalizedEstado = mappedFromLegacy || String(estadoInterno || "").trim().toLowerCase();

  const validEstados = [
    "pendente",
    "aceite",
    "atribuindo_estafeta",
    "estafeta_aceitou",
    "em_preparacao",
    "pronto_recolha",
    "recolhido",
    "a_caminho",
    "entregue",
    "cancelado",
  ];

  if (!validEstados.includes(normalizedEstado)) {
    throw new Error(`Estado interno invalido: ${estadoInterno}`);
  }

  const normalizedLojaId = normalizeLojaId(lojaId);

  let lookupQuery = supabase
    .from("orders")
    .select("id, loja_id, estado_interno, status, shipday_order_id, shipday_tracking_url, driver_name, driver_phone")
    .eq("id", orderId);

  if (normalizedLojaId) {
    lookupQuery = lookupQuery.eq("loja_id", normalizedLojaId);
  }

  const { data: currentOrder, error: lookupError } = await lookupQuery.maybeSingle();
  if (lookupError) {
    console.error("Erro ao consultar pedido antes de atualizar workflow", {
      orderId,
      lojaId: normalizedLojaId,
      estadoInterno: normalizedEstado,
      response: {
        code: lookupError.code || null,
        message: lookupError.message || null,
        details: lookupError.details || null,
        hint: lookupError.hint || null,
      },
    });
    throw lookupError;
  }
  if (!currentOrder) {
    throw new Error("Pedido nao encontrado para esta loja.");
  }

  if (normalizedEstado === "em_preparacao") {
    const hasDriver = String(currentOrder.driver_name || "").trim().length > 0;
    if (!hasDriver) {
      throw new Error("Aguarde que um estafeta seja atribuido antes de comecar a preparar.");
    }
  }

  const legacyStatus = mapEstadoInternoToLegacyStatus(normalizedEstado);
  const patch = {
    estado_interno: normalizedEstado,
    updated_at: new Date().toISOString(),
  };

  if (legacyStatus) {
    patch.status = legacyStatus;
  }

  let updateQuery = supabase
    .from("orders")
    .update(patch)
    .eq("id", orderId);

  if (normalizedLojaId) {
    updateQuery = updateQuery.eq("loja_id", normalizedLojaId);
  }

  const { data, error } = await updateQuery
    .select("id, loja_id, estado_interno, status, shipday_order_id, shipday_tracking_url, driver_name, driver_phone")
    .maybeSingle();

  if (error) {
    console.error("Erro ao atualizar workflow do pedido", {
      orderId,
      lojaId: normalizedLojaId,
      estadoInterno: normalizedEstado,
      patch,
      response: {
        code: error.code || null,
        message: error.message || null,
        details: error.details || null,
        hint: error.hint || null,
      },
    });
    throw error;
  }
  if (!data) {
    throw new Error("Pedido nao encontrado para esta loja.");
  }

  const shouldSyncShipday = options.syncShipday !== false;
  let shipdaySync = { ok: false, skipped: true, reason: "shipday_sync_desativado" };

  if (shouldSyncShipday) {
    if (normalizedEstado === "aceite") {
      try {
        shipdaySync = await createShipdayOrderForOrder({ orderId: data.id });
      } catch (shipdayCreateError) {
        const rollbackEstado = resolveOrderEstadoInterno(currentOrder);
        const rollbackPatch = {
          estado_interno: rollbackEstado,
          updated_at: new Date().toISOString(),
        };
        const rollbackLegacyStatus = mapEstadoInternoToLegacyStatus(rollbackEstado);
        if (rollbackLegacyStatus) rollbackPatch.status = rollbackLegacyStatus;

        await supabase
          .from("orders")
          .update(rollbackPatch)
          .eq("id", data.id);

        throw shipdayCreateError;
      }
    } else if (normalizedEstado === "pronto_recolha" || normalizedEstado === "em_preparacao") {
      shipdaySync = await updateShipdayOrderStatus({
        shipdayOrderId: data.shipday_order_id,
        newStatus: normalizedEstado,
        orderId: data.id,
        lojaId: data.loja_id,
      });
    } else if (data.shipday_order_id && normalizedEstado === "cancelado") {
      shipdaySync = await syncOrderStatusWithShipday({
        orderId: data.id,
        lojaId: data.loja_id,
        shipdayOrderId: data.shipday_order_id,
        estadoInterno: normalizedEstado,
      });
    } else {
      shipdaySync = { ok: false, skipped: true, reason: "estado_sem_sync_direto" };
    }
  }

  return { order: data, shipdaySync };
}

export async function updateOrderStatus(orderId, status, lojaId = null) {
  const mappedEstado = mapLegacyStatusToEstadoInterno(status);

  if (mappedEstado) {
    return updateOrderWorkflowStatus(orderId, mappedEstado, lojaId, { syncShipday: false });
  }

  let query = supabase
    .from("orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", orderId);

  const normalizedLojaId = normalizeLojaId(lojaId);
  if (normalizedLojaId) {
    query = query.eq("loja_id", normalizedLojaId);
  }

  const { data, error } = await query.select("id");

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Pedido nao encontrado para esta loja.");
  }

  return { order: { id: orderId, status }, shipdaySync: { ok: false, skipped: true, reason: "legacy_update" } };
}

export async function fetchDevDashboard(periodDays = 7) {
  const since = daysToIso(periodDays);

  try {
    const [eventsRes, deliveriesRes] = await Promise.all([
      supabase
        .from("delivery_events")
        .select("id, event_id, event_type, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("deliveries")
        .select("id, order_id, external_delivery_id, status, shipday_error, provider_payload, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    if (eventsRes.error) throw eventsRes.error;
    if (deliveriesRes.error) throw deliveriesRes.error;

    const deliveries = deliveriesRes.data || [];
    const failed = deliveries.filter((d) => d.status === "FAILED").length;

    return {
      events: eventsRes.data || [],
      deliveries,
      metrics: {
        webhookEvents: (eventsRes.data || []).length,
        failedDeliveries: failed,
        latestDeliveryStatus: deliveries[0]?.status || "N/A",
      },
    };
  } catch (error) {
    return {
      events: [],
      deliveries: [],
      metrics: { webhookEvents: 0, failedDeliveries: 0, latestDeliveryStatus: "N/A" },
      error: error.message,
    };
  }
}

export async function createRestaurantSignupRequest(payload) {
  const { data, error } = await supabase
    .from("restaurant_signup_requests")
    .insert({
      nome: payload.nome,
      email: payload.email,
      telefone: payload.telefone || null,
      restaurante_nome: payload.restaurante_nome,
      nif: payload.nif || null,
      cidade: payload.cidade || null,
      morada_completa: payload.morada_completa || null,
      horario_funcionamento: payload.horario_funcionamento || null,
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      place_id: payload.place_id || null,
      idtipoloja: payload.idtipoloja ? Number(payload.idtipoloja) : null,
      imagemfundo: payload.imagemfundo || null,
      icon: payload.icon || null,
      user_id: payload.user_id || payload.email || null,
      status: "PENDING",
    })
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

function normalizeStoreNameForMatch(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(cafe|caff?e|restaurante|restaurant|lda|unipessoal|snack|bar)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickBestStoreCandidate(candidates, requestedName) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const target = normalizeStoreNameForMatch(requestedName);

  const scored = candidates.map((candidate) => {
    const candidateName = normalizeStoreNameForMatch(candidate.nome);

    let score = 0;
    if (candidateName && target && candidateName === target) score = 100;
    else if (candidateName && target && (candidateName.startsWith(target) || target.startsWith(candidateName))) score = 80;
    else if (candidateName && target && (candidateName.includes(target) || target.includes(candidateName))) score = 60;
    else if (candidateName && target) {
      const targetTokens = target.split(" ").filter((token) => token.length >= 3);
      const common = targetTokens.filter((token) => candidateName.includes(token)).length;
      score = common * 10;
    }

    return { candidate, score };
  });

  scored.sort((a, b) => b.score - a.score || Number(a.candidate.idloja) - Number(b.candidate.idloja));
  return scored[0]?.score > 0 ? scored[0].candidate : null;
}

async function resolveExistingStoreIdForApproval({ request, ownerUserId, currentLojaId }) {
  if (currentLojaId) {
    const { data: lojaById, error: lojaByIdError } = await supabase
      .from("lojas")
      .select("idloja")
      .eq("idloja", currentLojaId)
      .maybeSingle();

    if (lojaByIdError) throw lojaByIdError;
    if (lojaById?.idloja) return lojaById.idloja;
  }

  if (Number.isFinite(ownerUserId)) {
    const { data: ownerStore, error: ownerStoreError } = await supabase
      .from("lojas")
      .select("idloja")
      .eq("idutilizador", ownerUserId)
      .order("idloja", { ascending: true })
      .limit(1);

    if (ownerStoreError) throw ownerStoreError;
    if (ownerStore && ownerStore.length > 0) {
      return ownerStore[0].idloja;
    }
  }

  const requestedName = String(request?.restaurante_nome || "").trim();
  if (!requestedName) return null;

  const candidates = [];
  const uniqueIds = new Set();
  const addCandidates = (rows) => {
    (rows || []).forEach((row) => {
      if (!row?.idloja || uniqueIds.has(row.idloja)) return;
      uniqueIds.add(row.idloja);
      candidates.push(row);
    });
  };

  const { data: byName, error: byNameError } = await supabase
    .from("lojas")
    .select("idloja, nome, idutilizador")
    .ilike("nome", `%${requestedName}%`)
    .limit(20);

  if (byNameError) throw byNameError;
  addCandidates(byName);

  if (candidates.length === 0) {
    const token = normalizeStoreNameForMatch(requestedName)
      .split(" ")
      .find((part) => part.length >= 3);

    if (token) {
      const { data: byToken, error: byTokenError } = await supabase
        .from("lojas")
        .select("idloja, nome, idutilizador")
        .ilike("nome", `%${token}%`)
        .limit(20);

      if (byTokenError) throw byTokenError;
      addCandidates(byToken);
    }
  }

  if (candidates.length === 0) return null;

  if (Number.isFinite(ownerUserId)) {
    const ownerCandidate = candidates.find((candidate) => Number(candidate.idutilizador) === Number(ownerUserId));
    if (ownerCandidate) return ownerCandidate.idloja;
  }

  const best = pickBestStoreCandidate(candidates, requestedName);
  return best?.idloja || null;
}

export async function updateRestaurantSignupRequest(requestId, status, reviewedBy = null) {
  const { data: request, error: requestError } = await supabase
    .from("restaurant_signup_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (requestError) throw requestError;

  const normalizedStatus = String(status || "").toUpperCase();
  let lojaId = request.loja_id || null;
  let provisionError = null;

  if (normalizedStatus === "APPROVED") {
    try {
      let moradaId = null;
      if (request.morada_completa) {
        const { data: morada, error: moradaError } = await supabase
          .from("moradas")
          .insert({
            morada: request.morada_completa,
            latitude: request.latitude ?? null,
            longitude: request.longitude ?? null,
            place_id: request.place_id || null,
            nome: request.restaurante_nome,
            data_criacao: new Date().toISOString(),
          })
          .select("idmorada")
          .single();

        if (moradaError) throw moradaError;
        moradaId = morada?.idmorada || null;
      }

      let ownerUserId = Number(request.user_id);
      if (!Number.isFinite(ownerUserId)) {
        const userCandidate = String(request.user_id || "").trim();
        if (userCandidate) {
          const { data: ownerByEmail, error: ownerByEmailError } = await supabase
            .from("utilizadores")
            .select("idutilizador")
            .eq("email", userCandidate)
            .maybeSingle();

          if (ownerByEmailError) throw ownerByEmailError;
          ownerUserId = ownerByEmail?.idutilizador || null;
        }
      }

      if (!Number.isFinite(ownerUserId)) {
        const fallbackEmail = String(request.email || "").trim();
        if (fallbackEmail) {
          const { data: ownerByEmail, error: ownerByEmailError } = await supabase
            .from("utilizadores")
            .select("idutilizador")
            .eq("email", fallbackEmail)
            .maybeSingle();

          if (ownerByEmailError) throw ownerByEmailError;
          ownerUserId = ownerByEmail?.idutilizador || null;
        }
      }

      lojaId = await resolveExistingStoreIdForApproval({
        request,
        ownerUserId,
        currentLojaId: lojaId,
      });

      const storeTypeId = await resolveStoreTypeIdForRequest(request);

      const lojaPayload = {
        nome: request.restaurante_nome,
        ativo: request.horario_funcionamento ? isStoreOpenNow(request.horario_funcionamento) : true,
        contacto: request.telefone || null,
        nif: request.nif || null,
        morada_completa: request.morada_completa || null,
        horario_funcionamento: request.horario_funcionamento || null,
        latitude: request.latitude ?? null,
        longitude: request.longitude ?? null,
        place_id: request.place_id || null,
        idmorada: moradaId,
        idutilizador: Number.isFinite(ownerUserId) ? ownerUserId : null,
        idtipoloja: Number.isFinite(storeTypeId) ? storeTypeId : null,
      };

      if (request.imagemfundo) {
        lojaPayload.imagemfundo = request.imagemfundo;
      }

      if (request.icon) {
        lojaPayload.icon = request.icon;
      }

      if (lojaId) {
        const { data: lojaUpdated, error: lojaUpdateError } = await supabase
          .from("lojas")
          .update(lojaPayload)
          .eq("idloja", lojaId)
          .select("idloja")
          .limit(1);

        if (lojaUpdateError) throw lojaUpdateError;
        if (!lojaUpdated || lojaUpdated.length === 0) {
          lojaId = null;
        }
      }

      if (!lojaId) {
        const { data: loja, error: lojaError } = await supabase
          .from("lojas")
          .insert(lojaPayload)
          .select("idloja")
          .single();

        if (lojaError) throw lojaError;
        lojaId = loja?.idloja || loja?.id || null;
      }

      if (Number.isFinite(ownerUserId)) {
        const { data: permissionRows, error: permissionError } = await supabase
          .from("permissoes")
          .select("idpermissao, permissao");

        if (permissionError) throw permissionError;

        const restaurantPermission = (permissionRows || []).find((row) =>
          /restaur|restaurant|loja|merchant/i.test(String(row.permissao || "")),
        );

        if (restaurantPermission?.idpermissao) {
          const { error: linkPermissionError } = await supabase
            .from("utilizadorespermissoes")
            .upsert(
              {
                idutilizador: ownerUserId,
                idpermissao: restaurantPermission.idpermissao,
              },
              { onConflict: "idutilizador,idpermissao" },
            );

          if (linkPermissionError) throw linkPermissionError;
        }
      }

      const staffUserId = Number.isFinite(ownerUserId)
        ? String(ownerUserId)
        : String(request.user_id || request.email || "").trim();

      if (lojaId && staffUserId) {
        const { data: staffExisting, error: staffLookupError } = await supabase
          .from("restaurant_staff_access")
          .select("id")
          .eq("user_id", staffUserId)
          .eq("loja_id", lojaId)
          .limit(1);

        if (staffLookupError) throw staffLookupError;

        if (staffExisting && staffExisting.length > 0) {
          const { error: staffUpdateError } = await supabase
            .from("restaurant_staff_access")
            .update({ role: "OWNER" })
            .eq("id", staffExisting[0].id);

          if (staffUpdateError) throw staffUpdateError;
        } else {
          const { error: staffInsertError } = await supabase
            .from("restaurant_staff_access")
            .insert({ user_id: staffUserId, loja_id: lojaId, role: "OWNER" });

          if (staffInsertError) throw staffInsertError;
        }
      }
    } catch (err) {
      provisionError = err;
    }
  }

  const { error } = await supabase
    .from("restaurant_signup_requests")
    .update({
      status: normalizedStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewedBy,
      loja_id: lojaId,
    })
    .eq("id", requestId);

  if (error) throw error;
  if (provisionError) throw provisionError;
}






























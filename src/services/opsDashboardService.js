import { supabase } from "./supabaseClient";
import {
  assertSupabaseClientAvailable,
  fetchGlobalDeliveryPricingConfig,
  GLOBAL_DELIVERY_PRICING_SETTING_KEY,
} from "./supabaseClient";
import { extractRestaurantId, extractUserId } from "../utils/roles";
import { DEFAULT_PER_KM_DELIVERY_CONFIG, sanitizeDeliveryPricingConfig } from "./deliveryZoneService";
import { isStoreOpenNow, sanitizeScheduleWithExceptions } from "../utils/storeHours";
import { mapEstadoInternoToLegacyStatus, mapLegacyStatusToEstadoInterno, resolveOrderEstadoInterno } from "./orderStatusMapper";
import { sanitizeCommissionConfig, normalizeCommissionPercent } from "./pricingService";
import { sanitizeAutoAssignConfig } from "./autoAssignConfig";

const STORE_SELECT_WITH_SETTINGS = "idloja, nome, ativo, taxaentrega, latitude, longitude, aceitacao_automatica_pedidos, atribuicao_automatica_estafeta, configuracao_auto_assign, comissao_pedeja_percent, configuracoes_comissao, configuracao_entrega, horario_funcionamento, dispatch_interno_ativo";
const STORE_SELECT_LEGACY_SETTINGS = "idloja, nome, ativo, taxaentrega, latitude, longitude, aceitacao_automatica_pedidos, comissao_pedeja_percent, horario_funcionamento";
const STORE_SELECT_BASIC = "idloja, nome, ativo, latitude, longitude, horario_funcionamento";
const SCHEDULED_RELEASE_WINDOW_MS = 30 * 60 * 1000;
const SCHEDULED_PREPARING_WINDOW_MS = 60 * 60 * 1000;
const PLATFORM_SETTINGS_SELECT = "chave, valor, updated_at";
const GLOBAL_AUTO_ASSIGN_SETTING_KEY = "auto_assign_carriers_default";
const GLOBAL_COMMISSION_DEFAULT_SETTING_KEY = "comissao_global_default";
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

function withOrderCompatibility(rows = []) {
  return (rows || []).map((order) => ({
    ...order,
    ...(() => {
      const driverName = order?.driver_name || null;
      const driverPhone = order?.driver_phone || null;
      const hasDriver = Boolean(String(driverName || driverPhone || "").trim());
      const baseEstado = order?.estado_interno || mapLegacyStatusToEstadoInterno(order?.status) || "pendente";
      const normalizedBaseEstado = resolveOrderEstadoInterno({ estado_interno: baseEstado, status: order?.status });
      const estadoInterno = hasDriver && normalizedBaseEstado === "pendente"
        ? "atribuindo_estafeta"
        : hasDriver && normalizedBaseEstado === "aceite"
          ? "estafeta_aceitou"
          : normalizedBaseEstado;

      return {
        subtotal: Number.isFinite(Number(order?.subtotal)) ? Number(order.subtotal) : null,
        taxa_entrega: Number.isFinite(Number(order?.taxa_entrega)) ? Number(order.taxa_entrega) : 0,
        estado_interno: estadoInterno,
        driver_name: driverName,
        driver_phone: driverPhone,
        veiculo_estafeta: order?.veiculo_estafeta || null,
        submitted_at: order?.submitted_at || null,
        order_timing_mode: order?.order_timing_mode || "ASAP",
        scheduled_for: order?.scheduled_for || (String(order?.order_timing_mode || "").toUpperCase() === "SCHEDULED" ? order?.created_at || null : null),
        aceite_em: order?.aceite_em || order?.data_aceitacao || null,
        atribuido_em: order?.atribuido_em || null,
        recolhido_em: order?.recolhido_em || null,
        entregue_em: order?.entregue_em || null,
      };
    })(),
  }));
}

function isMissingStoreSettingsColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("column")
    && (
      message.includes("aceitacao_automatica_pedidos")
      || message.includes("atribuicao_automatica_estafeta")
      || message.includes("configuracao_auto_assign")
      || message.includes("comissao_pedeja_percent")
      || message.includes("configuracoes_comissao")
      || message.includes("configuracao_entrega")
      || message.includes("horario_funcionamento")
      || message.includes("dispatch_interno_ativo")
    );
}

function isMissingPlatformSettingsTableError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("configuracoes_plataforma")
    && (
      message.includes("does not exist")
      || message.includes("relation")
      || message.includes("table")
    );
}

// platformDefaultCommissionPercent: usado so como fallback de exibicao
// (config.global_percent) quando a loja nao tem override proprio -- o
// comissao_pedeja_percent em si mantem-se null nesse caso, para o admin
// conseguir distinguir "sem override" (herda a plataforma) de "0% proprio".
function withStoreSettingsCompatibility(rows = [], platformDefaultCommissionPercent = 0) {
  return (rows || []).map((store) => {
    const commission = Number(store?.comissao_pedeja_percent);
    const hasOwnCommission = store?.comissao_pedeja_percent !== null && Number.isFinite(commission);
    const effectiveCommission = hasOwnCommission ? commission : platformDefaultCommissionPercent;

    return {
      ...store,
      taxaentrega: Number.isFinite(Number(store?.taxaentrega)) ? Number(store.taxaentrega) : 0,
      latitude: Number.isFinite(Number(store?.latitude)) ? Number(store.latitude) : null,
      longitude: Number.isFinite(Number(store?.longitude)) ? Number(store.longitude) : null,
      aceitacao_automatica_pedidos: Boolean(store?.aceitacao_automatica_pedidos),
      atribuicao_automatica_estafeta: Boolean(store?.atribuicao_automatica_estafeta),
      configuracao_auto_assign: sanitizeAutoAssignConfig(
        store?.configuracao_auto_assign,
        Boolean(store?.atribuicao_automatica_estafeta),
      ),
      comissao_pedeja_percent: hasOwnCommission ? commission : null,
      comissao_pedeja_percent_efetiva: effectiveCommission,
      configuracoes_comissao: sanitizeCommissionConfig(store?.configuracoes_comissao, effectiveCommission),
      configuracao_entrega: sanitizeDeliveryPricingConfig(store?.configuracao_entrega, store?.taxaentrega),
      horario_funcionamento: store?.horario_funcionamento || null,
      dispatch_interno_ativo: Boolean(store?.dispatch_interno_ativo),
    };
  });
}

function emptyMetrics() {
  return {
    totalOrders: 0,
    scheduledOrders: 0,
    immediateOrders: 0,
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

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeDashboardWindow(input) {
  if (typeof input === "number") {
    return {
      periodDays: input,
      since: daysToIso(input),
      until: null,
    };
  }

  const periodDays = Number(input?.periodDays || 7);
  const dateFrom = toIsoOrNull(input?.dateFrom || null);
  const dateTo = toIsoOrNull(input?.dateTo || null);

  return {
    periodDays: [7, 30, 90].includes(periodDays) ? periodDays : 7,
    since: dateFrom || daysToIso(periodDays),
    until: dateTo,
  };
}

function getAnalyticsTimestamp(order) {
  const timestamp = new Date(order?.submitted_at || order?.created_at || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isWithinDashboardWindow(row, { since = null, until = null } = {}) {
  const timestamp = getAnalyticsTimestamp(row);
  if (!timestamp) return false;

  const sinceTs = since ? new Date(since).getTime() : null;
  const untilTs = until ? new Date(until).getTime() : null;

  if (Number.isFinite(sinceTs) && timestamp < sinceTs) return false;
  if (Number.isFinite(untilTs) && timestamp > untilTs) return false;
  return true;
}

function filterRowsByDashboardWindow(rows = [], window = {}) {
  return (rows || []).filter((row) => isWithinDashboardWindow(row, window));
}

function formatDay(value) {
  return new Date(value).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

function formatHour(value) {
  return new Date(value).getHours();
}

function formatWeekdayPt(weekdayIndex) {
  const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  const normalized = Number(weekdayIndex);
  return Number.isFinite(normalized) && normalized >= 0 && normalized <= 6
    ? labels[normalized]
    : "-";
}

function formatHourLabel(hour) {
  const normalized = Number(hour);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 23) return "-";
  return `${String(normalized).padStart(2, "0")}h`;
}

function maskEmail(value) {
  const text = String(value || "").trim();
  if (!text.includes("@")) return "-";
  const [rawLocal, rawDomain] = text.split("@");
  const local = String(rawLocal || "").trim();
  const domain = String(rawDomain || "").trim();
  if (!local || !domain) return "-";

  if (local.length <= 2) {
    return `${local[0] || "*"}***@${domain}`;
  }

  return `${local.slice(0, 2)}***@${domain}`;
}

function topKeyByCount(counterMap = new Map()) {
  let winnerKey = null;
  let winnerCount = 0;
  counterMap.forEach((count, key) => {
    if (count > winnerCount) {
      winnerKey = key;
      winnerCount = count;
    }
  });
  return { key: winnerKey, count: winnerCount };
}

function isCustomerPermissionLabel(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (!normalized) return true;
  if (normalized.includes("admin")) return false;
  if (normalized.includes("dev") || normalized.includes("ops") || normalized.includes("tecnico")) return false;
  if (
    normalized.includes("restaur")
    || normalized.includes("restaurant")
    || normalized.includes("loja")
    || normalized.includes("merchant")
    || normalized.includes("store")
  ) {
    return false;
  }

  return true;
}

function isScheduledOrder(order) {
  return String(order?.order_timing_mode || "").trim().toUpperCase() === "SCHEDULED";
}

function getOrderActivityTimestamp(order) {
  const timestamp = new Date(order?.submitted_at || order?.created_at || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getScheduledTargetTimestamp(order) {
  if (!isScheduledOrder(order)) return null;
  const timestamp = new Date(order?.scheduled_for || order?.created_at || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getScheduledOperationalState(order, now = Date.now()) {
  if (!isScheduledOrder(order)) return null;
  if (isTerminalOrder(order)) return null;

  const targetTimestamp = getScheduledTargetTimestamp(order);
  if (!Number.isFinite(targetTimestamp)) return "na_fila_imediata";

  const remainingMs = targetTimestamp - now;
  if (remainingMs <= SCHEDULED_RELEASE_WINDOW_MS) return "na_fila_imediata";
  if (remainingMs <= SCHEDULED_PREPARING_WINDOW_MS) return "a_liberar";
  return "agendado";
}

function isTerminalOrder(order) {
  return ["entregue", "cancelado"].includes(getOrderWorkflowStatus(order));
}

function shouldOrderBeImmediate(order, now = Date.now()) {
  if (!isScheduledOrder(order)) return true;
  if (isTerminalOrder(order)) return true;

  const targetTimestamp = getScheduledTargetTimestamp(order);
  if (!Number.isFinite(targetTimestamp)) return true;

  return (targetTimestamp - now) <= SCHEDULED_RELEASE_WINDOW_MS;
}

function classifyDashboardOrders(orders = [], now = Date.now()) {
  const immediateOrders = [];
  const scheduledOrders = [];

  (orders || []).forEach((order) => {
    if (shouldOrderBeImmediate(order, now)) {
      immediateOrders.push({
        ...order,
        dashboard_bucket: "immediate",
        scheduled_target_at: getScheduledTargetTimestamp(order),
        scheduled_operational_state: getScheduledOperationalState(order, now),
      });
      return;
    }

    scheduledOrders.push({
      ...order,
      dashboard_bucket: "scheduled",
      scheduled_target_at: getScheduledTargetTimestamp(order),
      scheduled_operational_state: getScheduledOperationalState(order, now),
    });
  });

  immediateOrders.sort((a, b) => getOrderActivityTimestamp(b) - getOrderActivityTimestamp(a));
  scheduledOrders.sort((a, b) => {
    const aTimestamp = Number.isFinite(a?.scheduled_target_at) ? a.scheduled_target_at : getOrderActivityTimestamp(a);
    const bTimestamp = Number.isFinite(b?.scheduled_target_at) ? b.scheduled_target_at : getOrderActivityTimestamp(b);
    return aTimestamp - bTimestamp;
  });

  return { immediateOrders, scheduledOrders };
}

function normalizeLojaId(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : String(value).trim();
}

// null = a loja deixa de ter override proprio e passa a herdar a comissao
// base da plataforma -- acao explicita do admin, distinta de "0% proprio".
function normalizeCommissionValue(value) {
  if (value === null) return null;

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

  const globalCommission = await fetchGlobalCommissionSettings();
  return withStoreSettingsCompatibility(response.data || [], globalCommission.percent);
}

export async function updateRestaurantAdminSettings(lojaId, patch = {}, callerUserId = null) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  if (normalizedLojaId === null) {
    throw new Error("Loja invalida para atualizar configuracao.");
  }

  const normalizedCallerUserId = Number(callerUserId);
  if (!Number.isFinite(normalizedCallerUserId)) {
    throw new Error("Sessao invalida: inicia sessao novamente para atualizar esta loja.");
  }

  const updatePayload = {};

  if (Object.prototype.hasOwnProperty.call(patch, "aceitacao_automatica_pedidos")) {
    updatePayload.aceitacao_automatica_pedidos = Boolean(patch.aceitacao_automatica_pedidos);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "atribuicao_automatica_estafeta")) {
    updatePayload.atribuicao_automatica_estafeta = Boolean(patch.atribuicao_automatica_estafeta);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "dispatch_interno_ativo")) {
    updatePayload.dispatch_interno_ativo = Boolean(patch.dispatch_interno_ativo);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "configuracao_auto_assign")) {
    updatePayload.configuracao_auto_assign = sanitizeAutoAssignConfig(
      patch.configuracao_auto_assign,
      Object.prototype.hasOwnProperty.call(updatePayload, "atribuicao_automatica_estafeta")
        ? updatePayload.atribuicao_automatica_estafeta
        : false,
    );
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

  if (Object.prototype.hasOwnProperty.call(patch, "configuracao_entrega")) {
    if (patch.configuracao_entrega === null) {
      updatePayload.configuracao_entrega = null;
    } else {
      const sanitizedDeliveryConfig = sanitizeDeliveryPricingConfig(
        patch.configuracao_entrega,
        patch?.configuracao_entrega?.base_fee ?? patch?.taxaentrega ?? null,
      );

      if (!sanitizedDeliveryConfig) {
        throw new Error("A configuracao de entrega da loja esta invalida.");
      }

      updatePayload.configuracao_entrega = sanitizedDeliveryConfig;
      updatePayload.taxaentrega = sanitizedDeliveryConfig.base_fee;
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, "horario_funcionamento")) {
    const sanitizedSchedule = sanitizeScheduleWithExceptions(patch.horario_funcionamento);
    if (!sanitizedSchedule) {
      throw new Error("O horario da loja esta invalido.");
    }

    updatePayload.horario_funcionamento = sanitizedSchedule;
    updatePayload.ativo = isStoreOpenNow(sanitizedSchedule);
  }

  if (Object.keys(updatePayload).length === 0) {
    return null;
  }

  const { data, error } = await supabase.rpc("stores_apply_authorized_patch", {
    caller_user_id: normalizedCallerUserId,
    loja_id_input: normalizedLojaId,
    patch: updatePayload,
  });

  if (error) {
    if (isMissingStoreSettingsColumnError(error)) {
      throw new Error("As colunas de configuracao da loja ainda nao existem. Executa as migrations mais recentes do dashboard/entrega.");
    }

    throw error;
  }

  const globalCommission = await fetchGlobalCommissionSettings();
  return withStoreSettingsCompatibility(data ? [data] : [], globalCommission.percent)[0] || null;
}

export async function fetchGlobalDeliveryPricingSettings() {
  return fetchGlobalDeliveryPricingConfig();
}

export async function fetchGlobalAutoAssignSettings() {
  const { data, error } = await supabase
    .from("configuracoes_plataforma")
    .select(PLATFORM_SETTINGS_SELECT)
    .eq("chave", GLOBAL_AUTO_ASSIGN_SETTING_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingPlatformSettingsTableError(error)) {
      return {
        key: GLOBAL_AUTO_ASSIGN_SETTING_KEY,
        enabled: false,
        criteria: sanitizeAutoAssignConfig(null, false).criteria,
        updated_at: null,
        source: "fallback_default",
      };
    }

    throw error;
  }

  return {
    key: GLOBAL_AUTO_ASSIGN_SETTING_KEY,
    enabled: Boolean(data?.valor?.enabled),
    criteria: sanitizeAutoAssignConfig(data?.valor, Boolean(data?.valor?.enabled)).criteria,
    updated_at: data?.updated_at || null,
    source: data?.valor ? "database" : "fallback_default",
  };
}

export async function saveGlobalDeliveryPricingSettings(configuracaoEntrega, callerUserId) {
  const sanitizedDeliveryConfig = sanitizeDeliveryPricingConfig(
    configuracaoEntrega,
    DEFAULT_PER_KM_DELIVERY_CONFIG.base_fee,
  );

  if (!sanitizedDeliveryConfig) {
    throw new Error("A configuracao global de entrega esta invalida.");
  }

  const normalizedCallerUserId = Number(callerUserId);
  if (!Number.isFinite(normalizedCallerUserId)) {
    throw new Error("Sessao invalida: inicia sessao novamente para atualizar configuracoes globais.");
  }

  const { data, error } = await supabase.rpc("admin_upsert_platform_setting", {
    caller_user_id: normalizedCallerUserId,
    chave_input: GLOBAL_DELIVERY_PRICING_SETTING_KEY,
    valor_input: sanitizedDeliveryConfig,
  });

  if (error) {
    if (isMissingPlatformSettingsTableError(error)) {
      throw new Error("A tabela de configuracoes globais ainda nao existe. Executa a migration mais recente da entrega global.");
    }

    throw error;
  }

  return {
    key: GLOBAL_DELIVERY_PRICING_SETTING_KEY,
    config: sanitizeDeliveryPricingConfig(data?.valor, DEFAULT_PER_KM_DELIVERY_CONFIG.base_fee) || sanitizedDeliveryConfig,
    updated_at: data?.updated_at || null,
    source: "database",
    hasCustomValue: true,
  };
}

export async function saveGlobalAutoAssignSettings(value, callerUserId) {
  const normalized = sanitizeAutoAssignConfig(
    typeof value === "object" && value !== null ? value : { enabled: value },
    Boolean(typeof value === "boolean" ? value : value?.enabled),
  );

  const normalizedCallerUserId = Number(callerUserId);
  if (!Number.isFinite(normalizedCallerUserId)) {
    throw new Error("Sessao invalida: inicia sessao novamente para atualizar configuracoes globais.");
  }

  const { data, error } = await supabase.rpc("admin_upsert_platform_setting", {
    caller_user_id: normalizedCallerUserId,
    chave_input: GLOBAL_AUTO_ASSIGN_SETTING_KEY,
    valor_input: normalized,
  });

  if (error) {
    if (isMissingPlatformSettingsTableError(error)) {
      throw new Error("A tabela de configuracoes globais ainda nao existe. Executa a migration mais recente da plataforma.");
    }

    throw error;
  }

  return {
    key: GLOBAL_AUTO_ASSIGN_SETTING_KEY,
    enabled: Boolean(data?.valor?.enabled),
    criteria: sanitizeAutoAssignConfig(data?.valor, Boolean(data?.valor?.enabled)).criteria,
    updated_at: data?.updated_at || null,
    source: "database",
  };
}

export async function fetchGlobalCommissionSettings() {
  const { data, error } = await supabase
    .from("configuracoes_plataforma")
    .select(PLATFORM_SETTINGS_SELECT)
    .eq("chave", GLOBAL_COMMISSION_DEFAULT_SETTING_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingPlatformSettingsTableError(error)) {
      return {
        key: GLOBAL_COMMISSION_DEFAULT_SETTING_KEY,
        percent: 0,
        updated_at: null,
        source: "fallback_default",
      };
    }

    throw error;
  }

  return {
    key: GLOBAL_COMMISSION_DEFAULT_SETTING_KEY,
    percent: Number.isFinite(Number(data?.valor?.percent))
      ? normalizeCommissionPercent(data.valor.percent)
      : 0,
    updated_at: data?.updated_at || null,
    source: data?.valor ? "database" : "fallback_default",
  };
}

export async function saveGlobalCommissionSettings(percent, callerUserId) {
  const normalizedPercent = normalizeCommissionPercent(percent);

  const normalizedCallerUserId = Number(callerUserId);
  if (!Number.isFinite(normalizedCallerUserId)) {
    throw new Error("Sessao invalida: inicia sessao novamente para atualizar configuracoes globais.");
  }

  const { data, error } = await supabase.rpc("admin_upsert_platform_setting", {
    caller_user_id: normalizedCallerUserId,
    chave_input: GLOBAL_COMMISSION_DEFAULT_SETTING_KEY,
    valor_input: { percent: normalizedPercent },
  });

  if (error) {
    if (isMissingPlatformSettingsTableError(error)) {
      throw new Error("A tabela de configuracoes globais ainda nao existe. Executa a migration mais recente da plataforma.");
    }

    throw error;
  }

  return {
    key: GLOBAL_COMMISSION_DEFAULT_SETTING_KEY,
    percent: Number.isFinite(Number(data?.valor?.percent))
      ? normalizeCommissionPercent(data.valor.percent)
      : normalizedPercent,
    updated_at: data?.updated_at || null,
    source: "database",
  };
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
  const nonCanceledOrders = orders.filter((order) => getOrderWorkflowStatus(order) !== "cancelado");
  const { immediateOrders, scheduledOrders } = classifyDashboardOrders(orders);
  const totalOrders = orders.length;
  const totalRevenue = nonCanceledOrders.reduce((acc, order) => acc + safeNumber(order.total), 0);
  const deliveredOrders = orders.filter((order) => getOrderWorkflowStatus(order) === "entregue").length;
  const cancelledOrders = orders.filter((order) => getOrderWorkflowStatus(order) === "cancelado").length;

  return {
    totalOrders,
    scheduledOrders: scheduledOrders.length,
    immediateOrders: immediateOrders.length,
    totalRevenue,
    activeDeliveries: deliveries.filter((d) => !["DELIVERED", "FAILED", "CANCELLED"].includes(String(d.status || "").toUpperCase())).length,
    deliveredRate: totalOrders ? (deliveredOrders / totalOrders) * 100 : 0,
    cancelRate: totalOrders ? (cancelledOrders / totalOrders) * 100 : 0,
    avgTicket: nonCanceledOrders.length ? totalRevenue / nonCanceledOrders.length : 0,
  };
}

function getRestaurantOrderRevenue(order) {
  const subtotal = safeNumber(order?.subtotal);
  const total = safeNumber(order?.total);
  const deliveryFee = safeNumber(order?.taxa_entrega);

  if (subtotal > 0) return subtotal;

  const net = total - deliveryFee;
  if (Number.isFinite(net) && net > 0) return net;

  return total > 0 ? total : 0;
}

function buildRestaurantMetrics(orders, deliveries) {
  const { immediateOrders, scheduledOrders } = classifyDashboardOrders(orders);
  const totalOrders = orders.length;
  const deliveredOrders = orders.filter((order) => getOrderWorkflowStatus(order) === "entregue");
  const cancelledOrders = orders.filter((order) => getOrderWorkflowStatus(order) === "cancelado").length;

  const totalRevenue = deliveredOrders.reduce((acc, order) => acc + getRestaurantOrderRevenue(order), 0);
  const deliveredOrdersCount = deliveredOrders.length;

  return {
    totalOrders,
    scheduledOrders: scheduledOrders.length,
    immediateOrders: immediateOrders.length,
    totalRevenue,
    activeDeliveries: deliveries.filter((d) => !["DELIVERED", "FAILED", "CANCELLED"].includes(String(d.status || "").toUpperCase())).length,
    deliveredRate: totalOrders ? (deliveredOrdersCount / totalOrders) * 100 : 0,
    cancelRate: totalOrders ? (cancelledOrders / totalOrders) * 100 : 0,
    avgTicket: deliveredOrdersCount ? totalRevenue / deliveredOrdersCount : 0,
  };
}

function buildSeries(orders) {
  const billableOrders = orders.filter((order) => getOrderWorkflowStatus(order) !== "cancelado");
  const dailyMap = new Map();
  const hourlyMap = new Map();

  billableOrders.forEach((order) => {
    const analyticsTimestamp = order?.submitted_at || order?.created_at;
    const day = formatDay(analyticsTimestamp);
    const hour = formatHour(analyticsTimestamp);

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
    if (getOrderWorkflowStatus(order) !== "cancelado") {
      item.revenue += safeNumber(order.total);
    }
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
    aceite: 10,
    atribuindo_estafeta: 25,
    estafeta_aceitou: 30,
    em_preparacao: 35,
    pronto_recolha: 50,
    recolhido: 70,
    a_caminho: 80,
  };

  const referenceTimestampByEstado = (order, estado) => {
    if (estado === "aceite") {
      return new Date(order?.aceite_em || order?.submitted_at || order?.created_at || 0).getTime();
    }

    if (estado === "estafeta_aceitou") {
      return new Date(order?.atribuido_em || order?.updated_at || order?.created_at || 0).getTime();
    }

    if (estado === "recolhido" || estado === "a_caminho") {
      return new Date(order?.recolhido_em || order?.updated_at || order?.created_at || 0).getTime();
    }

    return getOrderActivityTimestamp(order);
  };

  return orders
    .map((order) => ({ order, estado: getOrderWorkflowStatus(order) }))
    .filter((entry) => !["entregue", "cancelado"].includes(entry.estado))
    .filter(({ order }) => shouldOrderBeImmediate(order, now))
    .map(({ order, estado }) => {
      const referenceTimestamp = referenceTimestampByEstado(order, estado);
      const elapsedMinutes = Math.floor((now - referenceTimestamp) / 60000);
      const threshold = thresholds[estado] || 45;
      const breached = elapsedMinutes > threshold;
      const needsCarrier = estado === "aceite" && !String(order?.driver_name || order?.driver_phone || "").trim();
      return {
        id: order.id,
        customer_nome: order.customer_nome,
        loja_id: order.loja_id,
        status: estado,
        elapsedMinutes,
        threshold,
        breached,
        driverAssignmentDelay: needsCarrier && breached,
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
    .filter((order) => shouldOrderBeImmediate(order))
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

function withTransitionTimestampPatch(currentOrder, normalizedEstado, timestamp) {
  const patch = {};

  if (normalizedEstado === "aceite" && !currentOrder?.aceite_em) {
    patch.aceite_em = timestamp;
  }

  if (normalizedEstado === "estafeta_aceitou" && !currentOrder?.atribuido_em) {
    patch.atribuido_em = timestamp;
  }

  if (normalizedEstado === "recolhido" && !currentOrder?.recolhido_em) {
    patch.recolhido_em = timestamp;
  }

  if (normalizedEstado === "entregue" && !currentOrder?.entregue_em) {
    patch.entregue_em = timestamp;
  }

  return patch;
}

async function queryOrdersRaw({ since = null, lojaId = null, limit = 220, callerUserId = null } = {}) {
  const normalizedCallerUserId = Number(callerUserId);
  if (!Number.isFinite(normalizedCallerUserId)) {
    return { data: null, error: new Error("Sessao invalida: inicia sessao novamente.") };
  }

  const response = await supabase.rpc("list_orders_for_viewer", {
    caller_user_id: normalizedCallerUserId,
    loja_id_filter: lojaId !== null && lojaId !== undefined && lojaId !== "" ? normalizeLojaId(lojaId) : null,
    since_input: since || null,
    until_input: null,
    limit_count: limit,
  });

  if (response.error) return response;

  return { data: withOrderCompatibility(response.data || []), error: null };
}

async function fetchOrdersForDashboard({ since = null, until = null, lojaId = null, limit = 220, callerUserId = null } = {}) {
  const withPeriod = await queryOrdersRaw({ since, lojaId, limit, callerUserId });
  if (withPeriod.error) return withPeriod;

  const scopedRows = filterRowsByDashboardWindow(withPeriod.data || [], { since, until });
  if (scopedRows.length > 0 || !since) {
    return { data: scopedRows, error: null };
  }

  const withoutPeriod = await queryOrdersRaw({ since: null, lojaId, limit, callerUserId });
  if (withoutPeriod.error) return withoutPeriod;

  return { data: filterRowsByDashboardWindow(withoutPeriod.data || [], { since, until }), error: null };
}

async function fetchDeliveriesForDashboard({ since = null, until = null, limit = 220, callerUserId = null } = {}) {
  const normalizedCallerUserId = Number(callerUserId);
  if (!Number.isFinite(normalizedCallerUserId)) {
    return { data: null, error: new Error("Sessao invalida: inicia sessao novamente.") };
  }

  const scoped = await supabase.rpc("list_deliveries_for_viewer", {
    caller_user_id: normalizedCallerUserId,
    since_input: since || null,
    until_input: null,
    limit_count: limit,
  });
  if (scoped.error) return scoped;

  const scopedRows = filterRowsByDashboardWindow(scoped.data || [], { since, until });
  if (scopedRows.length > 0 || !since) {
    return { ...scoped, data: scopedRows };
  }

  const fallback = await supabase.rpc("list_deliveries_for_viewer", {
    caller_user_id: normalizedCallerUserId,
    since_input: null,
    until_input: null,
    limit_count: limit,
  });

  return fallback.error
    ? fallback
    : { ...fallback, data: filterRowsByDashboardWindow(fallback.data || [], { since, until }) };
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

export async function fetchAdminDashboard(input = 7, { user } = {}) {
  const { since, until } = normalizeDashboardWindow(input);
  const callerUserId = Number(extractUserId(user));

  try {
    const [ordersRes, deliveriesRes, storesRes, requestsRes, storeTypesRes] = await Promise.all([
      fetchOrdersForDashboard({ since, until, limit: until ? 1500 : 300, callerUserId }),
      fetchDeliveriesForDashboard({ since, until, limit: until ? 1500 : 300, callerUserId }),
      fetchStoresWithAdminSettings(),
      Number.isFinite(callerUserId)
        ? supabase.rpc("admin_list_restaurant_signup_requests", {
            caller_user_id: callerUserId,
            status_filter: "PENDING",
          })
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("tiposloja")
        .select("idtipoloja, tipoloja, descricao")
        .order("idtipoloja", { ascending: true }),
    ]);

    if (ordersRes.error) throw ordersRes.error;
    if (deliveriesRes.error) throw deliveriesRes.error;

    const orders = ordersRes.data || [];
    const classifiedOrders = classifyDashboardOrders(orders);
    const deliveries = deliveriesRes.data || [];
    const stores = storesRes || [];

    return {
      orders,
      immediateOrders: classifiedOrders.immediateOrders,
      scheduledOrders: classifiedOrders.scheduledOrders,
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
      immediateOrders: [],
      scheduledOrders: [],
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

function buildRestaurantSeries(orders) {
  const deliveredOrders = orders.filter((order) => getOrderWorkflowStatus(order) === "entregue");
  const demandOrders = orders.filter((order) => getOrderWorkflowStatus(order) !== "cancelado");
  const dailyMap = new Map();
  const hourlyMap = new Map();

  deliveredOrders.forEach((order) => {
    const analyticsTimestamp = order?.submitted_at || order?.created_at;
    const day = formatDay(analyticsTimestamp);

    if (!dailyMap.has(day)) {
      dailyMap.set(day, { day, orders: 0, revenue: 0 });
    }

    const dayEntry = dailyMap.get(day);
    dayEntry.orders += 1;
    dayEntry.revenue += getRestaurantOrderRevenue(order);
  });

  demandOrders.forEach((order) => {
    const analyticsTimestamp = order?.submitted_at || order?.created_at;
    const hour = formatHour(analyticsTimestamp);

    if (!hourlyMap.has(hour)) {
      hourlyMap.set(hour, { hour, orders: 0 });
    }

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

export async function fetchAdminCustomerInsights(input = 30, callerUserId = null) {
  const { since, until } = normalizeDashboardWindow(input);
  const normalizedCallerUserId = Number(callerUserId);
  if (!Number.isFinite(normalizedCallerUserId)) {
    throw new Error("Sessao invalida: inicia sessao novamente.");
  }

  try {
    const [
      usersRes,
      ordersRes,
      storesRes,
      staffAccessRes,
      permissionsRes,
    ] = await Promise.all([
      supabase
        .from("utilizadores")
        .select("idutilizador, username, email, dataregisto")
        .order("dataregisto", { ascending: false })
        .limit(5000),
      supabase.rpc("admin_list_customer_order_insights", {
        caller_user_id: normalizedCallerUserId,
        limit_count: 20000,
      }),
      supabase
        .from("lojas")
        .select("idloja, nome"),
      supabase
        .from("restaurant_staff_access")
        .select("user_id"),
      supabase
        .from("utilizadorespermissoes")
        .select("idutilizador, permissoes(permissao)"),
    ]);

    if (usersRes.error) throw usersRes.error;
    if (ordersRes.error) throw ordersRes.error;
    if (storesRes.error) throw storesRes.error;
    if (staffAccessRes.error) throw staffAccessRes.error;
    if (permissionsRes.error) throw permissionsRes.error;

    const orders = withOrderCompatibility(ordersRes.data || [])
      .filter((order) => isWithinDashboardWindow(order, { since, until }));

    const storeNameById = new Map((storesRes.data || []).map((store) => [String(store.idloja), store.nome || `Loja ${store.idloja}`]));

    const excludedUserIds = new Set(
      (staffAccessRes.data || []).map((row) => String(row.user_id || "").trim()).filter(Boolean),
    );

    (permissionsRes.data || []).forEach((row) => {
      const permissionName = Array.isArray(row.permissoes)
        ? row.permissoes[0]?.permissao
        : row.permissoes?.permissao;
      if (!isCustomerPermissionLabel(permissionName)) {
        excludedUserIds.add(String(row.idutilizador || "").trim());
      }
    });

    const customers = (usersRes.data || [])
      .filter((user) => user?.idutilizador !== null && user?.idutilizador !== undefined)
      .filter((user) => !excludedUserIds.has(String(user.idutilizador)));

    const ordersByCustomerId = new Map();
    orders.forEach((order) => {
      const userId = String(order?.customer_user_id || "").trim();
      if (!userId) return;
      if (!ordersByCustomerId.has(userId)) {
        ordersByCustomerId.set(userId, []);
      }
      ordersByCustomerId.get(userId).push(order);
    });

    const customerRows = customers.map((customer) => {
      const customerId = String(customer.idutilizador);
      const customerOrders = ordersByCustomerId.get(customerId) || [];
      const paidOrders = customerOrders.filter((order) => getOrderWorkflowStatus(order) !== "cancelado");
      const totalSpent = paidOrders.reduce((acc, order) => acc + safeNumber(order.total), 0);
      const totalOrders = customerOrders.length;
      const averageTicket = paidOrders.length > 0 ? totalSpent / paidOrders.length : 0;
      const deliveredOrders = customerOrders.filter((order) => getOrderWorkflowStatus(order) === "entregue").length;
      const cancelledOrders = customerOrders.filter((order) => getOrderWorkflowStatus(order) === "cancelado").length;

      const ordersByStore = new Map();
      const ordersByWeekday = new Map();
      const ordersByHour = new Map();

      paidOrders.forEach((order) => {
        const storeIdKey = String(order?.loja_id || "");
        if (storeIdKey) {
          ordersByStore.set(storeIdKey, (ordersByStore.get(storeIdKey) || 0) + 1);
        }

        const ts = new Date(order?.created_at || 0).getTime();
        if (!Number.isFinite(ts)) return;
        const date = new Date(ts);
        const weekday = date.getDay();
        const hour = date.getHours();
        ordersByWeekday.set(weekday, (ordersByWeekday.get(weekday) || 0) + 1);
        ordersByHour.set(hour, (ordersByHour.get(hour) || 0) + 1);
      });

      const topStore = topKeyByCount(ordersByStore);
      const topWeekday = topKeyByCount(ordersByWeekday);
      const topHour = topKeyByCount(ordersByHour);

      const lastOrderAt = customerOrders
        .map((order) => new Date(order?.created_at || 0).getTime())
        .filter((ts) => Number.isFinite(ts))
        .sort((a, b) => b - a)[0] || null;

      return {
        customer_id: customerId,
        name: customer.username || `Cliente ${customerId}`,
        email_masked: maskEmail(customer.email),
        member_since: customer.dataregisto || null,
        orders_count: totalOrders,
        delivered_count: deliveredOrders,
        cancelled_count: cancelledOrders,
        total_spent: totalSpent,
        avg_ticket: averageTicket,
        favorite_store_id: topStore.key,
        favorite_store_name: topStore.key ? (storeNameById.get(String(topStore.key)) || `Loja ${topStore.key}`) : "-",
        favorite_store_orders: topStore.count || 0,
        peak_weekday: topWeekday.key !== null ? formatWeekdayPt(topWeekday.key) : "-",
        peak_weekday_orders: topWeekday.count || 0,
        peak_hour: topHour.key !== null ? formatHourLabel(topHour.key) : "-",
        peak_hour_orders: topHour.count || 0,
        last_order_at: lastOrderAt ? new Date(lastOrderAt).toISOString() : null,
      };
    });

    customerRows.sort((a, b) => {
      if (b.total_spent !== a.total_spent) return b.total_spent - a.total_spent;
      if (b.orders_count !== a.orders_count) return b.orders_count - a.orders_count;
      return String(a.name || "").localeCompare(String(b.name || ""), "pt-PT");
    });

    const customersWithOrders = customerRows.filter((row) => row.orders_count > 0).length;
    const totalOrders = customerRows.reduce((acc, row) => acc + row.orders_count, 0);
    const totalSpent = customerRows.reduce((acc, row) => acc + row.total_spent, 0);
    const avgTicket = totalOrders > 0 ? totalSpent / totalOrders : 0;
    const avgSpentPerCustomer = customersWithOrders > 0 ? totalSpent / customersWithOrders : 0;
    const activeCustomers30d = customerRows.filter((row) => {
      if (!row.last_order_at) return false;
      const lastOrderTs = new Date(row.last_order_at).getTime();
      if (!Number.isFinite(lastOrderTs)) return false;
      return (Date.now() - lastOrderTs) <= (30 * 24 * 60 * 60 * 1000);
    }).length;

    return {
      metrics: {
        totalCustomers: customerRows.length,
        customersWithOrders,
        activeCustomers30d,
        totalOrders,
        totalSpent,
        avgTicket,
        avgSpentPerCustomer,
      },
      customers: customerRows,
    };
  } catch (error) {
    return {
      metrics: {
        totalCustomers: 0,
        customersWithOrders: 0,
        activeCustomers30d: 0,
        totalOrders: 0,
        totalSpent: 0,
        avgTicket: 0,
        avgSpentPerCustomer: 0,
      },
      customers: [],
      error: error?.message || "Nao foi possivel carregar analytics de clientes.",
    };
  }
}

export async function fetchRestaurantDashboard({ lojaId, periodDays = 7, dateFrom = null, dateTo = null, callerUserId = null } = {}) {
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

  const { since, until } = normalizeDashboardWindow({ periodDays, dateFrom, dateTo });

  try {
    const ordersRes = await fetchOrdersForDashboard({
      since,
      until,
      lojaId: normalizedLojaId,
      limit: until ? 1500 : 300,
      callerUserId,
    });
    if (ordersRes.error) throw ordersRes.error;

    const orders = ordersRes.data || [];
    const classifiedOrders = classifyDashboardOrders(orders);
    const orderIds = orders.map((order) => order.id);

    let deliveries = [];
    if (orderIds.length > 0) {
      const scopedDeliveries = await supabase.rpc("list_deliveries_for_orders", {
        caller_user_id: Number(callerUserId),
        order_ids: orderIds,
      });
      if (scopedDeliveries.error) throw scopedDeliveries.error;

      deliveries = filterRowsByDashboardWindow(scopedDeliveries.data || [], { since, until });
    }

    return {
      orders,
      immediateOrders: classifiedOrders.immediateOrders,
      scheduledOrders: classifiedOrders.scheduledOrders,
      deliveries,
      metrics: buildRestaurantMetrics(orders, deliveries),
      series: buildRestaurantSeries(orders),
      slaAlerts: buildSlaAlerts(orders),
      liveOrders: buildLiveOrders(orders, [{ idloja: normalizedLojaId, nome: `Loja ${normalizedLojaId}` }]),
    };
  } catch (error) {
    return {
      orders: [],
      immediateOrders: [],
      scheduledOrders: [],
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

  const callerUserId = Number(options.callerUserId);
  if (!Number.isFinite(callerUserId)) {
    throw new Error("Sessao invalida: inicia sessao novamente para atualizar este pedido.");
  }

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

  const lookupResponse = await supabase.rpc("get_order_by_id", { order_id_input: orderId });
  if (
    !lookupResponse.error
    && lookupResponse.data
    && normalizedLojaId
    && String(lookupResponse.data.loja_id) !== String(normalizedLojaId)
  ) {
    lookupResponse.data = null;
  }

  const { data: currentOrder, error: lookupError } = lookupResponse;
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

  const legacyStatus = mapEstadoInternoToLegacyStatus(normalizedEstado);
  const nowIso = new Date().toISOString();
  const patch = {
    estado_interno: normalizedEstado,
    updated_at: nowIso,
    ...withTransitionTimestampPatch(currentOrder, normalizedEstado, nowIso),
  };

  if (legacyStatus) {
    patch.status = legacyStatus;
  }

  if (normalizedEstado === "cancelado") {
    patch.driver_name = null;
    patch.driver_phone = null;
    patch.veiculo_estafeta = null;
  }

  const { data, error } = await supabase.rpc("orders_apply_authorized_patch", {
    caller_user_id: callerUserId,
    order_id_input: orderId,
    patch,
  });

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

  return { order: data };
}

export async function updateOrderStatus(orderId, status, lojaId = null, callerUserId = null) {
  const mappedEstado = mapLegacyStatusToEstadoInterno(status);

  if (mappedEstado) {
    return updateOrderWorkflowStatus(orderId, mappedEstado, lojaId, { callerUserId });
  }

  const normalizedCallerUserId = Number(callerUserId);
  if (!Number.isFinite(normalizedCallerUserId)) {
    throw new Error("Sessao invalida: inicia sessao novamente para atualizar este pedido.");
  }

  const { data, error } = await supabase.rpc("orders_apply_authorized_patch", {
    caller_user_id: normalizedCallerUserId,
    order_id_input: orderId,
    patch: { status, updated_at: new Date().toISOString() },
  });

  if (error) throw error;
  if (!data) {
    throw new Error("Pedido nao encontrado para esta loja.");
  }

  return { order: { id: orderId, status } };
}

export async function fetchDevDashboard(periodDays = 7, callerUserId = null) {
  const since = daysToIso(periodDays);
  const normalizedCallerUserId = Number(callerUserId);
  if (!Number.isFinite(normalizedCallerUserId)) {
    return {
      events: [],
      deliveries: [],
      metrics: { webhookEvents: 0, failedDeliveries: 0, latestDeliveryStatus: "N/A" },
      error: "Sessao invalida: inicia sessao novamente.",
    };
  }

  try {
    const [eventsRes, deliveriesRes] = await Promise.all([
      supabase
        .from("delivery_events")
        .select("id, event_id, event_type, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.rpc("list_deliveries_for_viewer", {
        caller_user_id: normalizedCallerUserId,
        since_input: since,
        until_input: null,
        limit_count: 200,
      }),
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
  const { error } = await supabase.from("restaurant_signup_requests").insert({
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
  });

  if (error) throw error;
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
  const callerUserId = Number(reviewedBy);
  if (!Number.isFinite(callerUserId)) {
    throw new Error("Sessao invalida: inicia sessao novamente para rever candidaturas.");
  }

  const { data: request, error: requestError } = await supabase.rpc("admin_get_restaurant_signup_request", {
    caller_user_id: callerUserId,
    request_id_input: requestId,
  });

  if (requestError) throw requestError;

  const normalizedStatus = String(status || "").toUpperCase();
  let lojaId = request.loja_id || null;
  let provisionError = null;

  if (normalizedStatus === "APPROVED") {
    try {
      let moradaId = null;
      if (request.morada_completa) {
        const { data: morada, error: moradaError } = await supabase.rpc("admin_save_address", {
          caller_user_id: callerUserId,
          morada_input: request.morada_completa,
          latitude_input: request.latitude ?? null,
          longitude_input: request.longitude ?? null,
          place_id_input: request.place_id || null,
          nome_input: request.restaurante_nome,
        });

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
        const { error: lojaUpdateError } = await supabase.rpc("admin_provision_store_from_signup", {
          caller_user_id: callerUserId,
          loja_id_input: lojaId,
          payload: lojaPayload,
        });

        if (lojaUpdateError) {
          if (lojaUpdateError.code === "P0002") {
            lojaId = null;
          } else {
            throw lojaUpdateError;
          }
        }
      }

      if (!lojaId) {
        const { data: loja, error: lojaError } = await supabase.rpc("admin_provision_store_from_signup", {
          caller_user_id: callerUserId,
          loja_id_input: null,
          payload: lojaPayload,
        });

        if (lojaError) throw lojaError;
        lojaId = loja?.idloja || null;
      }

      if (Number.isFinite(ownerUserId) && lojaId) {
        const { error: associateError } = await supabase.rpc("admin_associate_restaurant_to_user", {
          caller_user_id: callerUserId,
          target_user_id: ownerUserId,
          loja_id_input: lojaId,
        });

        if (associateError) throw associateError;
      }
    } catch (err) {
      provisionError = err;
    }
  }

  const { error } = await supabase.rpc("admin_update_restaurant_signup_request_status", {
    caller_user_id: callerUserId,
    request_id_input: requestId,
    new_status: normalizedStatus,
    loja_id_input: lojaId,
  });

  if (error) throw error;
  if (provisionError) throw provisionError;
}






























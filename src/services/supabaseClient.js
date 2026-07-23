import { createClient } from "@supabase/supabase-js";
import { getStoreScheduleStatus, isStoreOpenNow } from "../utils/storeHours";
import {
  DEFAULT_PER_KM_DELIVERY_CONFIG,
  resolveEffectiveDeliveryPricingConfig,
  resolveDeliveryPricingMaxKm,
  resolveMinimumDeliveryFee,
  sanitizeDeliveryPricingConfig,
} from "./deliveryZoneService";
import {
  buildMenuOptionGroupFromLibraryRecord,
  mergeMenuOptionConfigurations,
} from "./menuOptionsService";
import { normalizeCommissionPercent } from "./pricingService";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "");

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const supabaseConfig = Object.freeze({
  url: supabaseUrl,
  anonKey: supabaseAnonKey,
});
export const GLOBAL_DELIVERY_PRICING_SETTING_KEY = "delivery_pricing_default";
export const GLOBAL_COMMISSION_DEFAULT_SETTING_KEY = "comissao_global_default";

export function isSupabaseConfigured() {
  return Boolean(supabaseConfig.url && supabaseConfig.anonKey);
}

export function assertSupabaseConfigured(context = "supabaseClient") {
  if (!isSupabaseConfigured()) {
    throw new Error(`Configuracao Supabase em falta no frontend (${context}).`);
  }
}

export function assertSupabaseClientAvailable(context = "supabaseClient") {
  assertSupabaseConfigured(context);

  if (!supabase || typeof supabase.from !== "function" || !supabase.auth) {
    throw new Error(`Cliente Supabase indisponivel (${context}).`);
  }
}

export function getSupabaseFunctionUrl(functionName) {
  assertSupabaseConfigured(`function:${functionName}`);
  return `${supabaseConfig.url}/functions/v1/${functionName}`;
}

export async function buildSupabaseFunctionHeaders({
  includeContentType = true,
  includeSessionAuthorization = true,
} = {}) {
  assertSupabaseClientAvailable("buildSupabaseFunctionHeaders");

  const headers = {
    apikey: supabaseConfig.anonKey,
  };

  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }

  if (includeSessionAuthorization) {
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data?.session?.access_token;
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
    } catch (error) {
      console.error("Nao foi possivel obter a sessao Supabase para montar headers", {
        error: error?.message || String(error),
      });
    }
  }

  return headers;
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

function buildDefaultGlobalDeliveryPricingConfig() {
  return sanitizeDeliveryPricingConfig(
    DEFAULT_PER_KM_DELIVERY_CONFIG,
    DEFAULT_PER_KM_DELIVERY_CONFIG.base_fee,
  );
}

export async function fetchGlobalDeliveryPricingConfig() {
  const fallbackConfig = buildDefaultGlobalDeliveryPricingConfig();

  const { data, error } = await supabase
    .from("configuracoes_plataforma")
    .select("valor, updated_at")
    .eq("chave", GLOBAL_DELIVERY_PRICING_SETTING_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingPlatformSettingsTableError(error)) {
      return {
        key: GLOBAL_DELIVERY_PRICING_SETTING_KEY,
        config: fallbackConfig,
        updated_at: null,
        source: "fallback_default",
        hasCustomValue: false,
      };
    }

    throw error;
  }

  return {
    key: GLOBAL_DELIVERY_PRICING_SETTING_KEY,
    config: sanitizeDeliveryPricingConfig(data?.valor, fallbackConfig?.base_fee) || fallbackConfig,
    updated_at: data?.updated_at || null,
    source: data?.valor ? "database" : "fallback_default",
    hasCustomValue: Boolean(data?.valor),
  };
}

// Comissao base da plataforma -- usada como fallback para lojas que nunca
// definiram a sua propria comissao (comissao_pedeja_percent = null). Leitura
// publica (sem gate de admin), tal como a config de entrega acima, porque o
// menu do cliente precisa dela para marcar os precos corretamente.
export async function fetchGlobalCommissionDefaultConfig() {
  const fallbackPercent = 0;

  const { data, error } = await supabase
    .from("configuracoes_plataforma")
    .select("valor, updated_at")
    .eq("chave", GLOBAL_COMMISSION_DEFAULT_SETTING_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingPlatformSettingsTableError(error)) {
      return {
        key: GLOBAL_COMMISSION_DEFAULT_SETTING_KEY,
        percent: fallbackPercent,
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
      : fallbackPercent,
    updated_at: data?.updated_at || null,
    source: data?.valor ? "database" : "fallback_default",
  };
}

export async function buscarCategoriasService() {
  const { data, error } = await supabase
    .from("tiposloja")
    .select("idtipoloja, descricao, tipoloja, icon");

  if (error) {
    console.error("Erro na BD:", error);
    return [];
  }

  return data.map((item) => ({
    id: item.idtipoloja,
    nome: item.descricao,
    slug: item.tipoloja,
    img: item.icon,
  }));
}

function resolveStoreStatus(loja) {
  if (loja.ativo === null) {
    return { statusTexto: "Indisponivel", statusCor: "#9e9e9e", isIndisponivel: true, statusDetalhe: "" };
  }

  const scheduleStatus = loja.horario_funcionamento
    ? getStoreScheduleStatus(loja.horario_funcionamento, new Date())
    : null;
  const open = scheduleStatus
    ? scheduleStatus.isOpen
    : Boolean(loja.ativo);

  return {
    statusTexto: open ? "Aberto" : "Fechado",
    statusCor: open ? "#28a745" : "#dc3545",
    isIndisponivel: false,
    statusDetalhe: scheduleStatus?.source === "special_exception" ? scheduleStatus.message : "",
  };
}

function normalizeSlug(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function extractStoreTypeSlug(loja) {
  const relation = loja?.tiposloja;
  if (Array.isArray(relation)) {
    return relation[0]?.tipoloja || "";
  }
  return relation?.tipoloja || "";
}

function shouldIncludeStoreByCategory(loja, mainCategorySlug) {
  if (!mainCategorySlug) return true;

  const categorySlug = normalizeSlug(mainCategorySlug);
  const storeTypeSlug = normalizeSlug(extractStoreTypeSlug(loja));
  const isRestaurantCategory = categorySlug.includes("restaurante");

  if (isRestaurantCategory) {
    return !loja.idtipoloja || storeTypeSlug === categorySlug;
  }

  return storeTypeSlug === categorySlug;
}

function addCategoryToMap(map, category) {
  if (!category?.categoria) return;

  const key = normalizeText(category.categoria);
  if (!key) return;

  if (!map.has(key)) {
    map.set(key, {
      idcategoria: category.idcategoria ?? `cat-${key.replace(/\s+/g, "-")}`,
      categoria: category.categoria,
    });
  }
}

function buildStoreSubCategories(loja) {
  const categoryMap = new Map();

  (loja?.categoriaslojas || []).forEach((entry) => {
    addCategoryToMap(categoryMap, entry?.categorias || null);
  });

  return Array.from(categoryMap.values());
}

function isMissingStoreConfigColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("column")
    && (
      message.includes("configuracoes_comissao")
      || message.includes("configuracao_entrega")
    );
}

function isMissingMenuOptionLibraryTableError(error) {
  const message = String(error?.message || "").toLowerCase();
  const mentionsLibraryTable = [
    "menu_option_groups",
    "menu_option_items",
    "menu_option_group_links",
  ].some((tableName) => message.includes(tableName));

  return mentionsLibraryTable
    && (
      message.includes("does not exist")
      || message.includes("relation")
      || message.includes("table")
    );
}

async function loadStoreMenuOptionLibraryDataset(idloja) {
  const normalizedStoreId = Number(idloja);
  if (!Number.isFinite(normalizedStoreId)) {
    return {
      available: false,
      groupMap: new Map(),
      linksByMenuId: new Map(),
    };
  }

  const { data: groupRows, error: groupError } = await supabase
    .from("menu_option_groups")
    .select("*")
    .eq("idloja", normalizedStoreId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (groupError) {
    if (isMissingMenuOptionLibraryTableError(groupError)) {
      return {
        available: false,
        groupMap: new Map(),
        linksByMenuId: new Map(),
      };
    }

    throw groupError;
  }

  const groupIds = (groupRows || []).map((group) => group.id).filter((id) => id !== null && id !== undefined);
  if (groupIds.length === 0) {
    return {
      available: true,
      groupMap: new Map(),
      linksByMenuId: new Map(),
    };
  }

  const [
    { data: itemRows, error: itemsError },
    { data: linkRows, error: linksError },
  ] = await Promise.all([
    supabase
      .from("menu_option_items")
      .select("*")
      .in("grupo_id", groupIds)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("menu_option_group_links")
      .select("idmenu, grupo_id")
      .in("grupo_id", groupIds),
  ]);

  if (itemsError) {
    if (isMissingMenuOptionLibraryTableError(itemsError)) {
      return {
        available: false,
        groupMap: new Map(),
        linksByMenuId: new Map(),
      };
    }

    throw itemsError;
  }

  if (linksError) {
    if (isMissingMenuOptionLibraryTableError(linksError)) {
      return {
        available: false,
        groupMap: new Map(),
        linksByMenuId: new Map(),
      };
    }

    throw linksError;
  }

  const itemsByGroup = new Map();
  (itemRows || []).forEach((item) => {
    const key = String(item.grupo_id);
    if (!itemsByGroup.has(key)) itemsByGroup.set(key, []);
    itemsByGroup.get(key).push(item);
  });

  const linkedMenuIdsByGroup = new Map();
  const linksByMenuId = new Map();
  (linkRows || []).forEach((link) => {
    const groupKey = String(link.grupo_id);
    const menuKey = String(link.idmenu);

    if (!linkedMenuIdsByGroup.has(groupKey)) linkedMenuIdsByGroup.set(groupKey, []);
    linkedMenuIdsByGroup.get(groupKey).push(menuKey);

    if (!linksByMenuId.has(menuKey)) linksByMenuId.set(menuKey, []);
    linksByMenuId.get(menuKey).push(groupKey);
  });

  const groupMap = new Map();
  (groupRows || []).forEach((group) => {
    const normalized = buildMenuOptionGroupFromLibraryRecord(
      group,
      itemsByGroup.get(String(group.id)) || [],
      linkedMenuIdsByGroup.get(String(group.id)) || [],
    );

    if (normalized) {
      groupMap.set(String(normalized.library_group_id || normalized.id), normalized);
    }
  });

  return {
    available: true,
    groupMap,
    linksByMenuId,
  };
}

async function syncStoresAvailability(lojas = []) {
  const changes = (lojas || [])
    .map((loja) => {
      if (!loja || loja.ativo === null || !loja.horario_funcionamento) return null;
      const nextAtivo = isStoreOpenNow(loja.horario_funcionamento);
      if (nextAtivo === Boolean(loja.ativo)) return null;
      return { idloja: loja.idloja, ativo: nextAtivo };
    })
    .filter(Boolean);

  if (changes.length === 0) {
    return lojas;
  }

  await Promise.allSettled(
    changes.map((item) =>
      supabase.rpc("sync_store_availability_from_schedule", {
        loja_id_input: item.idloja,
        computed_ativo: item.ativo,
      }),
    ),
  );

  const changeMap = new Map(changes.map((item) => [String(item.idloja), item.ativo]));

  return lojas.map((loja) => {
    const key = String(loja.idloja);
    if (!changeMap.has(key)) return loja;
    return { ...loja, ativo: changeMap.get(key) };
  });
}

export async function buscarLojasService(mainCategorySlug) {
  try {
    const [globalDeliveryPricing, globalCommissionDefault] = await Promise.all([
      fetchGlobalDeliveryPricingConfig(),
      fetchGlobalCommissionDefaultConfig(),
    ]);
    let response = await supabase
      .from("lojas")
      .select(`
        idloja,
        nome,
        imagemfundo,
        icon,
        ativo,
        contacto,
        taxaentrega,
        morada_completa,
        comissao_pedeja_percent,
        configuracoes_comissao,
        configuracao_entrega,
        horario_funcionamento,
        idtipoloja,
        tiposloja (tipoloja),
        categoriaslojas (
          categorias (idcategoria, categoria)
        )
      `)
      .order("idloja", { ascending: true });

    if (response.error && isMissingStoreConfigColumnError(response.error)) {
      response = await supabase
        .from("lojas")
        .select(`
          idloja,
          nome,
          imagemfundo,
          icon,
          ativo,
          contacto,
          taxaentrega,
          morada_completa,
          comissao_pedeja_percent,
          horario_funcionamento,
          idtipoloja,
          tiposloja (tipoloja),
          categoriaslojas (
            categorias (idcategoria, categoria)
          )
        `)
        .order("idloja", { ascending: true });
    }

    if (response.error) throw response.error;

    const syncedStores = await syncStoresAvailability(response.data || []);
    const filteredStores = syncedStores.filter((loja) => shouldIncludeStoreByCategory(loja, mainCategorySlug));

    return filteredStores.map((loja) => {
      const { statusTexto, statusCor, isIndisponivel, statusDetalhe } = resolveStoreStatus(loja);
      const configuracaoEntrega = resolveEffectiveDeliveryPricingConfig(
        loja.configuracao_entrega,
        globalDeliveryPricing?.config,
        loja.taxaentrega,
      );

      return {
        id: loja.idloja,
        nome: loja.nome,
        imagemfundo: loja.imagemfundo,
        icon: loja.icon,
        status: statusTexto,
        statusCor,
        isIndisponivel,
        statusDetalhe,
        contacto: loja.contacto || null,
        taxaentrega: resolveMinimumDeliveryFee(configuracaoEntrega, loja.taxaentrega),
        configuracao_entrega: configuracaoEntrega,
        raioentrega_km: resolveDeliveryPricingMaxKm(configuracaoEntrega),
        comissao_pedeja_percent: Number(loja.comissao_pedeja_percent ?? globalCommissionDefault.percent),
        configuracoes_comissao: loja.configuracoes_comissao || null,
        morada: loja.morada_completa || null,
        horario_funcionamento: loja.horario_funcionamento || null,
        subCategorias: buildStoreSubCategories(loja),
      };
    });
  } catch (error) {
    console.error("Erro ao buscar lojas:", error);
    return [];
  }
}

export async function buscarMenusService(idloja) {
  try {
    const libraryDataset = await loadStoreMenuOptionLibraryDataset(idloja);
    const { data, error } = await supabase
      .from("menus")
      .select(`
        *,
        tiposmenu (
          tipomenu
        )
      `)
      .eq("idloja", idloja)
      .order("idtipomenu", { ascending: true });

    if (error) throw error;

    return (data || []).filter((prato) => prato?.visivel !== false).reduce((acc, prato) => {
      const relacao = prato.tiposmenu;
      const nomeCategoria = String((Array.isArray(relacao) ? relacao[0]?.tipomenu : relacao?.tipomenu) || "Geral").trim() || "Geral";

      if (!acc[nomeCategoria]) {
        acc[nomeCategoria] = [];
      }

      const normalizedPrato = {
        ...prato,
        desc: prato?.desc ?? prato?.descricao ?? prato?.desricao ?? null,
        categoria_menu: nomeCategoria,
        visivel: prato?.visivel !== false,
        configuracao_opcoes: mergeMenuOptionConfigurations(
          (libraryDataset.linksByMenuId.get(String(prato?.idmenu || "")) || [])
            .map((groupId) => libraryDataset.groupMap.get(String(groupId)))
            .filter(Boolean),
          prato?.configuracao_opcoes,
        ),
      };

      acc[nomeCategoria].push(normalizedPrato);
      return acc;
    }, {});
  } catch (error) {
    console.error("Erro ao buscar menus:", error);
    return {};
  }
}

export async function buscarDadosLojaService(idloja) {
  try {
    const [globalDeliveryPricing, globalCommissionDefault] = await Promise.all([
      fetchGlobalDeliveryPricingConfig(),
      fetchGlobalCommissionDefaultConfig(),
    ]);
    let response = await supabase
      .from("lojas")
      .select(`
        idloja,
        nome,
        ativo,
        horario_funcionamento,
        imagemfundo,
        icon,
        morada_completa,
        taxaentrega,
        comissao_pedeja_percent,
        configuracoes_comissao,
        configuracao_entrega,
        categoriaslojas (
          categorias (idcategoria, categoria)
        )
      `)
      .eq("idloja", idloja)
      .single();

    if (response.error && isMissingStoreConfigColumnError(response.error)) {
      response = await supabase
        .from("lojas")
        .select(`
          idloja,
          nome,
          ativo,
          horario_funcionamento,
          imagemfundo,
          icon,
          morada_completa,
          taxaentrega,
          comissao_pedeja_percent,
          categoriaslojas (
            categorias (idcategoria, categoria)
          )
        `)
        .eq("idloja", idloja)
        .single();
    }

    if (response.error) throw response.error;

    const [syncedStore] = await syncStoresAvailability(response.data ? [response.data] : []);
    const store = syncedStore || response.data;
    const { statusTexto, statusDetalhe } = resolveStoreStatus(store);
    const configuracaoEntrega = resolveEffectiveDeliveryPricingConfig(
      store.configuracao_entrega,
      globalDeliveryPricing?.config,
      store.taxaentrega,
    );

    return {
      nome: store.nome,
      status: statusTexto,
      statusDetalhe,
      imagemfundo: store.imagemfundo || "",
      icon: store.icon || "",
      morada: store.morada_completa || "",
      taxaentrega: resolveMinimumDeliveryFee(configuracaoEntrega, store.taxaentrega),
      configuracao_entrega: configuracaoEntrega,
      raioentrega_km: resolveDeliveryPricingMaxKm(configuracaoEntrega),
      comissao_pedeja_percent: Number(store.comissao_pedeja_percent ?? globalCommissionDefault.percent),
      configuracoes_comissao: store.configuracoes_comissao || null,
      horario_funcionamento: store.horario_funcionamento || null,
      subCategorias: buildStoreSubCategories(store),
    };
  } catch (error) {
    console.error("Erro ao buscar dados da loja:", error);
    return {
      nome: "Restaurante",
      status: "Indisponivel",
      imagemfundo: "",
      icon: "",
      morada: "",
      taxaentrega: 0,
      configuracao_entrega: null,
      raioentrega_km: resolveDeliveryPricingMaxKm(null),
      comissao_pedeja_percent: 0,
      configuracoes_comissao: null,
      horario_funcionamento: null,
      subCategorias: [],
    };
  }
}



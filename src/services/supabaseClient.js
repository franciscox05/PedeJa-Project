import { createClient } from "@supabase/supabase-js";
import { isStoreOpenNow } from "../utils/storeHours";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "");

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const supabaseConfig = Object.freeze({
  url: supabaseUrl,
  anonKey: supabaseAnonKey,
});

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
    return { statusTexto: "Indisponivel", statusCor: "#9e9e9e", isIndisponivel: true };
  }

  const open = loja.horario_funcionamento
    ? isStoreOpenNow(loja.horario_funcionamento)
    : Boolean(loja.ativo);

  return {
    statusTexto: open ? "Aberto" : "Fechado",
    statusCor: open ? "#28a745" : "#dc3545",
    isIndisponivel: false,
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

function stripScopedMenuCategoryName(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^__store_menu__(\d+)::(.+)$/);
  if (!match) return raw;

  const label = String(match[2] || "").trim();
  return label || raw;
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

function isMissingCommissionConfigColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("configuracoes_comissao") && message.includes("column");
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
      supabase
        .from("lojas")
        .update({ ativo: item.ativo })
        .eq("idloja", item.idloja),
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
        horario_funcionamento,
        idtipoloja,
        tiposloja (tipoloja),
        categoriaslojas (
          categorias (idcategoria, categoria)
        )
      `)
      .order("idloja", { ascending: true });

    if (response.error && isMissingCommissionConfigColumnError(response.error)) {
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
      const { statusTexto, statusCor, isIndisponivel } = resolveStoreStatus(loja);

      return {
        id: loja.idloja,
        nome: loja.nome,
        imagemfundo: loja.imagemfundo,
        icon: loja.icon,
        status: statusTexto,
        statusCor,
        isIndisponivel,
        contacto: loja.contacto || null,
        taxaentrega: loja.taxaentrega || 0,
        comissao_pedeja_percent: Number(loja.comissao_pedeja_percent || 0),
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

    return (data || []).reduce((acc, prato) => {
      const relacao = prato.tiposmenu;
      const rawCategoria = (Array.isArray(relacao) ? relacao[0]?.tipomenu : relacao?.tipomenu) || "Geral";
      const nomeCategoria = stripScopedMenuCategoryName(rawCategoria) || "Geral";

      if (!acc[nomeCategoria]) {
        acc[nomeCategoria] = [];
      }

      const normalizedRelation = Array.isArray(relacao)
        ? relacao.map((item) => ({
          ...item,
          tipomenu: stripScopedMenuCategoryName(item?.tipomenu),
        }))
        : relacao
          ? {
            ...relacao,
            tipomenu: stripScopedMenuCategoryName(relacao?.tipomenu),
          }
          : relacao;

      const normalizedPrato = {
        ...prato,
        desc: prato?.desc ?? prato?.descricao ?? prato?.desricao ?? null,
        categoria_menu: nomeCategoria,
        tiposmenu: normalizedRelation,
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
        categoriaslojas (
          categorias (idcategoria, categoria)
        )
      `)
      .eq("idloja", idloja)
      .single();

    if (response.error && isMissingCommissionConfigColumnError(response.error)) {
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
    const { statusTexto } = resolveStoreStatus(store);

    return {
      nome: store.nome,
      status: statusTexto,
      imagemfundo: store.imagemfundo || "",
      icon: store.icon || "",
      morada: store.morada_completa || "",
      taxaentrega: Number(store.taxaentrega || 0),
      comissao_pedeja_percent: Number(store.comissao_pedeja_percent || 0),
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
      comissao_pedeja_percent: 0,
      configuracoes_comissao: null,
      horario_funcionamento: null,
      subCategorias: [],
    };
  }
}



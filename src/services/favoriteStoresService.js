import { fetchGlobalDeliveryPricingConfig, supabase } from "./supabaseClient";
import { resolveDeliveryPricingMaxKm, resolveEffectiveDeliveryPricingConfig, resolveMinimumDeliveryFee } from "./deliveryZoneService";
import { extractUserId } from "../utils/roles";
import { isStoreOpenNow } from "../utils/storeHours";

function normalizeUserId(user) {
  const userId = extractUserId(user);
  return userId ? String(userId).trim() : "";
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

function buildStoreSubCategories(loja) {
  const categoryMap = new Map();

  (loja?.categoriaslojas || []).forEach((entry) => {
    const category = entry?.categorias;
    const key = normalizeText(category?.categoria);
    if (!key || categoryMap.has(key)) return;

    categoryMap.set(key, {
      idcategoria: category?.idcategoria ?? key,
      categoria: category?.categoria,
    });
  });

  return Array.from(categoryMap.values());
}

function isMissingFavoritesStorageError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("favorite_stores")
    && (message.includes("does not exist") || message.includes("relation") || message.includes("table"))
  );
}

function isMissingDeliveryConfigColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("configuracao_entrega") && message.includes("column");
}

function mapFavoriteStore(loja, globalDeliveryPricingConfig = null) {
  const { statusTexto, statusCor, isIndisponivel } = resolveStoreStatus(loja);
  const configuracaoEntrega = resolveEffectiveDeliveryPricingConfig(
    loja.configuracao_entrega,
    globalDeliveryPricingConfig,
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
    contacto: loja.contacto || null,
    taxaentrega: resolveMinimumDeliveryFee(configuracaoEntrega, loja.taxaentrega),
    configuracao_entrega: configuracaoEntrega,
    raioentrega_km: resolveDeliveryPricingMaxKm(configuracaoEntrega),
    morada: loja.morada_completa || null,
    horario_funcionamento: loja.horario_funcionamento || null,
    subCategorias: buildStoreSubCategories(loja),
  };
}

export async function fetchFavoriteStoreIds(user) {
  const userId = normalizeUserId(user);
  if (!userId) return [];

  const { data, error } = await supabase
    .from("favorite_stores")
    .select("loja_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingFavoritesStorageError(error)) return [];
    throw error;
  }

  return (data || []).map((item) => Number(item.loja_id)).filter(Number.isFinite);
}

export async function fetchFavoriteStores(user) {
  const favoriteIds = await fetchFavoriteStoreIds(user);
  if (!favoriteIds.length) return [];
  const globalDeliveryPricing = await fetchGlobalDeliveryPricingConfig();

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
      configuracao_entrega,
      morada_completa,
      horario_funcionamento,
      categoriaslojas (
        categorias (idcategoria, categoria)
      )
    `)
    .in("idloja", favoriteIds);

  if (response.error && isMissingDeliveryConfigColumnError(response.error)) {
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
        horario_funcionamento,
        categoriaslojas (
          categorias (idcategoria, categoria)
        )
      `)
      .in("idloja", favoriteIds);
  }

  if (response.error) throw response.error;

  const byId = new Map(((response.data) || []).map((loja) => [
    Number(loja.idloja),
    mapFavoriteStore(loja, globalDeliveryPricing?.config),
  ]));
  return favoriteIds.map((id) => byId.get(Number(id))).filter(Boolean);
}

export async function toggleFavoriteStore(user, lojaId) {
  const userId = normalizeUserId(user);
  if (!userId) {
    throw new Error("Inicia sessao para guardar restaurantes favoritos.");
  }

  const normalizedLojaId = Number(lojaId);
  if (!Number.isFinite(normalizedLojaId)) {
    throw new Error("Loja invalida para favoritos.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("favorite_stores")
    .select("id")
    .eq("user_id", userId)
    .eq("loja_id", normalizedLojaId)
    .maybeSingle();

  if (existingError && !isMissingFavoritesStorageError(existingError)) {
    throw existingError;
  }

  if (isMissingFavoritesStorageError(existingError)) {
    throw new Error("A tabela de favoritos ainda nao existe. Executa a migration 012.");
  }

  if (existing?.id) {
    const { error } = await supabase
      .from("favorite_stores")
      .delete()
      .eq("id", existing.id);

    if (error) throw error;

    return { isFavorite: false };
  }

  const { error } = await supabase
    .from("favorite_stores")
    .insert({
      user_id: userId,
      loja_id: normalizedLojaId,
    });

  if (error) throw error;

  return { isFavorite: true };
}

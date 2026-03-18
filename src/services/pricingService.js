function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJsonObject(value) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTextKey(value) {
  return normalizeText(value).toLowerCase();
}

function sanitizeCategoryPercentMap(rawEntries) {
  if (!rawEntries || typeof rawEntries !== "object" || Array.isArray(rawEntries)) {
    return {};
  }

  return Object.entries(rawEntries).reduce((acc, [rawCategory, rawPercent]) => {
    const category = normalizeText(rawCategory);
    if (!category) return acc;
    acc[category] = normalizeCommissionPercent(rawPercent);
    return acc;
  }, {});
}

function sanitizeItemPercentMap(rawEntries) {
  if (!rawEntries || typeof rawEntries !== "object" || Array.isArray(rawEntries)) {
    return {};
  }

  return Object.entries(rawEntries).reduce((acc, [rawItemId, rawPercent]) => {
    const itemId = normalizeText(rawItemId);
    if (!itemId) return acc;
    acc[itemId] = normalizeCommissionPercent(rawPercent);
    return acc;
  }, {});
}

function findCategoryPercent(categoryName, categoryMap) {
  const normalizedCategory = normalizeTextKey(categoryName);
  if (!normalizedCategory) return null;

  const match = Object.entries(categoryMap || {}).find(
    ([candidate]) => normalizeTextKey(candidate) === normalizedCategory,
  );

  return match ? normalizeCommissionPercent(match[1]) : null;
}

function resolveCommissionSource(pricingSource, item = null) {
  const candidateSource = pricingSource && typeof pricingSource === "object" && !Array.isArray(pricingSource)
    ? pricingSource
    : item;
  const candidateConfigObject = (
    candidateSource?.mode
    || candidateSource?.category_percents
    || candidateSource?.item_percents
    || candidateSource?.global_percent !== undefined
  )
    ? candidateSource
    : null;

  const parsedConfig = parseJsonObject(
    candidateSource?.configuracoes_comissao
      ?? candidateSource?.commissionConfig
      ?? candidateSource?.config
      ?? candidateConfigObject,
  ) || candidateConfigObject;

  const globalPercent = normalizeCommissionPercent(
    candidateSource?.comissao_pedeja_percent
      ?? candidateSource?.global_percent
      ?? candidateSource?.globalPercent
      ?? parsedConfig?.global_percent
      ?? 0,
  );

  return {
    globalPercent,
    config: sanitizeCommissionConfig(parsedConfig, globalPercent),
  };
}

export function normalizeCommissionPercent(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  if (parsed > 100) return 100;
  return Number(parsed.toFixed(2));
}

export function sanitizeCommissionConfig(rawConfig, fallbackGlobal = 0) {
  const parsed = parseJsonObject(rawConfig);
  const globalPercent = normalizeCommissionPercent(
    parsed?.global_percent
      ?? parsed?.globalPercent
      ?? fallbackGlobal,
  );

  const mode = ["global", "category", "item"].includes(parsed?.mode)
    ? parsed.mode
    : "global";

  return {
    mode,
    global_percent: globalPercent,
    category_percents: sanitizeCategoryPercentMap(
      parsed?.category_percents ?? parsed?.categoryPercents,
    ),
    item_percents: sanitizeItemPercentMap(
      parsed?.item_percents ?? parsed?.itemPercents,
    ),
  };
}

export function resolveMenuItemCategoryName(item) {
  const directCategory = normalizeText(item?.categoria_menu ?? item?.categoria ?? item?.tipomenu);
  if (directCategory) return directCategory;

  const relation = item?.tiposmenu;
  if (Array.isArray(relation)) {
    return normalizeText(relation[0]?.tipomenu) || "Geral";
  }

  return normalizeText(relation?.tipomenu) || "Geral";
}

export function resolveCommissionPercentForItem(item, pricingSource = null) {
  const source = resolveCommissionSource(pricingSource, item);
  const itemId = normalizeText(item?.idmenu ?? item?.menu_id ?? item?.id);
  const categoryName = resolveMenuItemCategoryName(item);
  const itemPercent = itemId ? source.config.item_percents[itemId] : null;
  const categoryPercent = findCategoryPercent(categoryName, source.config.category_percents);

  if (source.config.mode === "item" && itemPercent !== undefined && itemPercent !== null) {
    return normalizeCommissionPercent(itemPercent);
  }

  if ((source.config.mode === "item" || source.config.mode === "category") && categoryPercent !== null) {
    return normalizeCommissionPercent(categoryPercent);
  }

  return normalizeCommissionPercent(source.config.global_percent ?? source.globalPercent);
}

export function calculateMarkupPrice(basePrice, commissionPercent = 0) {
  const safeBasePrice = toFiniteNumber(basePrice, 0);
  const safeCommission = normalizeCommissionPercent(commissionPercent);
  return Number((safeBasePrice * (1 + safeCommission / 100)).toFixed(2));
}

export function resolveDisplayPrice(item, pricingSource = null) {
  const basePrice = toFiniteNumber(item?.preco_base ?? item?.preco, 0);
  const commissionPercent = resolveCommissionPercentForItem(item, pricingSource);
  return calculateMarkupPrice(basePrice, commissionPercent);
}

export function normalizePricedItem(item, pricingSource = null) {
  const basePrice = toFiniteNumber(item?.preco_base ?? item?.preco, 0);
  const source = resolveCommissionSource(pricingSource, item);
  const appliedPercent = resolveCommissionPercentForItem(item, pricingSource);
  const categoryName = resolveMenuItemCategoryName(item);

  return {
    ...item,
    preco: basePrice,
    preco_base: basePrice,
    categoria_menu: categoryName,
    comissao_pedeja_percent: source.globalPercent,
    comissao_pedeja_percent_aplicada: appliedPercent,
    configuracoes_comissao: source.config,
    preco_cliente: calculateMarkupPrice(basePrice, appliedPercent),
  };
}

export function normalizeGroupedMenuPricing(groupedMenu, pricingSource = null) {
  return Object.entries(groupedMenu || {}).reduce((acc, [categoryName, items]) => {
    acc[categoryName] = (items || []).map((item) => normalizePricedItem(
      { ...item, categoria_menu: categoryName },
      pricingSource,
    ));
    return acc;
  }, {});
}

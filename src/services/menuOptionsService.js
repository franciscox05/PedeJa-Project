function toText(value) {
  return String(value || "").trim();
}

function toPrice(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(2)) : 0;
}

function toBoolean(value, fallback = false) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (!text) return fallback;
  return ["true", "1", "yes", "sim"].includes(text);
}

function toPositiveInt(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.trunc(parsed));
}

function toNonNegativeInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeDependencyOptionIds(value) {
  const parsed = parseJsonArray(value);
  const normalized = parsed
    .map((entry) => toText(entry))
    .filter(Boolean);

  return [...new Set(normalized)];
}

function normalizeId(prefix, value, index) {
  const raw = toText(value);
  return raw || `${prefix}-${index + 1}`;
}

function compareBySortOrder(a, b) {
  const sortA = Number(a?.sort_order ?? a?.sortOrder ?? 0);
  const sortB = Number(b?.sort_order ?? b?.sortOrder ?? 0);

  if (sortA !== sortB) return sortA - sortB;

  const createdA = new Date(a?.created_at || a?.createdAt || 0).getTime() || 0;
  const createdB = new Date(b?.created_at || b?.createdAt || 0).getTime() || 0;
  if (createdA !== createdB) return createdA - createdB;

  return String(a?.id || "").localeCompare(String(b?.id || ""));
}

export function normalizeMenuOptionType(value) {
  const text = toText(value).toLowerCase();
  if (["extra", "extras"].includes(text)) return "extra";
  if (["complementar", "complementares", "complemento", "complementos"].includes(text)) return "complementar";
  if (["sugestao", "sugestoes", "sugestão", "sugestões"].includes(text)) return "sugestao";
  return "extra";
}

export function getMenuOptionTypeLabel(value) {
  const type = normalizeMenuOptionType(value);
  if (type === "complementar") return "Complementar";
  if (type === "sugestao") return "Sugestao";
  return "Extra";
}

export function sanitizeMenuOptionsConfig(rawConfig) {
  const groups = parseJsonArray(rawConfig);

  return groups
    .map((group, groupIndex) => {
      const title = toText(group?.title || group?.titulo || group?.name || group?.label);
      const options = parseJsonArray(group?.options || group?.opcoes)
        .map((option, optionIndex) => ({
          id: normalizeId(`option-${groupIndex + 1}`, option?.id || option?.value, optionIndex),
          name: toText(option?.name || option?.nome || option?.label),
          price: toPrice(option?.price ?? option?.preco),
          defaultSelected: toBoolean(option?.defaultSelected ?? option?.default_selected, false),
          dependsOnOptionIds: normalizeDependencyOptionIds(
            option?.dependsOnOptionIds
            ?? option?.depends_on_option_ids
            ?? option?.depends_on_item_ids,
          ),
        }))
        .filter((option) => option.name);

      if (!title || options.length === 0) return null;

      const required = toBoolean(group?.required ?? group?.obrigatorio ?? group?.is_required, false);
      const maxSelections = toPositiveInt(
        group?.maxSelections ?? group?.max_selecoes ?? group?.max_choices ?? 1,
        1,
      );
      const rawMinSelections = group?.minSelections ?? group?.min_selecoes ?? group?.min_choices;
      const defaultMinSelections = required ? 1 : 0;
      const minSelections = Math.min(
        maxSelections,
        toNonNegativeInt(rawMinSelections, defaultMinSelections),
      );

      return {
        id: normalizeId("group", group?.id, groupIndex),
        title,
        type: normalizeMenuOptionType(group?.type || group?.tipo),
        required,
        minSelections: required ? Math.max(1, minSelections) : minSelections,
        maxSelections,
        dependsOnOptionIds: normalizeDependencyOptionIds(
          group?.dependsOnOptionIds
          ?? group?.depends_on_option_ids
          ?? group?.depends_on_item_ids,
        ),
        options,
      };
    })
    .filter(Boolean);
}

export function buildMenuOptionGroupFromLibraryRecord(group = {}, rawItems = [], linkedMenuIds = []) {
  const items = (Array.isArray(rawItems) ? rawItems : [])
    .filter((item) => item?.ativo !== false)
    .sort(compareBySortOrder)
    .map((item) => ({
      id: normalizeId("option", item?.id, 0),
      name: toText(item?.nome || item?.name || item?.label),
      price: toPrice(item?.preco ?? item?.price),
      defaultSelected: toBoolean(item?.default_selected ?? item?.defaultSelected, false),
      dependsOnOptionIds: normalizeDependencyOptionIds(
        item?.depends_on_option_ids
        ?? item?.depends_on_item_ids
        ?? item?.dependsOnOptionIds,
      ),
    }))
    .filter((item) => item.name);

  const [normalizedGroup] = sanitizeMenuOptionsConfig([
    {
      id: normalizeId("group", group?.id, 0),
      title: group?.titulo || group?.title || group?.name,
      type: group?.tipo || group?.type,
      required: group?.obrigatorio ?? group?.required ?? group?.is_required,
      minSelections: group?.min_selecoes ?? group?.minSelections ?? group?.min_choices,
      maxSelections: group?.max_selecoes ?? group?.maxSelections ?? group?.max_choices ?? 1,
      dependsOnOptionIds: group?.depends_on_option_ids
        ?? group?.depends_on_item_ids
        ?? group?.dependsOnOptionIds,
      options: items,
    },
  ]);

  if (!normalizedGroup) return null;

  return {
    ...normalizedGroup,
    library_group_id: String(group?.id || normalizedGroup.id),
    linked_menu_ids: Array.isArray(linkedMenuIds) ? linkedMenuIds.map((id) => String(id)) : [],
    linked_menu_count: Array.isArray(linkedMenuIds) ? linkedMenuIds.length : 0,
    ativo: group?.ativo !== false,
    sort_order: Number(group?.sort_order ?? 0) || 0,
    updated_at: group?.updated_at || null,
  };
}

export function mergeMenuOptionConfigurations(linkedGroups = [], embeddedGroups = []) {
  const normalizedLinkedGroups = (Array.isArray(linkedGroups) ? linkedGroups : []).filter(Boolean);
  const normalizedEmbeddedGroups = sanitizeMenuOptionsConfig(embeddedGroups);
  const usedLibraryIds = new Set(
    normalizedLinkedGroups
      .map((group) => String(group?.library_group_id || ""))
      .filter(Boolean),
  );

  const merged = [...normalizedLinkedGroups];

  normalizedEmbeddedGroups.forEach((group) => {
    const libraryId = String(group?.library_group_id || "");
    if (libraryId && usedLibraryIds.has(libraryId)) return;
    merged.push(group);
  });

  return merged;
}

export function describeMenuOptionSelectionMode(group = {}) {
  const maxSelections = toPositiveInt(group?.maxSelections ?? group?.max_selecoes ?? group?.max_choices ?? 1, 1);
  const minSelections = toNonNegativeInt(group?.minSelections ?? group?.min_selecoes ?? group?.min_choices ?? 0, 0);
  const required = Boolean(group?.required ?? group?.obrigatorio ?? group?.is_required);
  const effectiveMin = required ? Math.max(1, Math.min(minSelections || 1, maxSelections)) : Math.min(minSelections, maxSelections);

  if (required && maxSelections <= 1) return "Obrigatorio - escolha 1";
  if (!required && maxSelections <= 1) return "Opcional - ate 1";
  if (required) {
    if (effectiveMin > 1) return `Obrigatorio - de ${effectiveMin} ate ${maxSelections}`;
    return `Obrigatorio - ate ${maxSelections}`;
  }
  if (effectiveMin > 0) return `Opcional - de ${effectiveMin} ate ${maxSelections}`;
  return `Opcional - ate ${maxSelections}`;
}

export function buildDefaultMenuOptionSelections(groups = []) {
  return sanitizeMenuOptionsConfig(groups).reduce((acc, group) => {
    const selectedIds = group.options
      .filter((option) => option.defaultSelected)
      .slice(0, group.maxSelections)
      .map((option) => option.id);

    if (selectedIds.length > 0) {
      acc[group.id] = selectedIds;
    }

    return acc;
  }, {});
}

export function hasMissingRequiredMenuOptions(groups = [], selections = {}) {
  return sanitizeMenuOptionsConfig(groups).some((group) => {
    if (!Array.isArray(group?.options) || group.options.length === 0) return false;
    if (!group.required) return false;
    const selectedIds = Array.isArray(selections?.[group.id]) ? selections[group.id] : [];
    const requiredMin = Math.max(1, toNonNegativeInt(group?.minSelections ?? 1, 1));
    return selectedIds.length < requiredMin;
  });
}

export function validateMenuOptionSelections(groups = [], selections = {}) {
  const normalizedGroups = sanitizeMenuOptionsConfig(groups);
  const byGroup = {};
  let hasBlockingError = false;
  let missingRequired = false;
  let overLimit = false;

  normalizedGroups.forEach((group) => {
    if (!Array.isArray(group?.options) || group.options.length === 0) return;
    const validOptionIds = new Set(group.options.map((option) => option.id));
    const selectedIds = [
      ...new Set(
        (Array.isArray(selections?.[group.id]) ? selections[group.id] : [])
          .filter((optionId) => validOptionIds.has(optionId)),
      ),
    ];
    const selectedCount = selectedIds.length;
    const minSelections = group.required
      ? Math.max(1, toNonNegativeInt(group?.minSelections ?? 1, 1))
      : toNonNegativeInt(group?.minSelections ?? 0, 0);
    const maxSelections = toPositiveInt(group?.maxSelections ?? 1, 1);

    if (selectedCount > maxSelections) {
      byGroup[group.id] = `Escolhe no maximo ${maxSelections}.`;
      hasBlockingError = true;
      overLimit = true;
      return;
    }

    if (selectedCount < minSelections) {
      byGroup[group.id] = minSelections <= 1
        ? "Escolha obrigatoria."
        : `Escolhe pelo menos ${minSelections}.`;
      hasBlockingError = true;
      if (group.required) {
        missingRequired = true;
      }
    }
  });

  return {
    byGroup,
    hasBlockingError,
    missingRequired,
    overLimit,
  };
}

function applyOptionMarkup(price, commissionPercent = 0) {
  const basePrice = toPrice(price);
  const safeCommission = Number(commissionPercent);
  if (!Number.isFinite(safeCommission) || safeCommission <= 0) {
    return basePrice;
  }
  return Number((basePrice * (1 + safeCommission / 100)).toFixed(2));
}

export function buildSelectedMenuOptions(groups = [], selections = {}, commissionPercent = 0) {
  return sanitizeMenuOptionsConfig(groups).flatMap((group) => {
    const validOptionIds = new Set(group.options.map((option) => option.id));
    let selectedIds = [
      ...new Set(
        (Array.isArray(selections?.[group.id]) ? selections[group.id] : [])
          .filter((optionId) => validOptionIds.has(optionId)),
      ),
    ];

    if (group.maxSelections <= 1) {
      selectedIds = selectedIds.slice(0, 1);
    } else {
      selectedIds = selectedIds.slice(0, toPositiveInt(group.maxSelections, 1));
    }

    return group.options
      .filter((option) => selectedIds.includes(option.id))
      .map((option) => ({
        group_id: group.id,
        group_title: group.title,
        group_type: group.type,
        option_id: option.id,
        option_name: option.name,
        price_base: option.price,
        price_cliente: applyOptionMarkup(option.price, commissionPercent),
      }));
  });
}

export function normalizeSelectedMenuOptions(rawSelectedOptions = [], commissionPercent = 0) {
  const selectedOptions = parseJsonArray(rawSelectedOptions);

  return selectedOptions
    .map((entry, index) => {
      const optionName = toText(entry?.option_name || entry?.optionName || entry?.nome);
      if (!optionName) return null;

      const priceBase = toPrice(entry?.price_base ?? entry?.priceBase ?? entry?.preco ?? 0);
      const explicitDisplayPrice = Number(entry?.price_cliente ?? entry?.priceCliente);
      const priceCliente = Number.isFinite(explicitDisplayPrice)
        ? Number(explicitDisplayPrice.toFixed(2))
        : applyOptionMarkup(priceBase, commissionPercent);

      return {
        group_id: normalizeId("group", entry?.group_id || entry?.groupId, index),
        group_title: toText(entry?.group_title || entry?.groupTitle || entry?.grupo || "Opcoes"),
        group_type: normalizeMenuOptionType(entry?.group_type || entry?.groupType || entry?.tipo),
        option_id: normalizeId("option", entry?.option_id || entry?.optionId, index),
        option_name: optionName,
        price_base: priceBase,
        price_cliente: priceCliente,
      };
    })
    .filter(Boolean);
}

export function sumSelectedMenuOptions(selectedOptions = [], field = "price_cliente") {
  return normalizeSelectedMenuOptions(selectedOptions).reduce(
    (total, option) => total + toPrice(option?.[field]),
    0,
  );
}

export function groupSelectedMenuOptionsForDisplay(rawSelectedOptions = []) {
  const groupsMap = new Map();

  normalizeSelectedMenuOptions(rawSelectedOptions).forEach((option) => {
    const key = `${option.group_id}::${option.group_title}`;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        groupId: option.group_id,
        title: option.group_title,
        type: option.group_type,
        options: [],
      });
    }

    groupsMap.get(key).options.push(option);
  });

  return [...groupsMap.values()];
}

export function buildCartLineId(item = {}) {
  const menuId = toText(item?.idmenu ?? item?.menu_id ?? item?.id);
  const selectedSignature = normalizeSelectedMenuOptions(item?.opcoes_selecionadas || item?.selected_options)
    .map((option) => `${option.group_id}:${option.option_id}`)
    .sort()
    .join("|");
  const specialInstructions = toText(
    item?.instrucoes_especiais
    ?? item?.specialInstructions
    ?? item?.special_instructions,
  ).toLowerCase();
  const identitySegments = [];

  if (selectedSignature) {
    identitySegments.push(selectedSignature);
  }
  if (specialInstructions) {
    identitySegments.push(`note:${specialInstructions}`);
  }

  return identitySegments.length > 0
    ? `${menuId}::${identitySegments.join("|")}`
    : menuId;
}

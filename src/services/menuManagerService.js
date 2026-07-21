import { supabase, buildSupabaseFunctionHeaders, getSupabaseFunctionUrl } from "./supabaseClient";
import {
  buildMenuOptionGroupFromLibraryRecord,
  mergeMenuOptionConfigurations,
  normalizeMenuOptionType,
  sanitizeMenuOptionsConfig,
} from "./menuOptionsService";

let descriptionColumnPromise = null;
let menuOptionGroupSchemaPromise = null;
let menuOptionItemSchemaPromise = null;
let menuOptionLinkSchemaPromise = null;

function normalizePrice(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function normalizeLojaId(lojaId) {
  if (lojaId === null || lojaId === undefined || lojaId === "") return null;
  const parsed = Number(lojaId);
  return Number.isFinite(parsed) ? parsed : String(lojaId).trim();
}

function normalizeMenuId(idmenu) {
  const parsed = Number(idmenu);
  return Number.isFinite(parsed) ? parsed : idmenu;
}

function normalizeGroupId(groupId) {
  const parsed = Number(groupId);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOptionId(optionId) {
  const parsed = Number(optionId);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function normalizeGroupIdList(groupIds = []) {
  if (!Array.isArray(groupIds)) return [];

  return [...new Set(
    groupIds
      .map(normalizeGroupId)
      .filter((value) => Number.isFinite(value)),
  )];
}

function normalizeDependencyOptionIds(values = []) {
  if (!Array.isArray(values)) return [];
  return [...new Set(
    values
      .map(normalizeOptionId)
      .filter((value) => Number.isFinite(value)),
  )];
}

async function requestSignedImageUpload({ bucket, filename, contentType, callerUserId, lojaId }) {
  const headers = await buildSupabaseFunctionHeaders();

  const response = await fetch(getSupabaseFunctionUrl("request-image-upload"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      bucket,
      filename,
      content_type: contentType,
      caller_user_id: callerUserId,
      loja_id: lojaId,
    }),
  });

  const parsed = await response.json().catch(() => null);

  if (!response.ok || !parsed?.ok) {
    throw new Error(parsed?.error || "Falha ao preparar o upload da imagem.");
  }

  return parsed;
}

function toTrimmedText(value) {
  return String(value || "").trim();
}

function toBoolean(value, fallback = false) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "sim"].includes(String(value).trim().toLowerCase());
}

function isMissingMenuOptionLibraryTableError(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();
  const mentionsLibraryTable = [
    "menu_option_groups",
    "menu_option_items",
    "menu_option_group_links",
  ].some((tableName) => message.includes(tableName));

  return mentionsLibraryTable && (
    code === "42P01"
    || message.includes("does not exist")
    || message.includes("could not find the table")
  );
}

function ensureLibraryTablesAvailable(error) {
  if (!isMissingMenuOptionLibraryTableError(error)) {
    throw error;
  }

  throw new Error(
    "A biblioteca de extras ainda nao existe na base de dados. Corre as migrations 021_shared_menu_option_library.sql, 022_menu_modifier_order_and_dependencies.sql e 023_menu_group_dependencies.sql antes de usar esta funcionalidade.",
  );
}

function isMissingColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("could not find")
    || message.includes("schema cache")
    || (message.includes("column") && message.includes("menu_option_groups"));
}

function isPermissionOrPolicyError(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();
  return code === "42501"
    || message.includes("permission denied")
    || message.includes("row-level security")
    || message.includes("policy");
}

async function doesMenuOptionGroupColumnExist(columnName) {
  if (!columnName) return false;

  const { error } = await supabase
    .from("menu_option_groups")
    .select(`id,${columnName}`)
    .limit(1);

  if (!error) return true;
  if (isMissingMenuOptionLibraryTableError(error) || isMissingColumnError(error) || isPermissionOrPolicyError(error)) {
    return false;
  }
  throw error;
}

async function doesMenuOptionItemColumnExist(columnName) {
  if (!columnName) return false;

  const { error } = await supabase
    .from("menu_option_items")
    .select(`id,${columnName}`)
    .limit(1);

  if (!error) return true;
  if (isMissingMenuOptionLibraryTableError(error) || isMissingColumnError(error) || isPermissionOrPolicyError(error)) {
    return false;
  }
  throw error;
}

async function doesMenuOptionLinkColumnExist(columnName) {
  if (!columnName) return false;

  const { error } = await supabase
    .from("menu_option_group_links")
    .select(`id,${columnName}`)
    .limit(1);

  if (!error) return true;
  if (isMissingMenuOptionLibraryTableError(error) || isMissingColumnError(error) || isPermissionOrPolicyError(error)) {
    return false;
  }
  throw error;
}

async function detectMenuOptionGroupSchema() {
  if (menuOptionGroupSchemaPromise) return menuOptionGroupSchemaPromise;

  menuOptionGroupSchemaPromise = (async () => {
    const [
      hasTitulo,
      hasName,
      hasTipo,
      hasType,
      hasObrigatorio,
      hasIsRequired,
      hasMinChoices,
      hasMinSelecoes,
      hasMaxChoices,
      hasMaxSelecoes,
      hasDependsOnOptionIds,
      hasDependsOnItemIds,
      hasSortOrder,
    ] = await Promise.all([
      doesMenuOptionGroupColumnExist("titulo"),
      doesMenuOptionGroupColumnExist("name"),
      doesMenuOptionGroupColumnExist("tipo"),
      doesMenuOptionGroupColumnExist("type"),
      doesMenuOptionGroupColumnExist("obrigatorio"),
      doesMenuOptionGroupColumnExist("is_required"),
      doesMenuOptionGroupColumnExist("min_choices"),
      doesMenuOptionGroupColumnExist("min_selecoes"),
      doesMenuOptionGroupColumnExist("max_choices"),
      doesMenuOptionGroupColumnExist("max_selecoes"),
      doesMenuOptionGroupColumnExist("depends_on_option_ids"),
      doesMenuOptionGroupColumnExist("depends_on_item_ids"),
      doesMenuOptionGroupColumnExist("sort_order"),
    ]);

    return {
      titleColumn: hasTitulo ? "titulo" : (hasName ? "name" : "titulo"),
      typeColumn: hasTipo ? "tipo" : (hasType ? "type" : "tipo"),
      requiredColumn: hasObrigatorio ? "obrigatorio" : (hasIsRequired ? "is_required" : "obrigatorio"),
      minChoicesColumn: hasMinChoices ? "min_choices" : (hasMinSelecoes ? "min_selecoes" : null),
      maxChoicesColumn: hasMaxChoices ? "max_choices" : (hasMaxSelecoes ? "max_selecoes" : "max_selecoes"),
      dependsOnColumn: hasDependsOnOptionIds ? "depends_on_option_ids" : (hasDependsOnItemIds ? "depends_on_item_ids" : null),
      hasSortOrder: Boolean(hasSortOrder),
    };
  })();

  return menuOptionGroupSchemaPromise;
}

async function detectMenuOptionItemSchema() {
  if (menuOptionItemSchemaPromise) return menuOptionItemSchemaPromise;

  menuOptionItemSchemaPromise = (async () => {
    const [
      hasNome,
      hasName,
      hasPreco,
      hasPriceModifier,
      hasPrice,
      hasDefaultSelected,
      hasIsDefault,
      hasSortOrder,
      hasDependsOnOptionIds,
      hasDependsOnItemIds,
      hasAtivo,
      hasUpdatedAt,
    ] = await Promise.all([
      doesMenuOptionItemColumnExist("nome"),
      doesMenuOptionItemColumnExist("name"),
      doesMenuOptionItemColumnExist("preco"),
      doesMenuOptionItemColumnExist("price_modifier"),
      doesMenuOptionItemColumnExist("price"),
      doesMenuOptionItemColumnExist("default_selected"),
      doesMenuOptionItemColumnExist("is_default"),
      doesMenuOptionItemColumnExist("sort_order"),
      doesMenuOptionItemColumnExist("depends_on_option_ids"),
      doesMenuOptionItemColumnExist("depends_on_item_ids"),
      doesMenuOptionItemColumnExist("ativo"),
      doesMenuOptionItemColumnExist("updated_at"),
    ]);

    return {
      nameColumn: hasNome ? "nome" : (hasName ? "name" : "nome"),
      priceColumn: hasPreco ? "preco" : (hasPriceModifier ? "price_modifier" : (hasPrice ? "price" : "preco")),
      defaultColumn: hasDefaultSelected ? "default_selected" : (hasIsDefault ? "is_default" : null),
      dependsOnColumn: hasDependsOnOptionIds ? "depends_on_option_ids" : (hasDependsOnItemIds ? "depends_on_item_ids" : null),
      hasSortOrder,
      hasAtivo,
      hasUpdatedAt,
    };
  })();

  return menuOptionItemSchemaPromise;
}

async function detectMenuOptionLinkSchema() {
  if (menuOptionLinkSchemaPromise) return menuOptionLinkSchemaPromise;

  menuOptionLinkSchemaPromise = (async () => ({
    hasSortOrder: await doesMenuOptionLinkColumnExist("sort_order"),
  }))();

  return menuOptionLinkSchemaPromise;
}

function mapMenuRow(row, resolvedLibrary = {}) {
  const linkedGroups = Array.isArray(resolvedLibrary?.linkedGroups) ? resolvedLibrary.linkedGroups : [];
  const linkedGroupIds = Array.isArray(resolvedLibrary?.linkedGroupIds) ? resolvedLibrary.linkedGroupIds : [];
  const legacyGroups = sanitizeMenuOptionsConfig(row?.configuracao_opcoes);

  return {
    idmenu: row?.idmenu,
    idloja: row?.idloja,
    nome: row?.nome || "",
    desc: row?.desc ?? row?.descricao ?? row?.desricao ?? null,
    preco: row?.preco ?? 0,
    imagem: row?.imagem || null,
    ativo: row?.ativo,
    visivel: row?.visivel !== false,
    idtipomenu: row?.idtipomenu ?? null,
    configuracao_opcoes: mergeMenuOptionConfigurations(linkedGroups, legacyGroups),
    raw_configuracao_opcoes: legacyGroups,
    menu_option_group_ids: linkedGroupIds.map((id) => String(id)),
    linked_option_groups: linkedGroups,
  };
}

async function detectDescriptionColumn() {
  if (descriptionColumnPromise) return descriptionColumnPromise;

  descriptionColumnPromise = (async () => {
    const testDesc = await supabase.from("menus").select("idmenu,desc").limit(1);
    if (!testDesc.error) return "desc";

    const testDescricao = await supabase.from("menus").select("idmenu,descricao").limit(1);
    if (!testDescricao.error) return "descricao";

    const testDesricao = await supabase.from("menus").select("idmenu,desricao").limit(1);
    if (!testDesricao.error) return "desricao";

    return null;
  })();

  return descriptionColumnPromise;
}

function buildMenuBody(payload, descriptionColumn) {
  const body = {
    nome: String(payload.nome || "").trim(),
    preco: normalizePrice(payload.preco),
    imagem: payload.imagem || null,
    ativo: payload.ativo ?? true,
    visivel: payload.visivel ?? true,
    idtipomenu: payload.idtipomenu ? Number(payload.idtipomenu) : null,
    configuracao_opcoes: sanitizeMenuOptionsConfig(payload.configuracao_opcoes),
  };

  if (descriptionColumn === "desc") {
    body.desc = payload.desc || null;
  } else if (descriptionColumn === "descricao") {
    body.descricao = payload.desc || null;
  } else if (descriptionColumn === "desricao") {
    body.desricao = payload.desc || null;
  }

  return body;
}

async function buildLibraryGroupBody(lojaId, payload) {
  const schema = await detectMenuOptionGroupSchema();
  const required = toBoolean(payload?.required ?? payload?.obrigatorio ?? payload?.is_required, false);
  const maxSelections = Math.max(1, Number(payload?.maxSelections ?? payload?.max_selecoes ?? payload?.max_choices ?? 1) || 1);
  const rawMinSelections = Number(payload?.minSelections ?? payload?.min_selecoes ?? payload?.min_choices ?? (required ? 1 : 0));
  const minSelections = Math.max(
    0,
    Math.min(
      maxSelections,
      Number.isFinite(rawMinSelections) ? Math.trunc(rawMinSelections) : (required ? 1 : 0),
    ),
  );

  const body = {
    idloja: normalizeLojaId(lojaId),
    ativo: payload?.ativo !== false,
    updated_at: new Date().toISOString(),
  };

  body[schema.titleColumn] = toTrimmedText(payload?.title || payload?.titulo || payload?.name);
  body[schema.typeColumn] = normalizeMenuOptionType(payload?.type || payload?.tipo);
  if (schema.requiredColumn) body[schema.requiredColumn] = required;
  if (schema.minChoicesColumn) body[schema.minChoicesColumn] = required ? Math.max(1, minSelections) : minSelections;
  if (schema.maxChoicesColumn) body[schema.maxChoicesColumn] = maxSelections;
  if (schema.dependsOnColumn) {
    body[schema.dependsOnColumn] = normalizeDependencyOptionIds(
      payload?.dependsOnOptionIds
      ?? payload?.depends_on_option_ids
      ?? payload?.depends_on_item_ids,
    );
  }
  if (schema.hasSortOrder) {
    const rawSortOrder = Number(payload?.sortOrder ?? payload?.sort_order);
    if (Number.isFinite(rawSortOrder)) {
      body.sort_order = Math.max(0, Math.trunc(rawSortOrder));
    }
  }

  return body;
}

async function buildLibraryItemBodies(groupId, options = []) {
  const schema = await detectMenuOptionItemSchema();

  return (Array.isArray(options) ? options : [])
    .map((option, index) => {
      const name = toTrimmedText(option?.name || option?.nome || option?.label);
      const optionId = normalizeOptionId(
        option?.id
        ?? option?.option_id
        ?? option?.optionId,
      );
      const body = {
        grupo_id: groupId,
        _optionId: optionId,
      };
      body[schema.nameColumn] = name;
      body[schema.priceColumn] = normalizePrice(
        option?.price ?? option?.preco ?? option?.price_modifier,
      );
      if (schema.defaultColumn) body[schema.defaultColumn] = toBoolean(option?.defaultSelected ?? option?.default_selected, false);
      if (schema.dependsOnColumn) {
        body[schema.dependsOnColumn] = normalizeDependencyOptionIds(
          option?.dependsOnOptionIds
          ?? option?.depends_on_option_ids
          ?? option?.depends_on_item_ids,
        );
      }
      if (schema.hasAtivo) body.ativo = option?.ativo !== false;
      if (schema.hasSortOrder) body.sort_order = index;
      if (schema.hasUpdatedAt) body.updated_at = new Date().toISOString();
      return body;
    })
    .filter((option) => {
      const name = option[schema.nameColumn];
      return String(name || "").trim().length > 0;
    });
}

async function loadMenuOptionLibraryDataset(lojaId) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  if (!normalizedLojaId) {
    return {
      available: false,
      groups: [],
      groupMap: new Map(),
      linksByMenuId: new Map(),
    };
  }

  const { data: groupRows, error: groupsError } = await supabase
    .from("menu_option_groups")
    .select("*")
    .eq("idloja", normalizedLojaId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (groupsError) {
    if (isMissingMenuOptionLibraryTableError(groupsError)) {
      return {
        available: false,
        groups: [],
        groupMap: new Map(),
        linksByMenuId: new Map(),
      };
    }

    throw groupsError;
  }

  const groupIds = (groupRows || []).map((group) => group.id).filter((id) => id !== null && id !== undefined);

  if (groupIds.length === 0) {
    return {
      available: true,
      groups: [],
      groupMap: new Map(),
      linksByMenuId: new Map(),
    };
  }

  const linkSchema = await detectMenuOptionLinkSchema();
  const linkColumns = linkSchema.hasSortOrder
    ? "id, idmenu, grupo_id, sort_order"
    : "id, idmenu, grupo_id";
  let linkQuery = supabase
    .from("menu_option_group_links")
    .select(linkColumns)
    .in("grupo_id", groupIds)
    .order("idmenu", { ascending: true });

  if (linkSchema.hasSortOrder) {
    linkQuery = linkQuery.order("sort_order", { ascending: true });
  }
  linkQuery = linkQuery.order("id", { ascending: true });

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
    linkQuery,
  ]);

  if (itemsError) {
    if (isMissingMenuOptionLibraryTableError(itemsError)) {
      return {
        available: false,
        groups: [],
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
        groups: [],
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

  const groups = (groupRows || [])
    .map((group) => buildMenuOptionGroupFromLibraryRecord(
      group,
      itemsByGroup.get(String(group.id)) || [],
      linkedMenuIdsByGroup.get(String(group.id)) || [],
    ))
    .filter(Boolean);

  const groupMap = new Map(
    groups.map((group) => [String(group.library_group_id || group.id), group]),
  );

  return {
    available: true,
    groups,
    groupMap,
    linksByMenuId,
  };
}

async function syncMenuOptionGroupLinks(idmenu, groupIds = [], callerUserId = null) {
  const normalizedMenuId = normalizeMenuId(idmenu);
  const normalizedGroupIds = normalizeGroupIdList(groupIds);
  const normalizedCallerUserId = Number(callerUserId);
  if (!Number.isFinite(normalizedCallerUserId)) {
    throw new Error("Sessao invalida: inicia sessao novamente para gerir os extras deste prato.");
  }

  const { error } = await supabase.rpc("menu_manager_sync_menu_option_links", {
    caller_user_id: normalizedCallerUserId,
    idmenu_input: normalizedMenuId,
    group_ids: normalizedGroupIds,
  });

  if (error) ensureLibraryTablesAvailable(error);
}

export async function fetchMenus(lojaId) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  if (!normalizedLojaId) return [];

  const { data, error } = await supabase
    .from("menus")
    .select("*")
    .eq("idloja", normalizedLojaId)
    .order("idmenu", { ascending: false });

  if (error) throw error;

  const libraryDataset = await loadMenuOptionLibraryDataset(normalizedLojaId);

  return (data || []).map((row) => {
    const menuKey = String(row?.idmenu || "");
    const linkedGroupIds = libraryDataset.linksByMenuId.get(menuKey) || [];
    const linkedGroups = linkedGroupIds
      .map((groupId) => libraryDataset.groupMap.get(String(groupId)))
      .filter(Boolean);

    return mapMenuRow(row, {
      linkedGroups,
      linkedGroupIds,
    });
  });
}

export async function fetchMenuOptionLibrary(lojaId) {
  const dataset = await loadMenuOptionLibraryDataset(lojaId);
  return dataset.groups;
}

export async function fetchMenuOptionGroupsByMenu(lojaId, idmenu) {
  const normalizedMenuId = normalizeMenuId(idmenu);
  if (!normalizedMenuId) return [];

  const dataset = await loadMenuOptionLibraryDataset(lojaId);
  const menuKey = String(normalizedMenuId);
  const linkedGroupIds = dataset.linksByMenuId.get(menuKey) || [];

  return linkedGroupIds
    .map((groupId) => dataset.groupMap.get(String(groupId)))
    .filter(Boolean);
}

export async function linkMenuOptionLibraryGroupToMenu(idmenu, groupId, callerUserId) {
  const normalizedMenuId = normalizeMenuId(idmenu);
  const normalizedGroupId = normalizeGroupId(groupId);
  if (!normalizedMenuId || !Number.isFinite(normalizedGroupId)) {
    throw new Error("Menu ou grupo invalido para associar.");
  }

  const linkSchema = await detectMenuOptionLinkSchema();
  const selectColumns = linkSchema.hasSortOrder
    ? "grupo_id, sort_order, id"
    : "grupo_id, id";
  let linksQuery = supabase
    .from("menu_option_group_links")
    .select(selectColumns)
    .eq("idmenu", normalizedMenuId);

  if (linkSchema.hasSortOrder) {
    linksQuery = linksQuery.order("sort_order", { ascending: true });
  }
  linksQuery = linksQuery.order("id", { ascending: true });

  const { data: existingLinks, error: existingLinkError } = await linksQuery;

  if (existingLinkError) {
    ensureLibraryTablesAvailable(existingLinkError);
  }

  const orderedGroupIds = normalizeGroupIdList(
    (existingLinks || []).map((link) => link?.grupo_id),
  );
  if (!orderedGroupIds.includes(normalizedGroupId)) {
    orderedGroupIds.push(normalizedGroupId);
    await syncMenuOptionGroupLinks(normalizedMenuId, orderedGroupIds, callerUserId);
  }

  return { idmenu: normalizedMenuId, grupo_id: normalizedGroupId };
}

export async function unlinkMenuOptionLibraryGroupFromMenu(idmenu, groupId, callerUserId) {
  const normalizedMenuId = normalizeMenuId(idmenu);
  const normalizedGroupId = normalizeGroupId(groupId);
  if (!normalizedMenuId || !Number.isFinite(normalizedGroupId)) {
    throw new Error("Menu ou grupo invalido para remover associacao.");
  }

  const { data: existingLinks, error: existingLinkError } = await supabase
    .from("menu_option_group_links")
    .select("grupo_id")
    .eq("idmenu", normalizedMenuId);

  if (existingLinkError) ensureLibraryTablesAvailable(existingLinkError);

  const remainingGroupIds = normalizeGroupIdList(
    (existingLinks || []).map((link) => link?.grupo_id),
  ).filter((id) => id !== normalizedGroupId);

  await syncMenuOptionGroupLinks(normalizedMenuId, remainingGroupIds, callerUserId);
}

export async function reorderMenuOptionGroupsByMenu(idmenu, orderedGroupIds = [], callerUserId) {
  const normalizedMenuId = normalizeMenuId(idmenu);
  if (!normalizedMenuId) {
    throw new Error("Menu invalido para ordenar grupos.");
  }

  await syncMenuOptionGroupLinks(normalizedMenuId, orderedGroupIds, callerUserId);
}

export async function reorderMenuOptionLibraryGroups(lojaId, orderedGroupIds = [], callerUserId) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  if (!normalizedLojaId) {
    throw new Error("Loja invalida para ordenar grupos da biblioteca.");
  }

  const normalizedGroupIds = normalizeGroupIdList(orderedGroupIds);
  if (normalizedGroupIds.length === 0) return;

  const normalizedCallerUserId = Number(callerUserId);
  if (!Number.isFinite(normalizedCallerUserId)) {
    throw new Error("Sessao invalida: inicia sessao novamente para ordenar os extras.");
  }

  const { error } = await supabase.rpc("menu_manager_reorder_option_groups", {
    caller_user_id: normalizedCallerUserId,
    loja_id_input: normalizedLojaId,
    ordered_group_ids: normalizedGroupIds,
  });

  if (error) ensureLibraryTablesAvailable(error);
}

function requireCallerUserId(callerUserId, message) {
  const normalized = Number(callerUserId);
  if (!Number.isFinite(normalized)) {
    throw new Error(message);
  }
  return normalized;
}

export async function createMenu(lojaId, payload, callerUserId) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  if (!normalizedLojaId) throw new Error("Loja invalida para criar prato.");
  const normalizedCallerUserId = requireCallerUserId(callerUserId, "Sessao invalida: inicia sessao novamente para criar pratos.");

  const descriptionColumn = await detectDescriptionColumn();
  const body = buildMenuBody(payload, descriptionColumn);

  const { data, error } = await supabase.rpc("menu_manager_upsert_menu", {
    caller_user_id: normalizedCallerUserId,
    loja_id_input: normalizedLojaId,
    idmenu_input: null,
    patch: body,
  });

  if (error) throw error;

  const linkedGroupIds = normalizeGroupIdList(
    payload?.menu_option_group_ids || payload?.option_group_ids,
  );

  if (linkedGroupIds.length > 0) {
    await syncMenuOptionGroupLinks(data.idmenu, linkedGroupIds, normalizedCallerUserId);
  }

  return data;
}

export async function updateMenu(lojaId, idmenu, payload, callerUserId) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  const normalizedMenuId = normalizeMenuId(idmenu);
  const normalizedCallerUserId = requireCallerUserId(callerUserId, "Sessao invalida: inicia sessao novamente para editar pratos.");
  const descriptionColumn = await detectDescriptionColumn();

  const body = buildMenuBody(payload, descriptionColumn);

  const { error } = await supabase.rpc("menu_manager_upsert_menu", {
    caller_user_id: normalizedCallerUserId,
    loja_id_input: normalizedLojaId,
    idmenu_input: normalizedMenuId,
    patch: body,
  });

  if (error) throw error;

  await syncMenuOptionGroupLinks(
    normalizedMenuId,
    payload?.menu_option_group_ids || payload?.option_group_ids,
    normalizedCallerUserId,
  );
}

export async function deleteMenu(lojaId, idmenu, callerUserId) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  const normalizedMenuId = normalizeMenuId(idmenu);
  const normalizedCallerUserId = requireCallerUserId(callerUserId, "Sessao invalida: inicia sessao novamente para apagar pratos.");

  const { error } = await supabase.rpc("menu_manager_delete_menu", {
    caller_user_id: normalizedCallerUserId,
    loja_id_input: normalizedLojaId,
    idmenu_input: normalizedMenuId,
  });

  if (error) throw error;
}

export async function toggleDisponivel(lojaId, idmenu, disponivel, callerUserId) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  const normalizedMenuId = normalizeMenuId(idmenu);
  const normalizedCallerUserId = requireCallerUserId(callerUserId, "Sessao invalida: inicia sessao novamente para atualizar o prato.");

  const { error } = await supabase.rpc("menu_manager_upsert_menu", {
    caller_user_id: normalizedCallerUserId,
    loja_id_input: normalizedLojaId,
    idmenu_input: normalizedMenuId,
    patch: { ativo: Boolean(disponivel) },
  });

  if (error) throw error;
}

export async function toggleVisibilidade(lojaId, idmenu, visivel, callerUserId) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  const normalizedMenuId = normalizeMenuId(idmenu);
  const normalizedCallerUserId = requireCallerUserId(callerUserId, "Sessao invalida: inicia sessao novamente para atualizar o prato.");

  const { error } = await supabase.rpc("menu_manager_upsert_menu", {
    caller_user_id: normalizedCallerUserId,
    loja_id_input: normalizedLojaId,
    idmenu_input: normalizedMenuId,
    patch: { visivel: Boolean(visivel) },
  });

  if (error) throw error;
}

export async function createMenuOptionLibraryGroup(lojaId, payload, callerUserId) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  if (!normalizedLojaId) throw new Error("Loja invalida para criar grupo.");
  const normalizedCallerUserId = requireCallerUserId(callerUserId, "Sessao invalida: inicia sessao novamente para criar grupos de extras.");

  const body = await buildLibraryGroupBody(normalizedLojaId, payload);
  delete body.idloja;
  const groupTitle = toTrimmedText(payload?.title || payload?.titulo || payload?.name);
  if (!groupTitle) {
    throw new Error("O grupo precisa de um titulo.");
  }

  const options = await buildLibraryItemBodies(null, payload?.options || payload?.opcoes);
  if (options.length === 0) {
    throw new Error("O grupo precisa de pelo menos uma opcao.");
  }

  const { data: insertedGroup, error: groupError } = await supabase.rpc("menu_manager_upsert_option_group", {
    caller_user_id: normalizedCallerUserId,
    loja_id_input: normalizedLojaId,
    group_id_input: null,
    patch: body,
  });

  if (groupError) ensureLibraryTablesAvailable(groupError);
  if (!insertedGroup) {
    throw new Error("Nao foi possivel criar o grupo de opcoes com o schema atual.");
  }

  const itemsPayload = options.map((option) => {
    const next = { ...option };
    delete next._optionId;
    delete next.grupo_id;
    return next;
  });

  const { error: itemsError } = await supabase.rpc("menu_manager_upsert_option_items", {
    caller_user_id: normalizedCallerUserId,
    group_id_input: insertedGroup.id,
    items: itemsPayload,
  });

  if (itemsError) ensureLibraryTablesAvailable(itemsError);

  return insertedGroup;
}

export async function createMenuOptionGroupForMenu(lojaId, idmenu, payload, callerUserId) {
  const normalizedMenuId = normalizeMenuId(idmenu);
  if (!normalizedMenuId) throw new Error("Menu invalido para criar grupo.");

  const createdGroup = await createMenuOptionLibraryGroup(lojaId, payload, callerUserId);
  await linkMenuOptionLibraryGroupToMenu(normalizedMenuId, createdGroup?.id, callerUserId);
  return createdGroup;
}

export async function duplicateMenuOptionLibraryGroup(lojaId, sourceGroupId, {
  title = "",
  attachToMenuId = null,
} = {}, callerUserId) {
  const normalizedSourceGroupId = normalizeGroupId(sourceGroupId);
  if (!Number.isFinite(normalizedSourceGroupId)) {
    throw new Error("Grupo invalido para duplicar.");
  }

  const libraryGroups = await fetchMenuOptionLibrary(lojaId);
  const sourceGroup = (libraryGroups || []).find(
    (group) => normalizeGroupId(group?.library_group_id || group?.id) === normalizedSourceGroupId,
  );

  if (!sourceGroup) {
    throw new Error("Grupo de origem nao encontrado para duplicacao.");
  }

  const duplicatedTitle = toTrimmedText(title) || `${sourceGroup.title || "Grupo"} (Copia)`;
  const sourceDependsOnOptionIds = normalizeDependencyOptionIds(
    sourceGroup?.dependsOnOptionIds
    ?? sourceGroup?.depends_on_option_ids
    ?? sourceGroup?.depends_on_item_ids,
  );

  const duplicatedPayload = {
    title: duplicatedTitle,
    type: sourceGroup?.type || "extra",
    required: Boolean(sourceGroup?.required),
    minSelections: Number(sourceGroup?.minSelections ?? sourceGroup?.min_choices ?? sourceGroup?.min_selecoes ?? (sourceGroup?.required ? 1 : 0)),
    maxSelections: Math.max(1, Number(sourceGroup?.maxSelections ?? sourceGroup?.max_choices ?? sourceGroup?.max_selecoes ?? 1) || 1),
    dependsOnOptionIds: sourceDependsOnOptionIds,
    options: (Array.isArray(sourceGroup?.options) ? sourceGroup.options : []).map((option) => ({
      name: String(option?.name || option?.nome || "").trim(),
      price: normalizePrice(option?.price ?? option?.preco ?? option?.price_modifier),
      defaultSelected: toBoolean(option?.defaultSelected ?? option?.default_selected ?? option?.is_default, false),
      dependsOnOptionIds: normalizeDependencyOptionIds(
        option?.dependsOnOptionIds
        ?? option?.depends_on_option_ids
        ?? option?.depends_on_item_ids,
      ),
    })),
  };

  const createdGroup = await createMenuOptionLibraryGroup(lojaId, duplicatedPayload, callerUserId);

  if (attachToMenuId !== null && attachToMenuId !== undefined && attachToMenuId !== "") {
    await linkMenuOptionLibraryGroupToMenu(attachToMenuId, createdGroup?.id, callerUserId);
  }

  return createdGroup;
}

export async function updateMenuOptionLibraryGroup(lojaId, groupId, payload, callerUserId) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  const normalizedGroupId = normalizeGroupId(groupId);
  if (!Number.isFinite(normalizedGroupId)) throw new Error("Grupo invalido.");
  const normalizedCallerUserId = requireCallerUserId(callerUserId, "Sessao invalida: inicia sessao novamente para editar grupos de extras.");

  const body = await buildLibraryGroupBody(normalizedLojaId, payload);
  delete body.idloja;
  const groupTitle = toTrimmedText(payload?.title || payload?.titulo || payload?.name);
  if (!groupTitle) {
    throw new Error("O grupo precisa de um titulo.");
  }

  const options = await buildLibraryItemBodies(normalizedGroupId, payload?.options || payload?.opcoes);
  if (options.length === 0) {
    throw new Error("O grupo precisa de pelo menos uma opcao.");
  }

  const { error: groupError } = await supabase.rpc("menu_manager_upsert_option_group", {
    caller_user_id: normalizedCallerUserId,
    loja_id_input: normalizedLojaId,
    group_id_input: normalizedGroupId,
    patch: body,
  });

  if (groupError) ensureLibraryTablesAvailable(groupError);

  const { data: existingItems, error: existingItemsError } = await supabase
    .from("menu_option_items")
    .select("id")
    .eq("grupo_id", normalizedGroupId);

  if (existingItemsError) ensureLibraryTablesAvailable(existingItemsError);

  const existingIds = new Set(
    (existingItems || [])
      .map((item) => normalizeOptionId(item?.id))
      .filter((value) => Number.isFinite(value)),
  );

  const itemsPayload = options.map((rawOption) => {
    const optionId = normalizeOptionId(rawOption?._optionId);
    const next = { ...rawOption };
    delete next._optionId;
    delete next.grupo_id;
    if (Number.isFinite(optionId) && existingIds.has(optionId)) {
      next.id = optionId;
    }
    return next;
  });

  const { data: upsertedItems, error: itemsError } = await supabase.rpc("menu_manager_upsert_option_items", {
    caller_user_id: normalizedCallerUserId,
    group_id_input: normalizedGroupId,
    items: itemsPayload,
  });

  if (itemsError) ensureLibraryTablesAvailable(itemsError);

  const keepIds = (upsertedItems || [])
    .map((item) => normalizeOptionId(item?.id))
    .filter((value) => Number.isFinite(value));

  const idsToDelete = [...existingIds].filter((id) => !keepIds.includes(id));
  if (idsToDelete.length > 0) {
    const { error: deleteItemsError } = await supabase.rpc("menu_manager_delete_option_items", {
      caller_user_id: normalizedCallerUserId,
      group_id_input: normalizedGroupId,
      item_ids: idsToDelete,
    });

    if (deleteItemsError) ensureLibraryTablesAvailable(deleteItemsError);
  }
}

export async function deleteMenuOptionLibraryGroup(lojaId, groupId, callerUserId) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  const normalizedGroupId = normalizeGroupId(groupId);
  if (!Number.isFinite(normalizedGroupId)) throw new Error("Grupo invalido.");
  const normalizedCallerUserId = requireCallerUserId(callerUserId, "Sessao invalida: inicia sessao novamente para apagar grupos de extras.");

  const { error } = await supabase.rpc("menu_manager_delete_option_group", {
    caller_user_id: normalizedCallerUserId,
    loja_id_input: normalizedLojaId,
    group_id_input: normalizedGroupId,
  });

  if (error) ensureLibraryTablesAvailable(error);
}

export async function uploadMenuImage(file, lojaId, callerUserId) {
  if (!file) return null;

  const { path, token } = await requestSignedImageUpload({
    bucket: "menu-images",
    filename: file.name,
    contentType: file.type,
    callerUserId,
    lojaId,
  });

  const { error } = await supabase.storage.from("menu-images").uploadToSignedUrl(path, token, file);
  if (error) throw error;

  const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
  return data.publicUrl;
}

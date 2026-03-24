import { supabase } from "./supabaseClient";
import {
  buildMenuOptionGroupFromLibraryRecord,
  mergeMenuOptionConfigurations,
  normalizeMenuOptionType,
  sanitizeMenuOptionsConfig,
} from "./menuOptionsService";

let descriptionColumnPromise = null;

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

function normalizeGroupIdList(groupIds = []) {
  if (!Array.isArray(groupIds)) return [];

  return [...new Set(
    groupIds
      .map(normalizeGroupId)
      .filter((value) => Number.isFinite(value)),
  )];
}

function sanitizeFileName(name = "image") {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
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

function ensureLibraryTablesAvailable(error) {
  if (!isMissingMenuOptionLibraryTableError(error)) {
    throw error;
  }

  throw new Error(
    "A biblioteca de extras ainda nao existe na base de dados. Corre a migration 021_shared_menu_option_library.sql antes de usar esta funcionalidade.",
  );
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

function buildLibraryGroupBody(lojaId, payload) {
  return {
    idloja: normalizeLojaId(lojaId),
    titulo: toTrimmedText(payload?.title || payload?.titulo || payload?.name),
    tipo: normalizeMenuOptionType(payload?.type || payload?.tipo),
    obrigatorio: toBoolean(payload?.required ?? payload?.obrigatorio, false),
    max_selecoes: Math.max(1, Number(payload?.maxSelections ?? payload?.max_selecoes ?? 1) || 1),
    ativo: payload?.ativo !== false,
    updated_at: new Date().toISOString(),
  };
}

function buildLibraryItemBodies(groupId, options = []) {
  return (Array.isArray(options) ? options : [])
    .map((option, index) => ({
      grupo_id: groupId,
      nome: toTrimmedText(option?.name || option?.nome || option?.label),
      preco: normalizePrice(option?.price ?? option?.preco),
      default_selected: toBoolean(option?.defaultSelected ?? option?.default_selected, false),
      ativo: option?.ativo !== false,
      sort_order: index,
      updated_at: new Date().toISOString(),
    }))
    .filter((option) => option.nome);
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

async function syncMenuOptionGroupLinks(idmenu, groupIds = []) {
  const normalizedMenuId = normalizeMenuId(idmenu);
  const normalizedGroupIds = normalizeGroupIdList(groupIds);

  const { data: existingLinks, error: existingLinksError } = await supabase
    .from("menu_option_group_links")
    .select("id, grupo_id")
    .eq("idmenu", normalizedMenuId);

  if (existingLinksError) {
    ensureLibraryTablesAvailable(existingLinksError);
  }

  const existingGroupIds = (existingLinks || [])
    .map((link) => normalizeGroupId(link.grupo_id))
    .filter((value) => Number.isFinite(value));

  const toDelete = existingGroupIds.filter((groupId) => !normalizedGroupIds.includes(groupId));
  const toInsert = normalizedGroupIds.filter((groupId) => !existingGroupIds.includes(groupId));

  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("menu_option_group_links")
      .delete()
      .eq("idmenu", normalizedMenuId)
      .in("grupo_id", toDelete);

    if (deleteError) ensureLibraryTablesAvailable(deleteError);
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("menu_option_group_links")
      .insert(toInsert.map((groupId) => ({
        idmenu: normalizedMenuId,
        grupo_id: groupId,
      })));

    if (insertError) ensureLibraryTablesAvailable(insertError);
  }
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

export async function createMenu(lojaId, payload) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  if (!normalizedLojaId) throw new Error("Loja invalida para criar prato.");

  const descriptionColumn = await detectDescriptionColumn();
  const body = {
    idloja: normalizedLojaId,
    ...buildMenuBody(payload, descriptionColumn),
  };

  const { data, error } = await supabase
    .from("menus")
    .insert(body)
    .select("idmenu")
    .single();

  if (error) throw error;

  const linkedGroupIds = normalizeGroupIdList(
    payload?.menu_option_group_ids || payload?.option_group_ids,
  );

  if (linkedGroupIds.length > 0) {
    await syncMenuOptionGroupLinks(data.idmenu, linkedGroupIds);
  }

  return data;
}

export async function updateMenu(lojaId, idmenu, payload) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  const normalizedMenuId = normalizeMenuId(idmenu);
  const descriptionColumn = await detectDescriptionColumn();

  const body = buildMenuBody(payload, descriptionColumn);

  const { error } = await supabase
    .from("menus")
    .update(body)
    .eq("idmenu", normalizedMenuId)
    .eq("idloja", normalizedLojaId);

  if (error) throw error;

  await syncMenuOptionGroupLinks(
    normalizedMenuId,
    payload?.menu_option_group_ids || payload?.option_group_ids,
  );
}

export async function deleteMenu(lojaId, idmenu) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  const normalizedMenuId = normalizeMenuId(idmenu);

  const { error } = await supabase
    .from("menus")
    .delete()
    .eq("idmenu", normalizedMenuId)
    .eq("idloja", normalizedLojaId);

  if (error) throw error;
}

export async function toggleDisponivel(lojaId, idmenu, disponivel) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  const normalizedMenuId = normalizeMenuId(idmenu);

  const { error } = await supabase
    .from("menus")
    .update({ ativo: Boolean(disponivel) })
    .eq("idmenu", normalizedMenuId)
    .eq("idloja", normalizedLojaId);

  if (error) throw error;
}

export async function toggleVisibilidade(lojaId, idmenu, visivel) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  const normalizedMenuId = normalizeMenuId(idmenu);

  const { error } = await supabase
    .from("menus")
    .update({ visivel: Boolean(visivel) })
    .eq("idmenu", normalizedMenuId)
    .eq("idloja", normalizedLojaId);

  if (error) throw error;
}

export async function createMenuOptionLibraryGroup(lojaId, payload) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  if (!normalizedLojaId) throw new Error("Loja invalida para criar grupo.");

  const body = buildLibraryGroupBody(normalizedLojaId, payload);
  if (!body.titulo) {
    throw new Error("O grupo precisa de um titulo.");
  }

  const options = buildLibraryItemBodies(null, payload?.options || payload?.opcoes);
  if (options.length === 0) {
    throw new Error("O grupo precisa de pelo menos uma opcao.");
  }

  const { data: insertedGroup, error: groupError } = await supabase
    .from("menu_option_groups")
    .insert(body)
    .select("*")
    .single();

  if (groupError) ensureLibraryTablesAvailable(groupError);

  const itemsPayload = options.map((option) => ({
    ...option,
    grupo_id: insertedGroup.id,
  }));

  const { error: itemsError } = await supabase
    .from("menu_option_items")
    .insert(itemsPayload);

  if (itemsError) ensureLibraryTablesAvailable(itemsError);

  return insertedGroup;
}

export async function updateMenuOptionLibraryGroup(lojaId, groupId, payload) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  const normalizedGroupId = normalizeGroupId(groupId);
  if (!Number.isFinite(normalizedGroupId)) throw new Error("Grupo invalido.");

  const body = buildLibraryGroupBody(normalizedLojaId, payload);
  if (!body.titulo) {
    throw new Error("O grupo precisa de um titulo.");
  }

  const options = buildLibraryItemBodies(normalizedGroupId, payload?.options || payload?.opcoes);
  if (options.length === 0) {
    throw new Error("O grupo precisa de pelo menos uma opcao.");
  }

  const { error: groupError } = await supabase
    .from("menu_option_groups")
    .update(body)
    .eq("id", normalizedGroupId)
    .eq("idloja", normalizedLojaId);

  if (groupError) ensureLibraryTablesAvailable(groupError);

  const { error: deleteItemsError } = await supabase
    .from("menu_option_items")
    .delete()
    .eq("grupo_id", normalizedGroupId);

  if (deleteItemsError) ensureLibraryTablesAvailable(deleteItemsError);

  const { error: insertItemsError } = await supabase
    .from("menu_option_items")
    .insert(options);

  if (insertItemsError) ensureLibraryTablesAvailable(insertItemsError);
}

export async function deleteMenuOptionLibraryGroup(lojaId, groupId) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  const normalizedGroupId = normalizeGroupId(groupId);
  if (!Number.isFinite(normalizedGroupId)) throw new Error("Grupo invalido.");

  const { error } = await supabase
    .from("menu_option_groups")
    .delete()
    .eq("id", normalizedGroupId)
    .eq("idloja", normalizedLojaId);

  if (error) ensureLibraryTablesAvailable(error);
}

export async function uploadMenuImage(file, lojaId) {
  if (!file) return null;

  const safeName = sanitizeFileName(file.name);
  const path = `${lojaId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage.from("menu-images").upload(path, file, {
    contentType: file.type,
    upsert: true,
  });

  if (error) throw error;

  const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
  return data.publicUrl;
}

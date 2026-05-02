import { supabase } from "./supabaseClient";
import {
  buildMenuOptionGroupFromLibraryRecord,
  sanitizeMenuOptionsConfig,
} from "./menuOptionsService";

function normalizeMenuId(menuId) {
  const parsed = Number(menuId);
  return Number.isFinite(parsed) ? parsed : null;
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

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("could not find")
    && message.includes("column")
    && message.includes(String(columnName || "").toLowerCase());
}

function getFallbackGroups(fallbackConfig = []) {
  return sanitizeMenuOptionsConfig(fallbackConfig);
}

async function fetchMenuLinksOrderedByMenu(menuId) {
  let links = [];

  const preferred = await supabase
    .from("menu_option_group_links")
    .select("id, grupo_id, sort_order")
    .eq("idmenu", menuId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (!preferred.error) {
    links = preferred.data || [];
    return links;
  }

  if (isMissingColumnError(preferred.error, "sort_order")) {
    const fallback = await supabase
      .from("menu_option_group_links")
      .select("id, grupo_id")
      .eq("idmenu", menuId)
      .order("id", { ascending: true });

    if (!fallback.error) {
      links = fallback.data || [];
      return links;
    }

    throw fallback.error;
  }

  throw preferred.error;
}

export async function fetchMenuOptionGroupsByMenuId(menuId, fallbackConfig = []) {
  const normalizedMenuId = normalizeMenuId(menuId);
  if (!normalizedMenuId) {
    return {
      groups: getFallbackGroups(fallbackConfig),
      source: "fallback",
    };
  }

  let links = [];
  let linksError = null;
  try {
    links = await fetchMenuLinksOrderedByMenu(normalizedMenuId);
  } catch (error) {
    linksError = error;
  }

  if (linksError) {
    if (isMissingMenuOptionLibraryTableError(linksError)) {
      return {
        groups: getFallbackGroups(fallbackConfig),
        source: "fallback",
      };
    }
    throw linksError;
  }

  const groupIds = [...new Set((links || []).map((entry) => Number(entry?.grupo_id)).filter(Number.isFinite))];
  if (groupIds.length === 0) {
    return {
      groups: getFallbackGroups(fallbackConfig),
      source: "fallback",
    };
  }

  const [
    { data: groupRows, error: groupsError },
    { data: itemRows, error: itemsError },
  ] = await Promise.all([
    supabase
      .from("menu_option_groups")
      .select("*")
      .in("id", groupIds)
      .eq("ativo", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("menu_option_items")
      .select("*")
      .in("grupo_id", groupIds)
      .eq("ativo", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (groupsError) {
    if (isMissingMenuOptionLibraryTableError(groupsError)) {
      return {
        groups: getFallbackGroups(fallbackConfig),
        source: "fallback",
      };
    }
    throw groupsError;
  }

  if (itemsError) {
    if (isMissingMenuOptionLibraryTableError(itemsError)) {
      return {
        groups: getFallbackGroups(fallbackConfig),
        source: "fallback",
      };
    }
    throw itemsError;
  }

  const itemsByGroup = new Map();
  (itemRows || []).forEach((row) => {
    const key = String(row?.grupo_id || "");
    if (!itemsByGroup.has(key)) {
      itemsByGroup.set(key, []);
    }
    itemsByGroup.get(key).push(row);
  });

  const groups = (groupRows || [])
    .map((group) => buildMenuOptionGroupFromLibraryRecord(
      group,
      itemsByGroup.get(String(group?.id || "")) || [],
      [String(normalizedMenuId)],
    ))
    .filter(Boolean);

  const groupById = new Map(
    groups.map((group) => [String(group?.library_group_id || group?.id || ""), group]),
  );

  const orderedGroups = (links || [])
    .map((link) => groupById.get(String(link?.grupo_id || "")))
    .filter(Boolean);

  if (orderedGroups.length > 0) {
    return {
      groups: orderedGroups,
      source: "library",
    };
  }

  return {
    groups: getFallbackGroups(fallbackConfig),
    source: "fallback",
  };
}

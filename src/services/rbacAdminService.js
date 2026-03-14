import { supabase } from "./supabaseClient";
import { resolveUserRole } from "../utils/roles";

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function uniqueById(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    if (row?.idutilizador) map.set(row.idutilizador, row);
  });
  return Array.from(map.values());
}

function roleFromPermission(permission) {
  const normalized = normalizeText(permission);
  if (!normalized) return "customer";
  if (normalized.includes("admin")) return "admin";
  if (normalized.includes("dev") || normalized.includes("tecnico") || normalized.includes("ops")) return "dev";
  if (normalized.includes("restaur") || normalized.includes("restaurant") || normalized.includes("loja") || normalized.includes("merchant")) return "restaurant";
  return "customer";
}

async function queryUsersByTerm(term, limit) {
  const text = String(term || "").trim();

  if (!text) {
    const { data, error } = await supabase
      .from("utilizadores")
      .select("idutilizador, username, email, telemovel, dataregisto")
      .order("idutilizador", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  const wildcard = `%${text}%`;
  const queries = [];

  queries.push(
    supabase
      .from("utilizadores")
      .select("idutilizador, username, email, telemovel, dataregisto")
      .ilike("email", wildcard)
      .limit(limit),
  );

  queries.push(
    supabase
      .from("utilizadores")
      .select("idutilizador, username, email, telemovel, dataregisto")
      .ilike("username", wildcard)
      .limit(limit),
  );

  queries.push(
    supabase
      .from("utilizadores")
      .select("idutilizador, username, email, telemovel, dataregisto")
      .ilike("telemovel", wildcard)
      .limit(limit),
  );

  const responses = await Promise.all(queries);
  const allRows = [];

  responses.forEach((res) => {
    if (!res.error && res.data) {
      allRows.push(...res.data);
    }
  });

  return uniqueById(allRows).slice(0, limit);
}

async function enrichUsersWithRbac(users) {
  if (!users.length) return [];

  const userIds = users.map((user) => user.idutilizador).filter(Boolean);
  const userIdText = userIds.map((id) => String(id));

  const [permissionsRes, storesRes, staffRes, adminsRes] = await Promise.all([
    supabase
      .from("utilizadorespermissoes")
      .select("idutilizador, idpermissao, permissoes(permissao)")
      .in("idutilizador", userIds),
    supabase
      .from("lojas")
      .select("idloja, nome, idutilizador")
      .in("idutilizador", userIds),
    supabase
      .from("restaurant_staff_access")
      .select("user_id, loja_id, role, created_at")
      .in("user_id", userIdText),
    supabase
      .from("app_admins")
      .select("user_id")
      .in("user_id", userIdText),
  ]);

  const permissionsByUser = new Map();
  (permissionsRes.data || []).forEach((row) => {
    const current = permissionsByUser.get(row.idutilizador) || [];
    const permissionName = Array.isArray(row.permissoes) ? row.permissoes[0]?.permissao : row.permissoes?.permissao;
    current.push({ idpermissao: row.idpermissao, permissao: permissionName });
    permissionsByUser.set(row.idutilizador, current);
  });

  const ownerStoreByUser = new Map();
  (storesRes.data || []).forEach((store) => {
    if (!ownerStoreByUser.has(store.idutilizador)) {
      ownerStoreByUser.set(store.idutilizador, []);
    }
    ownerStoreByUser.get(store.idutilizador).push(store);
  });

  const staffStoreByUser = new Map();
  (staffRes.data || []).forEach((link) => {
    const userId = Number(link.user_id);
    if (!Number.isFinite(userId)) return;
    if (!staffStoreByUser.has(userId)) {
      staffStoreByUser.set(userId, []);
    }
    staffStoreByUser.get(userId).push(link);
  });

  const adminSet = new Set((adminsRes.data || []).map((row) => String(row.user_id)));

  return users.map((user) => {
    const permissionRows = permissionsByUser.get(user.idutilizador) || [];
    const permissionLabels = permissionRows.map((row) => row.permissao).filter(Boolean);
    const ownerStores = ownerStoreByUser.get(user.idutilizador) || [];
    const staffStores = staffStoreByUser.get(user.idutilizador) || [];

    let role = "customer";
    if (adminSet.has(String(user.idutilizador))) {
      role = "admin";
    } else if (permissionLabels.length > 0) {
      role = permissionLabels.map(roleFromPermission).sort((a, b) => {
        const rank = { admin: 4, dev: 3, restaurant: 2, customer: 1 };
        return (rank[b] || 1) - (rank[a] || 1);
      })[0] || "customer";
    }

    const lojaId = ownerStores[0]?.idloja || staffStores[0]?.loja_id || null;
    if (role === "customer" && lojaId) {
      role = "restaurant";
    }

    return {
      ...user,
      role,
      permissao: role,
      permissao_raw: permissionLabels[0] || null,
      loja_id: lojaId,
      loja_nome: ownerStores[0]?.nome || null,
    };
  });
}

async function findRestaurantPermissionId() {
  const { data, error } = await supabase
    .from("permissoes")
    .select("idpermissao, permissao")
    .order("idpermissao", { ascending: true });

  if (error) throw error;

  const rows = data || [];
  const candidate = rows.find((row) => {
    const text = normalizeText(row.permissao);
    return text.includes("restaur") || text.includes("restaurant") || text.includes("loja") || text.includes("merchant");
  });

  if (!candidate) {
    throw new Error("Nao existe permissao de restaurante na tabela permissoes.");
  }

  return candidate.idpermissao;
}

export async function searchUsersForRestaurantAssociation(term, limit = 20) {
  const users = await queryUsersByTerm(term, limit);
  return enrichUsersWithRbac(users);
}

export async function associateRestaurantToUser({ userId, lojaId }) {
  const normalizedUserId = Number(userId);
  const normalizedLojaId = Number(lojaId);

  if (!Number.isFinite(normalizedUserId)) {
    throw new Error("Utilizador invalido para associacao.");
  }

  if (!Number.isFinite(normalizedLojaId)) {
    throw new Error("Loja invalida para associacao.");
  }

  const { data: user, error: userError } = await supabase
    .from("utilizadores")
    .select("idutilizador, username, email")
    .eq("idutilizador", normalizedUserId)
    .maybeSingle();

  if (userError) throw userError;
  if (!user) throw new Error("Utilizador nao encontrado.");

  const { data: store, error: storeError } = await supabase
    .from("lojas")
    .select("idloja, nome")
    .eq("idloja", normalizedLojaId)
    .maybeSingle();

  if (storeError) throw storeError;
  if (!store) throw new Error("Loja nao encontrada.");

  const restaurantPermissionId = await findRestaurantPermissionId();

  const { error: permissionError } = await supabase
    .from("utilizadorespermissoes")
    .upsert(
      {
        idutilizador: normalizedUserId,
        idpermissao: restaurantPermissionId,
      },
      { onConflict: "idutilizador,idpermissao" },
    );

  if (permissionError) throw permissionError;

  const { data: existingStaff, error: existingStaffError } = await supabase
    .from("restaurant_staff_access")
    .select("id")
    .eq("user_id", String(normalizedUserId))
    .eq("loja_id", normalizedLojaId)
    .limit(1);

  if (existingStaffError) throw existingStaffError;

  if (existingStaff && existingStaff.length > 0) {
    const { error: staffUpdateError } = await supabase
      .from("restaurant_staff_access")
      .update({ role: "OWNER" })
      .eq("id", existingStaff[0].id);

    if (staffUpdateError) throw staffUpdateError;
  } else {
    const { error: staffInsertError } = await supabase
      .from("restaurant_staff_access")
      .insert({
        user_id: String(normalizedUserId),
        loja_id: normalizedLojaId,
        role: "OWNER",
      });

    if (staffInsertError) throw staffInsertError;
  }

  const { error: ownerUpdateError } = await supabase
    .from("lojas")
    .update({ idutilizador: normalizedUserId })
    .eq("idloja", normalizedLojaId);

  if (ownerUpdateError) throw ownerUpdateError;

  return {
    user: {
      ...user,
      role: resolveUserRole({ role: "restaurant" }),
      loja_id: normalizedLojaId,
    },
    store,
  };
}
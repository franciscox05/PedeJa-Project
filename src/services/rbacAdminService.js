import { supabase } from "./supabaseClient";
import { resolveUserRole } from "../utils/roles";

export async function searchUsersForRestaurantAssociation(term, limit = 20, callerUserId) {
  const { data, error } = await supabase.rpc("admin_search_users_for_association", {
    caller_user_id: Number(callerUserId),
    term: String(term || ""),
    limit_input: limit,
  });
  if (error) throw error;
  return data || [];
}

export async function associateRestaurantToUser({ callerUserId, userId, lojaId }) {
  const normalizedCallerId = Number(callerUserId);
  const normalizedUserId = Number(userId);
  const normalizedLojaId = Number(lojaId);

  if (!Number.isFinite(normalizedCallerId)) {
    throw new Error("Sessão inválida: inicia sessão novamente.");
  }

  if (!Number.isFinite(normalizedUserId)) {
    throw new Error("Utilizador inválido para associação.");
  }

  if (!Number.isFinite(normalizedLojaId)) {
    throw new Error("Loja inválida para associação.");
  }

  const { data, error } = await supabase.rpc("admin_associate_restaurant_to_user", {
    caller_user_id: normalizedCallerId,
    target_user_id: normalizedUserId,
    loja_id_input: normalizedLojaId,
  });

  if (error) throw error;

  return {
    user: {
      ...data.user,
      role: resolveUserRole({ role: "restaurant" }),
      loja_id: normalizedLojaId,
    },
    store: data.store,
    alreadyAssociated: data.already_associated === true,
  };
}

export async function fetchStoreAssociation({ callerUserId, lojaId }) {
  const normalizedCallerId = Number(callerUserId);
  const normalizedLojaId = Number(lojaId);

  if (!Number.isFinite(normalizedCallerId)) {
    throw new Error("Sessão inválida: inicia sessão novamente.");
  }
  if (!Number.isFinite(normalizedLojaId)) {
    throw new Error("Loja inválida para associação.");
  }

  const { data, error } = await supabase.rpc("admin_get_store_association", {
    caller_user_id: normalizedCallerId,
    loja_id_input: normalizedLojaId,
  });

  if (error) throw error;

  return data?.associated
    ? { associated: true, user: data.user }
    : { associated: false, user: null };
}

export async function removeRestaurantAssociation({ callerUserId, lojaId }) {
  const normalizedCallerId = Number(callerUserId);
  const normalizedLojaId = Number(lojaId);

  if (!Number.isFinite(normalizedCallerId)) {
    throw new Error("Sessão inválida: inicia sessão novamente.");
  }
  if (!Number.isFinite(normalizedLojaId)) {
    throw new Error("Loja inválida para associação.");
  }

  const { data, error } = await supabase.rpc("admin_remove_restaurant_association", {
    caller_user_id: normalizedCallerId,
    loja_id_input: normalizedLojaId,
  });

  if (error) throw error;

  return data;
}
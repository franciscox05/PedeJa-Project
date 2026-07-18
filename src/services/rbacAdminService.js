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
    throw new Error("Sessao invalida: inicia sessao novamente.");
  }

  if (!Number.isFinite(normalizedUserId)) {
    throw new Error("Utilizador invalido para associacao.");
  }

  if (!Number.isFinite(normalizedLojaId)) {
    throw new Error("Loja invalida para associacao.");
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
  };
}
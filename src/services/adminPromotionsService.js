import { supabase } from "./supabaseClient";

export async function fetchPromotionsAdmin(callerUserId) {
  const { data, error } = await supabase.rpc("admin_list_promotions", {
    caller_user_id: Number(callerUserId),
  });
  if (error) throw error;
  return data || [];
}

export async function createPromotion(callerUserId, payload) {
  const { data, error } = await supabase.rpc("admin_create_promotion", {
    caller_user_id: Number(callerUserId),
    payload,
  });
  if (error) throw error;
  return data;
}

export async function updatePromotion(callerUserId, id, payload) {
  const { data, error } = await supabase.rpc("admin_update_promotion", {
    caller_user_id: Number(callerUserId),
    promotion_id: id,
    payload,
  });
  if (error) throw error;
  return data;
}

export async function deletePromotion(callerUserId, id) {
  const { error } = await supabase.rpc("admin_delete_promotion", {
    caller_user_id: Number(callerUserId),
    promotion_id: id,
  });
  if (error) throw error;
}

export async function fetchStoreOptionsForPromotions() {
  const { data, error } = await supabase.from("lojas").select("idloja, nome").order("nome", { ascending: true });
  if (error) throw error;
  return data || [];
}

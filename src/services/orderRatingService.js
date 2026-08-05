import { supabase } from "./supabaseClient";

export async function fetchMyOrderRating(callerUserId, orderId) {
  const { data, error } = await supabase.rpc("get_my_order_rating", {
    caller_user_id: Number(callerUserId),
    order_id_input: orderId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function rateOrder(callerUserId, orderId, classificacao, comentario) {
  const { data, error } = await supabase.rpc("customer_rate_order", {
    caller_user_id: Number(callerUserId),
    order_id_input: orderId,
    classificacao_input: classificacao,
    comentario_input: comentario || null,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function fetchOrderReviewsAdmin(callerUserId) {
  const { data, error } = await supabase.rpc("admin_list_order_reviews", {
    caller_user_id: Number(callerUserId),
  });
  if (error) throw error;
  return data || [];
}

export async function fetchOrderReviewsForStore(callerUserId, lojaId) {
  const { data, error } = await supabase.rpc("restaurant_list_own_reviews", {
    caller_user_id: Number(callerUserId),
    loja_id_input: Number(lojaId),
  });
  if (error) throw error;
  return data || [];
}

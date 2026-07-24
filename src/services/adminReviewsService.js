import { supabase } from "./supabaseClient";

export async function fetchOrderReviews(callerUserId) {
  const { data, error } = await supabase.rpc("admin_list_order_reviews", {
    caller_user_id: Number(callerUserId),
  });
  if (error) throw error;
  return data || [];
}

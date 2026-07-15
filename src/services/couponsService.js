import { supabase } from "./supabaseClient";

export async function fetchCouponsAdmin(callerUserId) {
  const { data, error } = await supabase.rpc("admin_list_coupons", {
    caller_user_id: Number(callerUserId),
  });
  if (error) throw error;
  return data || [];
}

export async function createCoupon(callerUserId, payload) {
  const { data, error } = await supabase.rpc("admin_create_coupon", {
    caller_user_id: Number(callerUserId),
    payload,
  });
  if (error) throw error;
  return data;
}

export async function updateCoupon(callerUserId, id, payload) {
  const { data, error } = await supabase.rpc("admin_update_coupon", {
    caller_user_id: Number(callerUserId),
    coupon_id: id,
    payload,
  });
  if (error) throw error;
  return data;
}

export async function deleteCoupon(callerUserId, id) {
  const { error } = await supabase.rpc("admin_delete_coupon", {
    caller_user_id: Number(callerUserId),
    coupon_id: id,
  });
  if (error) throw error;
}

export async function validateCoupon(callerUserId, code, orderSubtotal) {
  const { data, error } = await supabase.rpc("validate_coupon", {
    caller_user_id: Number(callerUserId),
    code_input: code,
    order_subtotal: orderSubtotal,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function redeemCoupon(callerUserId, code, orderId) {
  const { data, error } = await supabase.rpc("redeem_coupon", {
    caller_user_id: Number(callerUserId),
    code_input: code,
    order_id_input: orderId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function fetchAvailableCoupons(callerUserId) {
  const { data, error } = await supabase.rpc("customer_list_available_coupons", {
    caller_user_id: Number(callerUserId),
  });
  if (error) throw error;
  return data || [];
}

import { supabase } from "./supabaseClient";

export async function fetchBanners(callerUserId) {
  const { data, error } = await supabase.rpc("admin_list_banners", {
    caller_user_id: Number(callerUserId),
  });
  if (error) throw error;
  return data || [];
}

export async function createBanner(callerUserId, payload) {
  const { data, error } = await supabase.rpc("admin_create_banner", {
    caller_user_id: Number(callerUserId),
    payload,
  });
  if (error) throw error;
  return data;
}

export async function updateBanner(callerUserId, id, payload) {
  const { data, error } = await supabase.rpc("admin_update_banner", {
    caller_user_id: Number(callerUserId),
    banner_id: id,
    payload,
  });
  if (error) throw error;
  return data;
}

export async function deleteBanner(callerUserId, id) {
  const { error } = await supabase.rpc("admin_delete_banner", {
    caller_user_id: Number(callerUserId),
    banner_id: id,
  });
  if (error) throw error;
}

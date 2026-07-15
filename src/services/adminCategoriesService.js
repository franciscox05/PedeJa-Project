import { supabase } from "./supabaseClient";

export async function fetchCategories(callerUserId) {
  const { data, error } = await supabase.rpc("admin_list_categories", {
    caller_user_id: Number(callerUserId),
  });
  if (error) throw error;
  return data || [];
}

export async function createCategory(callerUserId, categoria) {
  const { data, error } = await supabase.rpc("admin_create_category", {
    caller_user_id: Number(callerUserId),
    categoria_input: categoria,
  });
  if (error) throw error;
  return data;
}

export async function updateCategory(callerUserId, idcategoria, categoria) {
  const { data, error } = await supabase.rpc("admin_update_category", {
    caller_user_id: Number(callerUserId),
    idcategoria_input: idcategoria,
    categoria_input: categoria,
  });
  if (error) throw error;
  return data;
}

export async function deleteCategory(callerUserId, idcategoria) {
  const { error } = await supabase.rpc("admin_delete_category", {
    caller_user_id: Number(callerUserId),
    idcategoria_input: idcategoria,
  });
  if (error) throw error;
}

import { supabase } from "./supabaseClient";

// Tags de classificacao de loja (ex: "Sushi", "Pizza") -- distintas das
// categorias de menu (tiposmenu), que organizam os pratos dentro do menu de
// cada loja. Leitura publica (usada nos filtros do site), escrita via RPC
// (admin ou dono/staff da loja, atraves de is_loja_authorized).

export async function fetchAllCategories() {
  const { data, error } = await supabase
    .from("categorias")
    .select("idcategoria, categoria")
    .order("categoria", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchCategoryUsageCounts() {
  const { data, error } = await supabase.from("categoriaslojas").select("idcategoria");
  if (error) throw error;

  const counts = new Map();
  (data || []).forEach((row) => {
    const key = Number(row.idcategoria);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

export async function fetchStoreCategoryIds(lojaId) {
  const { data, error } = await supabase
    .from("categoriaslojas")
    .select("idcategoria")
    .eq("idloja", Number(lojaId));
  if (error) throw error;
  return (data || []).map((row) => Number(row.idcategoria));
}

export async function setStoreCategories({ callerUserId, lojaId, categoryIds }) {
  const normalizedCallerId = Number(callerUserId);
  const normalizedLojaId = Number(lojaId);

  if (!Number.isFinite(normalizedCallerId)) {
    throw new Error("Sessao invalida: inicia sessao novamente.");
  }
  if (!Number.isFinite(normalizedLojaId)) {
    throw new Error("Loja invalida.");
  }

  const { error } = await supabase.rpc("set_store_categories", {
    caller_user_id: normalizedCallerId,
    loja_id_input: normalizedLojaId,
    category_ids: (categoryIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)),
  });
  if (error) throw error;
}

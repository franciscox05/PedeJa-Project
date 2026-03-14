import { supabase } from "./supabaseClient";

let descriptionColumnPromise = null;

function normalizePrice(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLojaId(lojaId) {
  if (lojaId === null || lojaId === undefined || lojaId === "") return null;
  const parsed = Number(lojaId);
  return Number.isFinite(parsed) ? parsed : String(lojaId).trim();
}

function normalizeMenuId(idmenu) {
  const parsed = Number(idmenu);
  return Number.isFinite(parsed) ? parsed : idmenu;
}

function sanitizeFileName(name = "image") {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function mapMenuRow(row) {
  return {
    idmenu: row?.idmenu,
    idloja: row?.idloja,
    nome: row?.nome || "",
    desc: row?.desc ?? row?.descricao ?? row?.desricao ?? null,
    preco: row?.preco ?? 0,
    imagem: row?.imagem || null,
    ativo: row?.ativo,
    idtipomenu: row?.idtipomenu ?? null,
  };
}

async function detectDescriptionColumn() {
  if (descriptionColumnPromise) return descriptionColumnPromise;

  descriptionColumnPromise = (async () => {
    const testDesc = await supabase.from("menus").select("idmenu,desc").limit(1);
    if (!testDesc.error) return "desc";

    const testDescricao = await supabase.from("menus").select("idmenu,descricao").limit(1);
    if (!testDescricao.error) return "descricao";

    const testDesricao = await supabase.from("menus").select("idmenu,desricao").limit(1);
    if (!testDesricao.error) return "desricao";

    return null;
  })();

  return descriptionColumnPromise;
}

function buildMenuBody(payload, descriptionColumn) {
  const body = {
    nome: String(payload.nome || "").trim(),
    preco: normalizePrice(payload.preco),
    imagem: payload.imagem || null,
    ativo: payload.ativo ?? true,
    idtipomenu: payload.idtipomenu ? Number(payload.idtipomenu) : null,
  };

  if (descriptionColumn === "desc") {
    body.desc = payload.desc || null;
  } else if (descriptionColumn === "descricao") {
    body.descricao = payload.desc || null;
  } else if (descriptionColumn === "desricao") {
    body.desricao = payload.desc || null;
  }

  return body;
}

export async function fetchMenus(lojaId) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  if (!normalizedLojaId) return [];

  const { data, error } = await supabase
    .from("menus")
    .select("*")
    .eq("idloja", normalizedLojaId)
    .order("idmenu", { ascending: false });

  if (error) throw error;
  return (data || []).map(mapMenuRow);
}

export async function createMenu(lojaId, payload) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  if (!normalizedLojaId) throw new Error("Loja invalida para criar prato.");

  const descriptionColumn = await detectDescriptionColumn();
  const body = {
    idloja: normalizedLojaId,
    ...buildMenuBody(payload, descriptionColumn),
  };

  const { data, error } = await supabase
    .from("menus")
    .insert(body)
    .select("idmenu")
    .single();

  if (error) throw error;
  return data;
}

export async function updateMenu(lojaId, idmenu, payload) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  const normalizedMenuId = normalizeMenuId(idmenu);
  const descriptionColumn = await detectDescriptionColumn();

  const body = buildMenuBody(payload, descriptionColumn);

  const { error } = await supabase
    .from("menus")
    .update(body)
    .eq("idmenu", normalizedMenuId)
    .eq("idloja", normalizedLojaId);

  if (error) throw error;
}

export async function deleteMenu(lojaId, idmenu) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  const normalizedMenuId = normalizeMenuId(idmenu);

  const { error } = await supabase
    .from("menus")
    .delete()
    .eq("idmenu", normalizedMenuId)
    .eq("idloja", normalizedLojaId);

  if (error) throw error;
}

export async function toggleDisponivel(lojaId, idmenu, disponivel) {
  const normalizedLojaId = normalizeLojaId(lojaId);
  const normalizedMenuId = normalizeMenuId(idmenu);

  const { error } = await supabase
    .from("menus")
    .update({ ativo: Boolean(disponivel) })
    .eq("idmenu", normalizedMenuId)
    .eq("idloja", normalizedLojaId);

  if (error) throw error;
}

export async function uploadMenuImage(file, lojaId) {
  if (!file) return null;

  const safeName = sanitizeFileName(file.name);
  const path = `${lojaId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage.from("menu-images").upload(path, file, {
    contentType: file.type,
    upsert: true,
  });

  if (error) throw error;

  const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
  return data.publicUrl;
}



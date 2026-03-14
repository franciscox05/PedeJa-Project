import { supabase } from "./supabaseClient";
import { isStoreOpenNow } from "../utils/storeHours";

function sanitizeFileName(name = "image") {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, "-");
}

function normalizeId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeImageUrl(value) {
  const text = String(value || "").trim();
  return text || null;
}

export async function fetchStoreTypes() {
  const { data, error } = await supabase
    .from("tiposloja")
    .select("idtipoloja, tipoloja, descricao")
    .order("idtipoloja", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function uploadStoreImage(file, scope = "requests") {
  if (!file) return null;

  const safeName = sanitizeFileName(file.name);
  const path = `${scope}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage.from("store-images").upload(path, file, {
    contentType: file.type,
    upsert: true,
  });

  if (error) {
    throw new Error(`Falha no upload da imagem (${file.name}). Confirma se o bucket store-images existe e esta publico.`);
  }

  const { data } = supabase.storage.from("store-images").getPublicUrl(path);
  return data?.publicUrl || null;
}

async function resolveLojaIdFromStaff(userTextId) {
  if (!userTextId) return null;

  const { data, error } = await supabase
    .from("restaurant_staff_access")
    .select("loja_id")
    .eq("user_id", String(userTextId))
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  return data?.[0]?.loja_id || null;
}

export async function fetchRestaurantProfileByUser({ lojaId = null, userId = null, email = null } = {}) {
  const directLojaId = normalizeId(lojaId);

  if (directLojaId) {
    const { data, error } = await supabase
      .from("lojas")
      .select("idloja, nome, contacto, ativo, nif, morada_completa, horario_funcionamento, latitude, longitude, place_id, idtipoloja, imagemfundo, icon, idutilizador")
      .eq("idloja", directLojaId)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  const numericUserId = normalizeId(userId);

  if (numericUserId) {
    const { data: byOwner, error: byOwnerError } = await supabase
      .from("lojas")
      .select("idloja, nome, contacto, ativo, nif, morada_completa, horario_funcionamento, latitude, longitude, place_id, idtipoloja, imagemfundo, icon, idutilizador")
      .eq("idutilizador", numericUserId)
      .order("idloja", { ascending: true })
      .limit(1);

    if (byOwnerError) throw byOwnerError;
    if (byOwner && byOwner.length > 0) return byOwner[0];

    const fromStaff = await resolveLojaIdFromStaff(String(numericUserId));
    if (fromStaff) {
      return fetchRestaurantProfileByUser({ lojaId: fromStaff });
    }
  }

  const textUserId = String(userId || "").trim();
  if (textUserId) {
    const fromStaff = await resolveLojaIdFromStaff(textUserId);
    if (fromStaff) {
      return fetchRestaurantProfileByUser({ lojaId: fromStaff });
    }
  }

  if (email) {
    const { data: userRow, error: userError } = await supabase
      .from("utilizadores")
      .select("idutilizador")
      .eq("email", String(email).trim())
      .maybeSingle();

    if (userError) throw userError;
    if (userRow?.idutilizador) {
      return fetchRestaurantProfileByUser({ userId: userRow.idutilizador });
    }
  }

  return null;
}

export async function submitPartnerRequest(payload) {
  const body = {
    nome: payload.nome,
    email: payload.email,
    telefone: payload.telefone || null,
    restaurante_nome: payload.restaurante_nome,
    nif: payload.nif || null,
    morada_completa: payload.morada_completa,
    horario_funcionamento: payload.horario_funcionamento || null,
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    place_id: payload.place_id || null,
    user_id: payload.user_id || payload.email || null,
    idtipoloja: normalizeId(payload.idtipoloja),
    imagemfundo: normalizeImageUrl(payload.imagemfundo),
    icon: normalizeImageUrl(payload.icon),
    status: "PENDING",
  };

  const { data, error } = await supabase
    .from("restaurant_signup_requests")
    .insert(body)
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

export async function updateRestaurantProfile(lojaId, payload) {
  const normalizedLojaId = normalizeId(lojaId);
  if (!normalizedLojaId) {
    throw new Error("Loja invalida para atualizar.");
  }

  let moradaId = null;
  if (payload.morada_completa) {
    const { data: morada, error: moradaError } = await supabase
      .from("moradas")
      .insert({
        morada: payload.morada_completa,
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
        place_id: payload.place_id || null,
        nome: payload.restaurante_nome || null,
        data_criacao: new Date().toISOString(),
      })
      .select("idmorada")
      .single();

    if (moradaError) throw moradaError;
    moradaId = morada?.idmorada || null;
  }

  const { data: currentLoja, error: currentError } = await supabase
    .from("lojas")
    .select("ativo")
    .eq("idloja", normalizedLojaId)
    .maybeSingle();

  if (currentError) throw currentError;

  const body = {
    nome: payload.restaurante_nome,
    contacto: payload.telefone || null,
    nif: payload.nif || null,
    morada_completa: payload.morada_completa || null,
    horario_funcionamento: payload.horario_funcionamento || null,
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    place_id: payload.place_id || null,
    idtipoloja: normalizeId(payload.idtipoloja),
    imagemfundo: normalizeImageUrl(payload.imagemfundo),
    icon: normalizeImageUrl(payload.icon),
  };

  if (moradaId) {
    body.idmorada = moradaId;
  }

  if (currentLoja?.ativo !== null) {
    body.ativo = payload.horario_funcionamento ? isStoreOpenNow(payload.horario_funcionamento) : Boolean(currentLoja?.ativo);
  }

  const { error } = await supabase
    .from("lojas")
    .update(body)
    .eq("idloja", normalizedLojaId);

  if (error) throw error;
}

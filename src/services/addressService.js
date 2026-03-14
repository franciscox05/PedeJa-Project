import { supabase } from "./supabaseClient";

function normalizeUserId(userId) {
  const value = Number(userId);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseAddressLine(addressLine) {
  const value = String(addressLine || "").trim();
  if (!value) {
    return { rua: "", porta: "", codigo_postal: "", cidade: "" };
  }

  const segments = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (segments.length < 3) {
    return { rua: value, porta: "", codigo_postal: "", cidade: "" };
  }

  const rua = segments[0] || "";
  const porta = segments[1] || "";

  const postalAndCity = segments.slice(2).join(", ");
  const postalMatch = postalAndCity.match(/(\d{4}-\d{3})\s+(.+)/);

  if (postalMatch) {
    return {
      rua,
      porta,
      codigo_postal: postalMatch[1],
      cidade: postalMatch[2],
    };
  }

  return { rua, porta, codigo_postal: "", cidade: postalAndCity };
}

function buildAddressLine({ rua, porta, codigo_postal, cidade, address_line }) {
  if (address_line && String(address_line).trim()) {
    return String(address_line).trim();
  }

  if (!rua || !porta || !codigo_postal || !cidade) {
    throw new Error("Preenche Rua, Porta, Codigo Postal e Cidade.");
  }

  return `${String(rua).trim()}, ${String(porta).trim()}, ${String(codigo_postal).trim()} ${String(cidade).trim()}, Portugal`;
}

function normalizeMorada(row, defaultAddressId = null) {
  const addressLine = row?.morada || "";
  const parsed = parseAddressLine(addressLine);

  return {
    id: row?.idmorada,
    idmorada: row?.idmorada,
    user_id: null,
    label: row?.nome || "Outro",
    address_line: addressLine,
    rua: parsed.rua,
    porta: parsed.porta,
    codigo_postal: parsed.codigo_postal,
    cidade: parsed.cidade,
    lat: row?.latitude ?? null,
    lng: row?.longitude ?? null,
    place_id: row?.place_id ?? null,
    is_default: defaultAddressId ? Number(defaultAddressId) === Number(row?.idmorada) : false,
    created_at: row?.data_criacao || null,
  };
}

async function fetchDefaultAddressId(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return null;

  const { data, error } = await supabase
    .from("utilizadores")
    .select("idmoradaentrega")
    .eq("idutilizador", normalizedUserId)
    .maybeSingle();

  if (error) return null;
  return data?.idmoradaentrega || null;
}

export async function fetchUserAddresses(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return [];

  const defaultAddressId = await fetchDefaultAddressId(normalizedUserId);

  const relationQuery = await supabase
    .from("utilizadoresmoradas")
    .select("idmorada, moradas(idmorada, morada, latitude, longitude, place_id, nome, data_criacao)")
    .eq("idutilizador", normalizedUserId);

  let moradasRows = [];

  if (!relationQuery.error) {
    moradasRows = (relationQuery.data || [])
      .map((row) => (Array.isArray(row.moradas) ? row.moradas[0] : row.moradas))
      .filter(Boolean);
  } else {
    const links = await supabase
      .from("utilizadoresmoradas")
      .select("idmorada")
      .eq("idutilizador", normalizedUserId);

    if (links.error) throw links.error;

    const ids = (links.data || []).map((row) => row.idmorada).filter(Boolean);
    if (!ids.length) return [];

    const moradas = await supabase
      .from("moradas")
      .select("idmorada, morada, latitude, longitude, place_id, nome, data_criacao")
      .in("idmorada", ids);

    if (moradas.error) throw moradas.error;
    moradasRows = moradas.data || [];
  }

  return moradasRows
    .map((row) => normalizeMorada(row, defaultAddressId))
    .sort((a, b) => {
      if (a.is_default && !b.is_default) return -1;
      if (!a.is_default && b.is_default) return 1;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
}

export async function saveUserAddress(address) {
  const normalizedUserId = normalizeUserId(address?.user_id);
  if (!normalizedUserId) {
    throw new Error("Utilizador invalido para guardar morada.");
  }

  const label = String(address?.label || "Outro").trim() || "Outro";
  const addressLine = buildAddressLine({
    rua: address?.rua,
    porta: address?.porta,
    codigo_postal: address?.codigo_postal,
    cidade: address?.cidade,
    address_line: address?.address_line,
  });

  const { data: createdMorada, error: moradaError } = await supabase
    .from("moradas")
    .insert({
      morada: addressLine,
      latitude: address?.lat ?? null,
      longitude: address?.lng ?? null,
      place_id: address?.place_id || null,
      nome: label,
      data_criacao: new Date().toISOString(),
    })
    .select("idmorada, morada, latitude, longitude, place_id, nome, data_criacao")
    .single();

  if (moradaError) throw moradaError;

  const { error: relationError } = await supabase
    .from("utilizadoresmoradas")
    .insert({ idmorada: createdMorada.idmorada, idutilizador: normalizedUserId });

  if (relationError) throw relationError;

  if (address?.is_default) {
    await setDefaultAddress(normalizedUserId, createdMorada.idmorada);
  }

  return normalizeMorada(createdMorada, address?.is_default ? createdMorada.idmorada : null);
}

export async function setDefaultAddress(userId, addressId) {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedAddressId = Number(addressId);

  if (!normalizedUserId || !Number.isFinite(normalizedAddressId)) {
    throw new Error("Dados invalidos para definir morada principal.");
  }

  const { error } = await supabase
    .from("utilizadores")
    .update({ idmoradaentrega: normalizedAddressId })
    .eq("idutilizador", normalizedUserId);

  if (error) throw error;
}

export async function updateUserAddress(address) {
  const normalizedAddressId = Number(address?.id || address?.idmorada);
  if (!Number.isFinite(normalizedAddressId) || normalizedAddressId <= 0) {
    throw new Error("Morada invalida para editar.");
  }

  const label = String(address?.label || "Outro").trim() || "Outro";
  const addressLine = buildAddressLine({
    rua: address?.rua,
    porta: address?.porta,
    codigo_postal: address?.codigo_postal,
    cidade: address?.cidade,
    address_line: address?.address_line,
  });

  const { data, error } = await supabase
    .from("moradas")
    .update({
      morada: addressLine,
      latitude: address?.lat ?? null,
      longitude: address?.lng ?? null,
      place_id: address?.place_id || null,
      nome: label,
    })
    .eq("idmorada", normalizedAddressId)
    .select("idmorada, morada, latitude, longitude, place_id, nome, data_criacao")
    .single();

  if (error) throw error;
  return normalizeMorada(data, null);
}

export async function deleteUserAddress(userId, addressId) {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedAddressId = Number(addressId);

  if (!normalizedUserId || !Number.isFinite(normalizedAddressId) || normalizedAddressId <= 0) {
    throw new Error("Dados invalidos para apagar morada.");
  }

  const { data: userRow, error: userError } = await supabase
    .from("utilizadores")
    .select("idmoradaentrega")
    .eq("idutilizador", normalizedUserId)
    .maybeSingle();

  if (userError) throw userError;

  const { error: relationDeleteError } = await supabase
    .from("utilizadoresmoradas")
    .delete()
    .eq("idutilizador", normalizedUserId)
    .eq("idmorada", normalizedAddressId);

  if (relationDeleteError) throw relationDeleteError;

  if (Number(userRow?.idmoradaentrega) === normalizedAddressId) {
    await supabase
      .from("utilizadores")
      .update({ idmoradaentrega: null })
      .eq("idutilizador", normalizedUserId);
  }

  const { data: linksAfterDelete, error: linksError } = await supabase
    .from("utilizadoresmoradas")
    .select("idutilizador")
    .eq("idmorada", normalizedAddressId)
    .limit(1);

  if (linksError) throw linksError;

  if (!linksAfterDelete || linksAfterDelete.length === 0) {
    await supabase.from("moradas").delete().eq("idmorada", normalizedAddressId);
  }
}

function buildGeocodingUrl(query, limit = "8") {
  const endpoint =
    import.meta.env.VITE_GEOCODING_API_URL
    || "https://nominatim.openstreetmap.org/search";

  const url = new URL(endpoint);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", limit);
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "pt");
  return url;
}

function isPortugueseResult(item) {
  const countryCode = String(item?.address?.country_code || item?.country_code || "").toLowerCase();
  if (countryCode) return countryCode === "pt";
  return String(item?.display_name || "").toLowerCase().includes("portugal");
}

function isBarcelosResult(item) {
  const bucket = [
    item?.address?.city,
    item?.address?.town,
    item?.address?.village,
    item?.address?.municipality,
    item?.address?.county,
    item?.display_name,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  return bucket.includes("barcelos");
}

async function fetchGeocodingResults(query, limit = "8") {
  const url = buildGeocodingUrl(query, limit);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Language": "pt-PT,pt;q=0.9",
    },
  });

  if (!response.ok) return [];
  return await response.json();
}

function normalizeSuggestion(item) {
  return {
    id: item.place_id,
    place_id: item.place_id,
    label: item.display_name,
    lat: item.lat ? Number(item.lat) : null,
    lng: item.lon ? Number(item.lon) : null,
    city: item?.address?.city || item?.address?.town || item?.address?.village || null,
    county: item?.address?.county || null,
    is_barcelos: isBarcelosResult(item),
  };
}

export async function searchAddressSuggestions(query, { barcelosOnly = false } = {}) {
  const normalized = String(query || "").trim();
  if (normalized.length < 3) return [];

  const results = await fetchGeocodingResults(normalized);
  const onlyPortugal = (results || []).filter(isPortugueseResult);
  const candidates = barcelosOnly ? onlyPortugal.filter(isBarcelosResult) : onlyPortugal;

  return candidates.map(normalizeSuggestion);
}

export async function geocodePortugalAddress(addressLine, { barcelosOnly = false } = {}) {
  const normalized = String(addressLine || "").trim();
  if (!normalized) return null;

  const results = await fetchGeocodingResults(normalized, "6");
  const onlyPortugal = (results || []).filter(isPortugueseResult);

  const candidates = barcelosOnly
    ? onlyPortugal.filter(isBarcelosResult)
    : onlyPortugal;

  if (!candidates.length) return null;
  return normalizeSuggestion(candidates[0]);
}

export async function updateAddressCoordinates(addressId, { lat, lng, place_id = null }) {
  const normalizedAddressId = Number(addressId);
  if (!Number.isFinite(normalizedAddressId) || normalizedAddressId <= 0) {
    throw new Error("ID de morada invalido.");
  }

  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    throw new Error("Coordenadas invalidas.");
  }

  const { error } = await supabase
    .from("moradas")
    .update({
      latitude: parsedLat,
      longitude: parsedLng,
      place_id: place_id || null,
    })
    .eq("idmorada", normalizedAddressId);

  if (error) throw error;
}


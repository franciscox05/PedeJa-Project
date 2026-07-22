import { supabase } from "./supabaseClient";
import { resolveUserRole } from "../utils/roles";

function firstRow(payload) {
  if (Array.isArray(payload)) return payload[0] || null;
  return payload || null;
}

function toInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function canonicalRoleFromText(value) {
  const normalized = normalizeText(value);

  if (!normalized) return "customer";
  if (normalized.includes("admin") || normalized.includes("administrador")) return "admin";
  if (normalized.includes("dev") || normalized.includes("developer") || normalized.includes("tecnico") || normalized.includes("ops")) return "dev";
  if (normalized.includes("restaur") || normalized.includes("merchant") || normalized.includes("store") || normalized.includes("loja")) return "restaurant";
  if (normalized.includes("estafeta") || normalized.includes("driver") || normalized.includes("courier") || normalized.includes("carreteiro")) return "estafeta";
  if (normalized.includes("cliente") || normalized.includes("utilizador") || normalized.includes("customer") || normalized.includes("user")) return "customer";

  return "customer";
}

function rankRole(role) {
  if (role === "admin") return 4;
  if (role === "dev") return 3;
  if (role === "restaurant") return 2;
  if (role === "estafeta") return 2;
  return 1;
}

function pickHighestRole(candidates = []) {
  const normalized = candidates
    .map((value) => canonicalRoleFromText(value))
    .filter(Boolean);

  if (normalized.length === 0) return "customer";

  return normalized.sort((a, b) => rankRole(b) - rankRole(a))[0];
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean)));
}

async function fetchUserById(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("utilizadores")
    .select("idutilizador, username, email, telemovel, dataregisto")
    .eq("idutilizador", userId)
    .maybeSingle();

  if (error) return null;
  return data || null;
}

async function fetchUserByIdentifier(identifier, payload = null) {
  const rawIdentifier = String(identifier || "").trim();
  const payloadEmail = String(payload?.email || "").trim();
  const payloadUsername = String(payload?.username || payload?.nome || "").trim();
  const payloadPhone = String(payload?.telemovel || payload?.telefone || "").trim();

  const emailCandidates = unique([payloadEmail, rawIdentifier.includes("@") ? rawIdentifier : ""]);
  for (const email of emailCandidates) {
    const { data, error } = await supabase
      .from("utilizadores")
      .select("idutilizador, username, email, telemovel, dataregisto")
      .eq("email", email)
      .maybeSingle();

    if (!error && data) return data;
  }

  const usernameCandidates = unique([payloadUsername, !rawIdentifier.includes("@") ? rawIdentifier : ""]);
  for (const username of usernameCandidates) {
    const { data, error } = await supabase
      .from("utilizadores")
      .select("idutilizador, username, email, telemovel, dataregisto")
      .eq("username", username)
      .maybeSingle();

    if (!error && data) return data;
  }

  const phoneCandidates = unique([payloadPhone, rawIdentifier]);
  for (const phone of phoneCandidates) {
    const { data, error } = await supabase
      .from("utilizadores")
      .select("idutilizador, username, email, telemovel, dataregisto")
      .eq("telemovel", phone)
      .maybeSingle();

    if (!error && data) return data;
  }

  return null;
}

async function fetchPermissionsForUser(userId) {
  if (!userId) return [];

  const withJoin = await supabase
    .from("utilizadorespermissoes")
    .select("idpermissao, permissoes(permissao)")
    .eq("idutilizador", userId);

  if (!withJoin.error) {
    return (withJoin.data || []).map((row) => ({
      idpermissao: row.idpermissao,
      permissao: Array.isArray(row.permissoes) ? row.permissoes[0]?.permissao : row.permissoes?.permissao,
    }));
  }

  const fallback = await supabase
    .from("utilizadorespermissoes")
    .select("idpermissao")
    .eq("idutilizador", userId);

  if (fallback.error) return [];

  const permissionIds = (fallback.data || []).map((row) => row.idpermissao).filter(Boolean);
  if (!permissionIds.length) return [];

  const permissions = await supabase
    .from("permissoes")
    .select("idpermissao, permissao")
    .in("idpermissao", permissionIds);

  if (permissions.error) return [];

  const map = new Map((permissions.data || []).map((row) => [row.idpermissao, row.permissao]));
  return permissionIds.map((id) => ({ idpermissao: id, permissao: map.get(id) || null }));
}

async function fetchOwnedStores(userId) {
  if (!userId) return [];

  const { data, error } = await supabase
    .from("lojas")
    .select("idloja, nome")
    .eq("idutilizador", userId)
    .order("idloja", { ascending: true });

  if (error) return [];
  return data || [];
}

async function fetchRestaurantStaffLinks(candidateIds = []) {
  const ids = unique(candidateIds);
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from("restaurant_staff_access")
    .select("user_id, loja_id, role, created_at")
    .in("user_id", ids)
    .order("created_at", { ascending: false });

  if (error) return [];
  return data || [];
}

async function fetchEstafetaProfile(userId) {
  if (!userId) return null;

  // estafetas nao tem policy de leitura direta (tal como orders/deliveries):
  // o acesso passa pela RPC SECURITY DEFINER estafeta_get_my_state.
  const { data, error } = await supabase.rpc("estafeta_get_my_state", { caller_user_id: userId });
  if (error || !data?.estafeta) return null;

  return data.estafeta;
}

async function checkIsAdmin(userId) {
  if (!userId) return false;

  // Fonte de verdade unica para "e admin?": utilizadorespermissoes
  // (permissao = 'admin'), verificada server-side via RPC SECURITY DEFINER
  // is_caller_admin (a tabela nao tem policy de leitura direta).
  const { data, error } = await supabase.rpc("is_caller_admin", { caller_user_id: userId });
  if (error) return false;
  return Boolean(data);
}

function toCandidateIds({ userId, userRow, payload, identifier }) {
  return unique([
    userId ? String(userId) : null,
    userRow?.email,
    userRow?.username,
    payload?.user_id,
    payload?.id,
    payload?.uid,
    payload?.email,
    payload?.username,
    identifier,
  ]);
}

export async function buildSessionFromLoginPayload(loginPayload, identifier = "") {
  const payload = firstRow(loginPayload);
  if (!payload) return null;

  const payloadUserId = toInt(payload.idutilizador || payload.id || payload.user_id || payload.uid);

  let userRow = await fetchUserById(payloadUserId);
  if (!userRow) {
    userRow = await fetchUserByIdentifier(identifier, payload);
  }

  const userId = userRow?.idutilizador || payloadUserId;
  const candidateIds = toCandidateIds({ userId, userRow, payload, identifier });

  const [permissionRows, ownedStores, staffLinks, isAdmin, estafetaProfile] = await Promise.all([
    fetchPermissionsForUser(userId),
    fetchOwnedStores(userId),
    fetchRestaurantStaffLinks(candidateIds),
    checkIsAdmin(userId),
    fetchEstafetaProfile(userId),
  ]);

  const permissionNames = permissionRows.map((row) => row.permissao).filter(Boolean);
  const roleFromPermissions = pickHighestRole(permissionNames);
  const roleFromPayload = resolveUserRole(payload);

  const payloadStoreId = toInt(payload.loja_id || payload.idloja || payload.restaurant_id || payload.id_loja || payload.loja);
  const staffStoreId = toInt(staffLinks[0]?.loja_id);
  const ownerStoreId = toInt(ownedStores[0]?.idloja);

  const lojaId = payloadStoreId || staffStoreId || ownerStoreId || null;

  let resolvedRole = "customer";
  if (isAdmin) {
    resolvedRole = "admin";
  } else if (roleFromPayload && roleFromPayload !== "customer" && roleFromPayload !== "admin") {
    // "admin" nunca e aceite a partir do payload -- so a verificacao fresca
    // (isAdmin, acima) pode conceder esse papel. Sem isto, refreshSessionFromStoredUser
    // (que reutiliza o objeto de sessao antigo como "payload") reintroduzia
    // o proprio is_admin/role="admin" que estavamos a tentar revalidar,
    // criando um ciclo em que o admin removido nunca deixava de parecer admin.
    resolvedRole = roleFromPayload;
  } else if (roleFromPermissions && roleFromPermissions !== "customer") {
    resolvedRole = roleFromPermissions;
  } else if (lojaId) {
    resolvedRole = "restaurant";
  } else if (estafetaProfile?.ativo) {
    resolvedRole = "estafeta";
  }

  const lojasIds = unique([
    lojaId,
    ...ownedStores.map((store) => store.idloja),
    ...staffLinks.map((link) => link.loja_id),
  ]).map((value) => Number(value)).filter(Number.isFinite);

  const baseUsername = userRow?.username || payload.username || payload.nome || "Utilizador";

  return {
    idutilizador: userId || null,
    user_id: userId ? String(userId) : null,
    username: baseUsername,
    email: userRow?.email || payload.email || null,
    telemovel: userRow?.telemovel || payload.telemovel || payload.telefone || null,
    dataregisto: userRow?.dataregisto || payload.dataregisto || null,
    role: resolvedRole,
    permissao: resolvedRole,
    permission: resolvedRole,
    // So usa o nome de permissao fresco (da BD); nunca o do payload antigo --
    // mesmo motivo do resolvedRole acima (refreshSessionFromStoredUser reutiliza
    // a sessao antiga como payload, e essa continha o proprio valor a rever).
    permissao_raw: permissionNames[0] || null,
    idpermissao: permissionRows[0]?.idpermissao || null,
    loja_id: lojaId,
    idloja: lojaId,
    lojas_ids: lojasIds,
    restaurant_staff_role: staffLinks[0]?.role || null,
    is_admin: isAdmin || resolvedRole === "admin",
    estafeta_id: estafetaProfile?.id || null,
  };
}

export async function loginAndBuildSession({ identifier, password }) {
  const { data, error } = await supabase.rpc("login_utilizador", {
    input_identificador: identifier,
    input_senha: password,
  });

  if (error) throw error;
  if (!data) return null;

  return buildSessionFromLoginPayload(data, identifier);
}

export async function refreshSessionFromStoredUser(user) {
  if (!user) return null;
  return buildSessionFromLoginPayload(user, user.email || user.username || "");
}
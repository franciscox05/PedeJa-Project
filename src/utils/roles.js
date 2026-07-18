function normalizeRoleText(value) {
  return String(value || "").toLowerCase().trim();
}

function roleFromRawText(value) {
  const normalized = normalizeRoleText(value);

  if (["admin", "administrador", "owner"].includes(normalized)) return "admin";
  if (["restaurante", "restaurant", "store", "merchant", "restaurante/loja", "loja"].includes(normalized)) return "restaurant";
  if (["dev", "developer", "tecnico", "ops"].includes(normalized)) return "dev";
  if (["estafeta", "driver", "courier", "carreteiro"].includes(normalized)) return "estafeta";
  if (["utilizador normal", "utilizador", "user", "cliente", "customer"].includes(normalized)) return "customer";

  return null;
}

export function resolveUserRole(user) {
  if (!user) return "customer";

  if (user?.is_admin === true) return "admin";

  const directCandidates = [
    user?.role,
    user?.permissao,
    user?.permission,
    user?.perfil,
    user?.tipo,
    user?.tipo_utilizador,
    user?.nivel,
    user?.permissao_raw,
  ];

  for (const candidate of directCandidates) {
    const resolved = roleFromRawText(candidate);
    if (resolved) return resolved;
  }

  const permissionList = Array.isArray(user?.permissions) ? user.permissions : [];
  for (const candidate of permissionList) {
    const resolved = roleFromRawText(candidate);
    if (resolved) return resolved;
  }

  if (extractRestaurantId(user)) return "restaurant";

  return "customer";
}

export function extractEstafetaId(user) {
  return user?.estafeta_id || null;
}

export function extractRestaurantId(user) {
  return (
    user?.loja_id ||
    user?.idloja ||
    user?.restaurant_id ||
    user?.id_loja ||
    user?.loja ||
    user?.store_id ||
    null
  );
}

export function extractUserId(user) {
  return user?.idutilizador || user?.id || user?.user_id || user?.uid || null;
}

export function isAdmin(user) {
  return resolveUserRole(user) === "admin";
}

export function canAccessPortal(user) {
  const role = resolveUserRole(user);
  return role === "admin" || role === "restaurant" || role === "dev";
}

export function getDefaultPathByRole(role) {
  if (role === "admin") return "/dashboard/admin";
  if (role === "restaurant") return "/dashboard/restaurante";
  if (role === "dev") return "/dashboard/dev";
  if (role === "estafeta") return "/estafeta";
  return "/";
}
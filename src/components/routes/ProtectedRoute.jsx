import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { extractRestaurantId, getDefaultPathByRole, resolveUserRole } from "../../utils/roles";

function normalizeStoreId(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim();
}

export default function ProtectedRoute({
  allowedRoles = [],
  enforceRestaurantScope = false,
  children,
}) {
  const location = useLocation();
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const role = resolveUserRole(user);
  const isDashboardPath = location.pathname.startsWith("/dashboard");

  if (isDashboardPath && role === "customer") {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return <Navigate to={getDefaultPathByRole(role)} replace />;
  }

  if (enforceRestaurantScope && role === "restaurant") {
    const ownStoreId = normalizeStoreId(extractRestaurantId(user));
    const queryStoreId = normalizeStoreId(new URLSearchParams(location.search).get("loja"));

    if (queryStoreId && ownStoreId && queryStoreId !== ownStoreId) {
      return <Navigate to="/dashboard/restaurante" replace />;
    }

    if (!ownStoreId && queryStoreId) {
      return <Navigate to="/dashboard/restaurante" replace />;
    }
  }

  return children;
}
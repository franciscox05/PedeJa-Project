import ProtectedRoute from "./ProtectedRoute";

export default function ProtectedRoleRoute({ allowedRoles, children }) {
  return (
    <ProtectedRoute allowedRoles={allowedRoles}>
      {children}
    </ProtectedRoute>
  );
}
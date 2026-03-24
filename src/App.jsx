import { useEffect } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Inicio from "./pages/inicio";
import Categorias from "./pages/categorias";
import Restaurantes from "./pages/lojas";
import Menus from "./pages/menus";
import Carrinho from "./pages/carrinho";
import PedidoConfirmado from "./pages/pedidoConfirmado";
import DashboardAdmin from "./pages/dashboardAdmin";
import DashboardPerformance from "./pages/dashboardPerformance";
import DashboardRevenue from "./pages/dashboardRevenue";
import DashboardRestaurante from "./pages/dashboardRestaurante";
import DashboardDev from "./pages/dashboardDev";
import MenuManager from "./pages/menuManager";
import Parceiros from "./pages/parceiros";
import PerfilPage from "./pages/perfil";
import ProtectedRoute from "./components/routes/ProtectedRoute";
import { CartProvider } from "./context/CartContext";
import { resolveUserRole } from "./utils/roles";

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isDashboardRoute = location.pathname.startsWith("/dashboard/");

  useEffect(() => {
    const handleContextMenu = (e) => {
      e.preventDefault();
    };

    const handleMouseDown = (e) => {
      if (e.button === 1 || e.button === 2) {
        e.preventDefault();
        return false;
      }
    };

    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("mousedown", handleMouseDown);
    document.body.style.backgroundColor = isDashboardRoute ? "#f5f5f5" : "";
    document.body.style.backgroundImage = isDashboardRoute ? "none" : "";
    document.documentElement.style.backgroundColor = isDashboardRoute ? "#f5f5f5" : "";
    document.documentElement.style.backgroundImage = isDashboardRoute ? "none" : "";

    const maybeRedirectRestaurant = () => {
      const raw = localStorage.getItem("pedeja_user");
      const user = raw ? JSON.parse(raw) : null;
      const role = resolveUserRole(user);

      if (role !== "restaurant") return;

      const isParceirosEdit =
        location.pathname.startsWith("/parceiros")
        && new URLSearchParams(location.search).get("edit") === "1";

      const allowedForRestaurant = [
        location.pathname === "/",
        location.pathname.startsWith("/dashboard/restaurante"),
        location.pathname.startsWith("/menu-manager"),
        location.pathname.startsWith("/perfil"),
        isParceirosEdit,
      ];

      if (!allowedForRestaurant.some(Boolean)) {
        navigate("/dashboard/restaurante", { replace: true });
      }
    };

    maybeRedirectRestaurant();

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("mousedown", handleMouseDown);
      document.body.style.backgroundColor = "";
      document.body.style.backgroundImage = "";
      document.documentElement.style.backgroundColor = "";
      document.documentElement.style.backgroundImage = "";
    };
  }, [isDashboardRoute, location.pathname, location.search, navigate]);

  return (
    <CartProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4500,
          style: {
            background: "#111827",
            color: "#fff",
            borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 18px 34px rgba(15, 23, 42, 0.22)",
          },
          success: {
            iconTheme: {
              primary: "#22c55e",
              secondary: "#0b0d11",
            },
          },
          error: {
            iconTheme: {
              primary: "#ef4444",
              secondary: "#0b0d11",
            },
          },
        }}
      />
      <main className={`main-content${isDashboardRoute ? " main-content--dashboard" : ""}`}>
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/categorias/:city" element={<Categorias />} />
          <Route path="/lojas/:city/:category" element={<Restaurantes />} />
          <Route path="/menus/:idloja" element={<Menus />} />
          <Route path="/carrinho" element={<Carrinho />} />
          <Route path="/pedido/:orderId" element={<PedidoConfirmado />} />
          <Route path="/parceiros" element={<Parceiros />} />
          <Route
            path="/perfil"
            element={
              <ProtectedRoute>
                <PerfilPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/menu-manager"
            element={
              <ProtectedRoute allowedRoles={["restaurant", "admin"]} enforceRestaurantScope>
                <MenuManager />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/admin"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <DashboardAdmin />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/admin/receita"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <DashboardRevenue />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/admin/performance"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <DashboardPerformance />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/restaurante"
            element={
              <ProtectedRoute allowedRoles={["restaurant", "admin"]} enforceRestaurantScope>
                <DashboardRestaurante />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/dev"
            element={
              <ProtectedRoute allowedRoles={["dev", "admin"]}>
                <DashboardDev />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </CartProvider>
  );
}

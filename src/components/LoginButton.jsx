import "../css/index.css";
import userGif from "../assets/img/perfil.gif";
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import LogoutConfirm from "./LogoutConfirm";
import "../css/components/LoginInterfaces.css";
import UserProfileMenu from "./UserProfileMenu";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { canAccessPortal, resolveUserRole } from "../utils/roles";

function LoginButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const [confirmarLogoutAberto, setConfirmarLogoutAberto] = useState(false);
  const { user, logout } = useAuth();
  const { clearCart } = useCart();

  useEffect(() => {
    const handleAbrirLogin = () => navigate("/login", { state: { from: location } });
    window.addEventListener("abrirLogin", handleAbrirLogin);
    return () => window.removeEventListener("abrirLogin", handleAbrirLogin);
  }, [navigate, location]);

  const executarLogout = () => {
    logout();
    setConfirmarLogoutAberto(false);
    clearCart();
    navigate("/");
  };

  const openPortal = () => {
    if (!user) {
      navigate("/login", { state: { from: location } });
      return;
    }

    const role = resolveUserRole(user);
    if (role === "admin") {
      navigate("/dashboard/admin");
      return;
    }
    if (role === "restaurant") {
      navigate("/dashboard/restaurante");
      return;
    }
    if (role === "dev") {
      navigate("/dashboard/dev");
      return;
    }

    navigate("/carrinho");
  };

  return (
    <>
      {user ? (
        <UserProfileMenu
          user={user}
          canOpenPortal={canAccessPortal(user)}
          onLogout={() => setConfirmarLogoutAberto(true)}
          onOpenProfile={() => navigate("/perfil")}
          onOpenPortal={openPortal}
        />
      ) : (
        <div className="user-profile-container">
          <div
            role="button"
            tabIndex="0"
            className="user-profile"
            onClick={() => navigate("/login", { state: { from: location } })}
          >
            <div className="user-profile-inner">
              <img src={userGif} className="user-icon-img" alt="Login Icon" />
              <p>Iniciar Sessão</p>
            </div>
          </div>
        </div>
      )}

      {confirmarLogoutAberto && (
        <LogoutConfirm aoConfirmar={executarLogout} aoCancelar={() => setConfirmarLogoutAberto(false)} />
      )}
    </>
  );
}

export default LoginButton;

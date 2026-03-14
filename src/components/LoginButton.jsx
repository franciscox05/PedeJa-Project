import "../css/index.css";
import userGif from "../assets/img/perfil.gif";
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import LoginAccount from "./LoginAccount";
import CreateAccount from "./CreateAccount";
import LoginRecuperarPass from "./LoginRecuperarPass";
import LogoutConfirm from "./LogoutConfirm";
import "../css/components/LoginInterfaces.css";
import UserProfileMenu from "./UserProfileMenu";
import iconClose from "../assets/img/close.png";
import { useCart } from "../context/CartContext";
import { canAccessPortal, resolveUserRole } from "../utils/roles";

function readSessionUser() {
  try {
    const sessionUser = localStorage.getItem("pedeja_user");
    return sessionUser ? JSON.parse(sessionUser) : null;
  } catch {
    return null;
  }
}

function LoginButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuLoginAberto, setMenuLoginAberto] = useState(false);
  const [confirmarLogoutAberto, setConfirmarLogoutAberto] = useState(false);
  const [vista, setVista] = useState("login");
  const [user, setUser] = useState(readSessionUser());
  const { clearCart } = useCart();

  const isRestaurantPage = location.pathname.startsWith("/menus/");

  useEffect(() => {
    const syncUser = () => setUser(readSessionUser());
    const handleAbrirLogin = () => {
      setVista("login");
      setMenuLoginAberto(true);
    };

    window.addEventListener("abrirLogin", handleAbrirLogin);
    window.addEventListener("storage", syncUser);
    window.addEventListener("pedeja-user-updated", syncUser);

    return () => {
      window.removeEventListener("abrirLogin", handleAbrirLogin);
      window.removeEventListener("storage", syncUser);
      window.removeEventListener("pedeja-user-updated", syncUser);
    };
  }, []);

  const handleLoginSuccess = (dadosUtilizador) => {
    localStorage.setItem("pedeja_user", JSON.stringify(dadosUtilizador));
    window.dispatchEvent(new Event("pedeja-user-updated"));
    setUser(dadosUtilizador);
    setMenuLoginAberto(false);
  };

  const executarLogout = () => {
    localStorage.removeItem("pedeja_user");
    window.dispatchEvent(new Event("pedeja-user-updated"));
    setUser(null);
    setConfirmarLogoutAberto(false);
    clearCart();
    navigate("/");
  };

  const openPortal = () => {
    if (!user) {
      setMenuLoginAberto(true);
      setVista("login");
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
            onClick={() => {
              setMenuLoginAberto(true);
              setVista("login");
            }}
          >
            <div className="user-profile-inner">
              <img src={userGif} className="user-icon-img" alt="Login Icon" />
              <p>Iniciar Sessao</p>
            </div>
          </div>
        </div>
      )}

      {confirmarLogoutAberto && (
        <LogoutConfirm aoConfirmar={executarLogout} aoCancelar={() => setConfirmarLogoutAberto(false)} />
      )}

      {menuLoginAberto && (
        <div className="auth-overlay">
          <div className={`auth-modal${isRestaurantPage ? " auth-modal-centered" : ""}`}>
            <button type="button" className="close-custom" onClick={() => setMenuLoginAberto(false)}>
              <img src={iconClose} className="menu-close-icon" alt="Fechar" />
            </button>

            {vista === "login" && (
              <LoginAccount aoMudarVista={setVista} aoAutenticar={handleLoginSuccess} />
            )}

            {vista === "criar" && <CreateAccount aoMudarVista={setVista} />}

            {vista === "recuperar" && <LoginRecuperarPass aoMudarVista={setVista} />}
          </div>
        </div>
      )}
    </>
  );
}

export default LoginButton;

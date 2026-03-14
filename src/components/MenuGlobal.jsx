import "../css/index.css";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { extractRestaurantId, resolveUserRole } from "../utils/roles";

import iconMenu from "../assets/img/menu.png";
import iconClose from "../assets/img/close.png";
import iconHome from "../assets/img/home.png";
import iconInfo from "../assets/img/info.png";
import iconPhone from "../assets/img/phone.png";
import iconPolicy from "../assets/img/policy.png";
import iconTerms from "../assets/img/terms.png";

function readSessionUser() {
  try {
    const raw = localStorage.getItem("pedeja_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function MenuGlobal() {
  const [menuAberto, setMenuAberto] = useState(false);
  const [sessionUser, setSessionUser] = useState(() => readSessionUser());
  const navigate = useNavigate();

  useEffect(() => {
    const syncUser = () => setSessionUser(readSessionUser());

    window.addEventListener("storage", syncUser);
    window.addEventListener("focus", syncUser);

    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener("focus", syncUser);
    };
  }, []);

  const { partnerLabel, partnerRoute, showPartnerAction } = useMemo(() => {
    const role = resolveUserRole(sessionUser);

    if (role === "admin") {
      return {
        partnerLabel: "",
        partnerRoute: "",
        showPartnerAction: false,
      };
    }

    if (role === "restaurant") {
      const lojaId = extractRestaurantId(sessionUser);
      const route = lojaId ? `/parceiros?edit=1&loja=${lojaId}` : "/parceiros?edit=1";
      return {
        partnerLabel: "Editar dados da loja",
        partnerRoute: route,
        showPartnerAction: true,
      };
    }

    return {
      partnerLabel: "Torne-se parceiro PedeJa",
      partnerRoute: "/parceiros",
      showPartnerAction: true,
    };
  }, [sessionUser]);

  return (
    <main>
      <div id="menu-iconini" onClick={() => { setSessionUser(readSessionUser()); setMenuAberto(true); }}>
        <img src={iconMenu} className="menu-floating-icon" alt="Menu" />
      </div>

      <div
        className={`modal fade ${menuAberto ? "show" : ""}`}
        style={{
          display: menuAberto ? "block" : "none",
          backgroundColor: menuAberto ? "rgba(0,0,0,0.5)" : "transparent",
        }}
        tabIndex={-1}
      >
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Menu</h5>

              <button
                type="button"
                className="close-custom"
                onClick={() => setMenuAberto(false)}
              >
                <img src={iconClose} className="menu-close-icon" alt="Fechar" />
              </button>
            </div>

            <div className="modal-body">
              <button
                onClick={() => {
                  navigate("/");
                  setMenuAberto(false);
                }}
                className="menu-btn-custom"
              >
                <img src={iconHome} className="menu-item-icon icon-red" alt="Inicio" />
                Inicio
              </button>

              {showPartnerAction && (
                <button
                  onClick={() => {
                    navigate(partnerRoute);
                    setMenuAberto(false);
                  }}
                  className="menu-btn-custom"
                >
                  <img src={iconInfo} className="menu-item-icon icon-red" alt="Parceiros" />
                  {partnerLabel}
                </button>
              )}

              <a href="https://pedeja.pt/sobre.html" style={{ textDecoration: "none" }}>
                <button className="menu-btn-custom">
                  <img src={iconInfo} className="menu-item-icon icon-red" alt="Sobre" />
                  Sobre
                </button>
              </a>

              <a href="https://pedeja.pt/contatos.html" style={{ textDecoration: "none" }}>
                <button className="menu-btn-custom">
                  <img src={iconPhone} className="menu-item-icon icon-red" alt="Contatos" />
                  Contatos
                </button>
              </a>

              <a href="https://pedeja.pt/politicas.html" style={{ textDecoration: "none" }}>
                <button className="menu-btn-custom">
                  <img src={iconPolicy} className="menu-item-icon icon-red" alt="Politicas" />
                  Politicas de privacidade
                </button>
              </a>

              <a href="https://pedeja.pt/termos.html" style={{ textDecoration: "none" }}>
                <button className="menu-btn-custom">
                  <img src={iconTerms} className="menu-item-icon icon-red" alt="Termos" />
                  Termos e condicoes
                </button>
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default MenuGlobal;

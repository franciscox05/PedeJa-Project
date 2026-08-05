import { Link, NavLink, Navigate, Outlet } from "react-router-dom";
import { Package, Heart, User, Shield, MapPin } from "lucide-react";
import Logo from "../../components/Logo";
import LoginButton from "../../components/LoginButton";
import CartWidget from "../../components/CartWidget";
import Voltar from "../../components/Voltar";
import MenuGlobal from "../../components/MenuGlobal";
import { useAuth } from "../../context/AuthContext";
import { getDefaultPathByRole, resolveUserRole } from "../../utils/roles";
import userGif from "../../assets/img/perfil.gif";
import "../../css/pages/perfil.css";

// Sem restricao por papel: uma conta admin/restaurante/estafeta pode ter
// feito pedidos, favoritos ou moradas como cliente (nada no checkout impede
// isso), por isso todos os separadores ficam visiveis a qualquer sessao.
const TABS = [
  { path: "pedidos", label: "Pedidos", icon: Package },
  { path: "favoritos", label: "Favoritos", icon: Heart },
  { path: "dados", label: "Dados pessoais", icon: User },
  { path: "seguranca", label: "Segurança", icon: Shield },
  { path: "moradas", label: "Moradas", icon: MapPin },
];

export default function ProfileLayout() {
  const { user } = useAuth();
  const role = resolveUserRole(user);
  const isCustomer = role === "customer";

  return (
    <main className="perfil-main">
      <Logo />

      <div className="header-right-actions">
        <LoginButton />
        <CartWidget />
      </div>

      <div id="wave-top"></div>

      <div className="container perfil-container">
        <section className="perfil-card-shell">
          <section className="profile-workspace">
            <header className="profile-header">
              <div className="profile-avatar-wrap">
                <img src={userGif} alt="Perfil" className="profile-avatar" />
              </div>

              <div className="profile-header-text">
                <p className="profile-kicker">Área pessoal</p>
                <h1>O Meu Perfil</h1>
                <p className="profile-member-since">
                  Membro desde: {user?.dataregisto ? new Date(user.dataregisto).toLocaleDateString("pt-PT") : "-"}
                </p>
              </div>

              {!isCustomer ? (
                <div className="profile-header-actions">
                  <Link
                    to={getDefaultPathByRole(role)}
                    className="inline-flex items-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800"
                  >
                    Voltar ao painel
                  </Link>
                </div>
              ) : null}
            </header>

            <nav className="profile-tabs" aria-label="Secções do perfil">
              {TABS.map((tab) => (
                <NavLink
                  key={tab.path}
                  to={`/perfil/${tab.path}`}
                  className={({ isActive }) => `profile-tab-btn${isActive ? " active" : ""}`}
                >
                  <tab.icon className="profile-tab-icon" aria-hidden="true" />
                  {tab.label}
                </NavLink>
              ))}
            </nav>

            <div className="profile-tab-panel">
              <Outlet context={{ user, role }} />
            </div>
          </section>
        </section>
      </div>

      <Voltar />
      <MenuGlobal />
    </main>
  );
}

export function ProfileIndexRedirect() {
  return <Navigate to="pedidos" replace />;
}

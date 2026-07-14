import { NavLink, Outlet } from "react-router-dom";
import Logo from "../../components/Logo";
import LoginButton from "../../components/LoginButton";
import CartWidget from "../../components/CartWidget";
import Voltar from "../../components/Voltar";
import MenuGlobal from "../../components/MenuGlobal";
import { useAuth } from "../../context/AuthContext";
import { resolveUserRole } from "../../utils/roles";
import userGif from "../../assets/img/perfil.gif";
import "../../css/pages/perfil.css";

const TABS = [
  { path: "pedidos", label: "Pedidos" },
  { path: "favoritos", label: "Favoritos", customerOnly: true },
  { path: "dados", label: "Dados pessoais" },
  { path: "seguranca", label: "Segurança" },
  { path: "moradas", label: "Moradas" },
];

export default function ProfileLayout() {
  const { user } = useAuth();
  const isCustomer = resolveUserRole(user) === "customer";

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
                <p className="profile-kicker">Area pessoal</p>
                <h1>O Meu Perfil</h1>
                <p className="profile-member-since">
                  Membro desde: {user?.dataregisto ? new Date(user.dataregisto).toLocaleDateString("pt-PT") : "-"}
                </p>
              </div>
            </header>

            <nav className="profile-tabs" aria-label="Secoes do perfil">
              {TABS.filter((tab) => !tab.customerOnly || isCustomer).map((tab) => (
                <NavLink
                  key={tab.path}
                  to={`/perfil/${tab.path}`}
                  className={({ isActive }) => `profile-tab-btn${isActive ? " active" : ""}`}
                >
                  {tab.label}
                </NavLink>
              ))}
            </nav>

            <div className="profile-tab-panel">
              <Outlet context={{ user }} />
            </div>
          </section>
        </section>
      </div>

      <Voltar />
      <MenuGlobal />
    </main>
  );
}

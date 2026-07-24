import { Home, Receipt, User, LogOut } from "lucide-react";

const NAV_ITEMS = [
  { id: "inicio", label: "Início", icon: Home },
  { id: "historico", label: "Histórico", icon: Receipt },
  { id: "perfil", label: "Perfil", icon: User },
];

// Shell de app movel dedicado a /estafeta -- barra superior compacta +
// navegacao inferior por separadores (em vez da sidebar fixa partilhada com
// os dashboards de admin/restaurante, pensada para ecras largos). Estafetas
// usam isto quase sempre no telemovel, por isso o padrao de app nativa
// (top bar + bottom nav) e muito mais natural do que uma sidebar lateral.
export default function EstafetaAppShell({
  nome,
  online,
  activeTab,
  onTabChange,
  onLogout,
  children,
}) {
  const initial = (nome || "E").trim().charAt(0).toUpperCase();

  return (
    <div className="estafeta-app-shell">
      <header className="estafeta-app-topbar">
        <div className="estafeta-app-topbar-inner">
          <div className="estafeta-app-topbar-identity">
            <span className="estafeta-app-avatar">{initial}</span>
            <div>
              <p className="estafeta-app-topbar-kicker">PedeJá Estafeta</p>
              <h1 className="estafeta-app-topbar-name">{nome || "Estafeta"}</h1>
            </div>
          </div>

          <div className="estafeta-app-topbar-actions">
            <span className={`estafeta-app-status-pill${online ? " is-online" : ""}`}>
              <span className="estafeta-online-dot" />
              {online ? "Online" : "Offline"}
            </span>
            <button
              type="button"
              className="estafeta-app-icon-btn"
              title="A minha conta"
              onClick={() => onTabChange("perfil")}
            >
              <User aria-hidden="true" />
            </button>
            <button
              type="button"
              className="estafeta-app-icon-btn"
              title="Sair"
              onClick={onLogout}
            >
              <LogOut aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="estafeta-app-content">
        {children}
      </main>

      <nav className="estafeta-app-bottom-nav" aria-label="Navegação da app do estafeta">
        <div className="estafeta-app-bottom-nav-inner">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`estafeta-app-bottom-nav-btn${activeTab === item.id ? " is-active" : ""}`}
              onClick={() => onTabChange(item.id)}
            >
              <item.icon aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

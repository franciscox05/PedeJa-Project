import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";

const ICON_PATHS = {
  dashboard: "M4 4h7v7H4Zm9 0h7v4h-7ZM13 10h7v10h-7ZM4 13h7v7H4Z",
  customers: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  estafetas: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z",
  categorias: "M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z",
  banners: "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z",
  cupoes: "M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.41l9 9c.36.36.86.59 1.41.59.55 0 1.05-.23 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z",
  restaurants: "M4 6.5 5.6 3h12.8L20 6.5v2.2a2.2 2.2 0 0 1-1.4 2.06V20H5.4v-9.24A2.2 2.2 0 0 1 4 8.7Zm2.8-1.7-.8 1.7h12l-.8-1.7ZM7.4 11v7h8.8v-7Zm2 2.2h4.8v2H9.4Z",
  store: "M4 6.5 5.6 3h12.8L20 6.5v2.2a2.2 2.2 0 0 1-1.4 2.06V20H5.4v-9.24A2.2 2.2 0 0 1 4 8.7Zm2.8-1.7-.8 1.7h12l-.8-1.7ZM7.4 11v7h8.8v-7Zm2 2.2h4.8v2H9.4Z",
  promotions: "m20 4-8.2 3.3H6.8A2.8 2.8 0 0 0 4 10.1v1.8a2.8 2.8 0 0 0 2.3 2.76l.9 4.15A1.5 1.5 0 0 0 8.66 20h1.58a1.5 1.5 0 0 0 1.46-1.86l-.7-3.2L20 18V4ZM6.8 9.3h4.2v5.4H6.8a.8.8 0 0 1-.8-.8v-3.8a.8.8 0 0 1 .8-.8Z",
  campaigns: "m20 4-8.2 3.3H6.8A2.8 2.8 0 0 0 4 10.1v1.8a2.8 2.8 0 0 0 2.3 2.76l.9 4.15A1.5 1.5 0 0 0 8.66 20h1.58a1.5 1.5 0 0 0 1.46-1.86l-.7-3.2L20 18V4ZM6.8 9.3h4.2v5.4H6.8a.8.8 0 0 1-.8-.8v-3.8a.8.8 0 0 1 .8-.8Z",
  geoboard: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9 3.06A9.01 9.01 0 0 0 12.94 3V1h-2v2A9.01 9.01 0 0 0 3 11.94H1v2h2A9.01 9.01 0 0 0 11.06 21v2h2v-2A9.01 9.01 0 0 0 21 12.94h2v-2ZM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z",
  performance: "M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6Z",
  receita: "M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4Z",
};

function SidebarIcon({ name }) {
  const iconName = String(name || "dashboard").toLowerCase();
  const path = ICON_PATHS[iconName] || ICON_PATHS.dashboard;

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

// Agrupa as tabs pela ordem em que as suas seccoes aparecem primeiro no
// array -- opcional (campo `section`): quando nenhuma tab o define, cai num
// so grupo sem cabecalho, igual ao comportamento antigo (usado por ex. pelo
// dashboard do restaurante, que passa o seu proprio array sem seccoes).
function groupTabsBySection(tabs) {
  const groups = [];
  const groupByLabel = new Map();

  tabs.forEach((tab) => {
    const label = tab.section || "";
    if (!groupByLabel.has(label)) {
      const group = { label, tabs: [] };
      groupByLabel.set(label, group);
      groups.push(group);
    }
    groupByLabel.get(label).tabs.push(tab);
  });

  return groups;
}

function getInitialCollapsedState(storageKey) {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(storageKey) === "true";
  } catch {
    return false;
  }
}

export default function DashboardSidebarLayout({
  kicker = "Operations",
  title,
  subtitle = "",
  tabs = [],
  activeTab,
  onTabChange,
  footer = null,
  storageKey = "dashboard-sidebar-collapsed",
  children,
}) {
  const [collapsed, setCollapsed] = useState(() => getInitialCollapsedState(storageKey));
  const tabGroups = groupTabsBySection(tabs);
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { clearCart } = useCart();
  const activeTabRef = useRef(null);

  useEffect(() => {
    // Cada pagina do dashboard monta este componente de raiz, por isso o
    // scroll interno do menu (overflow-y: auto) comeca sempre no topo --
    // sem isto, clicar numa opcao mais abaixo (ex: "Promocoes") fazia o
    // menu "saltar" de volta para o topo em vez de ficar onde estava.
    activeTabRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeTab]);

  const handleAccountLogout = () => {
    logout();
    clearCart();
    // Navegacao "dura" (nao client-side): sair de uma rota protegida via navigate()
    // deixa o ProtectedRoute reagir ao user=null antes do router assentar em "/",
    // e o utilizador acaba momentaneamente em /login. Um reload evita essa corrida.
    window.location.href = "/";
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(storageKey, String(collapsed));
    } catch {
      // Ignora falhas de persistencia local.
    }
  }, [collapsed, storageKey]);

  return (
    <div className={`dashboard-shell enterprise dashboard-shell--with-sidebar${collapsed ? " is-collapsed" : ""}`}>
      <aside className="dashboard-sidebar">
        <div className="dashboard-sidebar-card">
          <div className="dashboard-sidebar-top">
            <button
              type="button"
              className="dashboard-sidebar-toggle"
              onClick={() => setCollapsed((prev) => !prev)}
              aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
              title={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
            >
              <span />
              <span />
              <span />
            </button>

            {!collapsed ? (
              <div className="dashboard-sidebar-copy">
                <p className="kicker">{kicker}</p>
                <h2 className="dashboard-sidebar-title">{title}</h2>
                {subtitle ? <p className="dashboard-sidebar-subtitle">{subtitle}</p> : null}
              </div>
            ) : null}
          </div>

          <nav className="dashboard-sidebar-nav" aria-label="Dashboard sections">
            {tabGroups.map((group) => (
              <div className="dashboard-sidebar-group" key={group.label || "default"}>
                {group.label && !collapsed ? (
                  <p className="dashboard-sidebar-section-label">{group.label}</p>
                ) : null}
                {group.tabs.map((tab) => {
                  const isActive = tab.id === activeTab;

                  return (
                    <button
                      key={tab.id}
                      ref={isActive ? activeTabRef : null}
                      type="button"
                      className={`dashboard-sidebar-tab${isActive ? " is-active" : ""}`}
                      onClick={() => onTabChange(tab.id)}
                      title={collapsed ? tab.label : undefined}
                    >
                      <span className="dashboard-sidebar-tab-icon">
                        <SidebarIcon name={tab.icon || tab.id} />
                      </span>
                      {!collapsed ? (
                        <span className="dashboard-sidebar-tab-text">
                          <span className="dashboard-sidebar-tab-label-row">
                            <span className="dashboard-sidebar-tab-label">
                              {tab.label}
                              {tab.route ? (
                                <span className="dashboard-sidebar-tab-route-indicator" aria-hidden="true" title="Abre noutra pagina">↗</span>
                              ) : null}
                            </span>
                            {typeof tab.badge === "number" && tab.badge > 0 ? (
                              <span className="dashboard-sidebar-tab-badge">{tab.badge}</span>
                            ) : null}
                          </span>
                          {tab.description ? (
                            <span className="dashboard-sidebar-tab-description">{tab.description}</span>
                          ) : null}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {footer && !collapsed ? <div className="dashboard-sidebar-footer">{footer}</div> : null}

          {user ? (
            <div className="dashboard-sidebar-account">
              <button
                type="button"
                className="dashboard-sidebar-account-btn"
                onClick={() => navigate("/perfil")}
                title={collapsed ? "A minha conta" : undefined}
              >
                <span className="material-icons" aria-hidden="true">person</span>
                {!collapsed ? <span>A minha conta</span> : null}
              </button>
              <button
                type="button"
                className="dashboard-sidebar-account-btn dashboard-sidebar-account-btn--logout"
                onClick={handleAccountLogout}
                title={collapsed ? "Sair" : undefined}
              >
                <span className="material-icons" aria-hidden="true">logout</span>
                {!collapsed ? <span>Sair</span> : null}
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <div className="dashboard-main">
        {children}
      </div>
    </div>
  );
}

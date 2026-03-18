import { useEffect, useState } from "react";

function SidebarIcon({ name }) {
  const iconName = String(name || "dashboard").toLowerCase();

  if (iconName === "restaurants" || iconName === "store") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6.5 5.6 3h12.8L20 6.5v2.2a2.2 2.2 0 0 1-1.4 2.06V20H5.4v-9.24A2.2 2.2 0 0 1 4 8.7Zm2.8-1.7-.8 1.7h12l-.8-1.7ZM7.4 11v7h8.8v-7Zm2 2.2h4.8v2H9.4Z" />
      </svg>
    );
  }

  if (iconName === "promotions" || iconName === "campaigns") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m20 4-8.2 3.3H6.8A2.8 2.8 0 0 0 4 10.1v1.8a2.8 2.8 0 0 0 2.3 2.76l.9 4.15A1.5 1.5 0 0 0 8.66 20h1.58a1.5 1.5 0 0 0 1.46-1.86l-.7-3.2L20 18V4ZM6.8 9.3h4.2v5.4H6.8a.8.8 0 0 1-.8-.8v-3.8a.8.8 0 0 1 .8-.8Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4h7v7H4Zm9 0h7v4h-7ZM13 10h7v10h-7ZM4 13h7v7H4Z" />
    </svg>
  );
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
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab;

              return (
                <button
                  key={tab.id}
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
                      <span className="dashboard-sidebar-tab-label">{tab.label}</span>
                      {tab.description ? (
                        <span className="dashboard-sidebar-tab-description">{tab.description}</span>
                      ) : null}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          {footer && !collapsed ? <div className="dashboard-sidebar-footer">{footer}</div> : null}
        </div>
      </aside>

      <div className="dashboard-main">
        {children}
      </div>
    </div>
  );
}

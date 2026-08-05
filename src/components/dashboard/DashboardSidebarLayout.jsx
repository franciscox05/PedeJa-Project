import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Bike,
  LayoutGrid,
  Megaphone,
  Ticket,
  Store,
  Tag,
  Map as MapIcon,
  TrendingUp,
  LineChart,
  Star,
  ClipboardList,
  ChevronsLeft,
  ChevronsRight,
  User,
  LogOut,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";

// Mapa de icones lucide-react por chave `tab.icon` (ou `tab.id` como
// fallback) -- substitui os antigos paths SVG desenhados a mao, ao estilo
// do DashboardSidebar.jsx do projeto de referencia base44.
const TAB_ICONS = {
  dashboard: LayoutDashboard,
  customers: Users,
  estafetas: Bike,
  categorias: LayoutGrid,
  banners: Megaphone,
  cupoes: Ticket,
  restaurants: Store,
  store: Store,
  promotions: Tag,
  campaigns: Tag,
  geoboard: MapIcon,
  performance: TrendingUp,
  receita: LineChart,
  avaliacoes: Star,
  recrutamento: ClipboardList,
};

function TabIcon({ name, className }) {
  const Icon = TAB_ICONS[String(name || "").toLowerCase()] || LayoutDashboard;
  return <Icon className={className} aria-hidden="true" />;
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
        <div
          className={cn(
            "flex h-full flex-col bg-white border-r border-gray-100 shadow-sm",
            collapsed ? "w-[88px]" : "w-[272px]",
          )}
        >
          <div className="flex items-start justify-between gap-2 px-4 py-4 border-b border-gray-100">
            {!collapsed ? (
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{kicker}</p>
                <h2 className="text-base font-bold text-gray-900 truncate">{title}</h2>
                {subtitle ? <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{subtitle}</p> : null}
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                <LayoutDashboard className="w-4 h-4 text-white" aria-hidden="true" />
              </div>
            )}
            <button
              type="button"
              className="flex-shrink-0 w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              onClick={() => setCollapsed((prev) => !prev)}
              aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
              title={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
            >
              {collapsed ? <ChevronsRight className="w-4 h-4" aria-hidden="true" /> : <ChevronsLeft className="w-4 h-4" aria-hidden="true" />}
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4" aria-label="Dashboard sections">
            {tabGroups.map((group) => (
              <div key={group.label || "default"} className="space-y-0.5">
                {group.label && !collapsed ? (
                  <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">{group.label}</p>
                ) : null}
                {group.tabs.map((tab) => {
                  const isActive = tab.id === activeTab;

                  return (
                    <button
                      key={tab.id}
                      ref={isActive ? activeTabRef : null}
                      type="button"
                      onClick={() => onTabChange(tab.id)}
                      title={collapsed ? tab.label : undefined}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-all",
                        isActive ? "bg-primary text-white shadow-sm" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                      )}
                    >
                      <TabIcon name={tab.icon || tab.id} className="w-4 h-4 flex-shrink-0" />
                      {!collapsed ? (
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate">{tab.label}</span>
                            {typeof tab.badge === "number" && tab.badge > 0 ? (
                              <span
                                className={cn(
                                  "ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold",
                                  isActive ? "bg-white/25 text-white" : "bg-primary/10 text-primary",
                                )}
                              >
                                {tab.badge}
                              </span>
                            ) : null}
                          </span>
                          {tab.description ? (
                            <span className={cn("block text-[11px] font-normal truncate", isActive ? "text-white/80" : "text-gray-400")}>
                              {tab.description}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {footer && !collapsed ? (
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-500">{footer}</div>
          ) : null}

          {user ? (
            <div className="px-3 py-2 border-t border-gray-100 space-y-0.5">
              <button
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all"
                onClick={() => navigate("/perfil")}
                title={collapsed ? "A minha conta" : undefined}
              >
                <User className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                {!collapsed ? <span>A minha conta</span> : null}
              </button>
              <button
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-all"
                onClick={handleAccountLogout}
                title={collapsed ? "Sair" : undefined}
              >
                <LogOut className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
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

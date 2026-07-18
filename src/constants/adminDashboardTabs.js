export const ADMIN_DASHBOARD_TABS = [
  { id: "dashboard", label: "Dashboard", description: "Ultimos pedidos e entregas recentes", icon: "dashboard" },
  { id: "customers", label: "Clientes", description: "Analise de atividade e valor por cliente", icon: "dashboard" },
  { id: "restaurants", label: "Gestao de Restaurantes", description: "Auto-accept e comissao por loja", icon: "restaurants" },
  { id: "estafetas", label: "Estafetas", description: "Dispatch interno, atribuicao e gestao de estafetas", icon: "dashboard", route: "/dashboard/admin/estafetas" },
  { id: "categorias", label: "Categorias", description: "Gerir categorias de lojas", icon: "dashboard", route: "/dashboard/admin/categorias" },
  { id: "banners", label: "Banners", description: "Banners promocionais da home", icon: "dashboard", route: "/dashboard/admin/banners" },
  { id: "cupoes", label: "Cupoes", description: "Codigos de desconto", icon: "dashboard", route: "/dashboard/admin/cupoes" },
  { id: "promotions", label: "Promocoes", description: "Campanhas e destaques por loja", icon: "promotions", route: "/dashboard/admin/promocoes" },
];

export function resolveAdminTabRoute(tabId) {
  const tab = ADMIN_DASHBOARD_TABS.find((entry) => entry.id === tabId);
  return tab?.route || `/dashboard/admin?tab=${tabId}`;
}

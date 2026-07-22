export const ADMIN_DASHBOARD_TABS = [
  { id: "dashboard", label: "Dashboard", description: "Ultimos pedidos e entregas recentes", icon: "dashboard", section: "Visao geral" },
  { id: "geoboard", label: "Live Geo", description: "Mapa em tempo real de pedidos e estafetas", icon: "geoboard", section: "Visao geral", route: "/dashboard/admin/geoboard" },
  { id: "performance", label: "Performance", description: "Faturacao vs taxa de entrega, top produtos", icon: "performance", section: "Visao geral", route: "/dashboard/admin/performance" },
  { id: "receita", label: "Receita", description: "Receita por tipo de loja, loja e estafeta", icon: "receita", section: "Visao geral", route: "/dashboard/admin/receita" },
  { id: "customers", label: "Clientes", description: "Analise de atividade e valor por cliente", icon: "customers", section: "Pessoas" },
  { id: "restaurants", label: "Gestao de Restaurantes", description: "Auto-accept e comissao por loja", icon: "restaurants", section: "Restaurantes" },
  { id: "estafetas", label: "Estafetas", description: "Dispatch interno, atribuicao e gestao de estafetas", icon: "estafetas", section: "Estafetas", route: "/dashboard/admin/estafetas" },
  { id: "categorias", label: "Categorias", description: "Gerir categorias de lojas", icon: "categorias", section: "Conteudo", route: "/dashboard/admin/categorias" },
  { id: "banners", label: "Banners", description: "Banners promocionais da home", icon: "banners", section: "Conteudo", route: "/dashboard/admin/banners" },
  { id: "cupoes", label: "Cupoes", description: "Codigos de desconto", icon: "cupoes", section: "Conteudo", route: "/dashboard/admin/cupoes" },
  { id: "promotions", label: "Promocoes", description: "Campanhas e destaques por loja", icon: "promotions", section: "Conteudo", route: "/dashboard/admin/promocoes" },
];

export function resolveAdminTabRoute(tabId) {
  const tab = ADMIN_DASHBOARD_TABS.find((entry) => entry.id === tabId);
  return tab?.route || `/dashboard/admin?tab=${tabId}`;
}

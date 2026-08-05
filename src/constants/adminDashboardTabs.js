export const ADMIN_DASHBOARD_TABS = [
  { id: "dashboard", label: "Dashboard", description: "Últimos pedidos e entregas recentes", icon: "dashboard", section: "Visão geral" },
  { id: "geoboard", label: "Live Geo", description: "Mapa em tempo real de pedidos e estafetas", icon: "geoboard", section: "Visão geral", route: "/dashboard/admin/geoboard" },
  { id: "performance", label: "Performance", description: "Faturação vs taxa de entrega, top produtos", icon: "performance", section: "Visão geral", route: "/dashboard/admin/performance" },
  { id: "receita", label: "Receita", description: "Receita por tipo de loja, loja e estafeta", icon: "receita", section: "Visão geral", route: "/dashboard/admin/receita" },
  { id: "customers", label: "Clientes", description: "Análise de atividade e valor por cliente", icon: "customers", section: "Pessoas" },
  { id: "restaurants", label: "Gestão de Restaurantes", description: "Auto-accept e comissão por loja", icon: "restaurants", section: "Restaurantes" },
  { id: "estafetas", label: "Estafetas", description: "Dispatch interno, atribuição e gestão de estafetas", icon: "estafetas", section: "Estafetas", route: "/dashboard/admin/estafetas" },
  { id: "categorias", label: "Categorias", description: "Gerir categorias de lojas", icon: "categorias", section: "Conteúdo", route: "/dashboard/admin/categorias" },
  { id: "banners", label: "Banners", description: "Banners promocionais da home", icon: "banners", section: "Conteúdo", route: "/dashboard/admin/banners" },
  { id: "cupoes", label: "Cupões", description: "Códigos de desconto", icon: "cupoes", section: "Conteúdo", route: "/dashboard/admin/cupoes" },
  { id: "promotions", label: "Promoções", description: "Campanhas e destaques por loja", icon: "promotions", section: "Conteúdo", route: "/dashboard/admin/promocoes" },
  { id: "avaliacoes", label: "Avaliações", description: "Avaliações de pedidos deixadas pelos clientes", icon: "avaliacoes", section: "Qualidade", route: "/dashboard/admin/avaliacoes" },
  { id: "recrutamento", label: "Recrutamento", description: "Quadro de tarefas para angariar restaurantes", icon: "recrutamento", section: "Crescimento", route: "/dashboard/admin/recrutamento" },
];

export function resolveAdminTabRoute(tabId) {
  const tab = ADMIN_DASHBOARD_TABS.find((entry) => entry.id === tabId);
  return tab?.route || `/dashboard/admin?tab=${tabId}`;
}

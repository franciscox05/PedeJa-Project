import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star, MessageCircle, TrendingUp } from "lucide-react";
import "../css/pages/dashboard.css";
import DashboardSidebarLayout from "../components/dashboard/DashboardSidebarLayout";
import DashboardPageHeader from "../components/dashboard/DashboardPageHeader";
import DashboardPanel from "../components/dashboard/DashboardPanel";
import DashboardEmptyState from "../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../components/dashboard/DashboardLoadingState";
import { ADMIN_DASHBOARD_TABS, resolveAdminTabRoute } from "../constants/adminDashboardTabs";
import { fetchOrderReviews } from "../services/adminReviewsService";
import { extractUserId } from "../utils/roles";
import { useAlert } from "../context/AlertContext";

function parseSessionUser(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function DashboardAvaliacoes() {
  const navigate = useNavigate();
  const userRaw = localStorage.getItem("pedeja_user");
  const user = useMemo(() => parseSessionUser(userRaw), [userRaw]);
  const callerUserId = extractUserId(user);

  const { showError } = useAlert();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ratingFilter, setRatingFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchOrderReviews(callerUserId);
      setReviews(rows);
    } catch (err) {
      showError(err?.message || "Nao foi possivel carregar as avaliacoes.");
    } finally {
      setLoading(false);
    }
  }, [callerUserId, showError]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const total = reviews.length;
    const avg = total > 0 ? reviews.reduce((sum, r) => sum + (r.classificacao || 0), 0) / total : 0;
    const withComments = reviews.filter((r) => r.comentario).length;
    const fiveStars = reviews.filter((r) => r.classificacao === 5).length;
    return { total, avg, withComments, fiveStars };
  }, [reviews]);

  const filteredReviews = useMemo(() => {
    return reviews.filter((review) => {
      if (ratingFilter !== "all" && review.classificacao !== Number(ratingFilter)) return false;
      if (search) {
        const query = search.toLowerCase();
        const matchesLoja = review.loja_nome?.toLowerCase().includes(query);
        const matchesCustomer = review.customer_nome?.toLowerCase().includes(query);
        const matchesComment = review.comentario?.toLowerCase().includes(query);
        if (!matchesLoja && !matchesCustomer && !matchesComment) return false;
      }
      return true;
    });
  }, [reviews, ratingFilter, search]);

  return (
    <DashboardSidebarLayout
      tabs={ADMIN_DASHBOARD_TABS}
      activeTab="avaliacoes"
      onTabChange={(tabId) => navigate(resolveAdminTabRoute(tabId))}
      kicker="Qualidade"
      title="Avaliacoes"
      subtitle="Avaliacoes dos clientes aos pedidos/restaurantes."
      storageKey="dashboard-admin-sidebar-collapsed"
    >
      <div className="dashboard-tab-section">
        <DashboardPageHeader
          kicker="Qualidade"
          title="Avaliacoes"
          subtitle="Avaliacoes que os clientes deixam depois de um pedido entregue."
        />

        <section className="dashboard-grid premium-grid">
          <article className="metric-card premium">
            <div className="metric-card-icon metric-icon-red"><TrendingUp aria-hidden="true" /></div>
            <div className="metric-label">Total</div>
            <div className="metric-value">{stats.total}</div>
          </article>
          <article className="metric-card premium">
            <div className="metric-card-icon metric-icon-amber"><Star aria-hidden="true" /></div>
            <div className="metric-label">Media</div>
            <div className="metric-value">{stats.avg.toFixed(1)}</div>
          </article>
          <article className="metric-card premium">
            <div className="metric-card-icon metric-icon-green"><MessageCircle aria-hidden="true" /></div>
            <div className="metric-label">Com comentario</div>
            <div className="metric-value">{stats.withComments}</div>
          </article>
          <article className="metric-card premium">
            <div className="metric-card-icon metric-icon-purple"><Star aria-hidden="true" /></div>
            <div className="metric-label">5 estrelas</div>
            <div className="metric-value">{stats.fiveStars}</div>
          </article>
        </section>

        <DashboardPanel
          title="Avaliacoes recentes"
          description="Pesquisa por loja, cliente ou comentario, e filtra por classificacao."
          actions={(
            <div className="dashboard-toolbar-field customer-search-field" style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder="Pesquisar loja, cliente ou comentario"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select value={ratingFilter} onChange={(event) => setRatingFilter(event.target.value)}>
                <option value="all">Todas</option>
                <option value="5">5 estrelas</option>
                <option value="4">4 estrelas</option>
                <option value="3">3 estrelas</option>
                <option value="2">2 estrelas</option>
                <option value="1">1 estrela</option>
              </select>
            </div>
          )}
        >
          {loading ? (
            <DashboardLoadingState label="A carregar avaliacoes..." />
          ) : filteredReviews.length === 0 ? (
            <DashboardEmptyState label="Sem avaliacoes para mostrar com os filtros atuais." />
          ) : (
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Loja</th>
                    <th>Cliente</th>
                    <th>Classificacao</th>
                    <th>Comentario</th>
                    <th>Pedido</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReviews.map((review) => (
                    <tr key={review.id}>
                      <td>{review.loja_nome}</td>
                      <td>{review.customer_nome || "-"}</td>
                      <td>
                        <span className="tag ok">{review.classificacao} <Star className="inline-star" aria-hidden="true" /></span>
                      </td>
                      <td>{review.comentario || <span className="muted">Sem comentario</span>}</td>
                      <td>#{review.order_id}</td>
                      <td>{new Date(review.criado_em).toLocaleDateString("pt-PT")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DashboardPanel>
      </div>
    </DashboardSidebarLayout>
  );
}

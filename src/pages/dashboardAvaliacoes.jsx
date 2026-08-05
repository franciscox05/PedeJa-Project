import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../css/pages/dashboard.css";
import DashboardSidebarLayout from "../components/dashboard/DashboardSidebarLayout";
import DashboardPageHeader from "../components/dashboard/DashboardPageHeader";
import DashboardPanel from "../components/dashboard/DashboardPanel";
import DashboardEmptyState from "../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../components/dashboard/DashboardLoadingState";
import { ADMIN_DASHBOARD_TABS, resolveAdminTabRoute } from "../constants/adminDashboardTabs";
import { fetchOrderReviewsAdmin } from "../services/orderRatingService";
import { extractUserId } from "../utils/roles";
import { useAlert } from "../context/AlertContext";

function parseSessionUser(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Stars({ value }) {
  return (
    <span aria-label={`${value} de 5 estrelas`}>
      {"★".repeat(value)}
      <span style={{ opacity: 0.3 }}>{"★".repeat(5 - value)}</span>
    </span>
  );
}

export default function DashboardAvaliacoes() {
  const navigate = useNavigate();
  const userRaw = localStorage.getItem("pedeja_user");
  const user = useMemo(() => parseSessionUser(userRaw), [userRaw]);
  const callerUserId = extractUserId(user);

  const { showError } = useAlert();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchOrderReviewsAdmin(callerUserId);
      setReviews(rows);
    } catch (err) {
      showError(err?.message || "Não foi possível carregar as avaliações.");
    } finally {
      setLoading(false);
    }
  }, [callerUserId, showError]);

  useEffect(() => {
    load();
  }, [load]);

  const averageRating = useMemo(() => {
    if (!reviews.length) return 0;
    return reviews.reduce((sum, r) => sum + Number(r.classificacao || 0), 0) / reviews.length;
  }, [reviews]);

  return (
    <DashboardSidebarLayout
      tabs={ADMIN_DASHBOARD_TABS}
      activeTab="avaliacoes"
      onTabChange={(tabId) => navigate(resolveAdminTabRoute(tabId))}
      kicker="Qualidade"
      title="Avaliações de Pedidos"
      subtitle="O que os clientes dizem sobre os pedidos entregues."
      storageKey="dashboard-admin-sidebar-collapsed"
    >
      <div className="dashboard-tab-section">
        <DashboardPageHeader
          kicker="Qualidade"
          title="Avaliações"
          subtitle="Classificação de 1 a 5 estrelas deixada pelos clientes após a entrega."
        />

        <section className="dashboard-grid premium-grid stat-hero-grid">
          <article className="metric-card premium stat-hero" style={{ "--stat-accent": "#e62429" }}>
            <div className="stat-hero-icon stat-hero-icon--red">
              <span className="material-icons" aria-hidden="true">reviews</span>
            </div>
            <div className="stat-hero-body">
              <div className="metric-label">Avaliações recebidas</div>
              <div className="metric-value">{reviews.length}</div>
              <div className="metric-foot">No total</div>
            </div>
          </article>
          <article className="metric-card premium stat-hero" style={{ "--stat-accent": "#15803d" }}>
            <div className="stat-hero-icon stat-hero-icon--green">
              <span className="material-icons" aria-hidden="true">star</span>
            </div>
            <div className="stat-hero-body">
              <div className="metric-label">Média geral</div>
              <div className="metric-value">{averageRating.toFixed(1)}</div>
              <div className="metric-foot">De 5 estrelas</div>
            </div>
          </article>
        </section>

        <DashboardPanel
          title={(
            <>
              <span className="material-icons panel-title-icon" aria-hidden="true">list_alt</span>
              Todas as avaliações
            </>
          )}
        >
          {loading ? (
            <DashboardLoadingState />
          ) : reviews.length === 0 ? (
            <DashboardEmptyState label="Ainda sem avaliações de pedidos." />
          ) : (
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Loja</th>
                    <th>Cliente</th>
                    <th>Classificação</th>
                    <th>Comentário</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((review) => (
                    <tr key={review.id}>
                      <td>#{review.order_id}</td>
                      <td>{review.loja_nome || "-"}</td>
                      <td>{review.customer_nome || "-"}</td>
                      <td><Stars value={Number(review.classificacao || 0)} /></td>
                      <td>{review.comentario || <span className="muted">Sem comentário</span>}</td>
                      <td>{formatDateTime(review.criado_em)}</td>
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

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../css/pages/dashboard.css";
import DashboardSidebarLayout from "../components/dashboard/DashboardSidebarLayout";
import DashboardPageHeader from "../components/dashboard/DashboardPageHeader";
import DashboardPanel from "../components/dashboard/DashboardPanel";
import DashboardEmptyState from "../components/dashboard/DashboardEmptyState";
import { fetchDevDashboard } from "../services/opsDashboardService";
import { extractUserId } from "../utils/roles";
import { ADMIN_DASHBOARD_TABS, resolveAdminTabRoute } from "../constants/adminDashboardTabs";

function parseSessionUser(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function statusClass(status) {
  if (["DELIVERED", "CONFIRMED"].includes(status)) return "tag ok";
  if (["FAILED", "CANCELLED"].includes(status)) return "tag bad";
  return "tag warn";
}

export default function DashboardDev() {
  const navigate = useNavigate();
  const userRaw = localStorage.getItem("pedeja_user");
  const user = useMemo(() => parseSessionUser(userRaw), [userRaw]);

  const [periodDays, setPeriodDays] = useState(7);
  const [state, setState] = useState({
    events: [],
    deliveries: [],
    metrics: { webhookEvents: 0, failedDeliveries: 0, latestDeliveryStatus: "N/A" },
    loading: true,
    error: "",
  });

  const load = useCallback(async () => {
    const callerUserId = extractUserId(user);
    if (!callerUserId) return;
    setState((prev) => ({ ...prev, loading: true }));
    const data = await fetchDevDashboard(periodDays, callerUserId);
    setState({ ...data, loading: false, error: data.error || "" });
  }, [periodDays, user]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- load() polls an external API and
       calls setState only after an await; identical pattern to dashboardEstafetas.jsx. */
    load();
    const timer = setInterval(load, 20000);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => clearInterval(timer);
  }, [load]);

  return (
    <DashboardSidebarLayout
      tabs={ADMIN_DASHBOARD_TABS}
      activeTab="dashboard"
      onTabChange={(tabId) => navigate(resolveAdminTabRoute(tabId))}
      kicker="DevOps"
      title="Dashboard DevOps"
      subtitle="Integrações, webhooks e saúde operacional."
      storageKey="dashboard-admin-sidebar-collapsed"
    >
      <DashboardPageHeader
        kicker="DevOps"
        title="Dashboard DevOps"
        subtitle="Integrações, webhooks e saúde operacional."
        actions={(
          <>
            <select value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))}>
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </select>
            <button className="btn-dashboard" onClick={load}>Atualizar</button>
            <button className="btn-dashboard secondary" onClick={() => navigate("/dashboard/admin")}>Voltar ao dashboard</button>
          </>
        )}
      />

      <section className="dashboard-grid">
        <article className="metric-card">
          <div className="metric-label">Eventos webhook</div>
          <div className="metric-value">{state.metrics.webhookEvents}</div>
        </article>
        <article className="metric-card">
          <div className="metric-label">Entregas falhadas</div>
          <div className="metric-value">{state.metrics.failedDeliveries}</div>
        </article>
        <article className="metric-card">
          <div className="metric-label">Último estado de entrega</div>
          <div className="metric-value" style={{ fontSize: "1.2rem" }}>{state.metrics.latestDeliveryStatus}</div>
        </article>
      </section>

      {state.error && <p style={{ color: "#b91c1c", fontWeight: 700 }}>{state.error}</p>}

      <section className="panel-grid">
        <DashboardPanel title="Eventos recentes">
          <div className="table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Tipo</th>
                  <th>Criado</th>
                </tr>
              </thead>
              <tbody>
                {state.events.map((event) => (
                  <tr key={event.id}>
                    <td>{String(event.event_id || event.id).slice(0, 12)}</td>
                    <td><span className="tag">{event.event_type}</span></td>
                    <td>{new Date(event.created_at).toLocaleString("pt-PT")}</td>
                  </tr>
                ))}
                {!state.loading && state.events.length === 0 && (
                  <DashboardEmptyState as="tableRow" colSpan={3} label="Sem eventos para mostrar." />
                )}
              </tbody>
            </table>
          </div>
        </DashboardPanel>

        <DashboardPanel title="Monitor de entregas">
          <div className="table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Entrega</th>
                  <th>Order</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {state.deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td>{String(delivery.external_delivery_id || delivery.id).slice(0, 12)}</td>
                    <td>{String(delivery.order_id).slice(0, 8)}</td>
                    <td><span className={statusClass(delivery.status)}>{delivery.status}</span></td>
                  </tr>
                ))}
                {!state.loading && state.deliveries.length === 0 && (
                  <DashboardEmptyState as="tableRow" colSpan={3} label="Sem entregas monitorizadas para mostrar." />
                )}
              </tbody>
            </table>
          </div>
        </DashboardPanel>
      </section>
    </DashboardSidebarLayout>
  );
}

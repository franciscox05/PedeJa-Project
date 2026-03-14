import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../css/pages/dashboard.css";
import { fetchDevDashboard } from "../services/opsDashboardService";

function statusClass(status) {
  if (["DELIVERED", "CONFIRMED"].includes(status)) return "tag ok";
  if (["FAILED", "CANCELLED"].includes(status)) return "tag bad";
  return "tag warn";
}

export default function DashboardDev() {
  const navigate = useNavigate();
  const [periodDays, setPeriodDays] = useState(7);
  const [state, setState] = useState({
    events: [],
    deliveries: [],
    metrics: { webhookEvents: 0, failedDeliveries: 0, latestDeliveryStatus: "N/A" },
    loading: true,
    error: "",
  });

  const load = async (days = periodDays) => {
    setState((prev) => ({ ...prev, loading: true }));
    const data = await fetchDevDashboard(days);
    setState({ ...data, loading: false, error: data.error || "" });
  };

  useEffect(() => {
    load(periodDays);
    const timer = setInterval(() => load(periodDays), 20000);
    return () => clearInterval(timer);
  }, [periodDays]);

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Dashboard DevOps</h1>
          <p className="dashboard-subtitle">Integracoes, webhooks e saude operacional</p>
        </div>
        <div className="dashboard-actions">
          <select value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))}>
            <option value={7}>Ultimos 7 dias</option>
            <option value={30}>Ultimos 30 dias</option>
            <option value={90}>Ultimos 90 dias</option>
          </select>
          <button className="btn-dashboard" onClick={() => load(periodDays)}>Atualizar</button>
          <button className="btn-dashboard" onClick={() => navigate("/")}>Website</button>
        </div>
      </header>

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
          <div className="metric-label">Ultimo estado de entrega</div>
          <div className="metric-value" style={{ fontSize: "1.2rem" }}>{state.metrics.latestDeliveryStatus}</div>
        </article>
      </section>

      {state.error && <p style={{ color: "#b91c1c", fontWeight: 700 }}>{state.error}</p>}

      <section className="panel-grid">
        <article className="panel">
          <h3>Eventos recentes</h3>
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
                  <tr><td colSpan={3}>Sem eventos.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <h3>Monitor Shipday</h3>
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
                  <tr><td colSpan={3}>Sem entregas monitorizadas.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}

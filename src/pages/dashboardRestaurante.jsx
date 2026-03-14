import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "../css/pages/dashboard.css";
import {
  fetchRestaurantDashboard,
  resolveRestaurantStoreId,
  updateOrderWorkflowStatus,
} from "../services/opsDashboardService";
import { extractRestaurantId, isAdmin } from "../utils/roles";
import { supabase } from "../services/supabaseClient";
import TrendBars from "../components/dashboard/TrendBars";
import LiveOperationsBoard from "../components/dashboard/LiveOperationsBoard";
import {
  getEstadoInternoLabelPt,
  getEstadoInternoTagClass,
  getRestaurantActionsForEstado,
  mapLegacyStatusToEstadoInterno,
  resolveOrderEstadoInterno,
} from "../services/orderStatusMapper";

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

export default function DashboardRestaurante() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const userRaw = localStorage.getItem("pedeja_user");
  const user = useMemo(() => (userRaw ? JSON.parse(userRaw) : null), [userRaw]);
  const admin = isAdmin(user);

  const queryLojaId = searchParams.get("loja") || "";
  const fromAdmin = searchParams.get("from") === "admin";

  const [fixedStoreId, setFixedStoreId] = useState(extractRestaurantId(user) || "");
  const [lojaId, setLojaId] = useState(queryLojaId || extractRestaurantId(user) || "");
  const [periodDays, setPeriodDays] = useState(7);
  const [updatingOrderId, setUpdatingOrderId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [adminStores, setAdminStores] = useState([]);
  const [adminStoreSearch, setAdminStoreSearch] = useState("");
  const [state, setState] = useState({
    orders: [],
    deliveries: [],
    metrics: {
      totalOrders: 0,
      totalRevenue: 0,
      activeDeliveries: 0,
      deliveredRate: 0,
      cancelRate: 0,
      avgTicket: 0,
    },
    series: { byDay: [], byHour: [] },
    slaAlerts: [],
    liveOrders: [],
    loading: true,
    error: "",
  });

  useEffect(() => {
    let active = true;

    const bootstrapStore = async () => {
      const localStore = extractRestaurantId(user);
      if (localStore) {
        if (active) {
          setFixedStoreId(String(localStore));
          if (!admin) setLojaId(String(localStore));
        }
        return;
      }

      const resolvedStore = await resolveRestaurantStoreId(user);
      if (active && resolvedStore) {
        setFixedStoreId(String(resolvedStore));
        if (!admin) setLojaId(String(resolvedStore));
      }
    };

    bootstrapStore();

    return () => {
      active = false;
    };
  }, [admin, userRaw]);

  useEffect(() => {
    if (admin && queryLojaId) {
      setLojaId(String(queryLojaId));
    }
  }, [admin, queryLojaId]);

  useEffect(() => {
    let active = true;

    const loadAdminStores = async () => {
      if (!admin) {
        if (active) setAdminStores([]);
        return;
      }

      const { data, error } = await supabase
        .from("lojas")
        .select("idloja, nome")
        .order("idloja", { ascending: true });

      if (!active || error) {
        if (active) setAdminStores([]);
        return;
      }

      const stores = data || [];
      setAdminStores(stores);

      setLojaId((prev) => {
        if (queryLojaId && stores.some((store) => String(store.idloja) === String(queryLojaId))) {
          return String(queryLojaId);
        }

        if (prev && stores.some((store) => String(store.idloja) === String(prev))) {
          return String(prev);
        }

        return stores.length > 0 ? String(stores[0].idloja) : "";
      });
    };

    loadAdminStores();

    return () => {
      active = false;
    };
  }, [admin, queryLojaId]);

  const filteredAdminStores = useMemo(() => {
    const search = normalizeSearch(adminStoreSearch);
    if (!search) return adminStores;
    return (adminStores || []).filter((store) => normalizeSearch(store.nome).includes(search));
  }, [adminStoreSearch, adminStores]);


  useEffect(() => {
    if (!admin) return;
    if (!filteredAdminStores.length) {
      if (lojaId) setLojaId("");
      return;
    }

    const existsInFiltered = filteredAdminStores.some(
      (store) => String(store.idloja) === String(lojaId),
    );

    if (!lojaId || !existsInFiltered) {
      setLojaId(String(filteredAdminStores[0].idloja));
    }
  }, [admin, filteredAdminStores, lojaId]);
  const scopedStoreId = admin ? lojaId : fixedStoreId;

  useEffect(() => {
    let active = true;

    const loadStoreName = async () => {
      if (!scopedStoreId) {
        if (active) setStoreName("");
        return;
      }

      const { data, error } = await supabase
        .from("lojas")
        .select("idloja, nome")
        .eq("idloja", Number(scopedStoreId))
        .maybeSingle();

      if (!active) return;
      if (error) {
        setStoreName("");
        return;
      }

      setStoreName(data?.nome || "");
    };

    loadStoreName();

    return () => {
      active = false;
    };
  }, [scopedStoreId]);

  const load = async () => {
    if (!scopedStoreId) {
      setState((prev) => ({ ...prev, error: "Conta restaurante sem loja associada.", loading: false }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));
    const data = await fetchRestaurantDashboard({ lojaId: scopedStoreId, periodDays });
    setState({ ...data, loading: false, error: data.error || "" });
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [scopedStoreId, periodDays]);

  const openOrders = useMemo(
    () => state.orders.filter((order) => !["entregue", "cancelado"].includes(resolveOrderEstadoInterno(order))).length,
    [state.orders],
  );

  const latestDeliveryByOrderId = useMemo(() => {
    const map = new Map();
    (state.deliveries || []).forEach((delivery) => {
      const key = String(delivery.order_id || "");
      if (!key || map.has(key)) return;
      map.set(key, delivery);
    });
    return map;
  }, [state.deliveries]);

  const handleLogout = () => {
    localStorage.removeItem("pedeja_user");
    localStorage.removeItem("pedeja_cart");
    navigate("/", { replace: true });
  };

  const goToWebsite = () => {
    navigate("/");
  };

  const goToAdmin = () => {
    navigate(`/dashboard/admin${scopedStoreId ? `?loja=${scopedStoreId}` : ""}`);
  };

  const handleOrderAction = async (order, toEstado) => {
    setUpdatingOrderId(order.id);
    try {
      const result = await updateOrderWorkflowStatus(order.id, toEstado, scopedStoreId, { syncShipday: true });

      if (result?.shipdaySync && !result.shipdaySync.ok && !result.shipdaySync.skipped) {
        alert(`Pedido atualizado no PedeJa, mas falhou sync Shipday: ${result.shipdaySync.error || "erro desconhecido"}`);
      }

      await load();
    } catch (error) {
      alert(`Falha a atualizar estado: ${error.message}`);
    } finally {
      setUpdatingOrderId("");
    }
  };

  return (
    <div className="dashboard-shell enterprise">
      <header className="dashboard-header">
        <div>
          <p className="kicker">Store Operations</p>
          <h1 className="dashboard-title">Dashboard {storeName || "Restaurante"}</h1>
          <p className="dashboard-subtitle">Cozinha, expedicao e entrega</p>
          <p className="muted" style={{ marginBottom: 0 }}>
            Loja atual: {storeName || "sem associacao"}
          </p>
        </div>
        <div className="dashboard-actions">
          <select value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))}>
            <option value={7}>Ultimos 7 dias</option>
            <option value={30}>Ultimos 30 dias</option>
            <option value={90}>Ultimos 90 dias</option>
          </select>
          <button className="btn-dashboard" onClick={load}>Atualizar</button>
          {(admin || fromAdmin) && (
            <button className="btn-dashboard secondary" onClick={goToAdmin}>
              Voltar ao admin
            </button>
          )}
          <button className="btn-dashboard" onClick={() => navigate(`/menu-manager${scopedStoreId ? `?loja=${scopedStoreId}` : ""}`)}>
            Gerir menu
          </button>
          <button className="btn-dashboard" onClick={goToWebsite}>Inicio</button>
          <button className="btn-dashboard secondary" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {admin && (
        <section className="panel store-access-panel" style={{ marginBottom: "14px" }}>
          <div className="store-access-header">
            <h3>Loja (modo admin)</h3>
            <p className="muted">Seleciona pelo nome do restaurante (ordenado por ID da loja)</p>
          </div>

          <div className="store-access-grid">
            <label>
              <span className="muted">Pesquisar restaurante</span>
              <input
                type="text"
                placeholder="Ex: Ao Barrote"
                value={adminStoreSearch}
                onChange={(e) => setAdminStoreSearch(e.target.value)}
              />
            </label>

            <label>
              <span className="muted">Restaurante</span>
              <select
                value={lojaId}
                onChange={(e) => setLojaId(e.target.value)}
                disabled={adminStores.length === 0}
              >
                {filteredAdminStores.length === 0 ? (
                  <option value="">Sem resultados</option>
                ) : (
                  filteredAdminStores.map((store) => (
                    <option key={store.idloja} value={String(store.idloja)}>
                      {store.nome}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>
        </section>
      )}

      <section className="dashboard-grid premium-grid">
        <article className="metric-card premium"><div className="metric-label">Pedidos</div><div className="metric-value">{state.metrics.totalOrders}</div></article>
        <article className="metric-card premium"><div className="metric-label">Em aberto</div><div className="metric-value">{openOrders}</div></article>
        <article className="metric-card premium"><div className="metric-label">Receita</div><div className="metric-value">{state.metrics.totalRevenue.toFixed(2)}EUR</div></article>
        <article className="metric-card premium"><div className="metric-label">Ticket medio</div><div className="metric-value">{state.metrics.avgTicket.toFixed(2)}EUR</div></article>
        <article className="metric-card premium"><div className="metric-label">Concluido</div><div className="metric-value">{state.metrics.deliveredRate.toFixed(1)}%</div></article>
        <article className="metric-card premium"><div className="metric-label">Cancelamento</div><div className="metric-value">{state.metrics.cancelRate.toFixed(1)}%</div></article>
      </section>

      {state.error && <p style={{ color: "#b91c1c", fontWeight: 700 }}>{state.error}</p>}

      <section className="panel-grid admin-top-grid">
        <LiveOperationsBoard orders={state.liveOrders} />
        <article className="panel sla-panel">
          <h3>Alertas SLA da loja</h3>
          <div className="table-wrap">
            <table className="ops-table compact">
              <thead><tr><th>Pedido</th><th>Estado</th><th>Tempo</th><th>Limite</th></tr></thead>
              <tbody>
                {state.slaAlerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>{String(alert.id).slice(0, 8)}</td>
                    <td><span className={getEstadoInternoTagClass(alert.status)}>{getEstadoInternoLabelPt(alert.status)}</span></td>
                    <td>{alert.elapsedMinutes} min</td>
                    <td>{alert.threshold} min</td>
                  </tr>
                ))}
                {!state.loading && state.slaAlerts.length === 0 && <tr><td colSpan={4}>Sem alertas.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="panel-grid analytics-grid">
        <TrendBars title="Receita por dia" data={state.series.byDay.map((i) => ({ label: i.day, value: i.revenue }))} valueKey="value" labelKey="label" suffix=" EUR" />
        <TrendBars title="Pedidos por hora" data={state.series.byHour.map((i) => ({ label: `${String(i.hour).padStart(2, "0")}h`, value: i.orders }))} valueKey="value" labelKey="label" />
      </section>

      <section className="panel-grid">
        <article className="panel">
          <h3>Fila de pedidos</h3>
          <div className="table-wrap">
            <table className="ops-table">
              <thead><tr><th>Pedido</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Estafeta</th><th>Tracking</th><th>Acoes</th></tr></thead>
              <tbody>
                {state.orders.map((order) => {
                  const estadoInterno = resolveOrderEstadoInterno(order);
                  const actions = getRestaurantActionsForEstado(estadoInterno);
                  const latestDelivery = latestDeliveryByOrderId.get(String(order.id));
                  const trackingUrl = order.shipday_tracking_url || latestDelivery?.tracking_url || null;
                  const driverText = order.driver_name
                    ? `${order.driver_name}${order.driver_phone ? ` (${order.driver_phone})` : ""}`
                    : (order.driver_phone || "-");

                  return (
                    <tr key={order.id}>
                      <td>{String(order.id).slice(0, 8)}</td>
                      <td>{order.customer_nome || "-"}</td>
                      <td>{Number(order.total || 0).toFixed(2)}EUR</td>
                      <td><span className={getEstadoInternoTagClass(estadoInterno)}>{getEstadoInternoLabelPt(estadoInterno)}</span></td>
                      <td>{driverText}</td>
                      <td>{trackingUrl ? <a href={trackingUrl} target="_blank" rel="noreferrer">Abrir</a> : "-"}</td>
                      <td>
                        {actions.length > 0 ? (
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            {actions.map((action) => (
                              <button
                                key={`${order.id}-${action.action}`}
                                className={`btn-dashboard small${action.variant === "secondary" ? " secondary" : ""}`}
                                disabled={updatingOrderId === order.id}
                                onClick={() => handleOrderAction(order, action.toEstado)}
                              >
                                {updatingOrderId === order.id ? "..." : action.label}
                              </button>
                            ))}
                          </div>
                        ) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <h3>Entregas da loja</h3>
          <div className="table-wrap">
            <table className="ops-table">
              <thead><tr><th>Entrega</th><th>Estado</th><th>Erro</th><th>Tracking</th></tr></thead>
              <tbody>
                {state.deliveries.map((delivery) => {
                  const rawDeliveryStatus = String(delivery.status || "").toUpperCase();
                  const deliveryEstado = mapLegacyStatusToEstadoInterno(rawDeliveryStatus);
                  const deliveryLabel = deliveryEstado ? getEstadoInternoLabelPt(deliveryEstado) : (rawDeliveryStatus || "-");
                  const deliveryTagClass = deliveryEstado ? getEstadoInternoTagClass(deliveryEstado) : "tag warn";

                  return (
                    <tr key={delivery.id}>
                      <td>{String(delivery.id).slice(0, 8)}</td>
                      <td><span className={deliveryTagClass}>{deliveryLabel}</span></td>
                      <td>
                        {rawDeliveryStatus === "FAILED"
                          ? (delivery.shipday_error
                            || delivery.provider_payload?.message
                            || delivery.provider_payload?.error
                            || "Erro na integracao Shipday")
                          : "-"}
                      </td>
                      <td>{delivery.tracking_url ? <a href={delivery.tracking_url} target="_blank" rel="noreferrer">Abrir</a> : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}


















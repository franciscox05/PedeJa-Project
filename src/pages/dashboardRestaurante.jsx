import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "../css/pages/dashboard.css";
import {
  fetchStoreCommissionCatalog,
  fetchStoresWithAdminSettings,
  fetchRestaurantDashboard,
  resolveRestaurantStoreId,
  updateRestaurantAdminSettings,
  updateOrderWorkflowStatus,
} from "../services/opsDashboardService";
import { extractRestaurantId, isAdmin } from "../utils/roles";
import { supabase } from "../services/supabaseClient";
import TrendBars from "../components/dashboard/TrendBars";
import LiveOperationsBoard from "../components/dashboard/LiveOperationsBoard";
import DashboardSidebarLayout from "../components/dashboard/DashboardSidebarLayout";
import RestaurantManagementPanel from "../components/dashboard/RestaurantManagementPanel";
import ShipdayTrackingModal from "../components/dashboard/ShipdayTrackingModal";
import OrderDetailsModal from "../components/dashboard/OrderDetailsModal";
import { fetchOrderDetails } from "../services/orderDetailsService";
import {
  getEstadoInternoLabelPt,
  getEstadoInternoTagClass,
  getRestaurantActionsForEstado,
  resolveOrderEstadoInterno,
} from "../services/orderStatusMapper";

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function getToneTagClass(tone) {
  if (tone === "success") return "tag ok";
  if (tone === "danger") return "tag bad";
  return "tag warn";
}

function getDeliveryStatusView(status) {
  const normalized = String(status || "").trim().toUpperCase();
  const labelMap = {
    CREATED: "Criada",
    PENDING: "Pendente",
    CONFIRMED: "Confirmada",
    ASSIGNED: "Atribuida",
    DISPATCHED: "Enviado",
    OUT_FOR_DELIVERY: "Em entrega",
    DELIVERED: "Entregue",
    FAILED: "Falhada",
    CANCELLED: "Cancelada",
  };
  const toneMap = {
    DELIVERED: "success",
    FAILED: "danger",
    CANCELLED: "danger",
  };

  return {
    label: labelMap[normalized] || normalized || "-",
    className: getToneTagClass(toneMap[normalized] || "warning"),
  };
}

function handleRowKeyDown(event, action) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

const RESTAURANT_DASHBOARD_TABS = [
  { id: "dashboard", label: "Dashboard", description: "Fila de pedidos e entregas da loja", icon: "dashboard" },
  { id: "restaurants", label: "Gestao de Restaurantes", description: "Configuracao operacional da loja", icon: "restaurants" },
  { id: "promotions", label: "Promocoes", description: "Campanhas e futuras ativacoes", icon: "promotions" },
];

export default function DashboardRestaurante() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const userRaw = localStorage.getItem("pedeja_user");
  const user = useMemo(() => (userRaw ? JSON.parse(userRaw) : null), [userRaw]);
  const admin = isAdmin(user);

  const queryLojaId = searchParams.get("loja") || "";
  const fromAdmin = searchParams.get("from") === "admin";

  const [activeTab, setActiveTab] = useState("dashboard");
  const [fixedStoreId, setFixedStoreId] = useState(extractRestaurantId(user) || "");
  const [lojaId, setLojaId] = useState(queryLojaId || extractRestaurantId(user) || "");
  const [periodDays, setPeriodDays] = useState(7);
  const [updatingOrderId, setUpdatingOrderId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [adminStores, setAdminStores] = useState([]);
  const [adminStoreSearch, setAdminStoreSearch] = useState("");
  const [trackingModal, setTrackingModal] = useState({ open: false, url: "", title: "Tracking Shipday" });
  const [orderDetailModal, setOrderDetailModal] = useState({ open: false, loading: false, error: "", data: null });
  const [commissionCatalogByStore, setCommissionCatalogByStore] = useState({});
  const [catalogLoadingByStore, setCatalogLoadingByStore] = useState({});
  const [catalogErrorByStore, setCatalogErrorByStore] = useState({});
  const [storeSettingsRows, setStoreSettingsRows] = useState([]);
  const [storeSettingsLoading, setStoreSettingsLoading] = useState(false);
  const [storeSettingsError, setStoreSettingsError] = useState("");
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
  }, [admin, user, userRaw]);

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

      try {
        const stores = await fetchStoresWithAdminSettings();
        if (!active) return;
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
      } catch (error) {
        if (!active) return;
        setAdminStores([]);
        setStoreSettingsError(error?.message || "Nao foi possivel carregar as lojas.");
      }
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

    const loadStoreSettings = async () => {
      if (!scopedStoreId) {
        if (active) {
          setStoreSettingsRows([]);
          setStoreSettingsError("");
          setStoreSettingsLoading(false);
        }
        return;
      }

      setStoreSettingsLoading(true);
      setStoreSettingsError("");

      try {
        if (admin) {
          const scoped = (adminStores || []).filter(
            (store) => String(store.idloja) === String(scopedStoreId),
          );

          if (!active) return;
          setStoreSettingsRows(scoped);
          setStoreSettingsLoading(false);

          if (scoped[0]?.nome) {
            setStoreName(scoped[0].nome);
          }
          return;
        }

        const rows = await fetchStoresWithAdminSettings({ lojaId: scopedStoreId });
        if (!active) return;
        setStoreSettingsRows(rows);
        if (rows[0]?.nome) {
          setStoreName(rows[0].nome);
        }
      } catch (error) {
        if (!active) return;
        setStoreSettingsRows([]);
        setStoreSettingsError(error?.message || "Nao foi possivel carregar as definicoes da loja.");
      } finally {
        if (active) setStoreSettingsLoading(false);
      }
    };

    loadStoreSettings();

    return () => {
      active = false;
    };
  }, [admin, adminStores, scopedStoreId]);

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

  useEffect(() => {
    let active = true;

    const loadCommissionCatalog = async () => {
      if (activeTab !== "restaurants" || !scopedStoreId) return;

      setCatalogLoadingByStore((prev) => ({ ...prev, [String(scopedStoreId)]: true }));
      setCatalogErrorByStore((prev) => ({ ...prev, [String(scopedStoreId)]: "" }));

      try {
        const catalog = await fetchStoreCommissionCatalog(scopedStoreId);
        if (!active) return;
        setCommissionCatalogByStore((prev) => ({ ...prev, [String(scopedStoreId)]: catalog }));
      } catch (error) {
        if (!active) return;
        setCatalogErrorByStore((prev) => ({
          ...prev,
          [String(scopedStoreId)]: error?.message || "Nao foi possivel carregar o catalogo da loja.",
        }));
      } finally {
        if (active) {
          setCatalogLoadingByStore((prev) => ({ ...prev, [String(scopedStoreId)]: false }));
        }
      }
    };

    loadCommissionCatalog();

    return () => {
      active = false;
    };
  }, [activeTab, scopedStoreId]);

  const load = useCallback(async () => {
    if (!scopedStoreId) {
      setState((prev) => ({ ...prev, error: "Conta restaurante sem loja associada.", loading: false }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));
    const data = await fetchRestaurantDashboard({ lojaId: scopedStoreId, periodDays });
    setState({ ...data, loading: false, error: data.error || "" });
  }, [periodDays, scopedStoreId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  const latestDeliveryByOrderId = useMemo(() => {
    const map = new Map();
    (state.deliveries || []).forEach((delivery) => {
      const key = String(delivery.order_id || "");
      if (!key || map.has(key)) return;
      map.set(key, delivery);
    });
    return map;
  }, [state.deliveries]);
  const openOrders = useMemo(
    () => state.orders.filter((order) => !["entregue", "cancelado"].includes(resolveOrderEstadoInterno(order))).length,
    [state.orders],
  );
  const dailyRevenue = useMemo(
    () => state.series.byDay.map((item) => ({ label: item.day, value: item.revenue })),
    [state.series.byDay],
  );
  const hourlyDemand = useMemo(
    () => state.series.byHour.map((item) => ({ label: `${String(item.hour).padStart(2, "0")}h`, value: item.orders })),
    [state.series.byHour],
  );

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

  const closeTrackingModal = () => {
    setTrackingModal({ open: false, url: "", title: "Tracking Shipday" });
  };

  const openTrackingModal = ({ url, title }) => {
    if (!url) return;
    setTrackingModal({ open: true, url, title: title || "Tracking Shipday" });
  };

  const closeOrderDetailModal = () => {
    setOrderDetailModal({ open: false, loading: false, error: "", data: null });
  };

  const openOrderDetailModal = async (orderId) => {
    setOrderDetailModal({ open: true, loading: true, error: "", data: null });

    try {
      const data = await fetchOrderDetails(orderId, { user });
      setOrderDetailModal({ open: true, loading: false, error: "", data });
    } catch (error) {
      setOrderDetailModal({
        open: true,
        loading: false,
        error: error?.message || "Nao foi possivel carregar os detalhes do pedido.",
        data: null,
      });
    }
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

  const syncUpdatedStore = (updatedStore) => {
    if (!updatedStore?.idloja) return;

    setAdminStores((prev) => (prev || []).map((store) => (
      String(store.idloja) === String(updatedStore.idloja)
        ? { ...store, ...updatedStore }
        : store
    )));

    setStoreSettingsRows((prev) => {
      if (!prev.length) return [updatedStore];
      return prev.map((store) => (
        String(store.idloja) === String(updatedStore.idloja)
          ? { ...store, ...updatedStore }
          : store
      ));
    });

    if (updatedStore.nome) {
      setStoreName(updatedStore.nome);
    }
  };

  const handleToggleAutoAccept = async (store, nextValue) => {
    if (!admin) {
      throw new Error("Apenas o admin pode alterar a aceitacao automatica.");
    }

    const updatedStore = await updateRestaurantAdminSettings(store.idloja, {
      aceitacao_automatica_pedidos: nextValue,
    });
    syncUpdatedStore(updatedStore);
  };

  const handleSaveCommissionSettings = async (store, payload) => {
    if (!admin) {
      throw new Error("Apenas o admin pode alterar a comissao.");
    }

    const updatedStore = await updateRestaurantAdminSettings(store.idloja, payload);
    syncUpdatedStore(updatedStore);
  };

  return (
    <DashboardSidebarLayout
      kicker="Store Operations"
      title={storeName || "Restaurante"}
      subtitle="Acompanha pedidos, configuracao operacional e futuras campanhas."
      tabs={RESTAURANT_DASHBOARD_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      storageKey="dashboard-restaurant-sidebar-collapsed"
      footer={(
        <div>
          <p className="muted dashboard-sidebar-footer-label">Loja atual</p>
          <strong>{storeName || "Sem associacao"}</strong>
          <p className="muted dashboard-sidebar-footer-meta">
            {scopedStoreId ? `#${scopedStoreId}` : "Sem loja"}
          </p>
        </div>
      )}
    >
      <header className="dashboard-header">
        <div>
          <p className="kicker">Store Operations</p>
          <h1 className="dashboard-title">Dashboard {storeName || "Restaurante"}</h1>
          <p className="dashboard-subtitle">
            {state.metrics.totalOrders} pedidos na janela atual - {state.metrics.totalRevenue.toFixed(2)}EUR faturados
          </p>
        </div>
        <div className="dashboard-actions">
          <select value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))}>
            <option value={7}>Ultimos 7 dias</option>
            <option value={30}>Ultimos 30 dias</option>
            <option value={90}>Ultimos 90 dias</option>
          </select>
          <button className="btn-dashboard" onClick={load}>Atualizar</button>
          {(admin || fromAdmin) ? (
            <button className="btn-dashboard secondary" onClick={goToAdmin}>
              Voltar ao admin
            </button>
          ) : null}
          <button className="btn-dashboard" onClick={() => navigate(`/menu-manager${scopedStoreId ? `?loja=${scopedStoreId}` : ""}`)}>
            Gerir menu
          </button>
          <button className="btn-dashboard" onClick={goToWebsite}>Inicio</button>
          <button className="btn-dashboard secondary" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {admin ? (
        <section className="panel store-access-panel">
          <div className="store-access-header">
            <div>
              <h3>Loja em foco (modo admin)</h3>
              <p className="muted">Seleciona pelo nome do restaurante e gere uma loja de cada vez.</p>
            </div>
          </div>

          <div className="store-access-grid">
            <label>
              <span className="muted">Pesquisar restaurante</span>
              <input
                type="text"
                placeholder="Ex: Ao Barrote"
                value={adminStoreSearch}
                onChange={(event) => setAdminStoreSearch(event.target.value)}
              />
            </label>

            <label>
              <span className="muted">Restaurante</span>
              <select
                value={lojaId}
                onChange={(event) => setLojaId(event.target.value)}
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
      ) : null}

      {state.error ? <p className="shipday-inline-error">{state.error}</p> : null}

      {activeTab === "restaurants" ? (
        <RestaurantManagementPanel
          title="Gestao de Restaurantes"
          subtitle={admin
            ? "Escolhe o modo de comissao e define overrides globais, por categoria ou por prato."
            : "Vista apenas de leitura. O admin gere estas definicoes da loja."}
          stores={storeSettingsRows}
          loading={storeSettingsLoading}
          error={storeSettingsError}
          canEdit={admin}
          emptyText="Sem configuracao de loja disponivel."
          commissionCatalogByStore={commissionCatalogByStore}
          catalogLoadingByStore={catalogLoadingByStore}
          catalogErrorByStore={catalogErrorByStore}
          onToggleAutoAccept={handleToggleAutoAccept}
          onSaveCommissionSettings={handleSaveCommissionSettings}
        />
      ) : null}

      {activeTab === "dashboard" ? (
        <div className="dashboard-stack">
          <section className="dashboard-grid premium-grid">
            <article className="metric-card premium">
              <div className="metric-label">Pedidos</div>
              <div className="metric-value">{state.metrics.totalOrders}</div>
              <div className="metric-foot">Volume total</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-label">Em aberto</div>
              <div className="metric-value">{openOrders}</div>
              <div className="metric-foot">Fila ativa</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-label">Receita</div>
              <div className="metric-value">{state.metrics.totalRevenue.toFixed(2)}EUR</div>
              <div className="metric-foot">Janela atual</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-label">Ticket medio</div>
              <div className="metric-value">{state.metrics.avgTicket.toFixed(2)}EUR</div>
              <div className="metric-foot">Valor por pedido</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-label">Concluido</div>
              <div className="metric-value">{state.metrics.deliveredRate.toFixed(1)}%</div>
              <div className="metric-foot">Pedidos entregues</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-label">Cancelamento</div>
              <div className="metric-value">{state.metrics.cancelRate.toFixed(1)}%</div>
              <div className="metric-foot">Taxa de cancelamento</div>
            </article>
          </section>

          <section className="panel-grid admin-top-grid">
            <LiveOperationsBoard orders={state.liveOrders} />

            <article className="panel sla-panel">
              <h3>Alertas SLA da loja</h3>
              <p className="muted">Pedidos acima do tempo limite esperado.</p>
              <div className="table-wrap">
                <table className="ops-table compact">
                  <thead>
                    <tr>
                      <th>Pedido</th>
                      <th>Estado</th>
                      <th>Tempo</th>
                      <th>Limite</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.slaAlerts.map((alert) => (
                      <tr key={alert.id}>
                        <td>{String(alert.id).slice(0, 8)}</td>
                        <td>
                          <span className={getEstadoInternoTagClass(alert.status)}>
                            {getEstadoInternoLabelPt(alert.status)}
                          </span>
                        </td>
                        <td>{alert.elapsedMinutes} min</td>
                        <td>{alert.threshold} min</td>
                      </tr>
                    ))}
                    {!state.loading && state.slaAlerts.length === 0 ? (
                      <tr><td colSpan={4}>Sem alertas.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          <section className="panel-grid analytics-grid">
            <TrendBars title="Receita por dia" data={dailyRevenue} valueKey="value" labelKey="label" suffix=" EUR" />
            <TrendBars title="Pedidos por hora" data={hourlyDemand} valueKey="value" labelKey="label" />
          </section>

          <article className="panel">
            <div className="panel-header-inline">
              <div>
                <h3>Fila de pedidos</h3>
                <p className="muted">Clica numa linha para ver itens, notas, morada detalhada e contacto do cliente.</p>
              </div>
            </div>

            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Total</th>
                    <th>Estado</th>
                    <th>Estafeta</th>
                    <th>Tracking</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
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
                      <tr
                        key={order.id}
                        className="is-clickable-row"
                        tabIndex={0}
                        onClick={() => openOrderDetailModal(order.id)}
                        onKeyDown={(event) => handleRowKeyDown(event, () => openOrderDetailModal(order.id))}
                      >
                        <td>{String(order.id).slice(0, 8)}</td>
                        <td>{order.customer_nome || "-"}</td>
                        <td>{Number(order.total || 0).toFixed(2)}EUR</td>
                        <td><span className={getEstadoInternoTagClass(estadoInterno)}>{getEstadoInternoLabelPt(estadoInterno)}</span></td>
                        <td>{driverText}</td>
                        <td>
                          {trackingUrl ? (
                            <button
                              type="button"
                              className="dashboard-link-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openTrackingModal({
                                  url: trackingUrl,
                                  title: `Tracking pedido #${order.id}`,
                                });
                              }}
                            >
                              Abrir
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>
                          {actions.length > 0 ? (
                            <div className="table-action-row">
                              {actions.map((action) => (
                                <button
                                  key={`${order.id}-${action.action}`}
                                  className={`btn-dashboard small${action.variant === "secondary" ? " secondary" : ""}`}
                                  disabled={updatingOrderId === order.id}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleOrderAction(order, action.toEstado);
                                  }}
                                >
                                  {updatingOrderId === order.id ? "..." : action.label}
                                </button>
                              ))}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!state.loading && state.orders.length === 0 ? (
                    <tr><td colSpan={7}>Sem pedidos nesta janela.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel">
            <div className="panel-header-inline">
              <div>
                <h3>Entregas Recentes</h3>
                <p className="muted">Estados do Shipday traduzidos para uma leitura mais rapida.</p>
              </div>
            </div>

            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Entrega</th>
                    <th>Pedido</th>
                    <th>Estado</th>
                    <th>Erro</th>
                    <th>Tracking</th>
                  </tr>
                </thead>
                <tbody>
                  {state.deliveries.map((delivery) => {
                    const rawDeliveryStatus = String(delivery.status || "").toUpperCase();
                    const deliveryStatusView = getDeliveryStatusView(rawDeliveryStatus);

                    return (
                      <tr key={delivery.id}>
                        <td>{String(delivery.id).slice(0, 8)}</td>
                        <td>{delivery.order_id || "-"}</td>
                        <td><span className={deliveryStatusView.className}>{deliveryStatusView.label}</span></td>
                        <td>
                          {rawDeliveryStatus === "FAILED"
                            ? (delivery.shipday_error
                              || delivery.provider_payload?.message
                              || delivery.provider_payload?.error
                              || "Erro na integracao Shipday")
                            : "-"}
                        </td>
                        <td>
                          {delivery.tracking_url ? (
                            <button
                              type="button"
                              className="dashboard-link-button"
                              onClick={() => openTrackingModal({
                                url: delivery.tracking_url,
                                title: `Tracking entrega #${delivery.id}`,
                              })}
                            >
                              Abrir
                            </button>
                          ) : "-"}
                        </td>
                      </tr>
                    );
                  })}
                  {!state.loading && state.deliveries.length === 0 ? (
                    <tr><td colSpan={5}>Sem entregas nesta janela.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      ) : null}

      {activeTab === "promotions" ? (
        <section className="panel empty-state-panel">
          <div>
            <p className="kicker">Promocoes</p>
            <h3>Gestao de Campanhas</h3>
            <p className="muted">Container preparado para uma futura area de campanhas do restaurante.</p>
          </div>
          <div>
            <button type="button" className="btn-dashboard secondary" disabled>
              Criar Nova Promocao
            </button>
          </div>
        </section>
      ) : null}

      <ShipdayTrackingModal
        isOpen={trackingModal.open}
        title={trackingModal.title}
        url={trackingModal.url}
        onClose={closeTrackingModal}
      />

      <OrderDetailsModal
        isOpen={orderDetailModal.open}
        loading={orderDetailModal.loading}
        error={orderDetailModal.error}
        data={orderDetailModal.data}
        onClose={closeOrderDetailModal}
      />
    </DashboardSidebarLayout>
  );
}

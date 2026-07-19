import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "../css/pages/dashboard.css";
import DashboardSidebarLayout from "../components/dashboard/DashboardSidebarLayout";
import DashboardPageHeader from "../components/dashboard/DashboardPageHeader";
import DashboardPanel from "../components/dashboard/DashboardPanel";
import DashboardEmptyState from "../components/dashboard/DashboardEmptyState";
import DatePickerCustom from "../components/ui/DatePickerCustom";
import LiveOperationsBoard from "../components/dashboard/LiveOperationsBoard";
import { fetchAdminDashboard } from "../services/opsDashboardService";
import { buildLiveCarrierBoardEntries, retrieveShipdayCarriers } from "../services/shipdayService";
import { getEstadoInternoLabelPt, getEstadoInternoTagClass, resolveOrderEstadoInterno } from "../services/orderStatusMapper";
import { ADMIN_DASHBOARD_TABS, resolveAdminTabRoute } from "../constants/adminDashboardTabs";

function normalizeSearchWindow(searchParams) {
  const mode = String(searchParams.get("mode") || "preset");
  const days = Number(searchParams.get("days") || 7);
  const periodDays = [7, 30, 90].includes(days) ? days : 7;

  return {
    rangeMode: mode === "custom" ? "custom" : "preset",
    periodDays,
    customRange: {
      from: searchParams.get("from") || "",
      to: searchParams.get("to") || "",
    },
  };
}

function buildWindowInput({ rangeMode, periodDays, customRange }) {
  if (rangeMode === "custom") {
    return {
      periodDays,
      dateFrom: customRange?.from || null,
      dateTo: customRange?.to || null,
    };
  }
  return periodDays;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasAssignedDriver(order) {
  return Boolean(String(order?.driver_name || order?.shipday_driver_name || "").trim());
}

export default function DashboardGeoBoard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilters = useMemo(() => normalizeSearchWindow(searchParams), [searchParams]);

  const [periodDays, setPeriodDays] = useState(initialFilters.periodDays);
  const [rangeMode, setRangeMode] = useState(initialFilters.rangeMode);
  const [customRange, setCustomRange] = useState(initialFilters.customRange);
  const [state, setState] = useState({
    loading: true,
    error: "",
    stores: [],
    immediateOrders: [],
    deliveries: [],
    metrics: { totalOrders: 0, activeDeliveries: 0 },
  });
  const [liveCarriers, setLiveCarriers] = useState([]);

  const dashboardInput = useMemo(
    () => buildWindowInput({ rangeMode, periodDays, customRange }),
    [customRange, periodDays, rangeMode],
  );

  const syncUrlFilters = useCallback((next) => {
    const nextDays = [7, 30, 90].includes(Number(next?.periodDays)) ? Number(next.periodDays) : periodDays;
    const nextRangeMode = next?.rangeMode === "custom" ? "custom" : "preset";
    const nextCustomRange = {
      from: next?.customRange?.from ?? customRange.from,
      to: next?.customRange?.to ?? customRange.to,
    };

    const params = new URLSearchParams();
    params.set("days", String(nextDays));
    if (nextRangeMode === "custom") {
      params.set("mode", "custom");
      if (nextCustomRange.from) params.set("from", nextCustomRange.from);
      if (nextCustomRange.to) params.set("to", nextCustomRange.to);
    }
    setSearchParams(params, { replace: true });
  }, [customRange.from, customRange.to, periodDays, setSearchParams]);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const [dashboardData, carriersData] = await Promise.all([
        fetchAdminDashboard(dashboardInput),
        retrieveShipdayCarriers(),
      ]);

      setState({
        loading: false,
        error: dashboardData?.error || "",
        stores: ensureArray(dashboardData?.stores),
        immediateOrders: ensureArray(dashboardData?.immediateOrders),
        deliveries: ensureArray(dashboardData?.deliveries),
        metrics: {
          totalOrders: Number(dashboardData?.metrics?.totalOrders || 0),
          activeDeliveries: Number(dashboardData?.metrics?.activeDeliveries || 0),
        },
      });
      setLiveCarriers(ensureArray(carriersData));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Nao foi possivel carregar o painel completo de geolocalizacao.",
      }));
    }
  }, [dashboardInput]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [load]);

  const storeNameById = useMemo(
    () => new Map((state.stores || []).map((store) => [String(store?.idloja || ""), store?.nome || `Loja ${store?.idloja || "-"}`])),
    [state.stores],
  );

  const liveCarrierEntries = useMemo(
    () => buildLiveCarrierBoardEntries({
      carriers: liveCarriers || [],
      orders: state.immediateOrders || [],
      stores: state.stores || [],
      deliveries: state.deliveries || [],
      mode: "admin",
    }),
    [liveCarriers, state.deliveries, state.immediateOrders, state.stores],
  );

  const activeOrders = useMemo(
    () => ensureArray(state.immediateOrders).filter((order) => !["entregue", "cancelado"].includes(resolveOrderEstadoInterno(order))),
    [state.immediateOrders],
  );

  const activeDeliveringCarriers = useMemo(
    () => ensureArray(liveCarrierEntries).filter((carrier) => ["delivery", "pickup"].includes(String(carrier?.status || "").toLowerCase())),
    [liveCarrierEntries],
  );

  return (
    <DashboardSidebarLayout
      tabs={ADMIN_DASHBOARD_TABS}
      activeTab="dashboard"
      onTabChange={(tabId) => navigate(resolveAdminTabRoute(tabId))}
      kicker="Live Geo"
      title="Geo Board Expandido"
      subtitle="Vista dedicada para monitorizacao operacional de pedidos, lojas e estafetas."
      storageKey="dashboard-admin-sidebar-collapsed"
      footer={(
        <div>
          <p className="muted dashboard-sidebar-footer-label">Geo Board</p>
          <strong>{activeOrders.length} pedidos ativos</strong>
          <p className="muted dashboard-sidebar-footer-meta">{activeDeliveringCarriers.length} estafetas operacionais</p>
        </div>
      )}
    >
      <DashboardPageHeader
        kicker="Live Geo Board"
        title="Painel Completo de Operacao"
        subtitle="Controlo central de pedidos ativos, estafetas online e contexto de loja em tempo real."
        actions={(
          <>
          <select
            value={rangeMode === "custom" ? "custom" : String(periodDays)}
            onChange={(event) => {
              if (event.target.value === "custom") {
                setRangeMode("custom");
                syncUrlFilters({ rangeMode: "custom", periodDays, customRange });
                return;
              }
              const nextDays = Number(event.target.value);
              setRangeMode("preset");
              setPeriodDays(nextDays);
              syncUrlFilters({ rangeMode: "preset", periodDays: nextDays, customRange: { from: "", to: "" } });
            }}
          >
            <option value={7}>Ultimos 7 dias</option>
            <option value={30}>Ultimos 30 dias</option>
            <option value={90}>Ultimos 90 dias</option>
            <option value="custom">Intervalo personalizado</option>
          </select>

          {rangeMode === "custom" ? (
            <div className="dashboard-range-fields">
              <label className="dashboard-range-field">
                <span className="muted">De</span>
                <DatePickerCustom
                  mode="datetime"
                  placeholder="Selecionar inicio"
                  value={customRange.from}
                  onChange={(value) => {
                    const next = { ...customRange, from: value };
                    setCustomRange(next);
                    syncUrlFilters({ rangeMode: "custom", periodDays, customRange: next });
                  }}
                />
              </label>
              <label className="dashboard-range-field">
                <span className="muted">Ate</span>
                <DatePickerCustom
                  mode="datetime"
                  placeholder="Selecionar fim"
                  value={customRange.to}
                  min={customRange.from || null}
                  onChange={(value) => {
                    const next = { ...customRange, to: value };
                    setCustomRange(next);
                    syncUrlFilters({ rangeMode: "custom", periodDays, customRange: next });
                  }}
                />
              </label>
            </div>
          ) : null}

          <button className="btn-dashboard" onClick={load}>Atualizar</button>
          <button className="btn-dashboard secondary" onClick={() => navigate("/dashboard/admin")}>Voltar ao dashboard</button>
          </>
        )}
      />

      {state.error ? <p className="shipday-inline-error">{state.error}</p> : null}

      <section className="dashboard-grid premium-grid">
        <article className="metric-card premium">
          <div className="metric-label">Pedidos ativos</div>
          <div className="metric-value">{activeOrders.length}</div>
          <div className="metric-foot">Em fila operacional</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Estafetas no mapa</div>
          <div className="metric-value">{liveCarrierEntries.length}</div>
          <div className="metric-foot">Com coordenadas validas</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Em recolha/entrega</div>
          <div className="metric-value">{activeDeliveringCarriers.length}</div>
          <div className="metric-foot">Rotas em curso</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Pedidos janela</div>
          <div className="metric-value">{state.metrics.totalOrders}</div>
          <div className="metric-foot">Selecionados pelo periodo</div>
        </article>
      </section>

      <div className="dashboard-stack">
        <LiveOperationsBoard
          mode="admin"
          orders={state.immediateOrders}
          carriers={liveCarrierEntries}
          stores={state.stores}
        />

        <section className="panel-grid analytics-grid">
          <DashboardPanel title="Estafetas online">
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Estafeta</th>
                    <th>Estado</th>
                    <th>Pedido</th>
                    <th>Loja</th>
                    <th>Fonte</th>
                  </tr>
                </thead>
                <tbody>
                  {liveCarrierEntries.map((carrier) => (
                    <tr key={`carrier-row-${carrier.id}`}>
                      <td>{carrier?.name || `Estafeta ${carrier?.id || "-"}`}</td>
                      <td>{String(carrier?.status || "").toLowerCase() || "-"}</td>
                      <td>{carrier?.orderId ? `#${carrier.orderId}` : "-"}</td>
                      <td>{carrier?.lojaNome || storeNameById.get(String(carrier?.lojaId || "")) || "-"}</td>
                      <td>{carrier?.coordsSource || "-"}</td>
                    </tr>
                  ))}
                  {!state.loading && liveCarrierEntries.length === 0 ? (
                    <DashboardEmptyState as="tableRow" colSpan={5} label="Sem estafetas com coordenadas validas para mostrar." />
                  ) : null}
                </tbody>
              </table>
            </div>
          </DashboardPanel>

          <DashboardPanel title="Pedidos ativos no mapa">
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Loja</th>
                    <th>Cliente</th>
                    <th>Estado</th>
                    <th>Estafeta</th>
                  </tr>
                </thead>
                <tbody>
                  {activeOrders.map((order) => {
                    const estado = resolveOrderEstadoInterno(order);
                    return (
                      <tr key={`active-order-${order.id}`}>
                        <td>{String(order.id).slice(0, 8)}</td>
                        <td>{storeNameById.get(String(order?.loja_id || "")) || `Loja ${order?.loja_id || "-"}`}</td>
                        <td>{order?.customer_nome || "-"}</td>
                        <td><span className={getEstadoInternoTagClass(estado)}>{getEstadoInternoLabelPt(estado)}</span></td>
                        <td>{hasAssignedDriver(order) ? (order?.driver_name || order?.shipday_driver_name || "-") : "-"}</td>
                      </tr>
                    );
                  })}
                  {!state.loading && activeOrders.length === 0 ? (
                    <DashboardEmptyState as="tableRow" colSpan={5} label="Sem pedidos ativos para mostrar." />
                  ) : null}
                </tbody>
              </table>
            </div>
          </DashboardPanel>
        </section>
      </div>
    </DashboardSidebarLayout>
  );
}

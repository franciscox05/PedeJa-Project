import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "../css/pages/dashboard.css";
import {
  fetchAdminDashboard,
  updateRestaurantSignupRequest,
} from "../services/opsDashboardService";
import TrendBars from "../components/dashboard/TrendBars";
import LiveOperationsBoard from "../components/dashboard/LiveOperationsBoard";
import AdminRestaurantAssociation from "../components/admin/AdminRestaurantAssociation";
import { extractUserId } from "../utils/roles";
import { formatScheduleLabel } from "../utils/storeHours";
import {
  getEstadoInternoLabelPt,
  getEstadoInternoTagClass,
  mapLegacyStatusToEstadoInterno,
  resolveOrderEstadoInterno,
} from "../services/orderStatusMapper";
import { assignOrderToShipdayCarrier, retrieveShipdayCarriers, updateShipdayOrderStatus } from "../services/shipdayService";
import { supabase } from "../services/supabaseClient";

function safeImage(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text) || text.startsWith("data:") || text.startsWith("blob:")) return text;
  if (text.startsWith("/")) return text;
  return text;
}

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function getDeliveryStatusView(status) {
  const mapped = mapLegacyStatusToEstadoInterno(status);
  if (mapped) {
    return { label: getEstadoInternoLabelPt(mapped), className: getEstadoInternoTagClass(mapped) };
  }

  const fallback = String(status || "-").toUpperCase();
  return { label: fallback || "-", className: "tag warn" };
}

export default function DashboardAdmin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userRaw = localStorage.getItem("pedeja_user");
  const user = userRaw ? JSON.parse(userRaw) : null;
  const queryStoreId = searchParams.get("loja") || "";

  const [periodDays, setPeriodDays] = useState(7);
  const [reviewingId, setReviewingId] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState(queryStoreId);
  const [storeSearch, setStoreSearch] = useState("");
  const [expandedRequestId, setExpandedRequestId] = useState("");
  const [state, setState] = useState({
    orders: [],
    deliveries: [],
    stores: [],
    storeTypes: [],
    requests: [],
    metrics: {
      totalOrders: 0,
      totalRevenue: 0,
      activeDeliveries: 0,
      deliveredRate: 0,
      cancelRate: 0,
      avgTicket: 0,
    },
    series: { byDay: [], byHour: [] },
    storePerformance: [],
    slaAlerts: [],
    liveOrders: [],
    loading: true,
    error: "",
  });

  const [carrierModal, setCarrierModal] = useState({
    open: false,
    order: null,
    carriers: [],
    loading: false,
    assigningCarrierId: "",
    error: "",
    success: "",
  });

  const storeTypeMap = useMemo(
    () => new Map((state.storeTypes || []).map((item) => [String(item.idtipoloja), item.descricao || item.tipoloja])),
    [state.storeTypes],
  );


  const storesOrderedById = useMemo(() => {
    return [...(state.stores || [])].sort((a, b) => Number(a.idloja || 0) - Number(b.idloja || 0));
  }, [state.stores]);

  const filteredStoresForPicker = useMemo(() => {
    const search = normalizeSearch(storeSearch);
    if (!search) return storesOrderedById;

    return storesOrderedById.filter((store) => normalizeSearch(store.nome).includes(search));
  }, [storeSearch, storesOrderedById]);

  const selectedStore = useMemo(
    () => storesOrderedById.find((store) => String(store.idloja) === String(selectedStoreId)) || null,
    [selectedStoreId, storesOrderedById],
  );

  useEffect(() => {
    if (!filteredStoresForPicker.length) {
      if (selectedStoreId) setSelectedStoreId("");
      return;
    }

    const existsInFiltered = filteredStoresForPicker.some(
      (store) => String(store.idloja) === String(selectedStoreId),
    );

    if (!selectedStoreId || !existsInFiltered) {
      setSelectedStoreId(String(filteredStoresForPicker[0].idloja));
    }
  }, [filteredStoresForPicker, selectedStoreId]);
  const openRestaurantDashboard = (lojaId = selectedStoreId) => {
    if (!lojaId) return;
    navigate(`/dashboard/restaurante?loja=${lojaId}&from=admin`);
  };

  const load = async (days = periodDays) => {
    setState((prev) => ({ ...prev, loading: true }));
    const data = await fetchAdminDashboard(days);
    setState({ ...data, loading: false, error: data.error || "" });

    const stores = [...(data.stores || [])].sort((a, b) => Number(a.idloja || 0) - Number(b.idloja || 0));
    setSelectedStoreId((prev) => {
      if (queryStoreId && stores.some((store) => String(store.idloja) === String(queryStoreId))) {
        return String(queryStoreId);
      }

      if (prev && stores.some((store) => String(store.idloja) === String(prev))) {
        return String(prev);
      }

      return stores.length > 0 ? String(stores[0].idloja) : "";
    });
  };

  useEffect(() => {
    load(periodDays);
    const timer = setInterval(() => load(periodDays), 15000);
    return () => clearInterval(timer);
  }, [periodDays, queryStoreId]);

  const reviewRequest = async (requestId, status) => {
    setReviewingId(requestId);
    try {
      await updateRestaurantSignupRequest(requestId, status, extractUserId(user) || null);
      await load(periodDays);
    } catch (error) {
      alert(`Falha na revisao: ${error.message}`);
    } finally {
      setReviewingId("");
    }
  };

  const closeCarrierModal = () => {
    setCarrierModal({
      open: false,
      order: null,
      carriers: [],
      loading: false,
      assigningCarrierId: "",
      error: "",
      success: "",
    });
  };

  const openCarrierModal = async (order) => {
    setCarrierModal({
      open: true,
      order,
      carriers: [],
      loading: true,
      assigningCarrierId: "",
      error: "",
      success: "",
    });

    try {
      const carriers = await retrieveShipdayCarriers();
      setCarrierModal((prev) => ({
        ...prev,
        carriers,
        loading: false,
        error: carriers.length === 0 ? "Sem estafetas disponiveis no Shipday." : "",
      }));
    } catch (error) {
      setCarrierModal((prev) => ({
        ...prev,
        loading: false,
        carriers: [],
        error: error?.message || "Falha ao carregar estafetas do Shipday.",
      }));
    }
  };

  const assignCarrierToOrder = async (carrier) => {
    const currentOrder = carrierModal.order;
    if (!currentOrder?.id) return;

    setCarrierModal((prev) => ({
      ...prev,
      assigningCarrierId: carrier.id,
      error: "",
      success: "",
    }));

    try {
      await assignOrderToShipdayCarrier({
        order: currentOrder,
        carrier,
      });

      const { error: persistDriverError } = await supabase
        .from("orders")
        .update({
          driver_name: carrier.name || null,
          driver_phone: carrier.phone || null,
          estado_interno: "atribuindo_estafeta",
          status: "ASSIGNED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentOrder.id);

      if (persistDriverError) {
        throw new Error(persistDriverError.message || "Falha ao guardar estafeta na base de dados.");
      }

      setState((prev) => ({
        ...prev,
        orders: (prev.orders || []).map((order) => {
          if (String(order.id) !== String(currentOrder.id)) return order;

          return {
            ...order,
            driver_name: carrier.name || order.driver_name || null,
            driver_phone: carrier.phone || order.driver_phone || null,
            estado_interno: "atribuindo_estafeta",
            status: "ASSIGNED",
          };
        }),
      }));

      setCarrierModal((prev) => ({
        ...prev,
        assigningCarrierId: "",
        success: `Estafeta ${carrier.name || carrier.id} atribuido com sucesso.`,
      }));

      await load(periodDays);
      closeCarrierModal();
    } catch (error) {
      setCarrierModal((prev) => ({
        ...prev,
        assigningCarrierId: "",
        error: error?.message || "Nao foi possivel atribuir estafeta.",
      }));
    }
  };

  const unassignCarrierFromOrder = async (order) => {
    if (!order?.id) return;

    const confirmed = window.confirm(`Desassociar estafeta do pedido #${order.id}?`);
    if (!confirmed) return;

    const shipdayResult = await updateShipdayOrderStatus({
      shipdayOrderId: order?.shipday_order_id,
      newStatus: "desassociar",
      orderId: order?.id,
      lojaId: order?.loja_id ?? null,
    });

    if (!shipdayResult?.ok && !shipdayResult?.skipped) {
      alert(shipdayResult?.error || "Falha ao desassociar estafeta no Shipday.");
      return;
    }

    const basePatch = {
      estado_interno: "aceite",
      status: "CONFIRMED",
      driver_name: null,
      driver_phone: null,
      updated_at: new Date().toISOString(),
    };

    let updateError = null;

    const attemptWithShipdayColumns = await supabase
      .from("orders")
      .update({
        ...basePatch,
        shipday_driver_name: null,
        shipday_driver_phone: null,
      })
      .eq("id", order.id);

    updateError = attemptWithShipdayColumns.error;

    if (updateError && /shipday_driver_name|shipday_driver_phone/i.test(String(updateError.message || ""))) {
      const fallbackAttempt = await supabase
        .from("orders")
        .update(basePatch)
        .eq("id", order.id);
      updateError = fallbackAttempt.error;
    }

    if (updateError) {
      alert(updateError.message || "Falha ao desassociar estafeta.");
      return;
    }

    setState((prev) => ({
      ...prev,
      orders: (prev.orders || []).map((row) => {
        if (String(row.id) !== String(order.id)) return row;
        return {
          ...row,
          estado_interno: "aceite",
          status: "CONFIRMED",
          driver_name: null,
          driver_phone: null,
          shipday_driver_name: null,
          shipday_driver_phone: null,
        };
      }),
    }));

    await load(periodDays);
  };

  const dailyRevenue = useMemo(
    () => state.series.byDay.map((item) => ({ label: item.day, value: item.revenue })),
    [state.series.byDay],
  );

  const hourlyDemand = useMemo(
    () => state.series.byHour.map((item) => ({ label: `${String(item.hour).padStart(2, "0")}h`, value: item.orders })),
    [state.series.byHour],
  );

  return (
    <div className="dashboard-shell enterprise">
      <header className="dashboard-header enterprise-header">
        <div>
          <p className="kicker">PedeJa Control Center</p>
          <h1 className="dashboard-title">Admin Command Dashboard</h1>
          <p className="dashboard-subtitle">Performance, operacao e risco em tempo real</p>
        </div>
        <div className="dashboard-actions">
          <select value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))}>
            <option value={7}>Ultimos 7 dias</option>
            <option value={30}>Ultimos 30 dias</option>
            <option value={90}>Ultimos 90 dias</option>
          </select>

          <button className="btn-dashboard" onClick={() => load(periodDays)}>Atualizar</button>
          <button className="btn-dashboard secondary" onClick={() => navigate("/")}>Website</button>
        </div>
      </header>

      <section className="panel store-access-panel">
        <div className="store-access-header">
          <h3>Aceder dashboard de restaurante</h3>
          <p className="muted">Pesquisa por nome e selecao ordenada por ID da loja</p>
        </div>

        <div className="store-access-grid">
          <label>
            <span className="muted">Pesquisar restaurante</span>
            <input
              type="text"
              placeholder="Ex: Munchies"
              value={storeSearch}
              onChange={(e) => setStoreSearch(e.target.value)}
            />
          </label>

          <label>
            <span className="muted">Restaurante</span>
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              disabled={storesOrderedById.length === 0}
              title="Selecionar restaurante"
            >
              {filteredStoresForPicker.length === 0 ? (
                <option value="">Sem resultados</option>
              ) : (
                filteredStoresForPicker.map((store) => (
                  <option key={store.idloja} value={String(store.idloja)}>
                    {store.nome}
                  </option>
                ))
              )}
            </select>
          </label>

          <div className="store-access-actions">
            <button className="btn-dashboard" disabled={!selectedStoreId} onClick={() => openRestaurantDashboard()}>
              Ver dashboard loja
            </button>
          </div>
        </div>

        {selectedStore ? (
          <p className="muted store-access-meta">Loja selecionada: #{selectedStore.idloja}</p>
        ) : null}
      </section>

      <section className="dashboard-grid premium-grid">
        <article className="metric-card premium">
          <div className="metric-label">Receita</div>
          <div className="metric-value">{state.metrics.totalRevenue.toFixed(2)}EUR</div>
          <div className="metric-foot">Janela atual</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Pedidos</div>
          <div className="metric-value">{state.metrics.totalOrders}</div>
          <div className="metric-foot">Volume total</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Ticket medio</div>
          <div className="metric-value">{state.metrics.avgTicket.toFixed(2)}EUR</div>
          <div className="metric-foot">Valor por pedido</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Entrega concluida</div>
          <div className="metric-value">{state.metrics.deliveredRate.toFixed(1)}%</div>
          <div className="metric-foot">Qualidade operacional</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Cancelamento</div>
          <div className="metric-value">{state.metrics.cancelRate.toFixed(1)}%</div>
          <div className="metric-foot">Risco de churn</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Entregas ativas</div>
          <div className="metric-value">{state.metrics.activeDeliveries}</div>
          <div className="metric-foot">Agora</div>
        </article>
      </section>

      {state.error && <p style={{ color: "#b91c1c", fontWeight: 700 }}>{state.error}</p>}

      <section className="panel-grid admin-top-grid">
        <LiveOperationsBoard orders={state.liveOrders} />

        <article className="panel sla-panel">
          <h3>Alertas SLA</h3>
          <p className="muted">Pedidos acima do tempo limite por estado</p>
          <div className="table-wrap">
            <table className="ops-table compact">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Loja</th>
                  <th>Estado</th>
                  <th>Tempo</th>
                  <th>Limite</th>
                </tr>
              </thead>
              <tbody>
                {state.slaAlerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>{String(alert.id).slice(0, 8)}</td>
                    <td>{alert.loja_id}</td>
                    <td><span className={getEstadoInternoTagClass(alert.status)}>{getEstadoInternoLabelPt(alert.status)}</span></td>
                    <td>{alert.elapsedMinutes} min</td>
                    <td>{alert.threshold} min</td>
                  </tr>
                ))}
                {!state.loading && state.slaAlerts.length === 0 && (
                  <tr><td colSpan={5}>Sem breaches de SLA.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="panel-grid analytics-grid">
        <TrendBars title="Receita por dia" data={dailyRevenue} valueKey="value" labelKey="label" suffix=" EUR" />
        <TrendBars title="Procura por hora" data={hourlyDemand} valueKey="value" labelKey="label" />
      </section>

      <section className="panel-grid analytics-grid">
        <article className="panel">
          <h3>Top lojas (performance)</h3>
          <div className="table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Loja</th>
                  <th>Pedidos</th>
                  <th>Receita</th>
                  <th>Ticket medio</th>
                  <th>Concluido</th>
                  <th>Acesso</th>
                </tr>
              </thead>
              <tbody>
                {state.storePerformance.map((store) => (
                  <tr key={store.lojaId}>
                    <td>{store.lojaNome}</td>
                    <td>{store.orders}</td>
                    <td>{store.revenue.toFixed(2)}EUR</td>
                    <td>{store.avgTicket.toFixed(2)}EUR</td>
                    <td><span className="tag ok">{store.deliveredRate.toFixed(1)}%</span></td>
                    <td>
                      <button className="btn-dashboard small" onClick={() => openRestaurantDashboard(store.lojaId)}>
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
                {!state.loading && state.storePerformance.length === 0 && (
                  <tr><td colSpan={6}>Sem dados de lojas.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <AdminRestaurantAssociation stores={state.stores} onLinked={() => load(periodDays)} />
      </section>

      <section className="panel-grid">
        <article className="panel" style={{ gridColumn: "1 / -1" }}>
          <h3>Aprovacoes de restaurantes</h3>
          <div className="table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Restaurante</th>
                  <th>NIF</th>
                  <th>Horario</th>
                  <th>Acao</th>
                </tr>
              </thead>
              <tbody>
                                                {state.requests.map((request) => {
                  const isExpanded = expandedRequestId === request.id;
                  const backgroundPreview = safeImage(request.imagemfundo);
                  const iconPreview = safeImage(request.icon);

                  return (
                    <Fragment key={request.id}>
                      <tr>
                        <td>{request.nome}</td>
                        <td>{request.email}</td>
                        <td>{request.restaurante_nome}</td>
                        <td>{request.nif || "-"}</td>
                        <td>{request.horario_funcionamento ? formatScheduleLabel(request.horario_funcionamento) : "-"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button
                              className="btn-dashboard small secondary"
                              onClick={() => setExpandedRequestId(isExpanded ? "" : request.id)}
                            >
                              {isExpanded ? "Fechar" : "Ver detalhes"}
                            </button>
                            <button className="btn-dashboard small" disabled={reviewingId === request.id} onClick={() => reviewRequest(request.id, "APPROVED")}>Aprovar</button>
                            <button className="btn-dashboard small secondary" disabled={reviewingId === request.id} onClick={() => reviewRequest(request.id, "REJECTED")}>Rejeitar</button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded ? (
                        <tr key={`${request.id}-details`}>
                          <td colSpan={6}>
                            <div className="request-detail-card">
                              <div className="request-detail-grid">
                                <div><span className="request-detail-label">Estabelecimento</span><p>{request.restaurante_nome || "-"}</p></div>
                                <div><span className="request-detail-label">Candidato</span><p>{request.nome || "-"}</p></div>
                                <div><span className="request-detail-label">Email</span><p>{request.email || "-"}</p></div>
                                <div><span className="request-detail-label">Telemovel</span><p>{request.telefone || "-"}</p></div>
                                <div><span className="request-detail-label">NIF</span><p>{request.nif || "-"}</p></div>
                                <div><span className="request-detail-label">Tipo de loja</span><p>{storeTypeMap.get(String(request.idtipoloja || "")) || "-"}</p></div>
                                <div><span className="request-detail-label">Morada</span><p>{request.morada_completa || "-"}</p></div>
                                <div><span className="request-detail-label">Coordenadas</span><p>{request.latitude ?? "-"}, {request.longitude ?? "-"}</p></div>
                                <div><span className="request-detail-label">Place ID</span><p>{request.place_id || "-"}</p></div>
                                <div><span className="request-detail-label">Horario</span><p>{request.horario_funcionamento ? formatScheduleLabel(request.horario_funcionamento) : "-"}</p></div>
                              </div>

                              <div className="request-detail-images">
                                <div>
                                  <span className="request-detail-label">Imagem de fundo</span>
                                  {backgroundPreview ? <img src={backgroundPreview} alt="Imagem de fundo" className="request-preview-bg" /> : <p>-</p>}
                                </div>
                                <div>
                                  <span className="request-detail-label">Icon</span>
                                  {iconPreview ? <img src={iconPreview} alt="Icon" className="request-preview-icon" /> : <p>-</p>}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
                {!state.loading && state.requests.length === 0 && (
                  <tr><td colSpan={6}>Sem pedidos pendentes.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <h3>Ultimos pedidos</h3>
          <div className="table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Loja</th>
                  <th>Cliente</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Estafeta</th>
                  <th>Tracking</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {state.orders.slice(0, 14).map((order) => {
                  const estadoInterno = resolveOrderEstadoInterno(order);
                  const hasAssignedDriver = Boolean(
                    String(order.driver_name || order.shipday_driver_name || "").trim(),
                  );
                  const canAssign = estadoInterno === "aceite" && !hasAssignedDriver;
                  const canUnassignDriver = hasAssignedDriver && estadoInterno !== "entregue";
                  const hasAnyAction = Boolean(canAssign || canUnassignDriver);
                  const resolvedDriverName = order.driver_name || order.shipday_driver_name || "";
                  const resolvedDriverPhone = order.driver_phone || order.shipday_driver_phone || "";
                  const driverText = resolvedDriverName
                    ? `${resolvedDriverName}${resolvedDriverPhone ? ` (${resolvedDriverPhone})` : ""}`
                    : (resolvedDriverPhone || "-");
                  const trackingUrl = order.shipday_tracking_url || null;

                  return (
                    <tr key={order.id}>
                      <td>{String(order.id).slice(0, 8)}</td>
                      <td>{order.loja_id || "-"}</td>
                      <td>{order.customer_nome || "-"}</td>
                      <td>{Number(order.total || 0).toFixed(2)}EUR</td>
                      <td><span className={getEstadoInternoTagClass(estadoInterno)}>{getEstadoInternoLabelPt(estadoInterno)}</span></td>
                      <td>{driverText}</td>
                      <td>
                        {trackingUrl ? (
                          <a href={trackingUrl} target="_blank" rel="noreferrer">Abrir</a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        {hasAnyAction ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-start" }}>
                            {canUnassignDriver ? (
                              <button className="btn-dashboard small danger" onClick={() => unassignCarrierFromOrder(order)}>
                                ❌ Desassociar Estafeta
                              </button>
                            ) : null}

                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              {canAssign ? (
                                <button className="btn-dashboard small" onClick={() => openCarrierModal(order)}>
                                  Atribuir Estafeta
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <h3>Entregas recentes</h3>
          <div className="table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Estado</th>
                  <th>Erro</th>
                  <th>Tracking</th>
                </tr>
              </thead>
              <tbody>
                {state.deliveries.slice(0, 14).map((delivery) => {
                  const deliveryStatusView = getDeliveryStatusView(delivery.status);
                  const rawDeliveryStatus = String(delivery.status || "").toUpperCase();

                  return (
                    <tr key={delivery.id}>
                      <td>{String(delivery.id).slice(0, 8)}</td>
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
                          <a href={delivery.tracking_url} target="_blank" rel="noreferrer">Abrir</a>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!state.loading && state.deliveries.length === 0 ? (
                  <tr><td colSpan={4}>Sem entregas nesta janela.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {carrierModal.open ? (
        <div className="shipday-modal-backdrop" onClick={closeCarrierModal}>
          <div className="shipday-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="shipday-modal-header">
              <div>
                <h3>Atribuir estafeta</h3>
                <p className="muted">
                  Pedido #{carrierModal.order?.id || "-"} · Shipday ID {carrierModal.order?.shipday_order_id || carrierModal.order?.id || "-"}
                </p>
              </div>
              <button className="btn-dashboard small secondary" onClick={closeCarrierModal}>Fechar</button>
            </div>

            {carrierModal.loading ? <p className="muted">A carregar estafetas...</p> : null}
            {carrierModal.error ? <p className="shipday-inline-error">{carrierModal.error}</p> : null}
            {carrierModal.success ? <p className="shipday-inline-success">{carrierModal.success}</p> : null}

            {!carrierModal.loading && carrierModal.carriers.length > 0 ? (
              <div className="shipday-carrier-list">
                {carrierModal.carriers.map((carrier) => (
                  <article key={carrier.id} className="shipday-carrier-card">
                    <div>
                      <strong>{carrier.name || `Estafeta ${carrier.id}`}</strong>
                      <p className="muted">{carrier.phone || "Sem telemovel"} · {carrier.status || "-"}</p>
                    </div>
                    <button
                      className="btn-dashboard small"
                      disabled={carrierModal.assigningCarrierId === carrier.id}
                      onClick={() => assignCarrierToOrder(carrier)}
                    >
                      {carrierModal.assigningCarrierId === carrier.id ? "A atribuir..." : "Atribuir"}
                    </button>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}


































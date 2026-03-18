import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "../css/pages/dashboard.css";
import {
  fetchAdminDashboard,
  fetchStoreCommissionCatalog,
  updateRestaurantAdminSettings,
  updateRestaurantSignupRequest,
} from "../services/opsDashboardService";
import AdminRestaurantAssociation from "../components/admin/AdminRestaurantAssociation";
import TrendBars from "../components/dashboard/TrendBars";
import LiveOperationsBoard from "../components/dashboard/LiveOperationsBoard";
import DashboardSidebarLayout from "../components/dashboard/DashboardSidebarLayout";
import RestaurantManagementPanel from "../components/dashboard/RestaurantManagementPanel";
import ShipdayTrackingModal from "../components/dashboard/ShipdayTrackingModal";
import OrderDetailsModal from "../components/dashboard/OrderDetailsModal";
import { extractUserId } from "../utils/roles";
import { formatScheduleLabel } from "../utils/storeHours";
import {
  getEstadoInternoLabelPt,
  getEstadoInternoTagClass,
  resolveOrderEstadoInterno,
} from "../services/orderStatusMapper";
import { fetchOrderDetails } from "../services/orderDetailsService";
import { assignOrderToShipdayCarrier, retrieveShipdayCarriers, unassignOrderToShipdayCarrier } from "../services/shipdayService";
import { supabase } from "../services/supabaseClient";

const ASSIGNING_TIMEOUT_MS = 2 * 60 * 1000;

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

function isAssigningTimedOut(order) {
  if (resolveOrderEstadoInterno(order) !== "atribuindo_estafeta") return false;

  const updatedAt = order?.updated_at ? new Date(order.updated_at).getTime() : NaN;
  if (!Number.isFinite(updatedAt)) return false;

  return Date.now() - updatedAt >= ASSIGNING_TIMEOUT_MS;
}

const ADMIN_DASHBOARD_TABS = [
  { id: "dashboard", label: "Dashboard", description: "Ultimos pedidos e entregas recentes", icon: "dashboard" },
  { id: "restaurants", label: "Gestao de Restaurantes", description: "Auto-accept e comissao por loja", icon: "restaurants" },
  { id: "promotions", label: "Promocoes", description: "Campanhas e futuras ativacoes", icon: "promotions" },
];

export default function DashboardAdmin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userRaw = localStorage.getItem("pedeja_user");
  const user = userRaw ? JSON.parse(userRaw) : null;
  const queryStoreId = searchParams.get("loja") || "";
  const queryTab = searchParams.get("tab") || "";
  const initialTab = ADMIN_DASHBOARD_TABS.some((tab) => tab.id === queryTab) ? queryTab : "dashboard";

  const [activeTab, setActiveTab] = useState(initialTab);
  const [periodDays, setPeriodDays] = useState(7);
  const [reviewingId, setReviewingId] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState(queryStoreId);
  const [storeSearch, setStoreSearch] = useState("");
  const [expandedRequestId, setExpandedRequestId] = useState("");
  const [trackingModal, setTrackingModal] = useState({ open: false, url: "", title: "Tracking Shipday" });
  const [orderDetailModal, setOrderDetailModal] = useState({ open: false, loading: false, error: "", data: null });
  const [commissionCatalogByStore, setCommissionCatalogByStore] = useState({});
  const [catalogLoadingByStore, setCatalogLoadingByStore] = useState({});
  const [catalogErrorByStore, setCatalogErrorByStore] = useState({});
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
  const ordersRef = useRef([]);
  const assigningTimeoutRollbackInFlightRef = useRef(new Set());

  const storeTypeMap = useMemo(
    () => new Map((state.storeTypes || []).map((item) => [String(item.idtipoloja), item.descricao || item.tipoloja])),
    [state.storeTypes],
  );
  const storeNameById = useMemo(
    () => new Map((state.stores || []).map((store) => [String(store.idloja), store.nome || `Loja ${store.idloja}`])),
    [state.stores],
  );
  const storesOrderedById = useMemo(
    () => [...(state.stores || [])].sort((a, b) => Number(a.idloja || 0) - Number(b.idloja || 0)),
    [state.stores],
  );
  const filteredStoresForPicker = useMemo(() => {
    const search = normalizeSearch(storeSearch);
    if (!search) return storesOrderedById;
    return storesOrderedById.filter((store) => normalizeSearch(store.nome).includes(search));
  }, [storeSearch, storesOrderedById]);
  const selectedStore = useMemo(
    () => storesOrderedById.find((store) => String(store.idloja) === String(selectedStoreId)) || null,
    [selectedStoreId, storesOrderedById],
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
  const managementStores = useMemo(() => (selectedStore ? [selectedStore] : []), [selectedStore]);
  const dailyRevenue = useMemo(
    () => state.series.byDay.map((item) => ({ label: item.day, value: item.revenue })),
    [state.series.byDay],
  );
  const hourlyDemand = useMemo(
    () => state.series.byHour.map((item) => ({ label: `${String(item.hour).padStart(2, "0")}h`, value: item.orders })),
    [state.series.byHour],
  );

  useEffect(() => {
    ordersRef.current = state.orders || [];
  }, [state.orders]);

  useEffect(() => {
    if (ADMIN_DASHBOARD_TABS.some((tab) => tab.id === queryTab)) {
      setActiveTab(queryTab);
    }
  }, [queryTab]);

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

  useEffect(() => {
    let active = true;

    const loadCommissionCatalog = async () => {
      if (activeTab !== "restaurants" || !selectedStoreId) return;

      setCatalogLoadingByStore((prev) => ({ ...prev, [String(selectedStoreId)]: true }));
      setCatalogErrorByStore((prev) => ({ ...prev, [String(selectedStoreId)]: "" }));

      try {
        const catalog = await fetchStoreCommissionCatalog(selectedStoreId);
        if (!active) return;
        setCommissionCatalogByStore((prev) => ({ ...prev, [String(selectedStoreId)]: catalog }));
      } catch (error) {
        if (!active) return;
        setCatalogErrorByStore((prev) => ({
          ...prev,
          [String(selectedStoreId)]: error?.message || "Nao foi possivel carregar o catalogo da loja.",
        }));
      } finally {
        if (active) {
          setCatalogLoadingByStore((prev) => ({ ...prev, [String(selectedStoreId)]: false }));
        }
      }
    };

    loadCommissionCatalog();

    return () => {
      active = false;
    };
  }, [activeTab, selectedStoreId]);

  const openRestaurantDashboard = (lojaId = selectedStoreId) => {
    if (!lojaId) return;
    navigate(`/dashboard/restaurante?loja=${lojaId}&from=admin`);
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

  const load = useCallback(async (days = periodDays) => {
    setState((prev) => ({ ...prev, loading: true }));
    const data = await fetchAdminDashboard(days);
    setState({
      ...data,
      orders: data.orders || [],
      loading: false,
      error: data.error || "",
    });

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
  }, [periodDays, queryStoreId]);

  useEffect(() => {
    load(periodDays);
    const timer = setInterval(() => load(periodDays), 15000);
    return () => clearInterval(timer);
  }, [load, periodDays]);

  const persistAcceptedCarrierReset = useCallback(async (orderId) => {
    const basePatch = {
      estado_interno: "aceite",
      status: "CONFIRMED",
      driver_name: null,
      driver_phone: null,
      veiculo_estafeta: null,
      shipday_tracking_url: null,
      updated_at: new Date().toISOString(),
    };

    let response = await supabase
      .from("orders")
      .update({
        ...basePatch,
        shipday_driver_name: null,
        shipday_driver_phone: null,
      })
      .eq("id", orderId)
      .select("id, estado_interno, status, driver_name, driver_phone, veiculo_estafeta, shipday_tracking_url, updated_at")
      .maybeSingle();

    if (
      response.error
      && /shipday_driver_name|shipday_driver_phone/i.test(String(response.error.message || ""))
    ) {
      response = await supabase
        .from("orders")
        .update(basePatch)
        .eq("id", orderId)
        .select("id, estado_interno, status, driver_name, driver_phone, veiculo_estafeta, shipday_tracking_url, updated_at")
        .maybeSingle();
    }

    if (response.error) {
      return {
        ok: false,
        error: response.error,
      };
    }

    return {
      ok: true,
      data: response.data || { id: orderId, ...basePatch },
    };
  }, []);

  const applyAcceptedCarrierResetLocally = useCallback((orderId, updatedAt = null) => {
    setState((prev) => ({
      ...prev,
      orders: (prev.orders || []).map((order) => {
        if (String(order.id) !== String(orderId)) return order;

          return {
            ...order,
            estado_interno: "aceite",
            status: "CONFIRMED",
            driver_name: null,
            driver_phone: null,
            veiculo_estafeta: null,
            shipday_tracking_url: null,
            updated_at: updatedAt || new Date().toISOString(),
          };
      }),
    }));
  }, []);

  const rollbackTimedOutCarrierAssignment = useCallback(async (order) => {
    const orderId = String(order?.id || "");
    if (!orderId || assigningTimeoutRollbackInFlightRef.current.has(orderId)) return;

    assigningTimeoutRollbackInFlightRef.current.add(orderId);

    try {
      if (order?.shipday_order_id) {
        const shipdayResult = await unassignOrderToShipdayCarrier({
          shipdayOrderId: order.shipday_order_id,
          orderId: order.id,
          lojaId: order?.loja_id ?? null,
        });

        if (!shipdayResult?.ok && !shipdayResult?.skipped) {
          console.error("Falha ao desassociar estafeta expirado no Shipday", {
            orderId: order.id,
            shipdayOrderId: order.shipday_order_id,
            response: shipdayResult,
          });
        }
      }

      const persistResult = await persistAcceptedCarrierReset(order.id);

      if (!persistResult.ok) {
        console.error("Falha ao limpar atribuicao expirada no Supabase", {
          orderId: order.id,
          shipdayOrderId: order?.shipday_order_id ?? null,
          response: {
            code: persistResult.error?.code || null,
            message: persistResult.error?.message || null,
            details: persistResult.error?.details || null,
            hint: persistResult.error?.hint || null,
          },
        });
        return;
      }

      applyAcceptedCarrierResetLocally(order.id, persistResult.data?.updated_at || null);
    } catch (error) {
      console.error("Falha no rollback automatico de atribuicao expirada", {
        orderId: order?.id ?? null,
        shipdayOrderId: order?.shipday_order_id ?? null,
        error,
      });
    } finally {
      assigningTimeoutRollbackInFlightRef.current.delete(orderId);
    }
  }, [applyAcceptedCarrierResetLocally, persistAcceptedCarrierReset]);

  useEffect(() => {
    const checkTimedOutCarrierAssignments = () => {
      const timedOutOrders = (ordersRef.current || []).filter(isAssigningTimedOut);
      timedOutOrders.forEach((order) => {
        rollbackTimedOutCarrierAssignment(order);
      });
    };

    checkTimedOutCarrierAssignments();
    const timer = setInterval(checkTimedOutCarrierAssignments, 30000);

    return () => clearInterval(timer);
  }, [rollbackTimedOutCarrierAssignment]);

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
        error: carriers.length === 0 ? "Sem estafetas com turno ativo no Shipday." : "",
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

      const assignmentPatch = {
        estado_interno: "atribuindo_estafeta",
        status: "ASSIGNED",
        updated_at: new Date().toISOString(),
      };
      const carrierName = String(carrier?.name || "").trim();
      const carrierPhone = String(carrier?.phone || "").trim();
      const carrierVehicle = String(carrier?.vehicle || "").trim();

      if (carrierName) assignmentPatch.driver_name = carrierName;
      if (carrierPhone) assignmentPatch.driver_phone = carrierPhone;
      if (carrierVehicle) assignmentPatch.veiculo_estafeta = carrierVehicle;

      const { data: updatedOrder, error: persistDriverError } = await supabase
        .from("orders")
        .update(assignmentPatch)
        .eq("id", currentOrder.id)
        .select("id, driver_name, driver_phone, veiculo_estafeta, estado_interno, status")
        .maybeSingle();

      if (persistDriverError) {
        console.error("Erro ao persistir atribuicao de estafeta", {
          orderId: currentOrder.id,
          shipdayOrderId: currentOrder.shipday_order_id || null,
          assignmentPatch,
          carrier,
          response: {
            code: persistDriverError.code || null,
            message: persistDriverError.message || null,
            details: persistDriverError.details || null,
            hint: persistDriverError.hint || null,
          },
        });
        throw new Error(persistDriverError.message || "Falha ao guardar estafeta na base de dados.");
      }

      if (!updatedOrder) {
        console.error("Supabase nao devolveu a linha atualizada apos atribuir estafeta", {
          orderId: currentOrder.id,
          shipdayOrderId: currentOrder.shipday_order_id || null,
          assignmentPatch,
          carrier,
        });
        throw new Error("Falha ao confirmar atribuicao de estafeta na base de dados.");
      }

      setState((prev) => ({
        ...prev,
        orders: (prev.orders || []).map((order) => {
          if (String(order.id) !== String(currentOrder.id)) return order;

          return {
            ...order,
            driver_name: updatedOrder.driver_name || order.driver_name || null,
            driver_phone: updatedOrder.driver_phone || order.driver_phone || null,
            veiculo_estafeta: updatedOrder.veiculo_estafeta || order.veiculo_estafeta || null,
            estado_interno: updatedOrder.estado_interno || "atribuindo_estafeta",
            status: updatedOrder.status || "ASSIGNED",
            updated_at: assignmentPatch.updated_at,
          };
        }),
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

    const shipdayResult = await unassignOrderToShipdayCarrier({
      shipdayOrderId: order?.shipday_order_id,
      orderId: order?.id,
      lojaId: order?.loja_id ?? null,
    });

    if (!shipdayResult?.ok && !shipdayResult?.skipped) {
      alert(shipdayResult?.error || "Falha ao desassociar estafeta no Shipday.");
      return;
    }

    const persistResult = await persistAcceptedCarrierReset(order.id);

    if (!persistResult.ok) {
      alert(persistResult.error?.message || "Falha ao desassociar estafeta.");
      return;
    }

    applyAcceptedCarrierResetLocally(order.id, persistResult.data?.updated_at || null);
    await load(periodDays);
  };

  const syncUpdatedStore = (updatedStore) => {
    if (!updatedStore?.idloja) return;

    setState((prev) => ({
      ...prev,
      stores: (prev.stores || []).map((store) => (
        String(store.idloja) === String(updatedStore.idloja)
          ? { ...store, ...updatedStore }
          : store
      )),
    }));
  };

  const handleToggleAutoAccept = async (store, nextValue) => {
    const updatedStore = await updateRestaurantAdminSettings(store.idloja, {
      aceitacao_automatica_pedidos: nextValue,
    });
    syncUpdatedStore(updatedStore);
  };

  const handleSaveCommissionSettings = async (store, payload) => {
    const updatedStore = await updateRestaurantAdminSettings(store.idloja, payload);
    syncUpdatedStore(updatedStore);
  };

  const managementToolbar = (
    <>
      <label className="dashboard-toolbar-field">
        <span className="muted">Pesquisar restaurante</span>
        <input
          type="text"
          placeholder="Ex: Munchies"
          value={storeSearch}
          onChange={(event) => setStoreSearch(event.target.value)}
        />
      </label>

      <label className="dashboard-toolbar-field">
        <span className="muted">Loja em foco</span>
        <select
          value={selectedStoreId}
          onChange={(event) => setSelectedStoreId(event.target.value)}
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
    </>
  );

  return (
    <DashboardSidebarLayout
      kicker="PedeJa Control Center"
      title="Admin Command Dashboard"
      subtitle="Menu lateral retratil para pedidos, restaurantes e campanhas."
      tabs={ADMIN_DASHBOARD_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      storageKey="dashboard-admin-sidebar-collapsed"
      footer={selectedStore ? (
        <div>
          <p className="muted dashboard-sidebar-footer-label">Loja em foco</p>
          <strong>{selectedStore.nome}</strong>
          <p className="muted dashboard-sidebar-footer-meta">#{selectedStore.idloja}</p>
        </div>
      ) : (
        <p className="muted dashboard-sidebar-footer-meta">Sem loja selecionada.</p>
      )}
    >
      <header className="dashboard-header enterprise-header">
        <div>
          <p className="kicker">PedeJa Control Center</p>
          <h1 className="dashboard-title">Admin Command Dashboard</h1>
        </div>
        <div className="dashboard-actions">
          <select value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))}>
            <option value={7}>Ultimos 7 dias</option>
            <option value={30}>Ultimos 30 dias</option>
            <option value={90}>Ultimos 90 dias</option>
          </select>
          <button className="btn-dashboard" onClick={() => load(periodDays)}>Atualizar</button>
          <button className="btn-dashboard secondary" onClick={() => navigate("/")}>Website</button>
        </div>
      </header>

      {state.error ? <p className="shipday-inline-error">{state.error}</p> : null}

      {activeTab === "dashboard" ? (
        <div className="dashboard-stack">
          <section className="dashboard-grid premium-grid">
            <article
              className="metric-card premium is-clickable"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/dashboard/admin/receita?days=${periodDays}`)}
              onKeyDown={(event) => handleRowKeyDown(event, () => navigate(`/dashboard/admin/receita?days=${periodDays}`))}
            >
              <div className="metric-label">Receita</div>
              <div className="metric-value">{state.metrics.totalRevenue.toFixed(2)}EUR</div>
              <div className="metric-foot">Abrir detalhe da receita</div>
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

          <section className="panel-grid admin-top-grid">
            <LiveOperationsBoard orders={state.liveOrders} />

            <article className="panel sla-panel">
              <h3>Alertas SLA</h3>
              <p className="muted">Pedidos acima do tempo limite por estado.</p>
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
                        <td>{storeNameById.get(String(alert.loja_id)) || `Loja ${alert.loja_id}`}</td>
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
                      <tr><td colSpan={5}>Sem breaches de SLA.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          <section className="panel-grid analytics-grid">
            <TrendBars title="Receita por dia" data={dailyRevenue} valueKey="value" labelKey="label" suffix=" EUR" />
            <TrendBars title="Procura por hora" data={hourlyDemand} valueKey="value" labelKey="label" />
          </section>

          <article className="panel">
            <div className="panel-header-inline">
              <div>
                <h3>Ultimos Pedidos</h3>
                <p className="muted">Clica numa linha para ver os detalhes completos do pedido.</p>
              </div>
            </div>

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
                    const latestDelivery = latestDeliveryByOrderId.get(String(order.id));
                    const hasAssignedDriver = Boolean(String(order.driver_name || order.shipday_driver_name || "").trim());
                    const canAssign = estadoInterno === "aceite" && !hasAssignedDriver;
                    const canUnassignDriver = hasAssignedDriver && estadoInterno !== "entregue";
                    const hasAnyAction = Boolean(canAssign || canUnassignDriver);
                    const resolvedDriverName = order.driver_name || order.shipday_driver_name || "";
                    const resolvedDriverPhone = order.driver_phone || order.shipday_driver_phone || "";
                    const driverText = resolvedDriverName
                      ? `${resolvedDriverName}${resolvedDriverPhone ? ` (${resolvedDriverPhone})` : ""}`
                      : (resolvedDriverPhone || "-");
                    const trackingUrl = order.shipday_tracking_url || latestDelivery?.tracking_url || null;

                    return (
                      <tr
                        key={order.id}
                        className="is-clickable-row"
                        tabIndex={0}
                        onClick={() => openOrderDetailModal(order.id)}
                        onKeyDown={(event) => handleRowKeyDown(event, () => openOrderDetailModal(order.id))}
                      >
                        <td>{String(order.id).slice(0, 8)}</td>
                        <td>{storeNameById.get(String(order.loja_id)) || `Loja ${order.loja_id || "-"}`}</td>
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
                          {hasAnyAction ? (
                            <div className="table-action-stack">
                              {canUnassignDriver ? (
                                <button
                                  className="btn-dashboard small danger"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    unassignCarrierFromOrder(order);
                                  }}
                                >
                                  Desassociar Estafeta
                                </button>
                              ) : null}

                              {canAssign ? (
                                <button
                                  className="btn-dashboard small"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openCarrierModal(order);
                                  }}
                                >
                                  Atribuir Estafeta
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {!state.loading && state.orders.length === 0 ? (
                    <tr><td colSpan={8}>Sem pedidos nesta janela.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel">
            <div className="panel-header-inline">
              <div>
                <h3>Entregas Recentes</h3>
                <p className="muted">Estados traduzidos para facilitar o acompanhamento operacional.</p>
              </div>
            </div>

            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Pedido</th>
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
                          ) : (
                            "-"
                          )}
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

      {activeTab === "restaurants" ? (
        <div className="dashboard-stack">
          <section className="panel store-access-panel">
            <div className="store-access-header">
              <div>
                <h3>Loja em foco</h3>
                <p className="muted">Pesquisa por nome e gere a configuracao granular de uma loja de cada vez.</p>
              </div>
              <button className="btn-dashboard secondary" disabled={!selectedStoreId} onClick={() => openRestaurantDashboard()}>
                Abrir dashboard da loja
              </button>
            </div>

            <div className="store-access-grid">
              <label>
                <span className="muted">Pesquisar restaurante</span>
                <input
                  type="text"
                  placeholder="Ex: Munchies"
                  value={storeSearch}
                  onChange={(event) => setStoreSearch(event.target.value)}
                />
              </label>

              <label>
                <span className="muted">Restaurante</span>
                <select
                  value={selectedStoreId}
                  onChange={(event) => setSelectedStoreId(event.target.value)}
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
            </div>
          </section>

          <RestaurantManagementPanel
            title="Gestao de Restaurantes"
            subtitle="Escolhe o modo de comissao e define overrides globais, por categoria ou por prato."
            stores={managementStores}
            loading={state.loading}
            canEdit
            toolbar={managementToolbar}
            commissionCatalogByStore={commissionCatalogByStore}
            catalogLoadingByStore={catalogLoadingByStore}
            catalogErrorByStore={catalogErrorByStore}
            onToggleAutoAccept={handleToggleAutoAccept}
            onSaveCommissionSettings={handleSaveCommissionSettings}
          />

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
                    {!state.loading && state.storePerformance.length === 0 ? (
                      <tr><td colSpan={6}>Sem dados de lojas.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>

            <AdminRestaurantAssociation stores={state.stores} onLinked={() => load(periodDays)} />
          </section>

          <article className="panel">
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
                            <div className="table-action-row">
                              <button
                                className="btn-dashboard small secondary"
                                onClick={() => setExpandedRequestId(isExpanded ? "" : request.id)}
                              >
                                {isExpanded ? "Fechar" : "Ver detalhes"}
                              </button>
                              <button className="btn-dashboard small" disabled={reviewingId === request.id} onClick={() => reviewRequest(request.id, "APPROVED")}>
                                Aprovar
                              </button>
                              <button className="btn-dashboard small secondary" disabled={reviewingId === request.id} onClick={() => reviewRequest(request.id, "REJECTED")}>
                                Rejeitar
                              </button>
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
                  {!state.loading && state.requests.length === 0 ? (
                    <tr><td colSpan={6}>Sem pedidos pendentes.</td></tr>
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
            <p className="muted">Container preparado para a futura configuracao de campanhas e descontos.</p>
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

      {carrierModal.open ? (
        <div className="shipday-modal-backdrop" onClick={closeCarrierModal}>
          <div className="shipday-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="shipday-modal-header">
              <div>
                <h3>Atribuir estafeta</h3>
                <p className="muted">
                  Pedido #{carrierModal.order?.id || "-"} - Shipday ID {carrierModal.order?.shipday_order_id || carrierModal.order?.id || "-"}
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
                      <p className="muted">{carrier.phone || "Sem telemovel"} - {carrier.status || "-"}</p>
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
    </DashboardSidebarLayout>
  );
}

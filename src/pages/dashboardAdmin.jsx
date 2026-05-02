import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import "../css/pages/dashboard.css";
import {
  fetchAdminDashboard,
  fetchAdminCustomerInsights,
  fetchGlobalAutoAssignSettings,
  fetchGlobalDeliveryPricingSettings,
  saveGlobalDeliveryPricingSettings,
  saveGlobalAutoAssignSettings,
  fetchStoreCommissionCatalog,
  updateRestaurantAdminSettings,
  updateRestaurantSignupRequest,
  updateOrderWorkflowStatus,
} from "../services/opsDashboardService";
import AdminRestaurantAssociation from "../components/admin/AdminRestaurantAssociation";
import TrendBars from "../components/dashboard/TrendBars";
import LiveOperationsBoard from "../components/dashboard/LiveOperationsBoard";
import DashboardSidebarLayout from "../components/dashboard/DashboardSidebarLayout";
import RestaurantManagementPanel from "../components/dashboard/RestaurantManagementPanel";
import StoreDeliveryPricingPanel from "../components/dashboard/StoreDeliveryPricingPanel";
import StoreSpecialHoursPanel from "../components/dashboard/StoreSpecialHoursPanel";
import ShipdayTrackingModal from "../components/dashboard/ShipdayTrackingModal";
import OrderDetailsModal from "../components/dashboard/OrderDetailsModal";
import DatePickerCustom from "../components/ui/DatePickerCustom";
import { extractUserId } from "../utils/roles";
import { formatScheduleLabel } from "../utils/storeHours";
import {
  getEstadoInternoLabelPt,
  getEstadoInternoTagClass,
  resolveOrderEstadoInterno,
} from "../services/orderStatusMapper";
import { fetchOrderDetails } from "../services/orderDetailsService";
import {
  assignOrderToShipdayCarrier,
  buildLiveCarrierBoardEntries,
  createShipdayOrderForOrder,
  persistAssignedCarrierSelection,
  pickBestCarrierForOrder,
  retrieveShipdayCarriers,
  unassignOrderToShipdayCarrier,
} from "../services/shipdayService";
import { supabase } from "../services/supabaseClient";
import { BARCELOS_CENTER } from "../services/deliveryZoneService";
import {
  resolveEffectiveAutoAssignConfig,
  sanitizeAutoAssignConfig,
} from "../services/autoAssignConfig";

const ASSIGNING_TIMEOUT_MS = 2 * 60 * 1000;
const ACCEPTED_WITHOUT_DRIVER_SLA_MS = 10 * 60 * 1000;
const SCHEDULED_RELEASE_WINDOW_MS = 30 * 60 * 1000;

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

function readUserFromStorageSafe() {
  try {
    const raw = localStorage.getItem("pedeja_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeFixed(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Number(0).toFixed(digits);
  return numeric.toFixed(digits);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureObjectArray(value) {
  return ensureArray(value).filter((item) => item && typeof item === "object");
}

function normalizeAdminMetrics(metrics = {}) {
  return {
    totalOrders: Number(metrics?.totalOrders || 0),
    scheduledOrders: Number(metrics?.scheduledOrders || 0),
    immediateOrders: Number(metrics?.immediateOrders || 0),
    totalRevenue: Number(metrics?.totalRevenue || 0),
    activeDeliveries: Number(metrics?.activeDeliveries || 0),
    deliveredRate: Number(metrics?.deliveredRate || 0),
    cancelRate: Number(metrics?.cancelRate || 0),
    avgTicket: Number(metrics?.avgTicket || 0),
  };
}

function normalizeAdminDashboardData(data = {}) {
  return {
    orders: ensureObjectArray(data?.orders),
    immediateOrders: ensureObjectArray(data?.immediateOrders),
    scheduledOrders: ensureObjectArray(data?.scheduledOrders),
    deliveries: ensureObjectArray(data?.deliveries),
    stores: ensureObjectArray(data?.stores),
    storeTypes: ensureObjectArray(data?.storeTypes),
    requests: ensureObjectArray(data?.requests),
    metrics: normalizeAdminMetrics(data?.metrics),
    series: {
      byDay: ensureObjectArray(data?.series?.byDay),
      byHour: ensureObjectArray(data?.series?.byHour),
    },
    storePerformance: ensureObjectArray(data?.storePerformance),
    slaAlerts: ensureObjectArray(data?.slaAlerts),
    liveOrders: ensureObjectArray(data?.liveOrders),
    error: String(data?.error || ""),
  };
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

function formatOrderDeliverySlot(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getScheduledOperationalStateView(order) {
  const normalized = String(order?.scheduled_operational_state || "").trim().toLowerCase();
  if (!normalized) return null;

  const labelMap = {
    agendado: "Agendado",
    a_liberar: "A libertar",
    na_fila_imediata: "Na fila imediata",
  };

  const toneMap = {
    agendado: "warning",
    a_liberar: "warning",
    na_fila_imediata: "success",
  };

  return {
    label: labelMap[normalized] || normalized,
    className: getToneTagClass(toneMap[normalized] || "warning"),
  };
}

function hasAssignedDriver(order) {
  return Boolean(String(order?.driver_name || order?.shipday_driver_name || "").trim());
}

function isDriverAssignmentSlaBreached(order) {
  if (resolveOrderEstadoInterno(order) !== "aceite") return false;
  if (hasAssignedDriver(order)) return false;

  const acceptedAt = new Date(order?.aceite_em || order?.updated_at || order?.created_at || 0).getTime();
  if (!Number.isFinite(acceptedAt)) return false;

  return Date.now() - acceptedAt >= ACCEPTED_WITHOUT_DRIVER_SLA_MS;
}

function shouldAutoAssignNow(order) {
  if (String(order?.order_timing_mode || "").trim().toUpperCase() !== "SCHEDULED") return true;

  const scheduledFor = new Date(order?.scheduled_for || order?.created_at || 0).getTime();
  if (!Number.isFinite(scheduledFor)) return true;

  return (scheduledFor - Date.now()) <= SCHEDULED_RELEASE_WINDOW_MS;
}

function isAssigningTimedOut(order) {
  if (resolveOrderEstadoInterno(order) !== "atribuindo_estafeta") return false;

  const updatedAt = order?.updated_at ? new Date(order.updated_at).getTime() : NaN;
  if (!Number.isFinite(updatedAt)) return false;

  return Date.now() - updatedAt >= ASSIGNING_TIMEOUT_MS;
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

function buildPerformanceSearchParams({ periodDays, rangeMode, customRange, granularity = "day" }) {
  const params = new URLSearchParams();
  params.set("granularity", granularity);

  if (rangeMode === "custom") {
    params.set("mode", "custom");
    if (customRange?.from) params.set("from", customRange.from);
    if (customRange?.to) params.set("to", customRange.to);
    params.set("days", String(periodDays));
    return params.toString();
  }

  params.set("days", String(periodDays));
  return params.toString();
}

const ADMIN_DASHBOARD_TABS = [
  { id: "dashboard", label: "Dashboard", description: "Ultimos pedidos e entregas recentes", icon: "dashboard" },
  { id: "customers", label: "Clientes", description: "Analise de atividade e valor por cliente", icon: "dashboard" },
  { id: "restaurants", label: "Gestao de Restaurantes", description: "Auto-accept e comissao por loja", icon: "restaurants" },
  { id: "promotions", label: "Promocoes", description: "Campanhas e futuras ativacoes", icon: "promotions" },
];

export default function DashboardAdmin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = readUserFromStorageSafe();
  const queryStoreId = searchParams.get("loja") || "";
  const queryTab = searchParams.get("tab") || "";
  const initialTab = ADMIN_DASHBOARD_TABS.some((tab) => tab.id === queryTab) ? queryTab : "dashboard";

  const [activeTab, setActiveTab] = useState(initialTab);
  const [periodDays, setPeriodDays] = useState(7);
  const [rangeMode, setRangeMode] = useState("preset");
  const [customRange, setCustomRange] = useState({ from: "", to: "" });
  const [reviewingId, setReviewingId] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState(queryStoreId);
  const [storeSearch, setStoreSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [expandedRequestId, setExpandedRequestId] = useState("");
  const [trackingModal, setTrackingModal] = useState({ open: false, url: "", title: "Tracking Shipday" });
  const [orderDetailModal, setOrderDetailModal] = useState({ open: false, loading: false, error: "", data: null });
  const [commissionCatalogByStore, setCommissionCatalogByStore] = useState({});
  const [catalogLoadingByStore, setCatalogLoadingByStore] = useState({});
  const [catalogErrorByStore, setCatalogErrorByStore] = useState({});
  const [globalDeliveryPricing, setGlobalDeliveryPricing] = useState({
    config: null,
    updated_at: null,
    loading: false,
    error: "",
  });
  const [globalAutoAssign, setGlobalAutoAssign] = useState({
    enabled: false,
    criteria: sanitizeAutoAssignConfig(null, false).criteria,
    updated_at: null,
    loading: false,
    error: "",
  });
  const [state, setState] = useState({
    orders: [],
    immediateOrders: [],
    scheduledOrders: [],
    deliveries: [],
    stores: [],
    storeTypes: [],
    requests: [],
      metrics: {
        totalOrders: 0,
        scheduledOrders: 0,
        immediateOrders: 0,
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
  const [liveCarriers, setLiveCarriers] = useState([]);
  const [customerInsights, setCustomerInsights] = useState({
    loading: false,
    error: "",
    metrics: {
      totalCustomers: 0,
      customersWithOrders: 0,
      activeCustomers30d: 0,
      totalOrders: 0,
      totalSpent: 0,
      avgTicket: 0,
      avgSpentPerCustomer: 0,
    },
    customers: [],
  });
  const ordersRef = useRef([]);
  const assigningTimeoutRollbackInFlightRef = useRef(new Set());
  const autoAssignInFlightRef = useRef(new Set());
  const dashboardWindowInput = useMemo(
    () => buildWindowInput({ rangeMode, periodDays, customRange }),
    [customRange, periodDays, rangeMode],
  );
  const performanceSearch = useMemo(
    () => buildPerformanceSearchParams({ periodDays, rangeMode, customRange, granularity: "day" }),
    [customRange, periodDays, rangeMode],
  );

  const storeTypeMap = useMemo(
    () => new Map(
      ensureObjectArray(state?.storeTypes)
        .map((item) => [String(item?.idtipoloja || ""), item?.descricao || item?.tipoloja || ""])
        .filter(([id]) => Boolean(id)),
    ),
    [state.storeTypes],
  );
  const storeNameById = useMemo(
    () => new Map(
      ensureObjectArray(state?.stores)
        .map((store) => [String(store?.idloja || ""), store?.nome || `Loja ${store?.idloja || "-"}`])
        .filter(([id]) => Boolean(id)),
    ),
    [state.stores],
  );
  const storesById = useMemo(
    () => new Map(
      ensureObjectArray(state?.stores)
        .map((store) => [String(store?.idloja || ""), store])
        .filter(([id]) => Boolean(id)),
    ),
    [state.stores],
  );
  const storesOrderedById = useMemo(
    () => [...ensureArray(state?.stores)].filter(Boolean).sort((a, b) => Number(a?.idloja || 0) - Number(b?.idloja || 0)),
    [state.stores],
  );
  const filteredStoresForPicker = useMemo(() => {
    const search = normalizeSearch(storeSearch);
    if (!search) return storesOrderedById;
    return storesOrderedById.filter((store) => normalizeSearch(store.nome).includes(search));
  }, [storeSearch, storesOrderedById]);
  const filteredCustomers = useMemo(() => {
    const search = normalizeSearch(customerSearch);
    if (!search) return customerInsights.customers || [];
    return (customerInsights.customers || []).filter((customer) => {
      const name = normalizeSearch(customer?.name || "");
      const emailMasked = normalizeSearch(customer?.email_masked || "");
      const favoriteStore = normalizeSearch(customer?.favorite_store_name || "");
      return name.includes(search) || emailMasked.includes(search) || favoriteStore.includes(search);
    });
  }, [customerInsights.customers, customerSearch]);
  const selectedStore = useMemo(
    () => storesOrderedById.find((store) => String(store.idloja) === String(selectedStoreId)) || null,
    [selectedStoreId, storesOrderedById],
  );
  const latestDeliveryByOrderId = useMemo(() => {
    const map = new Map();
    ensureObjectArray(state?.deliveries).forEach((delivery) => {
      const key = String(delivery?.order_id || "");
      if (!key || map.has(key)) return;
      map.set(key, delivery);
    });
    return map;
  }, [state.deliveries]);
  const managementStores = useMemo(() => (selectedStore ? [selectedStore] : []), [selectedStore]);
  const dailyRevenue = useMemo(
    () => ensureArray(state?.series?.byDay).map((item) => ({ label: item?.day, value: item?.revenue })),
    [state?.series?.byDay],
  );
  const hourlyDemand = useMemo(
    () => ensureArray(state?.series?.byHour).map((item) => ({ label: `${String(item?.hour).padStart(2, "0")}h`, value: item?.orders })),
    [state?.series?.byHour],
  );
  const liveCarrierEntries = useMemo(() => {
    try {
      return buildLiveCarrierBoardEntries({
        carriers: ensureArray(liveCarriers),
        orders: ensureObjectArray(state?.immediateOrders),
        stores: ensureObjectArray(state?.stores),
        deliveries: ensureObjectArray(state?.deliveries),
        mode: "admin",
      });
    } catch (error) {
      console.error("Live Geo Board falhou ao normalizar dados dos estafetas", error);
      return [];
    }
  }, [liveCarriers, state?.deliveries, state?.immediateOrders, state?.stores]);
  const slaBreachedOrderIds = useMemo(
    () => new Set(
      ensureObjectArray(state?.slaAlerts)
        .filter((alert) => Boolean(alert?.driverAssignmentDelay || alert?.driver_assignment_delay))
        .map((alert) => String(alert?.id || ""))
        .filter(Boolean),
    ),
    [state.slaAlerts],
  );
  const safeSlaAlerts = useMemo(() => ensureObjectArray(state?.slaAlerts), [state?.slaAlerts]);
  const safeScheduledOrders = useMemo(() => ensureObjectArray(state?.scheduledOrders), [state?.scheduledOrders]);
  const safeImmediateOrders = useMemo(() => ensureObjectArray(state?.immediateOrders), [state?.immediateOrders]);
  const safeDeliveries = useMemo(() => ensureObjectArray(state?.deliveries), [state?.deliveries]);
  const safeStorePerformance = useMemo(() => ensureObjectArray(state?.storePerformance), [state?.storePerformance]);
  const safeRequests = useMemo(() => ensureObjectArray(state?.requests), [state?.requests]);

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
      const firstStoreId = filteredStoresForPicker[0]?.idloja;
      setSelectedStoreId(firstStoreId ? String(firstStoreId) : "");
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

  useEffect(() => {
    let active = true;

    const loadPlatformSettings = async () => {
      setGlobalAutoAssign((prev) => ({
        ...prev,
        loading: true,
        error: "",
      }));
      const shouldLoadDeliveryPricing = activeTab === "restaurants";

      if (shouldLoadDeliveryPricing) {
        setGlobalDeliveryPricing((prev) => ({
          ...prev,
          loading: true,
          error: "",
        }));
      }

      try {
        const [deliverySettings, autoAssignSettings] = await Promise.all([
          shouldLoadDeliveryPricing ? fetchGlobalDeliveryPricingSettings() : Promise.resolve(null),
          fetchGlobalAutoAssignSettings(),
        ]);
        if (!active) return;

        if (shouldLoadDeliveryPricing) {
          setGlobalDeliveryPricing({
            config: deliverySettings?.config || null,
            updated_at: deliverySettings?.updated_at || null,
            loading: false,
            error: "",
          });
        }

        setGlobalAutoAssign({
          enabled: Boolean(autoAssignSettings?.enabled),
          criteria: sanitizeAutoAssignConfig(autoAssignSettings, Boolean(autoAssignSettings?.enabled)).criteria,
          updated_at: autoAssignSettings?.updated_at || null,
          loading: false,
          error: "",
        });
      } catch (error) {
        if (!active) return;

        if (shouldLoadDeliveryPricing) {
          setGlobalDeliveryPricing((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Nao foi possivel carregar a configuracao global de entrega.",
          }));
        }

        setGlobalAutoAssign((prev) => ({
          ...prev,
          loading: false,
          error: error?.message || "Nao foi possivel carregar a atribuicao automatica geral.",
        }));
      }
    };

    loadPlatformSettings();

    return () => {
      active = false;
    };
  }, [activeTab]);

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

  const load = useCallback(async (input = dashboardWindowInput) => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const data = await fetchAdminDashboard(input);
      const normalized = normalizeAdminDashboardData(data);
      setState({
        ...normalized,
        loading: false,
      });

      const stores = [...ensureArray(normalized.stores)].sort((a, b) => Number(a?.idloja || 0) - Number(b?.idloja || 0));
      setSelectedStoreId((prev) => {
        if (queryStoreId && stores.some((store) => String(store.idloja) === String(queryStoreId))) {
          return String(queryStoreId);
        }

        if (prev && stores.some((store) => String(store.idloja) === String(prev))) {
          return String(prev);
        }

        return stores.length > 0 ? String(stores[0].idloja) : "";
      });
    } catch (error) {
      console.error("Falha inesperada ao carregar dashboard admin", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Falha inesperada no dashboard admin.",
      }));
    }
  }, [dashboardWindowInput, queryStoreId]);

  const loadCustomerInsights = useCallback(async (input = dashboardWindowInput) => {
    setCustomerInsights((prev) => ({
      ...prev,
      loading: true,
      error: "",
    }));

    try {
      const data = await fetchAdminCustomerInsights(input);
      const normalizedMetrics = {
        totalCustomers: Number(data?.metrics?.totalCustomers || 0),
        customersWithOrders: Number(data?.metrics?.customersWithOrders || 0),
        activeCustomers30d: Number(data?.metrics?.activeCustomers30d || 0),
        totalOrders: Number(data?.metrics?.totalOrders || 0),
        totalSpent: Number(data?.metrics?.totalSpent || 0),
        avgTicket: Number(data?.metrics?.avgTicket || 0),
        avgSpentPerCustomer: Number(data?.metrics?.avgSpentPerCustomer || 0),
      };
      setCustomerInsights((prev) => ({
        ...prev,
        loading: false,
        error: data?.error || "",
        metrics: normalizedMetrics,
        customers: ensureObjectArray(data?.customers),
      }));
    } catch (error) {
      console.error("Falha inesperada ao carregar insights de clientes", error);
      setCustomerInsights((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Falha inesperada ao carregar clientes.",
      }));
    }
  }, [dashboardWindowInput]);

  const loadLiveCarriers = useCallback(async () => {
    try {
      const carriers = await retrieveShipdayCarriers();
      setLiveCarriers(ensureArray(carriers));
    } catch (error) {
      console.error("Falha ao carregar estafetas online para o live board", error);
      setLiveCarriers([]);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => load(), 15000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (activeTab !== "dashboard") return undefined;

    loadLiveCarriers();
    const timer = setInterval(loadLiveCarriers, 30000);
    return () => clearInterval(timer);
  }, [activeTab, loadLiveCarriers]);

  useEffect(() => {
    if (activeTab !== "customers") return undefined;
    loadCustomerInsights();
    const timer = setInterval(() => loadCustomerInsights(), 45000);
    return () => clearInterval(timer);
  }, [activeTab, loadCustomerInsights]);

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

  const persistCarrierAssignment = useCallback(async (order, carrier) => {
    const result = await persistAssignedCarrierSelection({
      orderId: order.id,
      carrier,
      nextEstado: "atribuindo_estafeta",
      nextStatus: "ASSIGNED",
      updatedAt: new Date().toISOString(),
    });

    setState((prev) => ({
      ...prev,
      orders: (prev.orders || []).map((candidate) => {
        if (String(candidate.id) !== String(order.id)) return candidate;
        return {
          ...candidate,
          driver_name: result.order?.driver_name || null,
          driver_phone: result.order?.driver_phone || null,
          veiculo_estafeta: result.order?.veiculo_estafeta || null,
          estado_interno: result.order?.estado_interno || "atribuindo_estafeta",
          status: result.order?.status || "ASSIGNED",
          updated_at: result.order?.updated_at || result.patch?.updated_at || candidate.updated_at,
        };
      }),
    }));

    return result;
  }, []);

  const runAutoAssignForOrder = useCallback(async (order, { silent = true } = {}) => {
    const orderId = String(order?.id || "");
    if (!orderId || autoAssignInFlightRef.current.has(orderId)) return { skipped: true, reason: "in_flight" };

    const store = storesById.get(String(order?.loja_id || ""));
    const effectiveAutoAssignConfig = resolveEffectiveAutoAssignConfig(store, globalAutoAssign);

    if (!effectiveAutoAssignConfig.enabled) {
      return { skipped: true, reason: "store_auto_assign_disabled" };
    }

    if (!shouldAutoAssignNow(order)) {
      return { skipped: true, reason: "scheduled_order_outside_release_window" };
    }

    if (resolveOrderEstadoInterno(order) !== "aceite" || hasAssignedDriver(order)) {
      return { skipped: true, reason: "order_not_waiting_for_driver" };
    }

    autoAssignInFlightRef.current.add(orderId);

    try {
      let preparedOrder = order;
      let shipdayOrderId = String(order?.shipday_order_id || "").trim();

      if (!shipdayOrderId) {
        const bootstrap = await createShipdayOrderForOrder({ orderId: order.id });
        shipdayOrderId = String(bootstrap?.shipdayOrderId || "").trim();
        preparedOrder = {
          ...order,
          shipday_order_id: shipdayOrderId || order?.shipday_order_id || "",
        };
      }

      const carriers = await retrieveShipdayCarriers();
      const { best } = pickBestCarrierForOrder({
        carriers,
        orders: ordersRef.current,
        storeLocation: BARCELOS_CENTER,
        criteriaConfig: effectiveAutoAssignConfig.criteria,
      });

      if (!best?.carrier?.id) {
        if (!silent) {
          toast.error("Nao existe nenhum estafeta online e disponivel para atribuicao automatica.");
        }
        return { skipped: true, reason: "no_available_carrier" };
      }

      await assignOrderToShipdayCarrier({
        order: {
          ...preparedOrder,
          shipday_order_id: shipdayOrderId || preparedOrder?.shipday_order_id || "",
        },
        carrier: best.carrier,
      });

      await persistCarrierAssignment(preparedOrder, best.carrier);

      if (!silent) {
        toast.success(`Estafeta ${best.carrier.name || best.carrier.id} atribuido automaticamente.`);
      }

      await load();

      return {
        ok: true,
        carrier: best.carrier,
      };
    } catch (error) {
      console.error("Falha na atribuicao automatica de estafeta", {
        orderId: order?.id ?? null,
        lojaId: order?.loja_id ?? null,
        error,
      });

      if (!silent) {
        toast.error(error?.message || "Nao foi possivel atribuir estafeta automaticamente.");
      }

      return {
        ok: false,
        error,
      };
    } finally {
      autoAssignInFlightRef.current.delete(orderId);
    }
  }, [globalAutoAssign, load, persistCarrierAssignment, storesById]);

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
      await load();
      toast.success(status === "APPROVED" ? "Pedido aprovado com sucesso." : "Pedido rejeitado com sucesso.");
    } catch (error) {
      toast.error(`Falha na revisao: ${error.message}`);
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
    let preparedOrder = order;

    if (!String(order?.shipday_order_id || "").trim()) {
      try {
        const shipdayBootstrap = await createShipdayOrderForOrder({ orderId: order.id });
        const bootstrapShipdayId = String(shipdayBootstrap?.shipdayOrderId || "").trim();

        if (!bootstrapShipdayId) {
          throw new Error("Nao foi possivel preparar o pedido no Shipday para atribuicao.");
        }

        preparedOrder = {
          ...order,
          shipday_order_id: bootstrapShipdayId,
        };
        await load();
      } catch (error) {
        toast.error(error?.message || "Falha ao preparar pedido no Shipday.");
        return;
      }
    }

    setCarrierModal({
      open: true,
      order: preparedOrder,
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
      await persistCarrierAssignment(currentOrder, carrier);

      await load();
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
      toast.error(shipdayResult?.error || "Falha ao desassociar estafeta no Shipday.");
      return;
    }

    const persistResult = await persistAcceptedCarrierReset(order.id);

    if (!persistResult.ok) {
      toast.error(persistResult.error?.message || "Falha ao desassociar estafeta.");
      return;
    }

    applyAcceptedCarrierResetLocally(order.id, persistResult.data?.updated_at || null);
    toast.success(`Estafeta desassociado do pedido #${order.id}.`);
    await load();
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

  const handleToggleAutoAssign = async (store, nextValue) => {
    const updatedStore = await updateRestaurantAdminSettings(store.idloja, {
      atribuicao_automatica_estafeta: nextValue,
      configuracao_auto_assign: {
        enabled: nextValue,
        criteria: sanitizeAutoAssignConfig(
          store?.configuracao_auto_assign,
          Boolean(nextValue),
        ).criteria,
      },
    });
    syncUpdatedStore(updatedStore);
  };

  const handleSaveAutoAssignConfig = async (store, config) => {
    const updatedStore = await updateRestaurantAdminSettings(store.idloja, {
      configuracao_auto_assign: {
        enabled: Boolean(store?.atribuicao_automatica_estafeta),
        criteria: sanitizeAutoAssignConfig(config, Boolean(store?.atribuicao_automatica_estafeta)).criteria,
      },
    });
    syncUpdatedStore(updatedStore);
  };

  const handleSaveCommissionSettings = async (store, payload) => {
    const updatedStore = await updateRestaurantAdminSettings(store.idloja, payload);
    syncUpdatedStore(updatedStore);
  };

  const handleSaveScheduleSettings = async (store, horario_funcionamento) => {
    const updatedStore = await updateRestaurantAdminSettings(store.idloja, {
      horario_funcionamento,
    });
    syncUpdatedStore(updatedStore);
  };

  const handleSaveDeliveryPricingSettings = async (store, configuracao_entrega) => {
    const updatedStore = await updateRestaurantAdminSettings(store.idloja, {
      configuracao_entrega,
    });
    syncUpdatedStore(updatedStore);
  };

  const handleSaveGlobalDeliveryPricingSettings = async (configuracaoEntrega) => {
    const settings = await saveGlobalDeliveryPricingSettings(configuracaoEntrega);
    setGlobalDeliveryPricing({
      config: settings?.config || null,
      updated_at: settings?.updated_at || null,
      loading: false,
      error: "",
    });
  };

  const handleToggleGlobalAutoAssign = async (nextValue) => {
    const settings = await saveGlobalAutoAssignSettings({
      enabled: nextValue,
      criteria: globalAutoAssign.criteria,
    });
    setGlobalAutoAssign({
      enabled: Boolean(settings?.enabled),
      criteria: sanitizeAutoAssignConfig(settings, Boolean(settings?.enabled)).criteria,
      updated_at: settings?.updated_at || null,
      loading: false,
      error: "",
    });
  };

  const handleSaveGlobalAutoAssignSettings = async (config) => {
    const settings = await saveGlobalAutoAssignSettings({
      enabled: Boolean(globalAutoAssign.enabled),
      criteria: sanitizeAutoAssignConfig(config, Boolean(globalAutoAssign.enabled)).criteria,
    });
    setGlobalAutoAssign({
      enabled: Boolean(settings?.enabled),
      criteria: sanitizeAutoAssignConfig(settings, Boolean(settings?.enabled)).criteria,
      updated_at: settings?.updated_at || null,
      loading: false,
      error: "",
    });
  };

  const handleAdminOrderAction = async (order, toEstado) => {
    setUpdatingOrderId(String(order?.id || ""));

    try {
      const result = await updateOrderWorkflowStatus(order.id, toEstado, order?.loja_id ?? null, { syncShipday: true });

      if (result?.shipdaySync && !result.shipdaySync.ok && !result.shipdaySync.skipped) {
        toast.error(`Pedido atualizado no PedeJa, mas falhou sync Shipday: ${result.shipdaySync.error || "erro desconhecido"}`);
      } else {
        toast.success(`Pedido #${order.id} atualizado para ${getEstadoInternoLabelPt(toEstado)}.`);
      }

      if (toEstado === "aceite") {
        const refreshedOrder = {
          ...order,
          ...result?.order,
          shipday_order_id: result?.shipdaySync?.shipdayOrderId || result?.order?.shipday_order_id || order?.shipday_order_id || "",
        };
        await runAutoAssignForOrder(refreshedOrder, { silent: false });
      }

      await load();
    } catch (error) {
      toast.error(`Falha a atualizar estado: ${error.message}`);
    } finally {
      setUpdatingOrderId("");
    }
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
          <select
            value={rangeMode === "custom" ? "custom" : String(periodDays)}
            onChange={(event) => {
              if (event.target.value === "custom") {
                setRangeMode("custom");
                return;
              }

              setRangeMode("preset");
              setPeriodDays(Number(event.target.value));
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
                  onChange={(value) => setCustomRange((prev) => ({ ...prev, from: value }))}
                />
              </label>
              <label className="dashboard-range-field">
                <span className="muted">Ate</span>
                <DatePickerCustom
                  mode="datetime"
                  placeholder="Selecionar fim"
                  value={customRange.to}
                  min={customRange.from || null}
                  onChange={(value) => setCustomRange((prev) => ({ ...prev, to: value }))}
                />
              </label>
            </div>
          ) : null}
          <button
            className="btn-dashboard"
            onClick={() => (activeTab === "customers" ? loadCustomerInsights() : load())}
          >
            Atualizar
          </button>
          <button className="btn-dashboard secondary" onClick={() => navigate(`/dashboard/admin/performance?${performanceSearch}`)}>
            Performance
          </button>
          <button className="btn-dashboard secondary" onClick={() => navigate(`/dashboard/admin/geoboard?${performanceSearch}`)}>
            Live Geo
          </button>
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
              <div className="metric-value">{safeFixed(state?.metrics?.totalRevenue, 2)}EUR</div>
              <div className="metric-foot">Abrir detalhe da receita</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-label">Pedidos</div>
              <div className="metric-value">{state.metrics.totalOrders}</div>
              <div className="metric-foot">Volume total</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-label">Agendados</div>
              <div className="metric-value">{state.metrics.scheduledOrders}</div>
              <div className="metric-foot">Ainda fora da fila imediata</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-label">Ticket medio</div>
              <div className="metric-value">{safeFixed(state?.metrics?.avgTicket, 2)}EUR</div>
              <div className="metric-foot">Valor por pedido</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-label">Entrega concluida</div>
              <div className="metric-value">{safeFixed(state?.metrics?.deliveredRate, 1)}%</div>
              <div className="metric-foot">Qualidade operacional</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-label">Cancelamento</div>
              <div className="metric-value">{safeFixed(state?.metrics?.cancelRate, 1)}%</div>
              <div className="metric-foot">Risco de churn</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-label">Entregas ativas</div>
              <div className="metric-value">{state.metrics.activeDeliveries}</div>
              <div className="metric-foot">Agora</div>
            </article>
          </section>

          <section className="panel-grid admin-top-grid">
            <LiveOperationsBoard
              mode="admin"
              orders={safeImmediateOrders}
              carriers={liveCarrierEntries}
              stores={ensureObjectArray(state?.stores)}
              onOpenDetails={() => navigate(`/dashboard/admin/geoboard?${performanceSearch}`)}
              openDetailsLabel="Abrir painel completo"
            />

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
                    {safeSlaAlerts.map((alert) => (
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
                    {!state.loading && safeSlaAlerts.length === 0 ? (
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
                <h3>Pedidos agendados</h3>
                <p className="muted">Entram automaticamente na fila imediata 30 minutos antes da entrega prevista.</p>
              </div>
            </div>

            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Loja</th>
                    <th>Cliente</th>
                    <th>Entrega prevista</th>
                    <th>Operacao</th>
                    <th>Total</th>
                    <th>Estado</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {safeScheduledOrders.slice(0, 14).map((order) => {
                    const estadoInterno = resolveOrderEstadoInterno(order);
                    const canCancelOrder = !["entregue", "cancelado"].includes(estadoInterno);
                    const scheduledStateView = getScheduledOperationalStateView(order);

                    return (
                      <tr
                        key={`scheduled-${order.id}`}
                        className="is-clickable-row"
                        tabIndex={0}
                        onClick={() => openOrderDetailModal(order.id)}
                        onKeyDown={(event) => handleRowKeyDown(event, () => openOrderDetailModal(order.id))}
                      >
                        <td>{String(order.id).slice(0, 8)}</td>
                        <td>{storeNameById.get(String(order.loja_id)) || `Loja ${order.loja_id || "-"}`}</td>
                        <td>{order.customer_nome || "-"}</td>
                        <td>{formatOrderDeliverySlot(order.scheduled_for || order.created_at)}</td>
                        <td>
                          {scheduledStateView ? <span className={scheduledStateView.className}>{scheduledStateView.label}</span> : "-"}
                        </td>
                        <td>{Number(order.total || 0).toFixed(2)}EUR</td>
                        <td><span className={getEstadoInternoTagClass(estadoInterno)}>{getEstadoInternoLabelPt(estadoInterno)}</span></td>
                        <td>
                          {canCancelOrder ? (
                            <button
                              className="btn-dashboard small secondary"
                              disabled={updatingOrderId === String(order.id)}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleAdminOrderAction(order, "cancelado");
                              }}
                            >
                              {updatingOrderId === String(order.id) ? "..." : "Cancelar Pedido"}
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {!state.loading && safeScheduledOrders.length === 0 ? (
                    <tr><td colSpan={8}>Sem pedidos agendados nesta janela.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel">
            <div className="panel-header-inline">
              <div>
                <h3>Pedidos imediatos</h3>
                <p className="muted">Pedidos ativos agora, incluindo os agendados que ja entraram na janela operacional.</p>
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
                  {safeImmediateOrders.slice(0, 14).map((order) => {
                    const estadoInterno = resolveOrderEstadoInterno(order);
                    const latestDelivery = latestDeliveryByOrderId.get(String(order.id));
                    const rowHasAssignedDriver = hasAssignedDriver(order);
                    const canAssign = estadoInterno === "aceite" && !rowHasAssignedDriver;
                    const canUnassignDriver = rowHasAssignedDriver && !["entregue", "cancelado"].includes(estadoInterno);
                    const canCancelOrder = !["entregue", "cancelado"].includes(estadoInterno);
                    const hasAnyAction = Boolean(canAssign || canUnassignDriver || canCancelOrder);
                    const resolvedDriverName = order.driver_name || order.shipday_driver_name || "";
                    const resolvedDriverPhone = order.driver_phone || order.shipday_driver_phone || "";
                    const hasDriverAlert = slaBreachedOrderIds.has(String(order.id)) || isDriverAssignmentSlaBreached(order);
                    const driverText = estadoInterno === "cancelado"
                      ? "-"
                      : (resolvedDriverName
                      ? `${resolvedDriverName}${resolvedDriverPhone ? ` (${resolvedDriverPhone})` : ""}`
                      : (resolvedDriverPhone || "-"));
                    const trackingUrl = estadoInterno === "cancelado"
                      ? null
                      : (order.shipday_tracking_url || latestDelivery?.tracking_url || null);

                    return (
                      <tr
                        key={order.id}
                        className={`is-clickable-row${hasDriverAlert ? " order-row-sla-alert" : ""}`}
                        tabIndex={0}
                        onClick={() => openOrderDetailModal(order.id)}
                        onKeyDown={(event) => handleRowKeyDown(event, () => openOrderDetailModal(order.id))}
                      >
                        <td>{String(order.id).slice(0, 8)}</td>
                        <td>{storeNameById.get(String(order.loja_id)) || `Loja ${order.loja_id || "-"}`}</td>
                        <td>{order.customer_nome || "-"}</td>
                        <td>{Number(order.total || 0).toFixed(2)}EUR</td>
                        <td>
                          <span className={getEstadoInternoTagClass(estadoInterno)}>
                            {getEstadoInternoLabelPt(estadoInterno)}
                          </span>
                          {hasDriverAlert ? <span className="table-alert-indicator" title="Pedido aceite sem estafeta ha mais de 10 minutos.">!</span> : null}
                        </td>
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

                              {canCancelOrder ? (
                                <button
                                  className="btn-dashboard small secondary"
                                  disabled={updatingOrderId === String(order.id)}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleAdminOrderAction(order, "cancelado");
                                  }}
                                >
                                  {updatingOrderId === String(order.id) ? "..." : "Cancelar Pedido"}
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

                  {!state.loading && safeImmediateOrders.length === 0 ? (
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
                  {safeDeliveries.slice(0, 14).map((delivery) => {
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
                  {!state.loading && safeDeliveries.length === 0 ? (
                    <tr><td colSpan={5}>Sem entregas nesta janela.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      ) : null}

      {activeTab === "customers" ? (
        <div className="dashboard-stack">
          <section className="dashboard-grid premium-grid">
            <article className="metric-card premium">
              <div className="metric-label">Clientes registados</div>
              <div className="metric-value">{customerInsights.metrics.totalCustomers}</div>
              <div className="metric-foot">Base de clientes sem contas staff/admin</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-label">Clientes com pedidos</div>
              <div className="metric-value">{customerInsights.metrics.customersWithOrders}</div>
              <div className="metric-foot">Pelo menos uma compra na janela selecionada</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-label">Ativos 30 dias</div>
              <div className="metric-value">{customerInsights.metrics.activeCustomers30d}</div>
              <div className="metric-foot">Clientes com pedido recente</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-label">Pedidos</div>
              <div className="metric-value">{customerInsights.metrics.totalOrders}</div>
              <div className="metric-foot">Total da janela selecionada</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-label">Receita clientes</div>
              <div className="metric-value">{safeFixed(customerInsights?.metrics?.totalSpent, 2)}EUR</div>
              <div className="metric-foot">Gasto acumulado dos clientes</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-label">Ticket medio</div>
              <div className="metric-value">{safeFixed(customerInsights?.metrics?.avgTicket, 2)}EUR</div>
              <div className="metric-foot">Media por pedido cliente</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-label">LTV medio cliente</div>
              <div className="metric-value">{safeFixed(customerInsights?.metrics?.avgSpentPerCustomer, 2)}EUR</div>
              <div className="metric-foot">Media de gasto por cliente comprador</div>
            </article>
          </section>

          {customerInsights.error ? <p className="shipday-inline-error">{customerInsights.error}</p> : null}

          <article className="panel">
            <div className="panel-header-inline">
              <div>
                <h3>Clientes da plataforma</h3>
                <p className="muted">
                  Vista sem dados privados sensiveis. Inclui comportamento de compra, ticket medio e restaurante favorito.
                </p>
              </div>

              <label className="dashboard-toolbar-field customer-search-field">
                <span className="muted">Pesquisar cliente</span>
                <input
                  type="text"
                  placeholder="Nome, email mascarado ou loja favorita"
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                />
              </label>
            </div>

            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Email</th>
                    <th>Membro desde</th>
                    <th>Pedidos</th>
                    <th>Gasto</th>
                    <th>Ticket medio</th>
                    <th>Restaurante favorito</th>
                    <th>Pico semanal</th>
                    <th>Pico horario</th>
                    <th>Ultimo pedido</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((customer) => (
                    <tr key={customer.customer_id}>
                      <td>{customer.name}</td>
                      <td>{customer.email_masked || "-"}</td>
                      <td>{customer.member_since ? new Date(customer.member_since).toLocaleDateString("pt-PT") : "-"}</td>
                      <td>{customer.orders_count}</td>
                      <td>{Number(customer.total_spent || 0).toFixed(2)}EUR</td>
                      <td>{Number(customer.avg_ticket || 0).toFixed(2)}EUR</td>
                      <td>{customer.favorite_store_name || "-"}</td>
                      <td>{customer.peak_weekday !== "-" ? `${customer.peak_weekday} (${customer.peak_weekday_orders})` : "-"}</td>
                      <td>{customer.peak_hour !== "-" ? `${customer.peak_hour} (${customer.peak_hour_orders})` : "-"}</td>
                      <td>{customer.last_order_at ? new Date(customer.last_order_at).toLocaleString("pt-PT") : "-"}</td>
                    </tr>
                  ))}

                  {!customerInsights.loading && filteredCustomers.length === 0 ? (
                    <tr><td colSpan={10}>Sem clientes para mostrar com os filtros atuais.</td></tr>
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
            globalAutoAssignEnabled={globalAutoAssign.enabled}
            globalAutoAssignConfig={globalAutoAssign}
            globalAutoAssignLoading={globalAutoAssign.loading}
            toolbar={managementToolbar}
            commissionCatalogByStore={commissionCatalogByStore}
            catalogLoadingByStore={catalogLoadingByStore}
            catalogErrorByStore={catalogErrorByStore}
            onToggleGlobalAutoAssign={handleToggleGlobalAutoAssign}
            onSaveGlobalAutoAssignSettings={handleSaveGlobalAutoAssignSettings}
            onToggleAutoAccept={handleToggleAutoAccept}
            onToggleAutoAssign={handleToggleAutoAssign}
            onSaveAutoAssignConfig={handleSaveAutoAssignConfig}
            onSaveCommissionSettings={handleSaveCommissionSettings}
          />

          <StoreDeliveryPricingPanel
            stores={managementStores}
            globalConfig={globalDeliveryPricing.config}
            loading={state.loading || globalDeliveryPricing.loading}
            canEdit
            onSaveGlobalDeliveryPricingSettings={handleSaveGlobalDeliveryPricingSettings}
            onSaveDeliveryPricingSettings={handleSaveDeliveryPricingSettings}
          />

          {globalDeliveryPricing.error ? (
            <p className="shipday-inline-error">{globalDeliveryPricing.error}</p>
          ) : null}

          {globalAutoAssign.error ? (
            <p className="shipday-inline-error">{globalAutoAssign.error}</p>
          ) : null}

          <StoreSpecialHoursPanel
            stores={managementStores}
            loading={state.loading}
            canEdit
            onSaveScheduleSettings={handleSaveScheduleSettings}
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
                    {safeStorePerformance.map((store) => (
                      <tr key={store.lojaId}>
                        <td>{store.lojaNome}</td>
                        <td>{store.orders}</td>
                        <td>{safeFixed(store?.revenue, 2)}EUR</td>
                        <td>{safeFixed(store?.avgTicket, 2)}EUR</td>
                        <td><span className="tag ok">{safeFixed(store?.deliveredRate, 1)}%</span></td>
                        <td>
                          <button className="btn-dashboard small" onClick={() => openRestaurantDashboard(store.lojaId)}>
                            Abrir
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!state.loading && safeStorePerformance.length === 0 ? (
                      <tr><td colSpan={6}>Sem dados de lojas.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>

            <AdminRestaurantAssociation stores={state.stores} onLinked={() => load()} />
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
                  {safeRequests.map((request) => {
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
                  {!state.loading && safeRequests.length === 0 ? (
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

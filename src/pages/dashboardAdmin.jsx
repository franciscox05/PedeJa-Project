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
import DashboardPageHeader from "../components/dashboard/DashboardPageHeader";
import DashboardPanel from "../components/dashboard/DashboardPanel";
import DashboardEmptyState from "../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../components/dashboard/DashboardLoadingState";
import { ADMIN_DASHBOARD_TABS } from "../constants/adminDashboardTabs";
import RestaurantManagementPanel from "../components/dashboard/RestaurantManagementPanel";
import StoreDeliveryPricingPanel from "../components/dashboard/StoreDeliveryPricingPanel";
import StoreSpecialHoursPanel from "../components/dashboard/StoreSpecialHoursPanel";
import InHouseTrackingModal from "../components/dashboard/InHouseTrackingModal";
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
  assignDeliveryToEstafeta,
  buildEstafetaBoardEntries,
  listActiveAtribuicoes,
  listEstafetasForDispatch,
} from "../services/estafetaService";
import { sanitizeAutoAssignConfig } from "../services/autoAssignConfig";

const ACCEPTED_WITHOUT_DRIVER_SLA_MS = 10 * 60 * 1000;

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

function readUserFromStorageSafe(raw) {
  try {
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
  return Boolean(String(order?.driver_name || "").trim());
}

function isDriverAssignmentSlaBreached(order) {
  if (resolveOrderEstadoInterno(order) !== "aceite") return false;
  if (hasAssignedDriver(order)) return false;

  const acceptedAt = new Date(order?.aceite_em || order?.updated_at || order?.created_at || 0).getTime();
  if (!Number.isFinite(acceptedAt)) return false;

  return Date.now() - acceptedAt >= ACCEPTED_WITHOUT_DRIVER_SLA_MS;
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

export default function DashboardAdmin() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const userRaw = localStorage.getItem("pedeja_user");
  // Memoized on the raw string (not recomputed into a fresh object every render) so useCallback
  // deps that include `user` don't recreate on every render and re-trigger their effects in a loop.
  const user = useMemo(() => readUserFromStorageSafe(userRaw), [userRaw]);
  const queryStoreId = searchParams.get("loja") || "";
  const queryTab = searchParams.get("tab") || "";
  const initialTab = ADMIN_DASHBOARD_TABS.some((tab) => tab.id === queryTab) ? queryTab : "dashboard";

  const [activeTab, setActiveTab] = useState(initialTab);
  const [periodDays, setPeriodDays] = useState(7);
  const [rangeMode, setRangeMode] = useState("preset");
  const [customRange, setCustomRange] = useState({ from: "", to: "" });
  const [reviewingId, setReviewingId] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState("");
  const [highlightedOrderId, setHighlightedOrderId] = useState("");
  const [pendingScrollAnchor, setPendingScrollAnchor] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState(queryStoreId);
  const [storeSearch, setStoreSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [expandedRequestId, setExpandedRequestId] = useState("");
  const [inHouseTrackingModal, setInHouseTrackingModal] = useState({ open: false, orderId: null, title: "", isLive: false });
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
  const [liveEstafetas, setLiveEstafetas] = useState([]);
  const [liveAtribuicoes, setLiveAtribuicoes] = useState([]);
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
  // Garante que a loja em edicao nunca desaparece do dropdown so porque o texto de
  // pesquisa deixou de a incluir -- evita a troca de contexto reportada como bug.
  const storePickerOptions = useMemo(() => {
    if (!selectedStore) return filteredStoresForPicker;
    const alreadyIncluded = filteredStoresForPicker.some(
      (store) => String(store.idloja) === String(selectedStore.idloja),
    );
    return alreadyIncluded ? filteredStoresForPicker : [selectedStore, ...filteredStoresForPicker];
  }, [filteredStoresForPicker, selectedStore]);
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
      return buildEstafetaBoardEntries(liveEstafetas, liveAtribuicoes, ensureObjectArray(state?.stores));
    } catch (error) {
      console.error("Live Geo Board falhou ao normalizar dados dos estafetas", error);
      return [];
    }
  }, [liveEstafetas, liveAtribuicoes, state?.stores]);
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
  const driverAlertOrders = useMemo(
    () => safeImmediateOrders.filter(
      (order) => slaBreachedOrderIds.has(String(order.id)) || isDriverAssignmentSlaBreached(order),
    ),
    [safeImmediateOrders, slaBreachedOrderIds],
  );
  const failedDeliveries = useMemo(
    () => safeDeliveries.filter((delivery) => String(delivery?.status || "").toUpperCase() === "FAILED"),
    [safeDeliveries],
  );
  const dispatchInternoLojaIds = useMemo(
    () => new Set(
      ensureObjectArray(state?.stores)
        .filter((store) => store?.dispatch_interno_ativo)
        .map((store) => String(store?.idloja || ""))
        .filter(Boolean),
    ),
    [state.stores],
  );
  const unassignedOrders = useMemo(
    () => safeImmediateOrders.filter(
      (order) => dispatchInternoLojaIds.has(String(order?.loja_id))
        && ["pendente", "aceite"].includes(resolveOrderEstadoInterno(order))
        && !hasAssignedDriver(order),
    ),
    [safeImmediateOrders, dispatchInternoLojaIds],
  );
  const tabsWithBadges = useMemo(
    () => ADMIN_DASHBOARD_TABS.map((tab) => {
      if (tab.id === "dashboard") return { ...tab, badge: safeSlaAlerts.length || undefined };
      if (tab.id === "restaurants") return { ...tab, badge: safeRequests.length || undefined };
      if (tab.id === "estafetas") return { ...tab, badge: unassignedOrders.length || undefined };
      return tab;
    }),
    [safeSlaAlerts, safeRequests, unassignedOrders],
  );

  useEffect(() => {
    if (ADMIN_DASHBOARD_TABS.some((tab) => tab.id === queryTab)) {
      setActiveTab(queryTab);
    }
  }, [queryTab]);

  useEffect(() => {
    // O painel alvo (ex. aprovacoes de restaurantes) so existe no DOM depois do
    // separador mudar e re-renderizar -- so faz o scroll nesse momento.
    if (!pendingScrollAnchor) return;
    const timer = setTimeout(() => {
      scrollToSection(pendingScrollAnchor);
      setPendingScrollAnchor("");
    }, 60);
    return () => clearTimeout(timer);
  }, [activeTab, pendingScrollAnchor]);

  useEffect(() => {
    // Nao usar filteredStoresForPicker aqui: e a lista estreitada pela pesquisa, e
    // trocar a loja selecionada so porque o texto de pesquisa deixou de bater certo
    // com ela descartava silenciosamente o contexto/edicoes em curso do admin.
    if (!storesOrderedById.length) {
      if (selectedStoreId) setSelectedStoreId("");
      return;
    }

    const existsInFullList = storesOrderedById.some(
      (store) => String(store.idloja) === String(selectedStoreId),
    );

    if (!selectedStoreId || !existsInFullList) {
      const firstStoreId = storesOrderedById[0]?.idloja;
      setSelectedStoreId(firstStoreId ? String(firstStoreId) : "");
    }
  }, [storesOrderedById, selectedStoreId]);

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

  const scrollToImmediateOrder = (orderId) => {
    if (!orderId) return;
    const row = document.getElementById(`immediate-order-${orderId}`);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedOrderId(String(orderId));
    setTimeout(() => {
      setHighlightedOrderId((current) => (current === String(orderId) ? "" : current));
    }, 1500);
  };

  const scrollToSection = (anchorId) => {
    document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const closeInHouseTrackingModal = () => {
    setInHouseTrackingModal({ open: false, orderId: null, title: "", isLive: false });
  };

  const openInHouseTrackingModal = ({ orderId, title, isLive }) => {
    if (!orderId) return;
    setInHouseTrackingModal({ open: true, orderId, title: title || "Tracking em tempo real", isLive: Boolean(isLive) });
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
      const data = await fetchAdminDashboard(input, { user });
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
  }, [dashboardWindowInput, queryStoreId, user]);

  const loadCustomerInsights = useCallback(async (input = dashboardWindowInput) => {
    setCustomerInsights((prev) => ({
      ...prev,
      loading: true,
      error: "",
    }));

    try {
      const data = await fetchAdminCustomerInsights(input, extractUserId(user));
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
  }, [dashboardWindowInput, user]);

  const loadLiveCarriers = useCallback(async () => {
    try {
      const callerUserId = extractUserId(user);
      const [estafetasData, activeAtribuicoesData] = await Promise.all([
        listEstafetasForDispatch(callerUserId),
        listActiveAtribuicoes(callerUserId),
      ]);
      setLiveEstafetas(ensureArray(estafetasData));
      setLiveAtribuicoes(ensureArray(activeAtribuicoesData));
    } catch (error) {
      console.error("Falha ao carregar estafetas online para o live board", error);
      setLiveEstafetas([]);
      setLiveAtribuicoes([]);
    }
  }, [user]);

  const anyModalOpenRef = useRef(false);
  useEffect(() => {
    anyModalOpenRef.current = Boolean(
      inHouseTrackingModal.open || orderDetailModal.open || carrierModal.open,
    );
  });

  useEffect(() => {
    load();
    // Nao recarregar em fundo enquanto ha um modal aberto -- evita que as tabelas
    // por baixo mudem/reordenem silenciosamente enquanto o admin le um detalhe.
    const timer = setInterval(() => {
      if (!anyModalOpenRef.current) load();
    }, 15000);
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
      const carriers = await listEstafetasForDispatch(extractUserId(user));
      const availableCarriers = ensureArray(carriers).filter((carrier) => carrier.ativo && carrier.disponivel);
      setCarrierModal((prev) => ({
        ...prev,
        carriers: availableCarriers,
        loading: false,
        error: availableCarriers.length === 0 ? "Sem estafetas disponiveis para atribuicao." : "",
      }));
    } catch (error) {
      setCarrierModal((prev) => ({
        ...prev,
        loading: false,
        carriers: [],
        error: error?.message || "Falha ao carregar estafetas.",
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
      await assignDeliveryToEstafeta(extractUserId(user), currentOrder.id, carrier.id);

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
    }, extractUserId(user));
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
    }, extractUserId(user));
    syncUpdatedStore(updatedStore);
  };

  const handleSaveAutoAssignConfig = async (store, config) => {
    const updatedStore = await updateRestaurantAdminSettings(store.idloja, {
      configuracao_auto_assign: {
        enabled: Boolean(store?.atribuicao_automatica_estafeta),
        criteria: sanitizeAutoAssignConfig(config, Boolean(store?.atribuicao_automatica_estafeta)).criteria,
      },
    }, extractUserId(user));
    syncUpdatedStore(updatedStore);
  };

  const handleSaveCommissionSettings = async (store, payload) => {
    const updatedStore = await updateRestaurantAdminSettings(store.idloja, payload, extractUserId(user));
    syncUpdatedStore(updatedStore);
  };

  const handleSaveScheduleSettings = async (store, horario_funcionamento) => {
    const updatedStore = await updateRestaurantAdminSettings(store.idloja, {
      horario_funcionamento,
    }, extractUserId(user));
    syncUpdatedStore(updatedStore);
  };

  const handleSaveDeliveryPricingSettings = async (store, configuracao_entrega) => {
    const updatedStore = await updateRestaurantAdminSettings(store.idloja, {
      configuracao_entrega,
    }, extractUserId(user));
    syncUpdatedStore(updatedStore);
  };

  const handleSaveGlobalDeliveryPricingSettings = async (configuracaoEntrega) => {
    const settings = await saveGlobalDeliveryPricingSettings(configuracaoEntrega, extractUserId(user));
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
    }, extractUserId(user));
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
    }, extractUserId(user));
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
      await updateOrderWorkflowStatus(order.id, toEstado, order?.loja_id ?? null, {
        callerUserId: extractUserId(user),
      });

      toast.success(`Pedido #${order.id} atualizado para ${getEstadoInternoLabelPt(toEstado)}.`);

      await load();
    } catch (error) {
      toast.error(`Falha a atualizar estado: ${error.message}`);
    } finally {
      setUpdatingOrderId("");
    }
  };

  return (
    <DashboardSidebarLayout
      kicker="PedeJa Control Center"
      title="Admin Command Dashboard"
      subtitle="Menu lateral retratil para pedidos, restaurantes e campanhas."
      tabs={tabsWithBadges}
      activeTab={activeTab}
      onTabChange={(tabId) => {
        const tab = ADMIN_DASHBOARD_TABS.find((entry) => entry.id === tabId);
        if (tab?.route) {
          navigate(tab.route);
          return;
        }
        setActiveTab(tabId);
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set("tab", tabId);
            return next;
          },
          { replace: true },
        );
      }}
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
      <DashboardPageHeader
        kicker="PedeJa Control Center"
        title="Admin Command Dashboard"
        actions={(
          <>
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
          </>
        )}
      />

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

          {safeSlaAlerts.length > 0 || safeRequests.length > 0 || driverAlertOrders.length > 0 || failedDeliveries.length > 0 ? (
            <DashboardPanel
              title="Precisa de atencao"
              description="Resumo rapido do que esta a bloquear a operacao agora."
              className="attention-panel"
            >
              <div className="attention-chip-row">
                <button
                  type="button"
                  className={`attention-chip attention-chip--alert${safeSlaAlerts.length === 0 ? " is-disabled" : ""}`}
                  disabled={safeSlaAlerts.length === 0}
                  onClick={() => scrollToSection("dashboard-tab-sla-panel")}
                >
                  <span className="attention-chip-value">{safeSlaAlerts.length}</span>
                  <span className="attention-chip-label">
                    {safeSlaAlerts.length === 1 ? "pedido com SLA excedido" : "pedidos com SLA excedido"}
                  </span>
                </button>
                <button
                  type="button"
                  className={`attention-chip attention-chip--action${safeRequests.length === 0 ? " is-disabled" : ""}`}
                  disabled={safeRequests.length === 0}
                  onClick={() => {
                    setPendingScrollAnchor("restaurant-approvals-panel");
                    setActiveTab("restaurants");
                  }}
                >
                  <span className="attention-chip-value">{safeRequests.length}</span>
                  <span className="attention-chip-label">
                    {safeRequests.length === 1 ? "pedido de restaurante pendente" : "pedidos de restaurante pendentes"}
                  </span>
                </button>
                <button
                  type="button"
                  className={`attention-chip attention-chip--alert${driverAlertOrders.length === 0 ? " is-disabled" : ""}`}
                  disabled={driverAlertOrders.length === 0}
                  onClick={() => (driverAlertOrders[0]?.id
                    ? scrollToImmediateOrder(driverAlertOrders[0].id)
                    : scrollToSection("immediate-orders-panel"))}
                >
                  <span className="attention-chip-value">{driverAlertOrders.length}</span>
                  <span className="attention-chip-label">
                    {driverAlertOrders.length === 1 ? "pedido sem estafeta" : "pedidos sem estafeta"}
                  </span>
                </button>
                <button
                  type="button"
                  className={`attention-chip attention-chip--alert${failedDeliveries.length === 0 ? " is-disabled" : ""}`}
                  disabled={failedDeliveries.length === 0}
                  onClick={() => scrollToSection("recent-deliveries-panel")}
                >
                  <span className="attention-chip-value">{failedDeliveries.length}</span>
                  <span className="attention-chip-label">
                    {failedDeliveries.length === 1 ? "entrega falhada" : "entregas falhadas"}
                  </span>
                </button>
              </div>
            </DashboardPanel>
          ) : (
            <DashboardEmptyState label="Tudo em ordem. Sem alertas de SLA, pedidos de restaurante, estafetas ou entregas por rever." />
          )}

          <section className="panel-grid admin-top-grid">
            <LiveOperationsBoard
              mode="admin"
              orders={safeImmediateOrders}
              carriers={liveCarrierEntries}
              stores={ensureObjectArray(state?.stores)}
              onOpenDetails={() => navigate(`/dashboard/admin/geoboard?${performanceSearch}`)}
              openDetailsLabel="Abrir painel completo"
              hideOrdersTable
            />

            <DashboardPanel
              id="dashboard-tab-sla-panel"
              title="Alertas SLA"
              description="Pedidos acima do tempo limite por estado."
              className="sla-panel"
            >
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
                    {state.loading && safeSlaAlerts.length === 0 ? (
                      <DashboardLoadingState as="tableRow" colSpan={5} />
                    ) : (
                      <>
                        {safeSlaAlerts.map((alert) => (
                          <tr
                            key={alert.id}
                            className="is-clickable-row"
                            tabIndex={0}
                            title="Ver este pedido em Pedidos imediatos"
                            onClick={() => scrollToImmediateOrder(alert.id)}
                            onKeyDown={(event) => handleRowKeyDown(event, () => scrollToImmediateOrder(alert.id))}
                          >
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
                          <DashboardEmptyState as="tableRow" colSpan={5} label="Sem alertas de SLA para mostrar." />
                        ) : null}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </DashboardPanel>
          </section>

          <section className="panel-grid analytics-grid">
            <TrendBars title="Receita por dia" data={dailyRevenue} valueKey="value" labelKey="label" suffix=" EUR" />
            <TrendBars title="Procura por hora" data={hourlyDemand} valueKey="value" labelKey="label" />
          </section>

          <DashboardPanel
            title="Pedidos agendados"
            description="Entram automaticamente na fila imediata 30 minutos antes da entrega prevista."
          >
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
                  {state.loading && safeScheduledOrders.length === 0 ? (
                    <DashboardLoadingState as="tableRow" colSpan={8} />
                  ) : null}
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
                              className="btn-dashboard small danger"
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
                    <DashboardEmptyState as="tableRow" colSpan={8} label="Sem pedidos agendados nesta janela para mostrar." />
                  ) : null}
                </tbody>
              </table>
            </div>
          </DashboardPanel>

          <DashboardPanel
            id="immediate-orders-panel"
            title="Pedidos imediatos"
            description="Pedidos ativos agora, incluindo os agendados que ja entraram na janela operacional."
          >
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
                  {state.loading && safeImmediateOrders.length === 0 ? (
                    <DashboardLoadingState as="tableRow" colSpan={8} />
                  ) : null}
                  {safeImmediateOrders.slice(0, 14).map((order) => {
                    const estadoInterno = resolveOrderEstadoInterno(order);
                    const latestDelivery = latestDeliveryByOrderId.get(String(order.id));
                    const rowHasAssignedDriver = hasAssignedDriver(order);
                    const canAssign = estadoInterno === "aceite" && !rowHasAssignedDriver;
                    const canCancelOrder = !["entregue", "cancelado"].includes(estadoInterno);
                    const hasAnyAction = Boolean(canAssign || canCancelOrder);
                    const resolvedDriverName = order.driver_name || "";
                    const resolvedDriverPhone = order.driver_phone || "";
                    const hasDriverAlert = slaBreachedOrderIds.has(String(order.id)) || isDriverAssignmentSlaBreached(order);
                    const driverText = estadoInterno === "cancelado"
                      ? "-"
                      : (resolvedDriverName
                      ? `${resolvedDriverName}${resolvedDriverPhone ? ` (${resolvedDriverPhone})` : ""}`
                      : (resolvedDriverPhone || "-"));
                    const canOpenTracking = estadoInterno !== "cancelado" && Boolean(latestDelivery || rowHasAssignedDriver);

                    const isHighlighted = highlightedOrderId === String(order.id);

                    return (
                      <tr
                        key={order.id}
                        id={`immediate-order-${order.id}`}
                        className={`is-clickable-row${hasDriverAlert ? " order-row-sla-alert" : ""}${isHighlighted ? " order-row-highlighted" : ""}`}
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
                          {canOpenTracking ? (
                            <button
                              type="button"
                              className="dashboard-link-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openInHouseTrackingModal({
                                  orderId: order.id,
                                  title: `Tracking pedido #${order.id}`,
                                  isLive: !["entregue", "cancelado"].includes(estadoInterno),
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
                                  className="btn-dashboard small danger"
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
                    <DashboardEmptyState as="tableRow" colSpan={8} label="Sem pedidos para mostrar nesta janela." />
                  ) : null}
                </tbody>
              </table>
            </div>
          </DashboardPanel>

          <DashboardPanel
            id="recent-deliveries-panel"
            title="Entregas Recentes"
            description="Estados traduzidos para facilitar o acompanhamento operacional."
          >
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
                  {state.loading && safeDeliveries.length === 0 ? (
                    <DashboardLoadingState as="tableRow" colSpan={5} />
                  ) : null}
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
                            ? (delivery.provider_payload?.message
                              || delivery.provider_payload?.error
                              || "Erro na entrega")
                            : "-"}
                        </td>
                        <td>
                          {delivery.order_id ? (
                            <button
                              type="button"
                              className="dashboard-link-button"
                              onClick={() => openInHouseTrackingModal({
                                orderId: delivery.order_id,
                                title: `Tracking entrega #${delivery.id}`,
                                isLive: !["DELIVERED", "CANCELLED", "FAILED"].includes(rawDeliveryStatus),
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
                    <DashboardEmptyState as="tableRow" colSpan={5} label="Sem entregas para mostrar nesta janela." />
                  ) : null}
                </tbody>
              </table>
            </div>
          </DashboardPanel>
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

          <DashboardPanel
            title="Clientes da plataforma"
            description="Vista sem dados privados sensiveis. Inclui comportamento de compra, ticket medio e restaurante favorito."
            actions={(
              <label className="dashboard-toolbar-field customer-search-field">
                <span className="muted">Pesquisar cliente</span>
                <input
                  type="text"
                  placeholder="Nome, email mascarado ou loja favorita"
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                />
              </label>
            )}
          >
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
                  {customerInsights.loading && filteredCustomers.length === 0 ? (
                    <DashboardLoadingState as="tableRow" colSpan={10} />
                  ) : null}
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
                    <DashboardEmptyState as="tableRow" colSpan={10} label="Sem clientes para mostrar com os filtros atuais." />
                  ) : null}
                </tbody>
              </table>
            </div>
          </DashboardPanel>
        </div>
      ) : null}

      {activeTab === "restaurants" ? (
        <div className="dashboard-stack">
          <nav className="restaurants-jump-nav" aria-label="Saltar para seccao">
            <button type="button" className="btn-dashboard small secondary" onClick={() => scrollToSection("restaurant-commission-panel")}>
              Comissao
            </button>
            <button type="button" className="btn-dashboard small secondary" onClick={() => scrollToSection("restaurant-delivery-pricing-panel")}>
              Entrega
            </button>
            <button type="button" className="btn-dashboard small secondary" onClick={() => scrollToSection("restaurant-hours-panel")}>
              Horarios
            </button>
            <button type="button" className="btn-dashboard small secondary" onClick={() => scrollToSection("restaurant-approvals-panel")}>
              Aprovacoes
            </button>
          </nav>

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
                  {storePickerOptions.length === 0 ? (
                    <option value="">Sem resultados</option>
                  ) : (
                    storePickerOptions.map((store) => (
                      <option key={store.idloja} value={String(store.idloja)}>
                        {store.nome}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>
          </section>

          <section id="restaurant-commission-panel">
            <RestaurantManagementPanel
              title="Gestao de Restaurantes"
              subtitle="Escolhe o modo de comissao e define overrides globais, por categoria ou por prato."
              stores={managementStores}
              loading={state.loading}
              canEdit
              globalAutoAssignEnabled={globalAutoAssign.enabled}
              globalAutoAssignConfig={globalAutoAssign}
              globalAutoAssignLoading={globalAutoAssign.loading}
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
          </section>

          <section id="restaurant-delivery-pricing-panel">
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
          </section>

          <section id="restaurant-hours-panel">
            <StoreSpecialHoursPanel
              stores={managementStores}
              loading={state.loading}
              canEdit
              onSaveScheduleSettings={handleSaveScheduleSettings}
            />
          </section>

          <section className="panel-grid analytics-grid">
            <DashboardPanel title="Top lojas (performance)">
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
                    {state.loading && safeStorePerformance.length === 0 ? (
                      <DashboardLoadingState as="tableRow" colSpan={6} />
                    ) : null}
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
                      <DashboardEmptyState as="tableRow" colSpan={6} label="Sem dados de lojas para mostrar." />
                    ) : null}
                  </tbody>
                </table>
              </div>
            </DashboardPanel>

            <AdminRestaurantAssociation stores={state.stores} onLinked={() => load()} />
          </section>

          <DashboardPanel id="restaurant-approvals-panel" title="Aprovacoes de restaurantes">
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
                  {state.loading && safeRequests.length === 0 ? (
                    <DashboardLoadingState as="tableRow" colSpan={6} />
                  ) : null}
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
                    <DashboardEmptyState as="tableRow" colSpan={6} label="Sem pedidos pendentes para mostrar." />
                  ) : null}
                </tbody>
              </table>
            </div>
          </DashboardPanel>
        </div>
      ) : null}

      <InHouseTrackingModal
        isOpen={inHouseTrackingModal.open}
        title={inHouseTrackingModal.title}
        orderId={inHouseTrackingModal.orderId}
        callerUserId={extractUserId(user)}
        isLive={inHouseTrackingModal.isLive}
        onClose={closeInHouseTrackingModal}
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
                  Pedido #{carrierModal.order?.id || "-"}
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

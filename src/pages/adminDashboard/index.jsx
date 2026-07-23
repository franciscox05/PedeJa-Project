import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import "../../css/pages/dashboard.css";
import {
  fetchAdminDashboard,
  fetchAdminCustomerInsights,
  fetchGlobalAutoAssignSettings,
  fetchGlobalDeliveryPricingSettings,
  fetchGlobalCommissionSettings,
  saveGlobalDeliveryPricingSettings,
  saveGlobalAutoAssignSettings,
  saveGlobalCommissionSettings,
  fetchStoreCommissionCatalog,
  updateRestaurantAdminSettings,
  updateRestaurantSignupRequest,
  updateOrderWorkflowStatus,
} from "../../services/opsDashboardService";
import { fetchAdminRevenueBreakdown } from "../../services/adminRevenueService";
import DashboardSidebarLayout from "../../components/dashboard/DashboardSidebarLayout";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import InHouseTrackingModal from "../../components/dashboard/InHouseTrackingModal";
import OrderDetailsModal from "../../components/dashboard/OrderDetailsModal";
import DatePickerCustom from "../../components/ui/DatePickerCustom";
import { ADMIN_DASHBOARD_TABS } from "../../constants/adminDashboardTabs";
import { extractUserId } from "../../utils/roles";
import { getEstadoInternoLabelPt, resolveOrderEstadoInterno } from "../../services/orderStatusMapper";
import { fetchOrderDetails } from "../../services/orderDetailsService";
import {
  assignDeliveryToEstafeta,
  listEstafetasForDispatch,
} from "../../services/estafetaService";
import { sanitizeAutoAssignConfig } from "../../services/autoAssignConfig";
import {
  ensureArray,
  ensureObjectArray,
  normalizeAdminDashboardData,
  normalizeSearch,
  readUserFromStorageSafe,
  isDriverAssignmentSlaBreached,
  hasAssignedDriver,
  buildWindowInput,
} from "./helpers";
import OverviewTab from "./OverviewTab";
import CustomersTab from "./CustomersTab";
import RestaurantsTab from "./RestaurantsTab";
import CarrierAssignModal from "./modals/CarrierAssignModal";

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
  const [restaurantsRequestedSection, setRestaurantsRequestedSection] = useState("");
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
  const [globalCommission, setGlobalCommission] = useState({
    percent: 0,
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
  const [commissionEarned, setCommissionEarned] = useState({ loading: true, error: "", value: 0 });
  const dashboardWindowInput = useMemo(
    () => buildWindowInput({ rangeMode, periodDays, customRange }),
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
      const shouldLoadCommission = activeTab === "restaurants";

      if (shouldLoadDeliveryPricing) {
        setGlobalDeliveryPricing((prev) => ({
          ...prev,
          loading: true,
          error: "",
        }));
      }

      if (shouldLoadCommission) {
        setGlobalCommission((prev) => ({
          ...prev,
          loading: true,
          error: "",
        }));
      }

      try {
        const [deliverySettings, autoAssignSettings, commissionSettings] = await Promise.all([
          shouldLoadDeliveryPricing ? fetchGlobalDeliveryPricingSettings() : Promise.resolve(null),
          fetchGlobalAutoAssignSettings(),
          shouldLoadCommission ? fetchGlobalCommissionSettings() : Promise.resolve(null),
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

        if (shouldLoadCommission) {
          setGlobalCommission({
            percent: Number(commissionSettings?.percent || 0),
            updated_at: commissionSettings?.updated_at || null,
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

        if (shouldLoadCommission) {
          setGlobalCommission((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Nao foi possivel carregar a comissao base da plataforma.",
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

  // Comissao ganha pela plataforma (nao a receita bruta faturada) -- reutiliza
  // o mesmo calculo ja usado na pagina Receita (reconstroi preco base vs.
  // preco final por item), por isso so aceita um numero de dias (sem suporte
  // a intervalo personalizado, tal como a pagina Receita hoje).
  const loadCommissionEarned = useCallback(async (days = periodDays) => {
    setCommissionEarned((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await fetchAdminRevenueBreakdown(days, extractUserId(user));
      setCommissionEarned({
        loading: false,
        error: "",
        value: Number(data?.overview?.totalCommissionProfit || 0),
      });
    } catch (error) {
      console.error("Falha ao carregar a comissao ganha pela plataforma", error);
      setCommissionEarned((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Nao foi possivel calcular a comissao ganha.",
      }));
    }
  }, [periodDays, user]);

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
    if (activeTab !== "customers") return undefined;
    loadCustomerInsights();
    const timer = setInterval(() => loadCustomerInsights(), 45000);
    return () => clearInterval(timer);
  }, [activeTab, loadCustomerInsights]);

  useEffect(() => {
    if (activeTab !== "dashboard") return undefined;
    loadCommissionEarned();
    const timer = setInterval(() => loadCommissionEarned(), 60000);
    return () => clearInterval(timer);
  }, [activeTab, loadCommissionEarned]);

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

  const handleSaveGlobalCommissionSettings = async (percent) => {
    const settings = await saveGlobalCommissionSettings(percent, extractUserId(user));
    setGlobalCommission({
      percent: Number(settings?.percent || 0),
      updated_at: settings?.updated_at || null,
      loading: false,
      error: "",
    });
    // Lojas sem override proprio mostram o valor efetivo calculado no
    // servidor -- recarregar para essas lojas refletirem o novo valor.
    await load();
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

  const handleCancelOrderFromModal = async (order) => {
    await handleAdminOrderAction(order, "cancelado");
    closeOrderDetailModal();
  };

  const handleAssignCarrierFromModal = (order) => {
    closeOrderDetailModal();
    openCarrierModal(order);
  };

  const goToRestaurantApprovals = () => {
    setActiveTab("restaurants");
    setRestaurantsRequestedSection("approvals");
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
              onClick={() => {
                if (activeTab === "customers") {
                  loadCustomerInsights();
                  return;
                }
                load();
                if (activeTab === "dashboard") loadCommissionEarned();
              }}
            >
              Atualizar
            </button>
            <button className="btn-dashboard secondary" onClick={() => navigate("/")}>Website</button>
          </>
        )}
      />

      {state.error ? <p className="admin-inline-error">{state.error}</p> : null}

      {activeTab === "dashboard" ? (
        <OverviewTab
          state={state}
          periodDays={periodDays}
          commissionEarned={commissionEarned}
          safeSlaAlerts={safeSlaAlerts}
          safeRequests={safeRequests}
          driverAlertOrders={driverAlertOrders}
          failedDeliveries={failedDeliveries}
          safeScheduledOrders={safeScheduledOrders}
          safeImmediateOrders={safeImmediateOrders}
          safeDeliveries={safeDeliveries}
          dailyRevenue={dailyRevenue}
          hourlyDemand={hourlyDemand}
          storeNameById={storeNameById}
          slaBreachedOrderIds={slaBreachedOrderIds}
          latestDeliveryByOrderId={latestDeliveryByOrderId}
          highlightedOrderId={highlightedOrderId}
          updatingOrderId={updatingOrderId}
          navigate={navigate}
          scrollToSection={scrollToSection}
          scrollToImmediateOrder={scrollToImmediateOrder}
          onGoToRestaurantApprovals={goToRestaurantApprovals}
          openOrderDetailModal={openOrderDetailModal}
          openInHouseTrackingModal={openInHouseTrackingModal}
          openCarrierModal={openCarrierModal}
          handleAdminOrderAction={handleAdminOrderAction}
        />
      ) : null}

      {activeTab === "customers" ? (
        <CustomersTab
          customerInsights={customerInsights}
          filteredCustomers={filteredCustomers}
          customerSearch={customerSearch}
          setCustomerSearch={setCustomerSearch}
        />
      ) : null}

      {activeTab === "restaurants" ? (
        <RestaurantsTab
          requestedSection={restaurantsRequestedSection}
          onRequestedSectionHandled={() => setRestaurantsRequestedSection("")}
          storeSearch={storeSearch}
          setStoreSearch={setStoreSearch}
          storesOrderedById={storesOrderedById}
          storePickerOptions={storePickerOptions}
          selectedStoreId={selectedStoreId}
          setSelectedStoreId={setSelectedStoreId}
          selectedStore={selectedStore}
          managementStores={managementStores}
          openRestaurantDashboard={openRestaurantDashboard}
          loading={state.loading}
          globalAutoAssign={globalAutoAssign}
          globalDeliveryPricing={globalDeliveryPricing}
          globalCommission={globalCommission}
          commissionCatalogByStore={commissionCatalogByStore}
          catalogLoadingByStore={catalogLoadingByStore}
          catalogErrorByStore={catalogErrorByStore}
          onToggleGlobalAutoAssign={handleToggleGlobalAutoAssign}
          onSaveGlobalAutoAssignSettings={handleSaveGlobalAutoAssignSettings}
          onSaveGlobalCommissionSettings={handleSaveGlobalCommissionSettings}
          onToggleAutoAccept={handleToggleAutoAccept}
          onToggleAutoAssign={handleToggleAutoAssign}
          onSaveAutoAssignConfig={handleSaveAutoAssignConfig}
          onSaveCommissionSettings={handleSaveCommissionSettings}
          onSaveGlobalDeliveryPricingSettings={handleSaveGlobalDeliveryPricingSettings}
          onSaveDeliveryPricingSettings={handleSaveDeliveryPricingSettings}
          onSaveScheduleSettings={handleSaveScheduleSettings}
          safeStorePerformance={safeStorePerformance}
          safeRequests={safeRequests}
          reviewingId={reviewingId}
          reviewRequest={reviewRequest}
          expandedRequestId={expandedRequestId}
          setExpandedRequestId={setExpandedRequestId}
          storeTypeMap={storeTypeMap}
          stores={state.stores}
          onLinkedAssociation={() => load()}
        />
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
        onAssignCarrier={handleAssignCarrierFromModal}
        onCancelOrder={handleCancelOrderFromModal}
        isUpdating={updatingOrderId === String(orderDetailModal.data?.order?.id || "")}
      />

      <CarrierAssignModal
        carrierModal={carrierModal}
        onClose={closeCarrierModal}
        onAssign={assignCarrierToOrder}
      />
    </DashboardSidebarLayout>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ShieldAlert,
  ShoppingBag,
  Clock,
  CalendarClock,
  Euro,
  Receipt,
  CheckCircle2,
  XCircle,
  Star,
} from "lucide-react";
import "../css/pages/dashboard.css";
import {
  fetchStoreCommissionCatalog,
  fetchStoresWithAdminSettings,
  fetchRestaurantDashboard,
  resolveRestaurantStoreId,
  updateRestaurantAdminSettings,
  updateOrderWorkflowStatus,
} from "../services/opsDashboardService";
import { extractRestaurantId, extractUserId, isAdmin } from "../utils/roles";
import { useAlert } from "../context/AlertContext";
import TrendBars from "../components/dashboard/TrendBars";
import LiveOperationsBoard from "../components/dashboard/LiveOperationsBoard";
import DashboardSidebarLayout from "../components/dashboard/DashboardSidebarLayout";
import DashboardPageHeader from "../components/dashboard/DashboardPageHeader";
import DashboardPanel from "../components/dashboard/DashboardPanel";
import DashboardEmptyState from "../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../components/dashboard/DashboardLoadingState";
import RestaurantManagementPanel from "../components/dashboard/RestaurantManagementPanel";
import StoreSpecialHoursPanel from "../components/dashboard/StoreSpecialHoursPanel";
import InHouseTrackingModal from "../components/dashboard/InHouseTrackingModal";
import OrderDetailsModal from "../components/dashboard/OrderDetailsModal";
import DatePickerCustom from "../components/ui/DatePickerCustom";
import { fetchOrderDetails } from "../services/orderDetailsService";
import {
  getEstadoInternoLabelPt,
  getEstadoInternoTagClass,
  getRestaurantActionsForEstado,
  resolveOrderEstadoInterno,
} from "../services/orderStatusMapper";
import {
  buildEstafetaBoardEntries,
  listActiveAtribuicoes,
  listEstafetasForDispatch,
} from "../services/estafetaService";
import { fetchOrderReviewsForStore } from "../services/orderRatingService";

function ReviewStars({ value }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} de 5 estrelas`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          className="h-3.5 w-3.5"
          fill={index < value ? "#f59e0b" : "none"}
          color="#f59e0b"
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function formatReviewDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
    ASSIGNED: "Atribuída",
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

const ACCEPTED_WITHOUT_DRIVER_SLA_MS = 10 * 60 * 1000;

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

  return {
    periodDays,
    dateFrom: null,
    dateTo: null,
  };
}

const RESTAURANT_DASHBOARD_TABS = [
  { id: "dashboard", label: "Dashboard", description: "Fila de pedidos e entregas da loja", icon: "dashboard" },
  { id: "restaurants", label: "Gestão de Restaurantes", description: "Configuração operacional da loja", icon: "restaurants" },
  { id: "reviews", label: "Avaliações", description: "O que os clientes dizem sobre a loja", icon: "avaliacoes" },
  { id: "promotions", label: "Promoções", description: "Campanhas e futuras ativações", icon: "promotions" },
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
  const [rangeMode, setRangeMode] = useState("preset");
  const [customRange, setCustomRange] = useState({ from: "", to: "" });
  const [updatingOrderId, setUpdatingOrderId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [adminStores, setAdminStores] = useState([]);
  const [adminStoreSearch, setAdminStoreSearch] = useState("");
  const [inHouseTrackingModal, setInHouseTrackingModal] = useState({ open: false, orderId: null, title: "", isLive: false });
  const [orderDetailModal, setOrderDetailModal] = useState({ open: false, loading: false, error: "", data: null });
  const [commissionCatalogByStore, setCommissionCatalogByStore] = useState({});
  const [catalogLoadingByStore, setCatalogLoadingByStore] = useState({});
  const [catalogErrorByStore, setCatalogErrorByStore] = useState({});
  const [storeSettingsRows, setStoreSettingsRows] = useState([]);
  const [storeSettingsLoading, setStoreSettingsLoading] = useState(false);
  const [storeSettingsError, setStoreSettingsError] = useState("");
  const [liveEstafetas, setLiveEstafetas] = useState([]);
  const [liveAtribuicoes, setLiveAtribuicoes] = useState([]);
  const { showError } = useAlert();
  useEffect(() => {
    if (orderDetailModal.error) showError(orderDetailModal.error);
  }, [orderDetailModal.error, showError]);
  useEffect(() => {
    if (storeSettingsError) showError(storeSettingsError);
  }, [storeSettingsError, showError]);
  const [state, setState] = useState({
    orders: [],
    immediateOrders: [],
    scheduledOrders: [],
    deliveries: [],
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
    slaAlerts: [],
    liveOrders: [],
    loading: true,
    error: "",
  });
  useEffect(() => {
    if (state.error) showError(state.error);
  }, [state.error, showError]);
  const dashboardWindowInput = useMemo(
    () => buildWindowInput({ rangeMode, periodDays, customRange }),
    [customRange, periodDays, rangeMode],
  );

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
        setStoreSettingsError(error?.message || "Não foi possível carregar as lojas.");
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

  const selectedAdminStore = useMemo(
    () => (adminStores || []).find((store) => String(store.idloja) === String(lojaId)) || null,
    [adminStores, lojaId],
  );

  // Garante que a loja em foco nunca muda so porque o texto de pesquisa deixou de a
  // incluir -- so troca quando nada esta selecionado ou a loja deixou de existir.
  const storePickerOptions = useMemo(() => {
    if (!selectedAdminStore) return filteredAdminStores;
    const alreadyIncluded = filteredAdminStores.some(
      (store) => String(store.idloja) === String(selectedAdminStore.idloja),
    );
    return alreadyIncluded ? filteredAdminStores : [selectedAdminStore, ...filteredAdminStores];
  }, [filteredAdminStores, selectedAdminStore]);

  useEffect(() => {
    if (!admin) return;
    if (!adminStores.length) {
      if (lojaId) setLojaId("");
      return;
    }

    const existsInFullList = adminStores.some(
      (store) => String(store.idloja) === String(lojaId),
    );

    if (!lojaId || !existsInFullList) {
      setLojaId(String(adminStores[0].idloja));
    }
  }, [admin, adminStores, lojaId]);

  const scopedStoreId = admin ? lojaId : fixedStoreId;

  const [storeReviews, setStoreReviews] = useState([]);
  const [storeReviewsLoading, setStoreReviewsLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== "reviews" || !scopedStoreId) return undefined;
    let active = true;

    setStoreReviewsLoading(true);
    fetchOrderReviewsForStore(extractUserId(user), scopedStoreId)
      .then((rows) => {
        if (active) setStoreReviews(rows);
      })
      .catch((error) => {
        console.error("Falha ao carregar avaliações da loja", error);
        if (active) setStoreReviews([]);
      })
      .finally(() => {
        if (active) setStoreReviewsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeTab, scopedStoreId, user]);

  const storeReviewsAverage = useMemo(() => {
    if (!storeReviews.length) return 0;
    return storeReviews.reduce((sum, r) => sum + Number(r.classificacao || 0), 0) / storeReviews.length;
  }, [storeReviews]);

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
        setStoreSettingsError(error?.message || "Não foi possível carregar as definições da loja.");
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
          [String(scopedStoreId)]: error?.message || "Não foi possível carregar o catálogo da loja.",
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
    const data = await fetchRestaurantDashboard({
      lojaId: scopedStoreId,
      periodDays: dashboardWindowInput.periodDays,
      dateFrom: dashboardWindowInput.dateFrom,
      dateTo: dashboardWindowInput.dateTo,
      callerUserId: extractUserId(user),
    });
    setState({ ...data, loading: false, error: data.error || "" });
  }, [dashboardWindowInput, scopedStoreId, user]);

  const loadLiveCarriers = useCallback(async () => {
    try {
      const callerUserId = extractUserId(user);
      const [estafetasData, activeAtribuicoesData] = await Promise.all([
        listEstafetasForDispatch(callerUserId),
        listActiveAtribuicoes(callerUserId, scopedStoreId || null),
      ]);
      setLiveEstafetas(estafetasData);
      setLiveAtribuicoes(activeAtribuicoesData);
    } catch (error) {
      console.error("Falha ao carregar estafetas online para a dashboard da loja", error);
    }
  }, [scopedStoreId, user]);

  const anyModalOpenRef = useRef(false);
  useEffect(() => {
    anyModalOpenRef.current = Boolean(inHouseTrackingModal.open || orderDetailModal.open);
  });

  useEffect(() => {
    load();
    // Nao recarregar em fundo enquanto ha um modal aberto -- evita que as tabelas
    // por baixo mudem/reordenem silenciosamente enquanto se le um detalhe.
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


  const openOrders = useMemo(
    () => state.immediateOrders.filter((order) => !["entregue", "cancelado"].includes(resolveOrderEstadoInterno(order))).length,
    [state.immediateOrders],
  );
  const dailyRevenue = useMemo(
    () => state.series.byDay.map((item) => ({ label: item.day, value: item.revenue })),
    [state.series.byDay],
  );
  const hourlyDemand = useMemo(
    () => state.series.byHour.map((item) => ({ label: `${String(item.hour).padStart(2, "0")}h`, value: item.orders })),
    [state.series.byHour],
  );
  const liveCarrierEntries = useMemo(
    () => buildEstafetaBoardEntries(liveEstafetas, liveAtribuicoes, storeSettingsRows || []),
    [liveEstafetas, liveAtribuicoes, storeSettingsRows],
  );
  const slaBreachedOrderIds = useMemo(
    () => new Set((state.slaAlerts || []).filter((alert) => alert.driverAssignmentDelay).map((alert) => String(alert.id))),
    [state.slaAlerts],
  );

  const goToWebsite = () => {
    navigate("/");
  };

  const goToAdmin = () => {
    navigate(`/dashboard/admin${scopedStoreId ? `?loja=${scopedStoreId}` : ""}`);
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
        error: error?.message || "Não foi possível carregar os detalhes do pedido.",
        data: null,
      });
    }
  };

  const handleOrderAction = async (order, toEstado) => {
    setUpdatingOrderId(order.id);
    try {
      await updateOrderWorkflowStatus(order.id, toEstado, scopedStoreId, {
        callerUserId: extractUserId(user),
      });

      toast.success(`Pedido #${order.id} atualizado para ${getEstadoInternoLabelPt(toEstado)}.`);

      await load();
    } catch (error) {
      showError(`Falha a atualizar estado: ${error.message}`);
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
      throw new Error("Apenas o admin pode alterar a aceitação automática.");
    }

    const updatedStore = await updateRestaurantAdminSettings(store.idloja, {
      aceitacao_automatica_pedidos: nextValue,
    }, extractUserId(user));
    syncUpdatedStore(updatedStore);
  };

  const handleToggleAutoAssign = async (store, nextValue) => {
    if (!admin) {
      throw new Error("Apenas o admin pode alterar a atribuição automática.");
    }

    const updatedStore = await updateRestaurantAdminSettings(store.idloja, {
      atribuicao_automatica_estafeta: nextValue,
    }, extractUserId(user));
    syncUpdatedStore(updatedStore);
  };

  const handleSaveCommissionSettings = async (store, payload) => {
    if (!admin) {
      throw new Error("Apenas o admin pode alterar a comissão.");
    }

    const updatedStore = await updateRestaurantAdminSettings(store.idloja, payload, extractUserId(user));
    syncUpdatedStore(updatedStore);
  };

  const handleSaveScheduleSettings = async (store, horario_funcionamento) => {
    const updatedStore = await updateRestaurantAdminSettings(store.idloja, {
      horario_funcionamento,
    }, extractUserId(user));
    syncUpdatedStore(updatedStore);
  };

  return (
    <DashboardSidebarLayout
      kicker="Store Operations"
      title={storeName || "Restaurante"}
      subtitle="Acompanha pedidos, configuração operacional e futuras campanhas."
      tabs={RESTAURANT_DASHBOARD_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      storageKey="dashboard-restaurant-sidebar-collapsed"
      footer={(
        <div>
          <p className="muted dashboard-sidebar-footer-label">Loja atual</p>
          <strong>{storeName || "Sem associação"}</strong>
          <p className="muted dashboard-sidebar-footer-meta">
            {scopedStoreId ? `#${scopedStoreId}` : "Sem loja"}
          </p>
        </div>
      )}
    >
      <DashboardPageHeader
        kicker="Store Operations"
        title={`Dashboard ${storeName || "Restaurante"}`}
        subtitle={`${state.metrics.totalOrders} pedidos na janela atual - ${state.metrics.totalRevenue.toFixed(2)}EUR faturados (entregues e sem taxa de entrega)`}
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
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
              <option value="custom">Intervalo personalizado</option>
            </select>
            {rangeMode === "custom" ? (
              <div className="dashboard-range-fields">
                <label className="dashboard-range-field">
                  <span className="muted">De</span>
                  <DatePickerCustom
                    mode="datetime"
                    placeholder="Selecionar início"
                    value={customRange.from}
                    onChange={(value) => setCustomRange((prev) => ({ ...prev, from: value }))}
                  />
                </label>
                <label className="dashboard-range-field">
                  <span className="muted">Até</span>
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
            <button className="btn-dashboard" onClick={load}>Atualizar</button>
            <button className="btn-dashboard" onClick={() => navigate(`/menu-manager${scopedStoreId ? `?loja=${scopedStoreId}` : ""}`)}>
              Gerir menu
            </button>
            <button className="btn-dashboard" onClick={goToWebsite}>Início</button>
          </>
        )}
      />

      {admin || fromAdmin ? (
        <div className="admin-peek-banner">
          <ShieldAlert aria-hidden="true" />
          <span>
            Estás a gerir <strong>{storeName || "esta loja"}</strong> como administrador,
            sem precisares da conta do restaurante.
          </span>
          <button type="button" className="btn-dashboard small" onClick={goToAdmin}>
            Voltar ao admin
          </button>
        </div>
      ) : null}

      {admin ? (
        <section className="panel store-access-panel">
          <div className="store-access-header">
            <div>
              <h3>Trocar de loja</h3>
              <p className="muted">Pesquisa por nome para veres o dashboard operacional de outro restaurante.</p>
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
      ) : null}

      {state.error ? <p className="shipday-inline-error">{state.error}</p> : null}

      {activeTab === "restaurants" ? (
        <div className="dashboard-stack">
          <DashboardPanel
            title="Dados da loja"
            description="Horário semanal, morada, contacto, NIF e imagens editam-se na página de perfil da loja."
          >
            <button
              type="button"
              className="btn-dashboard small"
              onClick={() => navigate(lojaId ? `/parceiros?edit=1&loja=${lojaId}` : "/parceiros?edit=1")}
            >
              Editar dados da loja
            </button>
          </DashboardPanel>

          <RestaurantManagementPanel
            title="Gestão de Restaurantes"
            subtitle={admin
              ? "Escolhe o modo de comissão e define overrides globais, por categoria ou por prato."
              : "Vista apenas de leitura. O admin gere estas definições da loja."}
            stores={storeSettingsRows}
            loading={storeSettingsLoading}
            error={storeSettingsError}
            canEdit={admin}
            isAdmin={false}
            showCommissions={false}
            showCommissionSettings={false}
            showOperationalSettings={false}
            emptyText="Sem configuração de loja disponível."
            commissionCatalogByStore={commissionCatalogByStore}
            catalogLoadingByStore={catalogLoadingByStore}
            catalogErrorByStore={catalogErrorByStore}
            onToggleAutoAccept={handleToggleAutoAccept}
            onToggleAutoAssign={handleToggleAutoAssign}
            onSaveCommissionSettings={handleSaveCommissionSettings}
          />

          <StoreSpecialHoursPanel
            stores={storeSettingsRows}
            loading={storeSettingsLoading}
            canEdit
            onSaveScheduleSettings={handleSaveScheduleSettings}
          />
        </div>
      ) : null}

      {activeTab === "dashboard" ? (
        <div className="dashboard-stack">
          <section className="dashboard-grid premium-grid">
            <article className="metric-card premium">
              <div className="metric-card-icon metric-icon-blue"><ShoppingBag aria-hidden="true" /></div>
              <div className="metric-label">Pedidos</div>
              <div className="metric-value">{state.metrics.totalOrders}</div>
              <div className="metric-foot">Volume total</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-card-icon metric-icon-amber"><Clock aria-hidden="true" /></div>
              <div className="metric-label">Em aberto</div>
              <div className="metric-value">{openOrders}</div>
              <div className="metric-foot">Fila imediata</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-card-icon metric-icon-slate"><CalendarClock aria-hidden="true" /></div>
              <div className="metric-label">Agendados</div>
              <div className="metric-value">{state.metrics.scheduledOrders}</div>
              <div className="metric-foot">Aguardam janela operacional</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-card-icon metric-icon-red"><Euro aria-hidden="true" /></div>
              <div className="metric-label">Receita</div>
              <div className="metric-value">{state.metrics.totalRevenue.toFixed(2)}EUR</div>
              <div className="metric-foot">Apenas entregues (sem taxa de entrega)</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-card-icon metric-icon-purple"><Receipt aria-hidden="true" /></div>
              <div className="metric-label">Ticket médio</div>
              <div className="metric-value">{state.metrics.avgTicket.toFixed(2)}EUR</div>
              <div className="metric-foot">Valor médio por pedido entregue</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-card-icon metric-icon-green"><CheckCircle2 aria-hidden="true" /></div>
              <div className="metric-label">Concluído</div>
              <div className="metric-value">{state.metrics.deliveredRate.toFixed(1)}%</div>
              <div className="metric-foot">Pedidos entregues</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-card-icon metric-icon-red"><XCircle aria-hidden="true" /></div>
              <div className="metric-label">Cancelamento</div>
              <div className="metric-value">{state.metrics.cancelRate.toFixed(1)}%</div>
              <div className="metric-foot">Taxa de cancelamento</div>
            </article>
          </section>

          <section className="panel-grid admin-top-grid">
            <LiveOperationsBoard
              mode="restaurant"
              storeId={scopedStoreId}
              orders={state.immediateOrders}
              carriers={liveCarrierEntries}
              stores={storeSettingsRows}
            />

            <DashboardPanel
              title="Alertas SLA da loja"
              description="Pedidos acima do tempo limite esperado."
              className="sla-panel"
            >
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
                    {state.loading && state.slaAlerts.length === 0 ? (
                      <DashboardLoadingState as="tableRow" colSpan={4} />
                    ) : null}
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
                      <DashboardEmptyState as="tableRow" colSpan={4} label="Sem alertas de SLA para mostrar." />
                    ) : null}
                  </tbody>
                </table>
              </div>
            </DashboardPanel>
          </section>

          <section className="panel-grid analytics-grid">
            <TrendBars title="Receita por dia" data={dailyRevenue} valueKey="value" labelKey="label" suffix=" EUR" />
            <TrendBars title="Pedidos por hora" data={hourlyDemand} valueKey="value" labelKey="label" />
          </section>

          <DashboardPanel
            title="Pedidos agendados"
            description="Passam automaticamente para a fila imediata 30 minutos antes da entrega prevista."
          >
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Entrega prevista</th>
                    <th>Operação</th>
                    <th>Total</th>
                    <th>Estado</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {state.loading && state.scheduledOrders.length === 0 ? (
                    <DashboardLoadingState as="tableRow" colSpan={7} />
                  ) : null}
                  {state.scheduledOrders.map((order) => {
                    const estadoInterno = resolveOrderEstadoInterno(order);
                    const actions = getRestaurantActionsForEstado(estadoInterno);
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
                        <td>{order.customer_nome || "-"}</td>
                        <td>{formatOrderDeliverySlot(order.scheduled_for || order.created_at)}</td>
                        <td>
                          {scheduledStateView ? <span className={scheduledStateView.className}>{scheduledStateView.label}</span> : "-"}
                        </td>
                        <td>{Number(order.total || 0).toFixed(2)}EUR</td>
                        <td><span className={getEstadoInternoTagClass(estadoInterno)}>{getEstadoInternoLabelPt(estadoInterno)}</span></td>
                        <td>
                          {actions.length > 0 ? (
                            <div className="table-action-row">
                              {actions.map((action) => (
                                <button
                                  key={`scheduled-${order.id}-${action.action}`}
                                  className={`btn-dashboard small${action.toEstado === "cancelado" ? " danger" : (action.variant === "secondary" ? " secondary" : "")}`}
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
                  {!state.loading && state.scheduledOrders.length === 0 ? (
                    <DashboardEmptyState as="tableRow" colSpan={7} label="Sem pedidos agendados nesta janela para mostrar." />
                  ) : null}
                </tbody>
              </table>
            </div>
          </DashboardPanel>

          <DashboardPanel
            title="Fila de pedidos imediatos"
            description="Pedidos a trabalhar agora, incluindo os agendados que já entraram na janela operacional."
          >

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
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {state.loading && state.immediateOrders.length === 0 ? (
                    <DashboardLoadingState as="tableRow" colSpan={7} />
                  ) : null}
                  {state.immediateOrders.map((order) => {
                    const estadoInterno = resolveOrderEstadoInterno(order);
                    const actions = getRestaurantActionsForEstado(estadoInterno);
                    const hasDriverAlert = slaBreachedOrderIds.has(String(order.id)) || isDriverAssignmentSlaBreached(order);
                    const driverText = estadoInterno === "cancelado"
                      ? "-"
                      : (order.driver_name
                      ? `${order.driver_name}${order.driver_phone ? ` (${order.driver_phone})` : ""}`
                      : (order.driver_phone || "-"));

                    return (
                      <tr
                        key={order.id}
                        className={`is-clickable-row${hasDriverAlert ? " order-row-sla-alert" : ""}`}
                        tabIndex={0}
                        onClick={() => openOrderDetailModal(order.id)}
                        onKeyDown={(event) => handleRowKeyDown(event, () => openOrderDetailModal(order.id))}
                      >
                        <td>{String(order.id).slice(0, 8)}</td>
                        <td>{order.customer_nome || "-"}</td>
                        <td>{Number(order.total || 0).toFixed(2)}EUR</td>
                        <td>
                          <span className={getEstadoInternoTagClass(estadoInterno)}>{getEstadoInternoLabelPt(estadoInterno)}</span>
                          {hasDriverAlert ? <span className="table-alert-indicator" title="Pedido aceite sem estafeta há mais de 10 minutos.">!</span> : null}
                        </td>
                        <td>{driverText}</td>
                        <td>
                          {estadoInterno !== "cancelado" ? (
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
                          {actions.length > 0 ? (
                            <div className="table-action-row">
                              {actions.map((action) => (
                                <button
                                  key={`${order.id}-${action.action}`}
                                  className={`btn-dashboard small${action.toEstado === "cancelado" ? " danger" : (action.variant === "secondary" ? " secondary" : "")}`}
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
                  {!state.loading && state.immediateOrders.length === 0 ? (
                    <DashboardEmptyState as="tableRow" colSpan={7} label="Sem pedidos para mostrar nesta janela." />
                  ) : null}
                </tbody>
              </table>
            </div>
          </DashboardPanel>

          <DashboardPanel
            title="Entregas Recentes"
            description="Estados traduzidos para uma leitura mais rápida."
          >
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
                  {state.loading && state.deliveries.length === 0 ? (
                    <DashboardLoadingState as="tableRow" colSpan={5} />
                  ) : null}
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
                          ) : "-"}
                        </td>
                      </tr>
                    );
                  })}
                  {!state.loading && state.deliveries.length === 0 ? (
                    <DashboardEmptyState as="tableRow" colSpan={5} label="Sem entregas para mostrar nesta janela." />
                  ) : null}
                </tbody>
              </table>
            </div>
          </DashboardPanel>
        </div>
      ) : null}

      {activeTab === "reviews" ? (
        <div className="dashboard-stack">
          <section className="dashboard-grid premium-grid stat-hero-grid">
            <article className="metric-card premium stat-hero" style={{ "--stat-accent": "#e62429" }}>
              <div className="stat-hero-icon stat-hero-icon--red">
                <Star aria-hidden="true" />
              </div>
              <div className="stat-hero-body">
                <div className="metric-label">Avaliações recebidas</div>
                <div className="metric-value">{storeReviews.length}</div>
                <div className="metric-foot">No total</div>
              </div>
            </article>
            <article className="metric-card premium stat-hero" style={{ "--stat-accent": "#15803d" }}>
              <div className="stat-hero-icon stat-hero-icon--green">
                <Star aria-hidden="true" />
              </div>
              <div className="stat-hero-body">
                <div className="metric-label">Média geral</div>
                <div className="metric-value">{storeReviewsAverage.toFixed(1)}</div>
                <div className="metric-foot">De 5 estrelas</div>
              </div>
            </article>
          </section>

          <DashboardPanel title="Avaliações dos clientes" description="Classificação de 1 a 5 estrelas deixada pelos clientes após a entrega.">
            {storeReviewsLoading ? (
              <DashboardLoadingState />
            ) : storeReviews.length === 0 ? (
              <DashboardEmptyState label="Ainda sem avaliações para esta loja." />
            ) : (
              <div className="table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Pedido</th>
                      <th>Cliente</th>
                      <th>Classificação</th>
                      <th>Comentário</th>
                      <th>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storeReviews.map((review) => (
                      <tr key={review.id}>
                        <td>#{review.order_id}</td>
                        <td>{review.customer_nome || "-"}</td>
                        <td><ReviewStars value={Number(review.classificacao || 0)} /></td>
                        <td>{review.comentario || <span className="muted">Sem comentário</span>}</td>
                        <td>{formatReviewDateTime(review.criado_em)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DashboardPanel>
        </div>
      ) : null}

      {activeTab === "promotions" ? (
        <section className="panel empty-state-panel">
          <div>
            <p className="kicker">Promoções</p>
            <h3>Gestão de Campanhas</h3>
            <p className="muted">Container preparado para uma futura área de campanhas do restaurante.</p>
          </div>
          <div>
            <button type="button" className="btn-dashboard secondary" disabled>
              Criar Nova Promoção
            </button>
          </div>
        </section>
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
    </DashboardSidebarLayout>
  );
}

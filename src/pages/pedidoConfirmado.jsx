import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import Logo from "../components/Logo";
import Login from "../components/LoginButton";
import CartWidget from "../components/CartWidget";
import Voltar from "../components/Voltar";
import MenuGlobal from "../components/MenuGlobal";
import EmbeddedTrackingCard from "../components/order/EmbeddedTrackingCard";
import { groupSelectedMenuOptionsForDisplay } from "../services/menuOptionsService";
import { updateOrderWorkflowStatus } from "../services/opsDashboardService";
import { fetchOrderDetails, getStatusTone } from "../services/orderDetailsService";
import { resolveUserRole } from "../utils/roles";
import "../css/pages/pedidoDetalhe.css";

const CUSTOMER_CANCEL_WINDOW_MS = 5 * 60 * 1000;
const CUSTOMER_CANCELABLE_ESTADOS = new Set([
  "pendente",
  "aceite",
  "atribuindo_estafeta",
  "estafeta_aceitou",
  "em_preparacao",
  "pronto_recolha",
]);

function readSessionUser() {
  try {
    const raw = localStorage.getItem("pedeja_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value) {
  return `${Number(value || 0).toFixed(2)}EUR`;
}

function toneClass(tone) {
  if (tone === "success") return "is-success";
  if (tone === "danger") return "is-danger";
  return "is-warning";
}

function formatVehicleDisplay(value) {
  const text = String(value || "").trim();
  if (!text) return "-";

  const plate = text.replace(/\s+/g, "").toUpperCase();
  const isPlateOnly = /^[A-Z0-9]{2}-?[A-Z0-9]{2}-?[A-Z0-9]{2}$/.test(plate);

  return isPlateOnly ? `(Matricula: ${plate})` : text;
}

function resolveCustomerCancelBaseTime(order) {
  return order?.submitted_at || order?.created_at || null;
}

function getCustomerCancelRemainingMs(order, now = Date.now()) {
  const baseTime = resolveCustomerCancelBaseTime(order);
  if (!baseTime) return 0;

  const createdAt = new Date(baseTime).getTime();
  if (!Number.isFinite(createdAt)) return 0;

  return Math.max(0, (createdAt + CUSTOMER_CANCEL_WINDOW_MS) - now);
}

function formatRemainingCancelTime(milliseconds) {
  const safeMs = Math.max(0, Number(milliseconds || 0));
  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function AsyncValue({
  loading = false,
  value,
  fallback = "-",
  className = "",
}) {
  if (loading) {
    return <span className={`pedido-skeleton-line${className ? ` ${className}` : ""}`} aria-hidden="true" />;
  }

  return value || fallback;
}

export default function PedidoConfirmado() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState(() => readSessionUser());
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const [cancelTick, setCancelTick] = useState(() => Date.now());

  const allowGuestState = Boolean(location.state?.allow_guest_access);
  const fallbackTrackingUrl = location.state?.tracking_url || null;
  const fromCheckout = Boolean(location.state?.from_checkout);

  useEffect(() => {
    const syncUser = () => setUser(readSessionUser());

    window.addEventListener("storage", syncUser);
    window.addEventListener("pedeja-user-updated", syncUser);

    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener("pedeja-user-updated", syncUser);
    };
  }, []);

  const userIdentityKey = useMemo(
    () => `${user?.idutilizador || user?.id || user?.user_id || "anon"}|${String(user?.email || "").toLowerCase()}`,
    [user?.email, user?.id, user?.idutilizador, user?.user_id],
  );
  const viewerIsCustomer = useMemo(() => Boolean(user) && resolveUserRole(user) === "customer", [user]);

  const loadOrder = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError("");
    } else {
      setRefreshing(true);
    }

    try {
      const data = await fetchOrderDetails(orderId, {
        user,
        allowGuestState,
        fallbackTrackingUrl,
      });
      setDetails(data);
      setError("");
    } catch (err) {
      setError(err.message || "Nao foi possivel carregar os detalhes do pedido.");
      setDetails(null);
    } finally {
      if (!silent) setLoading(false);
      if (silent) setRefreshing(false);
    }
  }, [allowGuestState, fallbackTrackingUrl, orderId, user]);

  useEffect(() => {
    loadOrder({ silent: false });
  }, [loadOrder, userIdentityKey]);

  useEffect(() => {
    if (!details?.is_live) return;

    const timer = setInterval(() => {
      loadOrder({ silent: true });
    }, 15000);

    return () => clearInterval(timer);
  }, [details?.is_live, loadOrder]);

  useEffect(() => {
    const baseTime = resolveCustomerCancelBaseTime(details?.order);
    if (!baseTime) return undefined;

    const timer = setInterval(() => {
      setCancelTick(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [details?.order]);

  const vehicleDisplay = useMemo(
    () => formatVehicleDisplay(details?.driver?.vehicle || details?.order?.veiculo_estafeta),
    [details?.driver?.vehicle, details?.order?.veiculo_estafeta],
  );
  const customerCancelRemainingMs = useMemo(
    () => getCustomerCancelRemainingMs(details?.order, cancelTick),
    [details?.order, cancelTick],
  );
  const customerOrderEstadoInterno = details?.workflow?.estado_interno || details?.order?.estado_interno || "";
  const customerCanCancel = Boolean(
    viewerIsCustomer
    && details?.order?.id
    && CUSTOMER_CANCELABLE_ESTADOS.has(customerOrderEstadoInterno)
    && customerCancelRemainingMs > 0,
  );
  const shouldShowCustomerCancelBox = Boolean(
    viewerIsCustomer
    && details?.order
    && !["cancelado", "entregue"].includes(customerOrderEstadoInterno),
  );
  const shouldSkeletonEta = Boolean(details?.is_live && !details?.estimated_delivery);
  const shouldSkeletonDriverName = Boolean(details?.is_live && !details?.driver?.name);
  const shouldSkeletonDriverPhone = Boolean(details?.is_live && !details?.driver?.phone);
  const shouldSkeletonVehicle = Boolean(details?.is_live && vehicleDisplay === "-");

  const handleCustomerCancel = useCallback(async () => {
    if (!details?.order?.id) return;

    const remainingMs = getCustomerCancelRemainingMs(details.order, Date.now());
    if (remainingMs <= 0) {
      toast.error("A janela de cancelamento de 5 minutos ja terminou.");
      return;
    }

    if (!CUSTOMER_CANCELABLE_ESTADOS.has(customerOrderEstadoInterno)) {
      toast.error("Este pedido ja avancou demasiado para ser cancelado pelo cliente.");
      return;
    }

    setCancelling(true);

    try {
      const result = await updateOrderWorkflowStatus(
        details.order.id,
        "cancelado",
        details.order.loja_id ?? null,
        { syncShipday: true },
      );

      if (result?.shipdaySync && !result.shipdaySync.ok && !result.shipdaySync.skipped) {
        toast.error("Pedido cancelado no PedeJa, mas a sincronizacao com o Shipday falhou.");
      } else {
        toast.success("Pedido cancelado com sucesso.");
      }

      await loadOrder({ silent: false });
    } catch (cancelError) {
      toast.error(cancelError?.message || "Nao foi possivel cancelar o pedido.");
    } finally {
      setCancelling(false);
    }
  }, [customerOrderEstadoInterno, details?.order, loadOrder]);

  return (
    <main className="pedido-detalhe-main">
      <Logo />

      <div className="header-right-actions">
        <Login />
        <CartWidget />
      </div>

      <div id="wave-top"></div>

      <div className="container pedido-detalhe-container">
        <section className="pedido-detalhe-card">
          {fromCheckout && !error ? (
            <div className="pedido-top-alert">
              Pedido criado com sucesso. Abaixo podes acompanhar tudo em tempo real.
            </div>
          ) : null}

          <header className="pedido-header-row">
            <div>
              <p className="pedido-kicker">Pedido #{orderId}</p>
              <h1>Detalhes do pedido</h1>
              <p className="pedido-muted">Consulta estado, itens, dados de entrega e tracking Shipday.</p>
            </div>

            <div className="pedido-header-actions">
              <button type="button" className="pedido-btn ghost" onClick={() => loadOrder({ silent: false })}>
                {refreshing ? "A atualizar..." : "Atualizar"}
              </button>

              {user ? (
                <button type="button" className="pedido-btn" onClick={() => navigate("/perfil")}>
                  Voltar ao perfil
                </button>
              ) : null}

              <button type="button" className="pedido-btn dark" onClick={() => navigate("/")}>
                Inicio
              </button>
            </div>
          </header>

          {loading ? (
            <p className="pedido-muted">A carregar detalhes do pedido...</p>
          ) : error ? (
            <div className="pedido-error-box">
              <strong>Falha ao abrir pedido.</strong>
              <p>{error}</p>
              {!user && !allowGuestState ? (
                <button type="button" className="pedido-btn" onClick={() => window.dispatchEvent(new Event("abrirLogin"))}>
                  Iniciar sessao
                </button>
              ) : null}
            </div>
          ) : details ? (
            <>
              <div className="pedido-status-row">
                <span className={`pedido-status-pill ${toneClass(details.order.status_tone)}`}>
                  Estado pedido: {details.order.status_label}
                </span>

                {details.latest_delivery ? (
                  <span className={`pedido-status-pill ${toneClass(details.latest_delivery.status_tone)}`}>
                    Entrega: {details.latest_delivery.status_label}
                  </span>
                ) : null}

                {details.is_live ? <span className="pedido-live-dot">Em curso</span> : <span className="pedido-live-dot done">Finalizado</span>}
              </div>

              {shouldShowCustomerCancelBox ? (
                <section className="pedido-cancel-card">
                  <div>
                    <strong>Cancelamento rapido</strong>
                    <p className="pedido-muted">
                      {customerCanCancel
                        ? `Podes cancelar este pedido durante os primeiros 5 minutos. Tempo restante: ${formatRemainingCancelTime(customerCancelRemainingMs)}.`
                        : "A janela de cancelamento de 5 minutos ja terminou ou o pedido ja avancou para uma fase sem cancelamento direto."}
                    </p>
                  </div>

                  {customerCanCancel ? (
                    <button
                      type="button"
                      className="pedido-btn danger"
                      disabled={cancelling}
                      onClick={handleCustomerCancel}
                    >
                      {cancelling ? "A cancelar..." : "Cancelar pedido"}
                    </button>
                  ) : null}
                </section>
              ) : null}

              <section className="pedido-panel pedido-workflow-panel">
                <h3>Progresso do pedido</h3>
                {details.workflow?.is_canceled ? (
                  <p className="pedido-error-inline">Este pedido foi cancelado.</p>
                ) : null}

                <ol className="pedido-workflow-list">
                  {(details.workflow?.steps || []).map((step) => (
                    <li
                      key={step.key}
                      className={`pedido-workflow-step${step.is_completed ? " done" : ""}${step.is_current ? " current" : ""}`}
                    >
                      <span className="pedido-workflow-dot">{step.is_completed ? "OK" : step.index + 1}</span>
                      <span className="pedido-workflow-label">{step.label}</span>
                    </li>
                  ))}
                </ol>
              </section>

              <section className="pedido-grid two">
                <article className="pedido-panel">
                  <h3>Resumo financeiro</h3>
                  <div className="pedido-values">
                    <div><span>Subtotal</span><strong>{formatMoney(details.order.subtotal)}</strong></div>
                    <div><span>Taxa de entrega</span><strong>{formatMoney(details.order.taxa_entrega)}</strong></div>
                    <div className="total"><span>Total</span><strong>{formatMoney(details.order.total)}</strong></div>
                  </div>
                </article>

                <article className="pedido-panel">
                  <h3>Entrega e tracking</h3>
                  <div className="pedido-delivery-meta">
                    <p><strong>ID Shipday:</strong> {details.shipday_delivery_id || "-"}</p>
                    <p>
                      <strong>Previsao:</strong>
                      {" "}
                      <AsyncValue
                        loading={shouldSkeletonEta}
                        value={details.estimated_delivery}
                        fallback="A calcular..."
                        className="pedido-skeleton-line--short"
                      />
                    </p>
                    <p><strong>Metodo pagamento:</strong> {details.payment_method_label || "-"}</p>
                  </div>

                  {details.tracking_url ? (
                    <EmbeddedTrackingCard
                      url={details.tracking_url}
                      title={`Tracking pedido #${orderId}`}
                    />
                  ) : (
                    <p className="pedido-muted">Tracking ainda nao disponibilizado.</p>
                  )}

                  {details.shipday_error ? (
                    <p className="pedido-error-inline">Erro Shipday: {details.shipday_error}</p>
                  ) : null}
                </article>
              </section>

              <section className="pedido-grid two">
                <article className="pedido-panel">
                  <h3>Dados do pedido</h3>
                  <div className="pedido-info-grid">
                    <p><strong>Cliente:</strong> {details.order.customer_nome || "-"}</p>
                    <p><strong>Telefone:</strong> {details.order.customer_phone || "-"}</p>
                    <p><strong>Email:</strong> {details.order.customer_email || "-"}</p>
                    <p><strong>Morada:</strong> {details.order.customer_address || "-"}</p>
                    <p><strong>Etiqueta morada:</strong> {details.order.customer_address_label || "-"}</p>
                    <p><strong>Notas:</strong> {details.order.customer_notes || "-"}</p>
                    <p>
                      <strong>{details.order.order_timing_mode === "SCHEDULED" ? "Pedido agendado para:" : "Criado:"}</strong>
                      {" "}
                      {formatDateTime(details.order.order_timing_mode === "SCHEDULED"
                        ? (details.order.scheduled_for || details.order.created_at)
                        : details.order.created_at)}
                    </p>
                    {details.order.submitted_at ? (
                      <p><strong>Pedido submetido em:</strong> {formatDateTime(details.order.submitted_at)}</p>
                    ) : null}
                    <p><strong>Ultima atualizacao:</strong> {formatDateTime(details.order.updated_at)}</p>
                  </div>
                </article>

                <article className="pedido-panel">
                  <h3>Restaurante e estafeta</h3>
                  <div className="pedido-info-grid">
                    <p><strong>Restaurante:</strong> {details.store?.nome || "-"}</p>
                    <p><strong>Contacto loja:</strong> {details.store?.contacto || "-"}</p>
                    <p><strong>Morada loja:</strong> {details.store?.morada || "-"}</p>
                    <p>
                      <strong>Estafeta:</strong>
                      {" "}
                      <AsyncValue
                        loading={shouldSkeletonDriverName}
                        value={details.driver?.name}
                        className="pedido-skeleton-line--medium"
                      />
                    </p>
                    <p>
                      <strong>Telemovel estafeta:</strong>
                      {" "}
                      <AsyncValue
                        loading={shouldSkeletonDriverPhone}
                        value={details.driver?.phone}
                        className="pedido-skeleton-line--medium"
                      />
                    </p>
                    <p>
                      <strong>Veiculo:</strong>
                      {" "}
                      <AsyncValue
                        loading={shouldSkeletonVehicle}
                        value={vehicleDisplay !== "-" ? vehicleDisplay : ""}
                        className="pedido-skeleton-line--medium"
                      />
                    </p>
                  </div>
                </article>
              </section>

              <section className="pedido-panel">
                <h3>Itens do pedido</h3>
                {details.items.length === 0 ? (
                  <p className="pedido-muted">Sem itens registados para este pedido.</p>
                ) : (
                  <div className="pedido-table-wrap">
                    <table className="pedido-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Qtd</th>
                          <th>Unitario</th>
                          <th>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.items.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <div>{item.nome}</div>
                              {groupSelectedMenuOptionsForDisplay(item.opcoes_selecionadas).map((group) => (
                                <div key={`${item.id}-${group.groupId}`} className="pedido-item-option-group">
                                  <span className="pedido-item-option-title">{group.title}:</span>
                                  <span className="pedido-item-option-values">
                                    {group.options.map((option) => option.option_name).join(", ")}
                                  </span>
                                </div>
                              ))}
                            </td>
                            <td>{item.quantidade}</td>
                            <td>{formatMoney(item.preco_unitario)}</td>
                            <td>{formatMoney(item.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="pedido-panel">
                <h3>Linha temporal</h3>
                {details.timeline.length === 0 ? (
                  <p className="pedido-muted">Sem eventos de timeline para este pedido.</p>
                ) : (
                  <div className="pedido-timeline">
                    {details.timeline.slice(0, 40).map((entry, idx) => (
                      <div className="pedido-timeline-item" key={`${entry.type}-${entry.created_at || idx}-${idx}`}>
                        <span className={`pedido-status-pill thin ${toneClass(getStatusTone(entry.status))}`}>
                          {entry.label}
                        </span>
                        <span className="pedido-muted">{formatDateTime(entry.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : null}
        </section>
      </div>

      <Voltar />
      <MenuGlobal />
    </main>
  );
}




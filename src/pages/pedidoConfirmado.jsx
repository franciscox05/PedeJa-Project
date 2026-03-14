import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Logo from "../components/Logo";
import Login from "../components/LoginButton";
import CartWidget from "../components/CartWidget";
import Voltar from "../components/Voltar";
import MenuGlobal from "../components/MenuGlobal";
import { fetchOrderDetails, getStatusTone } from "../services/orderDetailsService";
import "../css/pages/pedidoDetalhe.css";

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

export default function PedidoConfirmado() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState(() => readSessionUser());
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

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
                    <p><strong>Previsao:</strong> {details.estimated_delivery || "-"}</p>
                    <p><strong>Metodo pagamento:</strong> {details.payment_method_label || "-"}</p>
                  </div>

                  {details.tracking_url ? (
                    <a href={details.tracking_url} target="_blank" rel="noreferrer" className="pedido-track-link pedido-track-link--cta">
                      Acompanhar no Mapa
                    </a>
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
                    <p><strong>Criado:</strong> {formatDateTime(details.order.created_at)}</p>
                    <p><strong>Ultima atualizacao:</strong> {formatDateTime(details.order.updated_at)}</p>
                  </div>
                </article>

                <article className="pedido-panel">
                  <h3>Restaurante e estafeta</h3>
                  <div className="pedido-info-grid">
                    <p><strong>Restaurante:</strong> {details.store?.nome || "-"}</p>
                    <p><strong>Contacto loja:</strong> {details.store?.contacto || "-"}</p>
                    <p><strong>Morada loja:</strong> {details.store?.morada || "-"}</p>
                    <p><strong>Estafeta:</strong> {details.driver?.name || "-"}</p>
                    <p><strong>Telemovel estafeta:</strong> {details.driver?.phone || "-"}</p>
                    <p><strong>Veiculo:</strong> {details.driver?.vehicle || "-"}</p>
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
                            <td>{item.nome}</td>
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




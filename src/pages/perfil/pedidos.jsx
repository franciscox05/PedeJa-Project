import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { fetchProfileOrders } from "../../services/profileOrdersService";

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

function formatOrderMoment(order) {
  if (order?.order_timing_mode === "SCHEDULED") {
    return `Agendado para ${formatDateTime(order.scheduled_for || order.created_at)}`;
  }
  return formatDateTime(order?.submitted_at || order?.created_at);
}

function formatMoney(value) {
  return `${Number(value || 0).toFixed(2)}EUR`;
}

function statusClassName(tone) {
  if (tone === "success") return "is-success";
  if (tone === "danger") return "is-danger";
  return "is-warning";
}

const ORDERS_PER_PAGE = 8;

export default function ProfilePedidos() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [ordersData, setOrdersData] = useState({
    summary: { totalOrders: 0, openOrders: 0, completedOrders: 0, canceledOrders: 0 },
    orders: [],
  });
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;

    const loadOrders = async () => {
      setLoading(true);
      try {
        const data = await fetchProfileOrders(user);
        if (active) setOrdersData(data);
      } catch (error) {
        console.error("Erro ao carregar pedidos do perfil:", error);
        if (active) setOrdersData((prev) => ({ ...prev, orders: [] }));
      } finally {
        if (active) setLoading(false);
      }
    };

    loadOrders();
    return () => {
      active = false;
    };
  }, [user]);

  const orderedOrders = useMemo(
    () => [...(ordersData.orders || [])].sort(
      (a, b) => new Date(b?.submitted_at || b?.created_at || 0).getTime() - new Date(a?.submitted_at || a?.created_at || 0).getTime(),
    ),
    [ordersData.orders],
  );

  useEffect(() => {
    setPage(1);
  }, [orderedOrders.length]);

  const totalPages = Math.max(1, Math.ceil(orderedOrders.length / ORDERS_PER_PAGE));
  const paginatedOrders = orderedOrders.slice((page - 1) * ORDERS_PER_PAGE, page * ORDERS_PER_PAGE);

  if (loading) {
    return <p className="profile-note">A carregar resumo e histórico de pedidos...</p>;
  }

  return (
    <section className="profile-orders-area">
      <div className="profile-order-summary-grid">
        <article className="profile-summary-card">
          <span>Total de pedidos</span>
          <strong>{ordersData.summary.totalOrders}</strong>
        </article>
        <article className="profile-summary-card">
          <span>Em curso</span>
          <strong>{ordersData.summary.openOrders}</strong>
        </article>
        <article className="profile-summary-card">
          <span>Concluídos</span>
          <strong>{ordersData.summary.completedOrders}</strong>
        </article>
        <article className="profile-summary-card">
          <span>Cancelados</span>
          <strong>{ordersData.summary.canceledOrders}</strong>
        </article>
      </div>

      {ordersData.orders.length === 0 ? (
        <p className="profile-note">Ainda não tens pedidos registados.</p>
      ) : (
        <div className="profile-orders-section">
          <div className="profile-orders-header">
            <p className="profile-note">Pedidos recentes ({orderedOrders.length})</p>
            {orderedOrders.length > ORDERS_PER_PAGE ? (
              <div className="profile-pagination">
                <button
                  type="button"
                  className="profile-order-link"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                >
                  Anterior
                </button>
                <span>Página {page} de {totalPages}</span>
                <button
                  type="button"
                  className="profile-order-link"
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                >
                  Seguinte
                </button>
              </div>
            ) : null}
          </div>

          <div className="profile-orders-list">
            {paginatedOrders.map((order) => (
              <article
                key={order.id}
                className="profile-order-item is-clickable"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/pedido/${order.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(`/pedido/${order.id}`);
                  }
                }}
              >
                <div className="profile-order-main">
                  <div>
                    <p className="profile-order-id">Pedido #{order.id}</p>
                    <h4>{order.loja_nome}</h4>
                    <p className="profile-order-date">{formatOrderMoment(order)}</p>
                  </div>

                  <div className="profile-order-right">
                    <strong>{formatMoney(order.total)}</strong>
                    <span className={`profile-status-pill ${statusClassName(order.status_tone)}`}>
                      {order.status_label}
                    </span>
                  </div>
                </div>

                <div className="profile-order-meta">
                  <button
                    type="button"
                    className="profile-order-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/pedido/${order.id}`);
                    }}
                  >
                    Ver detalhes
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

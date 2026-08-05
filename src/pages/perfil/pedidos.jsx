import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

const STATUS_TONE_CLASS = {
  success: "bg-green-100 text-green-800",
  danger: "bg-red-100 text-red-800",
  warning: "bg-amber-100 text-amber-800",
};

function statusClassName(tone) {
  return STATUS_TONE_CLASS[tone] || STATUS_TONE_CLASS.warning;
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
    return <p className="text-sm text-gray-500">A carregar resumo e histórico de pedidos...</p>;
  }

  return (
    <section className="grid gap-3.5">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <article className="grid gap-1.5 rounded-xl border border-gray-100 bg-white p-3">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Total de pedidos</span>
          <strong className="text-xl text-gray-900">{ordersData.summary.totalOrders}</strong>
        </article>
        <article className="grid gap-1.5 rounded-xl border border-gray-100 bg-white p-3">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Em curso</span>
          <strong className="text-xl text-gray-900">{ordersData.summary.openOrders}</strong>
        </article>
        <article className="grid gap-1.5 rounded-xl border border-gray-100 bg-white p-3">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Concluídos</span>
          <strong className="text-xl text-gray-900">{ordersData.summary.completedOrders}</strong>
        </article>
        <article className="grid gap-1.5 rounded-xl border border-gray-100 bg-white p-3">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Cancelados</span>
          <strong className="text-xl text-gray-900">{ordersData.summary.canceledOrders}</strong>
        </article>
      </div>

      {ordersData.orders.length === 0 ? (
        <p className="text-sm text-gray-500">Ainda não tens pedidos registados.</p>
      ) : (
        <div className="grid gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-500">Pedidos recentes ({orderedOrders.length})</p>
            {orderedOrders.length > ORDERS_PER_PAGE ? (
              <div className="flex flex-wrap items-center gap-2.5 text-sm text-gray-600">
                <button
                  type="button"
                  className="flex items-center gap-1 font-bold text-[#c91b20] hover:underline disabled:opacity-40 disabled:no-underline"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Anterior
                </button>
                <span>Página {page} de {totalPages}</span>
                <button
                  type="button"
                  className="flex items-center gap-1 font-bold text-[#c91b20] hover:underline disabled:opacity-40 disabled:no-underline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                >
                  Seguinte
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>

          <div className="grid gap-2.5">
            {paginatedOrders.map((order) => (
              <article
                key={order.id}
                className="grid cursor-pointer gap-2 rounded-xl border border-gray-100 bg-white p-3 transition-all hover:-translate-y-px hover:border-red-200 hover:shadow-md"
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
                <div className="flex justify-between gap-3.5">
                  <div>
                    <p className="text-xs font-bold text-[#e62429]">Pedido #{order.id}</p>
                    <h4 className="mt-1 text-gray-800">{order.loja_nome}</h4>
                    <p className="mt-1 text-sm text-gray-500">{formatOrderMoment(order)}</p>
                  </div>

                  <div className="grid content-start justify-items-end gap-1.5">
                    <strong className="text-gray-900">{formatMoney(order.total)}</strong>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${statusClassName(order.status_tone)}`}>
                      {order.status_label}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="text-sm font-bold text-[#c91b20] hover:underline"
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

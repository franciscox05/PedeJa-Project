import { useEffect } from "react";
import { createPortal } from "react-dom";
import { groupSelectedMenuOptionsForDisplay } from "../../services/menuOptionsService";

function resolveTagClass(tone) {
  if (tone === "success") return "tag ok";
  if (tone === "danger") return "tag bad";
  return "tag warn";
}

function formatMoney(value) {
  return `${Number(value || 0).toFixed(2)}EUR`;
}

export default function OrderDetailsModal({
  isOpen,
  loading = false,
  error = "",
  data = null,
  onClose,
}) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  const order = data?.order || null;
  const items = data?.items || [];
  const store = data?.store || null;
  const driver = data?.driver || null;
  const customerAddress = order?.customer_address_label
    ? `${order.customer_address_label} · ${order.customer_address || "-"}`
    : (order?.customer_address || "-");

  return createPortal(
    <div className="shipday-modal-backdrop" onClick={onClose}>
      <div className="shipday-modal-card order-details-modal" onClick={(event) => event.stopPropagation()}>
        <div className="shipday-modal-header">
          <div>
            <p className="kicker">Pedido</p>
            <h3>{order ? `Detalhes do pedido #${order.id}` : "Detalhes do pedido"}</h3>
            <p className="muted">Consulta rapida de itens, observacoes, morada e contacto do cliente.</p>
          </div>
          <button type="button" className="btn-dashboard small secondary" onClick={onClose}>
            Fechar
          </button>
        </div>

        {loading ? <p className="muted">A carregar detalhes do pedido...</p> : null}
        {!loading && error ? <p className="shipday-inline-error">{error}</p> : null}

        {!loading && !error && order ? (
          <div className="order-details-content">
            <div className="order-details-summary">
              <div className="order-detail-block">
                <span className="muted">Estado</span>
                <div>
                  <span className={resolveTagClass(order.status_tone)}>{order.status_label || order.status}</span>
                </div>
              </div>
              <div className="order-detail-block">
                <span className="muted">Loja</span>
                <strong>{store?.nome || `Loja ${order.loja_id}`}</strong>
              </div>
              <div className="order-detail-block">
                <span className="muted">Total</span>
                <strong>{formatMoney(order.total)}</strong>
              </div>
              <div className="order-detail-block">
                <span className="muted">Pagamento</span>
                <strong>{data?.payment_method_label || "-"}</strong>
              </div>
            </div>

            <div className="order-details-grid">
              <div className="order-detail-card">
                <h4>Cliente</h4>
                <p><strong>{order.customer_nome || "-"}</strong></p>
                <p>{order.customer_phone || "-"}</p>
                <p>{order.customer_email || "-"}</p>
              </div>

              <div className="order-detail-card">
                <h4>Entrega</h4>
                <p>{customerAddress}</p>
                <p>{order.customer_notes || "Sem observacoes do cliente."}</p>
              </div>

              <div className="order-detail-card">
                <h4>Loja</h4>
                <p>{store?.nome || "-"}</p>
                <p>{store?.contacto || "-"}</p>
                <p>{store?.morada || "-"}</p>
              </div>

              <div className="order-detail-card">
                <h4>Estafeta</h4>
                <p><strong>{driver?.name || "Sem estafeta atribuido."}</strong></p>
                <p>{driver?.phone || "-"}</p>
                <p>{driver?.vehicle || "-"}</p>
              </div>

              <div className="order-detail-card">
                <h4>Resumo financeiro</h4>
                <p>Subtotal: <strong>{formatMoney(order.subtotal)}</strong></p>
                <p>Entrega: <strong>{formatMoney(order.taxa_entrega)}</strong></p>
                <p>Total: <strong>{formatMoney(order.total)}</strong></p>
              </div>
            </div>

            <div className="order-detail-card">
              <h4>Itens do pedido</h4>
              {items.length > 0 ? (
                <div className="order-items-list">
                  {items.map((item) => (
                    <div key={item.id} className="order-item-row">
                      <div>
                        <strong>{item.nome || `Item ${item.menu_id || item.id}`}</strong>
                        {groupSelectedMenuOptionsForDisplay(item.opcoes_selecionadas).map((group) => (
                          <p key={`${item.id}-${group.groupId}`} className="muted">
                            {group.title}: {group.options.map((option) => option.option_name).join(", ")}
                          </p>
                        ))}
                        <p className="muted">{item.quantidade} x {formatMoney(item.preco_unitario)}</p>
                      </div>
                      <strong>{formatMoney(item.subtotal)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">Sem itens associados ao pedido.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

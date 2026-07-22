import { useEffect } from "react";
import { createPortal } from "react-dom";
import InHouseTrackingMap from "../order/InHouseTrackingMap";
import "../../css/pages/pedidoDetalhe.css";

export default function InHouseTrackingModal({
  isOpen,
  title = "Tracking em tempo real",
  orderId,
  callerUserId,
  isLive,
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

  return createPortal(
    <div className="admin-modal-backdrop admin-modal-backdrop--tracking" onClick={onClose}>
      <div
        className="admin-modal-card admin-modal-card--tracking"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-header">
          <div>
            <h3>{title}</h3>
            <p className="muted">Localizacao do estafeta em tempo real (dispatch interno).</p>
          </div>
          <button type="button" className="btn-dashboard small secondary" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="admin-tracking-frame-wrap">
          <InHouseTrackingMap
            orderId={orderId}
            callerUserId={callerUserId}
            isLive={isLive}
            fallback={<p className="admin-inline-error">Tracking indisponivel para este pedido.</p>}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

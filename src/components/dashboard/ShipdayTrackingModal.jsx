import { useEffect } from "react";
import { createPortal } from "react-dom";

export default function ShipdayTrackingModal({
  isOpen,
  title = "Tracking Shipday",
  url = "",
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
    <div className="shipday-modal-backdrop shipday-modal-backdrop--tracking" onClick={onClose}>
      <div
        className="shipday-modal-card shipday-modal-card--tracking"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shipday-modal-header">
          <div>
            <h3>{title}</h3>
            <p className="muted">Tracking interno do Shipday carregado no dashboard.</p>
          </div>
          <button type="button" className="btn-dashboard small secondary" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="shipday-tracking-frame-wrap">
          {url ? (
            <iframe
              src={url}
              title={title}
              className="shipday-tracking-frame"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <p className="shipday-inline-error">Link de tracking indisponivel.</p>
          )}
        </div>

        {url ? (
          <div className="shipday-tracking-footer">
            <a href={url} target="_blank" rel="noreferrer" className="btn-dashboard small secondary">
              Abrir link direto
            </a>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

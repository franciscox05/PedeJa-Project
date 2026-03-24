import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

function sanitizeTrackingUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  try {
    const parsed = new URL(text);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function TrackingIframe({
  url,
  title,
  className = "pedido-tracking-frame",
}) {
  const safeUrl = useMemo(() => sanitizeTrackingUrl(url), [url]);

  if (!safeUrl) {
    return <p className="pedido-muted">Tracking indisponivel para visualizacao embebida.</p>;
  }

  return (
    <iframe
      src={safeUrl}
      title={title}
      className={className}
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}

export default function EmbeddedTrackingCard({
  url,
  title = "Tracking do pedido",
}) {
  const [expanded, setExpanded] = useState(false);
  const safeUrl = useMemo(() => sanitizeTrackingUrl(url), [url]);

  useEffect(() => {
    if (!expanded) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [expanded]);

  return (
    <>
      <div className="pedido-tracking-embed-card">
        <div className="pedido-tracking-embed-header">
          <div>
            <strong>Mapa em tempo real</strong>
            <p className="pedido-muted">Tracking Shipday carregado diretamente no detalhe do pedido.</p>
          </div>

          <div className="pedido-tracking-embed-actions">
            <button type="button" className="pedido-btn ghost" onClick={() => setExpanded(true)} disabled={!safeUrl}>
              Expandir Mapa
            </button>
            {safeUrl ? (
              <a href={safeUrl} target="_blank" rel="noreferrer" className="pedido-track-link pedido-track-link--cta">
                Abrir link direto
              </a>
            ) : null}
          </div>
        </div>

        <div className="pedido-tracking-frame-wrap">
          <TrackingIframe url={safeUrl} title={title} />
        </div>
      </div>

      {expanded && typeof document !== "undefined"
        ? createPortal(
          <div className="pedido-tracking-overlay" onClick={() => setExpanded(false)}>
            <div className="pedido-tracking-overlay-card" onClick={(event) => event.stopPropagation()}>
              <div className="pedido-tracking-embed-header">
                <div>
                  <strong>{title}</strong>
                  <p className="pedido-muted">Visualizacao expandida do tracking em tempo real.</p>
                </div>
                <button type="button" className="pedido-btn dark" onClick={() => setExpanded(false)}>
                  Fechar
                </button>
              </div>

              <div className="pedido-tracking-frame-wrap pedido-tracking-frame-wrap--expanded">
                <TrackingIframe url={safeUrl} title={`${title} expandido`} className="pedido-tracking-frame pedido-tracking-frame--expanded" />
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </>
  );
}

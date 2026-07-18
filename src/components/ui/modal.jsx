export default function Modal({ open, title, children, onClose, actions }) {
  if (!open) return null;

  return (
    <div className="app-modal-backdrop" onClick={onClose}>
      <div className="app-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="app-modal-header">
          <h3>{title}</h3>
          <button type="button" className="app-modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="app-modal-body">{children}</div>
        {actions ? <div className="app-modal-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

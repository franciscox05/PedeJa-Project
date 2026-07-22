export default function CarrierAssignModal({ carrierModal, onClose, onAssign }) {
  if (!carrierModal.open) return null;

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <h3>Atribuir estafeta</h3>
            <p className="muted">
              Pedido #{carrierModal.order?.id || "-"}
            </p>
          </div>
          <button className="btn-dashboard small secondary" onClick={onClose}>Fechar</button>
        </div>

        {carrierModal.loading ? <p className="muted">A carregar estafetas...</p> : null}
        {carrierModal.error ? <p className="admin-inline-error">{carrierModal.error}</p> : null}
        {carrierModal.success ? <p className="admin-inline-success">{carrierModal.success}</p> : null}

        {!carrierModal.loading && carrierModal.carriers.length > 0 ? (
          <div className="admin-carrier-list">
            {carrierModal.carriers.map((carrier) => (
              <article key={carrier.id} className="admin-carrier-card">
                <div>
                  <strong>{carrier.name || `Estafeta ${carrier.id}`}</strong>
                  <p className="muted">{carrier.phone || "Sem telemovel"} - {carrier.status || "-"}</p>
                </div>
                <button
                  className="btn-dashboard small"
                  disabled={carrierModal.assigningCarrierId === carrier.id}
                  onClick={() => onAssign(carrier)}
                >
                  {carrierModal.assigningCarrierId === carrier.id ? "A atribuir..." : "Atribuir"}
                </button>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

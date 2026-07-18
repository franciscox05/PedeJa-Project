function formatCurrency(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return parsed.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function resolveHistoryStatus(item) {
  if (item.entregue_em) return { label: "Entregue", className: "tag ok" };
  if (item.rejeitado_em) return { label: "Rejeitado", className: "tag warn" };
  if (item.cancelado_em) return { label: "Cancelado", className: "tag bad" };
  return { label: "Terminado", className: "tag warn" };
}

export default function EstafetaHistoryTab({ history, loading }) {
  if (loading) {
    return <div className="dashboard-tab-section"><p className="muted">A carregar histórico...</p></div>;
  }

  if (!history?.length) {
    return (
      <div className="dashboard-tab-section">
        <div className="estafeta-empty-state">
          <p>Ainda não tens entregas no histórico.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-tab-section">
      <div className="estafeta-history-list">
        {history.map((item) => {
          const status = resolveHistoryStatus(item);
          return (
            <div className="estafeta-history-row" key={item.id}>
              <div className="estafeta-history-row-main">
                <span className="estafeta-history-row-title">{item.customer_nome || "Cliente"}</span>
                <span className="estafeta-history-row-meta">
                  {item.customer_address} • {formatDateTime(item.criado_em)}
                </span>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className={status.className}>{status.label}</div>
                <div className="estafeta-history-row-meta">{formatCurrency(item.valor_estafeta)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

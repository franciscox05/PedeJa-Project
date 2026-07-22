import EstafetaEarningsChart from "./EstafetaEarningsChart";

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

function formatDuration(startValue, endValue) {
  if (!startValue || !endValue) return null;
  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  const totalMinutes = Math.round((end - start) / 60000);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  return `${Math.floor(totalMinutes / 60)}h${String(totalMinutes % 60).padStart(2, "0")}`;
}

export default function EstafetaHistoryTab({ history, loading, earningsByDay, loadingEarnings }) {
  return (
    <div className="dashboard-tab-section">
      <EstafetaEarningsChart earningsByDay={earningsByDay} loading={loadingEarnings} />

      {loading ? (
        <p className="muted">A carregar histórico...</p>
      ) : !history?.length ? (
        <div className="estafeta-empty-state">
          <p>Ainda não tens entregas no histórico.</p>
        </div>
      ) : (
        <div className="estafeta-history-list">
          {history.map((item) => {
            const status = resolveHistoryStatus(item);
            const duration = formatDuration(item.atribuido_em, item.entregue_em);
            return (
              <div className="estafeta-history-row" key={item.id}>
                <div className="estafeta-history-row-main">
                  <span className="estafeta-history-row-title">
                    {item.store_nome ? `${item.store_nome} → ` : ""}{item.customer_nome || "Cliente"}
                  </span>
                  <span className="estafeta-history-row-meta">
                    {item.customer_address} • {formatDateTime(item.criado_em)}
                    {Number.isFinite(Number(item.distancia_km)) ? ` • ${Number(item.distancia_km).toFixed(1)} km` : ""}
                    {duration ? ` • ${duration}` : ""}
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
      )}
    </div>
  );
}

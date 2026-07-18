import { Button } from "../ui/button";
import { getEstadoInternoLabelPt, getEstadoInternoTagClass } from "../../services/orderStatusMapper";

const NEXT_STEP_BY_ESTADO = {
  estafeta_aceitou: { estado: "recolhido", label: "Marcar como recolhido" },
  iniciado: { estado: "recolhido", label: "Marcar como recolhido" },
  em_preparacao: { estado: "recolhido", label: "Marcar como recolhido" },
  pronto_recolha: { estado: "recolhido", label: "Marcar como recolhido" },
  recolhido: { estado: "a_caminho", label: "A caminho do cliente" },
  pronto_entregar: { estado: "a_caminho", label: "A caminho do cliente" },
  a_caminho: { estado: "entregue", label: "Marcar como entregue" },
};

function formatCurrency(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return parsed.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

function buildMapsUrl(address, lat, lng) {
  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || "")}`;
}

export default function EstafetaHomeTab({
  estafeta,
  pendingAssignment,
  activeAssignment,
  onToggleOnline,
  onAccept,
  onReject,
  onAdvance,
  onCancel,
  busy,
}) {
  const isOnline = Boolean(estafeta?.online);
  const nextStep = activeAssignment ? NEXT_STEP_BY_ESTADO[activeAssignment.estado_interno] : null;

  return (
    <div className="dashboard-tab-section">
      <div className="estafeta-online-card">
        <div className="estafeta-online-card-status">
          <span className={`estafeta-online-dot${isOnline ? " is-online" : ""}`} />
          <span>{isOnline ? "Estás online" : "Estás offline"}</span>
        </div>
        <Button
          variant={isOnline ? "outline" : "default"}
          onClick={() => onToggleOnline(!isOnline)}
          disabled={busy || Boolean(activeAssignment)}
        >
          {isOnline ? "Ficar offline" : "Ficar online"}
        </Button>
      </div>

      <div className="estafeta-stats-row">
        <div className="estafeta-stat-card">
          <p className="estafeta-stat-label">Entregas totais</p>
          <p className="estafeta-stat-value">{estafeta?.total_entregas ?? 0}</p>
        </div>
        <div className="estafeta-stat-card">
          <p className="estafeta-stat-label">Ganhos totais</p>
          <p className="estafeta-stat-value">{formatCurrency(estafeta?.total_ganhos)}</p>
        </div>
        <div className="estafeta-stat-card">
          <p className="estafeta-stat-label">Avaliação</p>
          <p className="estafeta-stat-value">{Number(estafeta?.avaliacao_media ?? 5).toFixed(1)} ★</p>
        </div>
      </div>

      {pendingAssignment ? (
        <div className="estafeta-order-card estafeta-order-card--pending">
          <div className="estafeta-order-card-head">
            <h3 className="estafeta-order-card-title">🔔 Novo pedido disponível</h3>
            <span className="tag warn">Por responder</span>
          </div>
          <p className="estafeta-order-card-meta">Cliente: {pendingAssignment.customer_nome}</p>
          <p className="estafeta-order-card-meta">Morada: {pendingAssignment.customer_address}</p>
          <p className="estafeta-order-card-meta">Total do pedido: {formatCurrency(pendingAssignment.total)}</p>
          <p className="estafeta-order-card-meta">Ganho estimado: {formatCurrency(pendingAssignment.valor_estafeta)}</p>
          <div className="estafeta-order-card-actions">
            <Button onClick={() => onAccept(pendingAssignment.id)} disabled={busy}>
              Aceitar
            </Button>
            <Button variant="outline" onClick={() => onReject(pendingAssignment.id)} disabled={busy}>
              Rejeitar
            </Button>
          </div>
        </div>
      ) : null}

      {activeAssignment ? (
        <div className="estafeta-order-card estafeta-order-card--active">
          <div className="estafeta-order-card-head">
            <h3 className="estafeta-order-card-title">Entrega em curso</h3>
            <span className={getEstadoInternoTagClass(activeAssignment.estado_interno)}>
              {getEstadoInternoLabelPt(activeAssignment.estado_interno)}
            </span>
          </div>
          <p className="estafeta-order-card-meta">Cliente: {activeAssignment.customer_nome}</p>
          <p className="estafeta-order-card-meta">Morada: {activeAssignment.customer_address}</p>
          <p className="estafeta-order-card-meta">Ganho: {formatCurrency(activeAssignment.valor_estafeta)}</p>
          <div className="estafeta-order-card-actions">
            <Button
              variant="outline"
              onClick={() => window.open(
                buildMapsUrl(activeAssignment.customer_address, activeAssignment.customer_lat, activeAssignment.customer_lng),
                "_blank",
                "noopener,noreferrer",
              )}
            >
              Abrir no mapa
            </Button>
            {nextStep ? (
              <Button onClick={() => onAdvance(activeAssignment.id, nextStep.estado)} disabled={busy}>
                {nextStep.label}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              onClick={() => onCancel(activeAssignment.id)}
              disabled={busy}
            >
              Reportar problema
            </Button>
          </div>
        </div>
      ) : null}

      {!pendingAssignment && !activeAssignment ? (
        <div className="estafeta-empty-state">
          <p>{isOnline ? "Sem entregas de momento. Assim que houver um pedido, avisamos-te aqui." : "Fica online para começares a receber pedidos."}</p>
        </div>
      ) : null}
    </div>
  );
}

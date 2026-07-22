import { useState } from "react";
import { Button } from "../ui/button";
import { getEstadoInternoLabelPt, getEstadoInternoTagClass } from "../../services/orderStatusMapper";
import { groupSelectedMenuOptionsForDisplay } from "../../services/menuOptionsService";

const NEXT_STEP_BY_ESTADO = {
  estafeta_aceitou: { estado: "recolhido", label: "Marcar como recolhido" },
  iniciado: { estado: "recolhido", label: "Marcar como recolhido" },
  em_preparacao: { estado: "recolhido", label: "Marcar como recolhido" },
  pronto_recolha: { estado: "recolhido", label: "Marcar como recolhido" },
  recolhido: { estado: "a_caminho", label: "A caminho do cliente" },
  pronto_entregar: { estado: "a_caminho", label: "A caminho do cliente" },
  a_caminho: { estado: "entregue", label: "Marcar como entregue" },
};

const AVG_SPEED_KMH_BY_VEICULO = {
  bicicleta: 15,
  bike: 15,
  mota: 28,
  scooter: 28,
  carro: 24,
  car: 24,
  pe: 5,
};

const TIMELINE_STEPS = [
  { key: "order_created_at", label: "Pedido feito" },
  { key: "atribuido_em", label: "Atribuído a ti" },
  { key: "aceite_em", label: "Aceitaste" },
  { key: "recolhido_em", label: "Recolhido na loja" },
  { key: "a_caminho_em", label: "A caminho do cliente" },
  { key: "entregue_em", label: "Entregue" },
];

function formatCurrency(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return parsed.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function buildMapsUrl(address, lat, lng) {
  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || "")}`;
}

function normalizePhoneForLinks(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("351")) return digits;
  if (digits.length === 9) return `351${digits}`;
  return digits;
}

function buildTelUrl(phone) {
  const normalized = normalizePhoneForLinks(phone);
  return normalized ? `tel:+${normalized}` : null;
}

function buildWhatsappUrl(phone) {
  const normalized = normalizePhoneForLinks(phone);
  return normalized ? `https://wa.me/${normalized}` : null;
}

function openExternal(url) {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function haversineKm(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every((value) => Number.isFinite(Number(value)))) return null;
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function resolveAvgSpeedKmh(veiculo) {
  const key = String(veiculo || "").trim().toLowerCase();
  return AVG_SPEED_KMH_BY_VEICULO[key] || 22;
}

function DistanceEtaBadge({ estafeta, assignment }) {
  const isHeadingToStore = !assignment.recolhido_em;
  const targetLat = isHeadingToStore ? assignment.store_lat : assignment.customer_lat;
  const targetLng = isHeadingToStore ? assignment.store_lng : assignment.customer_lng;
  const distanceKm = haversineKm(
    estafeta?.ultima_localizacao_lat,
    estafeta?.ultima_localizacao_lng,
    targetLat,
    targetLng,
  );

  if (distanceKm === null) return null;

  const etaMinutes = Math.max(1, Math.round((distanceKm / resolveAvgSpeedKmh(estafeta?.veiculo)) * 60));

  return (
    <p className="estafeta-order-card-eta">
      📍 {isHeadingToStore ? "Até à loja" : "Até ao cliente"}: ~{distanceKm.toFixed(1)} km · ~{etaMinutes} min
    </p>
  );
}

function OrderTimeline({ assignment }) {
  return (
    <div className="estafeta-order-timeline">
      {TIMELINE_STEPS.map((step) => {
        const value = formatDateTime(assignment[step.key]);
        const done = Boolean(value);
        return (
          <div key={step.key} className={`estafeta-timeline-step${done ? " is-done" : ""}`}>
            <span className="estafeta-timeline-dot" />
            <span className="estafeta-timeline-label">{step.label}</span>
            <span className="estafeta-timeline-time">{value || "-"}</span>
          </div>
        );
      })}
    </div>
  );
}

function OrderItemsList({ items }) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    return <p className="estafeta-order-card-meta">Sem itens associados a este pedido.</p>;
  }

  return (
    <div className="estafeta-order-items-list">
      {list.map((item, index) => (
        <div key={`${item.nome}-${index}`} className="estafeta-order-item-row">
          <div>
            <strong>{item.quantidade}x {item.nome}</strong>
            {groupSelectedMenuOptionsForDisplay(item.opcoes_selecionadas).map((group) => (
              <p key={group.groupId} className="muted">
                {group.title}: {group.options.map((option) => option.option_name).join(", ")}
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function OrderDetailPanel({ assignment, showTimeline }) {
  const orderTime = formatDateTime(assignment.order_created_at);
  const scheduledTime = formatDateTime(assignment.scheduled_for);

  return (
    <div className="estafeta-order-detail-panel">
      <div className="estafeta-order-detail-times">
        {orderTime ? <p className="estafeta-order-card-meta">Pedido feito às {orderTime}</p> : null}
        {scheduledTime ? (
          <p className="estafeta-order-card-meta">Entrega agendada para {scheduledTime}</p>
        ) : (assignment.previsao_entrega ? (
          <p className="estafeta-order-card-meta">Previsão de entrega: {assignment.previsao_entrega}</p>
        ) : null)}
      </div>

      <p className="estafeta-order-card-meta"><strong>O que vais buscar:</strong></p>
      <OrderItemsList items={assignment.items} />

      {assignment.customer_notes ? (
        <p className="estafeta-order-card-meta"><strong>Notas do cliente:</strong> {assignment.customer_notes}</p>
      ) : null}

      {showTimeline ? (
        <>
          <p className="estafeta-order-card-meta" style={{ marginTop: 10 }}><strong>Linha do tempo:</strong></p>
          <OrderTimeline assignment={assignment} />
        </>
      ) : null}
    </div>
  );
}

function OrderCardActions({ assignment }) {
  const storeMapsUrl = buildMapsUrl(assignment.store_morada, assignment.store_lat, assignment.store_lng);
  const customerMapsUrl = buildMapsUrl(assignment.customer_address, assignment.customer_lat, assignment.customer_lng);
  const telUrl = buildTelUrl(assignment.customer_phone);
  const whatsappUrl = buildWhatsappUrl(assignment.customer_phone);

  return (
    <div className="estafeta-order-card-actions">
      <Button variant="outline" onClick={() => openExternal(storeMapsUrl)}>
        Navegar até à loja
      </Button>
      <Button variant="outline" onClick={() => openExternal(customerMapsUrl)}>
        Navegar até ao cliente
      </Button>
      {telUrl ? (
        <Button variant="outline" onClick={() => openExternal(telUrl)}>
          Ligar ao cliente
        </Button>
      ) : null}
      {whatsappUrl ? (
        <Button variant="outline" onClick={() => openExternal(whatsappUrl)}>
          WhatsApp
        </Button>
      ) : null}
    </div>
  );
}

export default function EstafetaHomeTab({
  estafeta,
  pendingAssignment,
  activeAssignment,
  onToggleOnline,
  onAccept,
  onReject,
  onAdvance,
  onRequestDeliveryProof,
  onRevert,
  onCancel,
  busy,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const isOnline = Boolean(estafeta?.online);
  const nextStep = activeAssignment ? NEXT_STEP_BY_ESTADO[activeAssignment.estado_interno] : null;
  const isFinalStep = nextStep?.estado === "entregue";
  const canRevert = Boolean(
    activeAssignment && ["recolhido", "pronto_entregar", "a_caminho"].includes(activeAssignment.estado_interno),
  );

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
          <p className="estafeta-order-card-store">Recolher em: {pendingAssignment.store_nome || `Loja ${pendingAssignment.loja_id}`}</p>
          <p className="estafeta-order-card-meta">Cliente: {pendingAssignment.customer_nome}</p>
          <p className="estafeta-order-card-meta">Morada: {pendingAssignment.customer_address}</p>
          <p className="estafeta-order-card-meta">Total do pedido: {formatCurrency(pendingAssignment.total)}</p>
          <p className="estafeta-order-card-meta">Ganho estimado: {formatCurrency(pendingAssignment.valor_estafeta)}</p>
          <DistanceEtaBadge estafeta={estafeta} assignment={pendingAssignment} />

          <button
            type="button"
            className="dashboard-link-button"
            onClick={() => setExpandedId(expandedId === pendingAssignment.id ? null : pendingAssignment.id)}
          >
            {expandedId === pendingAssignment.id ? "Esconder detalhes do pedido" : "Ver detalhes do pedido"}
          </button>
          {expandedId === pendingAssignment.id ? <OrderDetailPanel assignment={pendingAssignment} /> : null}

          <OrderCardActions assignment={pendingAssignment} />

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
          <p className="estafeta-order-card-store">Recolher em: {activeAssignment.store_nome || `Loja ${activeAssignment.loja_id}`}</p>
          <p className="estafeta-order-card-meta">Cliente: {activeAssignment.customer_nome}</p>
          <p className="estafeta-order-card-meta">Morada: {activeAssignment.customer_address}</p>
          <p className="estafeta-order-card-meta">Ganho: {formatCurrency(activeAssignment.valor_estafeta)}</p>
          <DistanceEtaBadge estafeta={estafeta} assignment={activeAssignment} />

          <button
            type="button"
            className="dashboard-link-button"
            onClick={() => setExpandedId(expandedId === activeAssignment.id ? null : activeAssignment.id)}
          >
            {expandedId === activeAssignment.id ? "Esconder detalhes do pedido" : "Ver detalhes do pedido"}
          </button>
          {expandedId === activeAssignment.id ? <OrderDetailPanel assignment={activeAssignment} showTimeline /> : null}

          <OrderCardActions assignment={activeAssignment} />

          <div className="estafeta-order-card-actions">
            {canRevert ? (
              <Button variant="outline" onClick={() => onRevert(activeAssignment.id)} disabled={busy}>
                Voltar atrás
              </Button>
            ) : null}
            {nextStep ? (
              <Button
                onClick={() => (isFinalStep
                  ? onRequestDeliveryProof(activeAssignment.id)
                  : onAdvance(activeAssignment.id, nextStep.estado))}
                disabled={busy}
              >
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

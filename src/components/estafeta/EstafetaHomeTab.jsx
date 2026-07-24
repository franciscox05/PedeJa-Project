import { useEffect, useState } from "react";
import {
  Store,
  Bike,
  CheckCircle2,
  Navigation,
  Check,
  MapPin,
  AlertTriangle,
  Truck,
  Banknote,
  Star,
  BellRing,
  ChevronUp,
  ChevronDown,
  X,
  ClipboardList,
  Phone,
  MessageCircle,
  Undo2,
  Hourglass,
  Moon,
} from "lucide-react";
import { getEstadoInternoLabelPt, getEstadoInternoTone } from "../../services/orderStatusMapper";
import { groupSelectedMenuOptionsForDisplay } from "../../services/menuOptionsService";
import { getDrivingRoute } from "../../services/googleMapsService";

const NEXT_STEP_BY_ESTADO = {
  estafeta_aceitou: { estado: "recolhido", label: "Marcar como recolhido", icon: Store },
  iniciado: { estado: "recolhido", label: "Marcar como recolhido", icon: Store },
  em_preparacao: { estado: "recolhido", label: "Marcar como recolhido", icon: Store },
  pronto_recolha: { estado: "recolhido", label: "Marcar como recolhido", icon: Store },
  recolhido: { estado: "a_caminho", label: "A caminho do cliente", icon: Bike },
  pronto_entregar: { estado: "a_caminho", label: "A caminho do cliente", icon: Bike },
  a_caminho: { estado: "entregue", label: "Marcar como entregue", icon: CheckCircle2 },
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

function EstafetaButton({ variant = "primary", size, icon: Icon, children, ...rest }) {
  const classNames = ["estafeta-btn", `estafeta-btn--${variant}`, size ? `estafeta-btn--${size}` : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={classNames} {...rest}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

// Mostra distancia/tempo reais de estrada (Google Distance Matrix) em vez de
// linha reta -- a estimativa em linha reta fica so como fallback instantaneo
// enquanto a chamada real nao responde (ou se falhar), porque em estradas
// rurais como as da zona de Barcelos o desvio entre as duas pode ser grande.
function DistanceEtaBadge({ estafeta, assignment, isPending }) {
  const isHeadingToStore = isPending || !assignment.recolhido_em;
  const targetLat = isHeadingToStore ? assignment.store_lat : assignment.customer_lat;
  const targetLng = isHeadingToStore ? assignment.store_lng : assignment.customer_lng;
  const originLat = estafeta?.ultima_localizacao_lat;
  const originLng = estafeta?.ultima_localizacao_lng;

  const fallbackKm = haversineKm(originLat, originLng, targetLat, targetLng);
  const routeKey = fallbackKm === null ? null : `${originLat},${originLng}|${targetLat},${targetLng}`;
  const [route, setRoute] = useState(null);

  useEffect(() => {
    if (!routeKey) return undefined;
    let cancelled = false;
    getDrivingRoute({ lat: originLat, lng: originLng }, { lat: targetLat, lng: targetLng })
      .then((result) => {
        if (!cancelled) setRoute({ key: routeKey, ...result });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [routeKey, originLat, originLng, targetLat, targetLng]);

  if (fallbackKm === null) return null;

  const hasRealRoute = route?.key === routeKey;
  const distanceKm = hasRealRoute ? route.distanceKm : fallbackKm;
  const etaMinutes = hasRealRoute
    ? Math.max(1, Math.round(route.durationMinutes))
    : Math.max(1, Math.round((fallbackKm / resolveAvgSpeedKmh(estafeta?.veiculo)) * 60));

  return (
    <p className="estafeta-order-card-eta">
      <Navigation aria-hidden="true" />
      {isHeadingToStore ? "Até à loja" : "Até ao cliente"}: ~{distanceKm.toFixed(1)} km · ~{etaMinutes} min
    </p>
  );
}

// Viagem em 2 paragens (recolha na loja -> entrega ao cliente), no padrao
// usado por apps de dispatch de estafetas -- a paragem atual fica destacada,
// a concluida fica com o visto e esbatida.
function TaskStops({ assignment, isPending }) {
  const pickupDone = !isPending && Boolean(assignment.recolhido_em);
  const deliveryDone = !isPending && Boolean(assignment.entregue_em);
  const pickupIsCurrent = !pickupDone;
  const deliveryIsCurrent = pickupDone && !deliveryDone;

  return (
    <div className="estafeta-task-stops">
      <div className={`estafeta-task-stop${pickupDone ? " is-done" : ""}${pickupIsCurrent ? " is-current" : ""}`}>
        <span className="estafeta-task-stop-marker">
          {pickupDone ? <Check aria-hidden="true" /> : <Store aria-hidden="true" />}
        </span>
        <div className="estafeta-task-stop-body">
          <p className="estafeta-task-stop-label">Recolha</p>
          <p className="estafeta-task-stop-name">{assignment.store_nome || `Loja ${assignment.loja_id}`}</p>
          <p className="estafeta-task-stop-address">{assignment.store_morada || "Morada não disponível"}</p>
          {pickupDone && assignment.recolhido_em ? (
            <p className="estafeta-task-stop-time">Recolhido às {formatDateTime(assignment.recolhido_em)}</p>
          ) : null}
        </div>
      </div>

      <div className={`estafeta-task-stop${deliveryDone ? " is-done" : ""}${deliveryIsCurrent ? " is-current" : ""}`}>
        <span className="estafeta-task-stop-marker">
          {deliveryDone ? <Check aria-hidden="true" /> : <MapPin aria-hidden="true" />}
        </span>
        <div className="estafeta-task-stop-body">
          <p className="estafeta-task-stop-label">Entrega</p>
          <p className="estafeta-task-stop-name">{assignment.customer_nome}</p>
          <p className="estafeta-task-stop-address">{assignment.customer_address}</p>
        </div>
      </div>
    </div>
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
          <span className="estafeta-order-item-qty">{item.quantidade}x</span>
          <div>
            <strong>{item.nome}</strong>
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
        <p className="estafeta-order-card-meta">Total do pedido: <strong>{formatCurrency(assignment.total)}</strong></p>
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

// Acoes de contacto/navegacao focadas so na paragem atual da tarefa (loja
// enquanto nao ha recolha, cliente depois) -- em vez de mostrar sempre os 4
// botoes, guia o estafeta passo a passo como um app de dispatch a serio.
function TaskStopActions({ assignment, isPending }) {
  const pickupDone = !isPending && Boolean(assignment.recolhido_em);

  if (!pickupDone) {
    const storeMapsUrl = buildMapsUrl(assignment.store_morada, assignment.store_lat, assignment.store_lng);
    const storeTelUrl = buildTelUrl(assignment.store_contacto);
    return (
      <div className="estafeta-order-card-actions">
        <EstafetaButton variant="outline" size="sm" icon={Store} onClick={() => openExternal(storeMapsUrl)}>
          Navegar até à loja
        </EstafetaButton>
        {storeTelUrl ? (
          <EstafetaButton variant="outline" size="sm" icon={Phone} onClick={() => openExternal(storeTelUrl)}>
            Ligar à loja
          </EstafetaButton>
        ) : null}
      </div>
    );
  }

  const customerMapsUrl = buildMapsUrl(assignment.customer_address, assignment.customer_lat, assignment.customer_lng);
  const telUrl = buildTelUrl(assignment.customer_phone);
  const whatsappUrl = buildWhatsappUrl(assignment.customer_phone);

  return (
    <div className="estafeta-order-card-actions">
      <EstafetaButton variant="outline" size="sm" icon={MapPin} onClick={() => openExternal(customerMapsUrl)}>
        Navegar até ao cliente
      </EstafetaButton>
      {telUrl ? (
        <EstafetaButton variant="outline" size="sm" icon={Phone} onClick={() => openExternal(telUrl)}>
          Ligar
        </EstafetaButton>
      ) : null}
      {whatsappUrl ? (
        <EstafetaButton variant="outline" size="sm" icon={MessageCircle} onClick={() => openExternal(whatsappUrl)}>
          WhatsApp
        </EstafetaButton>
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
  locationStatus = "idle",
  locationErrorMessage = "",
}) {
  const [expandedId, setExpandedId] = useState(null);
  const isOnline = Boolean(estafeta?.online);
  const nextStep = activeAssignment ? NEXT_STEP_BY_ESTADO[activeAssignment.estado_interno] : null;
  const isFinalStep = nextStep?.estado === "entregue";
  const canRevert = Boolean(
    activeAssignment && ["recolhido", "pronto_entregar", "a_caminho"].includes(activeAssignment.estado_interno),
  );
  const activeTone = activeAssignment ? getEstadoInternoTone(activeAssignment.estado_interno) : "warn";

  return (
    <div className="estafeta-app-section">
      <div className="estafeta-online-card">
        <div className="estafeta-online-card-status">
          <span className={`estafeta-online-dot${isOnline ? " is-online" : ""}`} />
          <span>{isOnline ? "Estás online" : "Estás offline"}</span>
        </div>
        <EstafetaButton
          variant={isOnline ? "outline" : "primary"}
          size="sm"
          onClick={() => onToggleOnline(!isOnline)}
          disabled={busy || Boolean(activeAssignment)}
        >
          {isOnline ? "Ficar offline" : "Ficar online"}
        </EstafetaButton>
      </div>

      {isOnline && locationStatus === "error" ? (
        <div className="estafeta-location-warning">
          <AlertTriangle aria-hidden="true" />
          <span>{locationErrorMessage || "Não foi possível partilhar a tua localização."} Sem isto, o admin não te vê corretamente no mapa nem consegue calcular distâncias.</span>
        </div>
      ) : null}

      <div className="estafeta-stats-row">
        <div className="estafeta-stat-card">
          <span className="estafeta-stat-icon"><Truck aria-hidden="true" /></span>
          <p className="estafeta-stat-label">Entregas</p>
          <p className="estafeta-stat-value">{estafeta?.total_entregas ?? 0}</p>
        </div>
        <div className="estafeta-stat-card">
          <span className="estafeta-stat-icon"><Banknote aria-hidden="true" /></span>
          <p className="estafeta-stat-label">Ganhos totais</p>
          <p className="estafeta-stat-value">{formatCurrency(estafeta?.total_ganhos)}</p>
        </div>
        <div className="estafeta-stat-card">
          <span className="estafeta-stat-icon"><Star aria-hidden="true" /></span>
          <p className="estafeta-stat-label">Avaliação</p>
          <p className="estafeta-stat-value">{Number(estafeta?.avaliacao_media ?? 5).toFixed(1)}</p>
        </div>
      </div>

      {pendingAssignment ? (
        <div className="estafeta-order-card estafeta-order-card--pending">
          <div className="estafeta-order-card-head">
            <h3 className="estafeta-order-card-title">
              <BellRing aria-hidden="true" />
              Nova tarefa
            </h3>
            <span className="estafeta-tag estafeta-tag--warn">Por responder</span>
          </div>
          <p className="estafeta-task-earn">Ganho estimado <strong>{formatCurrency(pendingAssignment.valor_estafeta)}</strong></p>

          <TaskStops assignment={pendingAssignment} isPending />
          <DistanceEtaBadge estafeta={estafeta} assignment={pendingAssignment} isPending />

          <button
            type="button"
            className="estafeta-link-btn"
            onClick={() => setExpandedId(expandedId === pendingAssignment.id ? null : pendingAssignment.id)}
          >
            {expandedId === pendingAssignment.id ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            {expandedId === pendingAssignment.id ? "Esconder detalhes do pedido" : "Ver detalhes do pedido"}
          </button>
          {expandedId === pendingAssignment.id ? <OrderDetailPanel assignment={pendingAssignment} /> : null}

          <div className="estafeta-task-cta-row">
            <EstafetaButton variant="primary" size="lg" icon={Check} onClick={() => onAccept(pendingAssignment.id)} disabled={busy}>
              Aceitar tarefa
            </EstafetaButton>
            <EstafetaButton variant="outline" size="lg" icon={X} onClick={() => onReject(pendingAssignment.id)} disabled={busy}>
              Rejeitar
            </EstafetaButton>
          </div>
        </div>
      ) : null}

      {activeAssignment ? (
        <div className="estafeta-order-card estafeta-order-card--active">
          <div className="estafeta-order-card-head">
            <h3 className="estafeta-order-card-title">
              <ClipboardList aria-hidden="true" />
              Tarefa #{activeAssignment.order_id}
            </h3>
            <span className={`estafeta-tag estafeta-tag--${activeTone}`}>
              {getEstadoInternoLabelPt(activeAssignment.estado_interno)}
            </span>
          </div>
          <p className="estafeta-task-earn">Ganho <strong>{formatCurrency(activeAssignment.valor_estafeta)}</strong></p>

          <TaskStops assignment={activeAssignment} />
          <DistanceEtaBadge estafeta={estafeta} assignment={activeAssignment} />

          <TaskStopActions assignment={activeAssignment} />

          <button
            type="button"
            className="estafeta-link-btn"
            onClick={() => setExpandedId(expandedId === activeAssignment.id ? null : activeAssignment.id)}
          >
            {expandedId === activeAssignment.id ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            {expandedId === activeAssignment.id ? "Esconder detalhes do pedido" : "Ver detalhes do pedido"}
          </button>
          {expandedId === activeAssignment.id ? <OrderDetailPanel assignment={activeAssignment} showTimeline /> : null}

          {nextStep ? (
            <button
              type="button"
              className="estafeta-task-primary-cta"
              onClick={() => (isFinalStep
                ? onRequestDeliveryProof(activeAssignment.id)
                : onAdvance(activeAssignment.id, nextStep.estado))}
              disabled={busy}
            >
              <nextStep.icon aria-hidden="true" />
              {nextStep.label}
            </button>
          ) : null}

          <div className="estafeta-task-secondary-row">
            {canRevert ? (
              <button type="button" className="estafeta-link-btn" onClick={() => onRevert(activeAssignment.id)} disabled={busy}>
                <Undo2 aria-hidden="true" />
                Voltar atrás
              </button>
            ) : null}
            <button type="button" className="estafeta-link-btn estafeta-link-btn--danger" onClick={() => onCancel(activeAssignment.id)} disabled={busy}>
              <AlertTriangle aria-hidden="true" />
              Reportar problema
            </button>
          </div>
        </div>
      ) : null}

      {!pendingAssignment && !activeAssignment ? (
        <div className="estafeta-empty-state">
          {isOnline ? (
            <Hourglass className="estafeta-empty-state-icon" aria-hidden="true" />
          ) : (
            <Moon className="estafeta-empty-state-icon" aria-hidden="true" />
          )}
          <p>{isOnline ? "Sem entregas de momento. Assim que houver um pedido, avisamos-te aqui." : "Fica online para começares a receber pedidos."}</p>
        </div>
      ) : null}
    </div>
  );
}

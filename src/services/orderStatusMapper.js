export const ESTADO_INTERNO_SEQUENCE = [
  "pendente",
  "aceite",
  "atribuindo_estafeta",
  "estafeta_aceitou",
  "em_preparacao",
  "pronto_recolha",
  "iniciado",
  "recolhido",
  "pronto_entregar",
  "a_caminho",
  "entregue",
  "cancelado",
];

export const LEGACY_TO_ESTADO_INTERNO = {
  PENDING: "pendente",
  PENDING_PAYMENT: "pendente",
  CREATED: "pendente",
  ACCEPTED: "estafeta_aceitou",
  CONFIRMED: "aceite",
  ASSIGNING_DRIVER: "atribuindo_estafeta",
  PREPARING: "em_preparacao",
  ASSIGNED: "estafeta_aceitou",
  READY: "pronto_recolha",
  READY_FOR_PICKUP: "pronto_recolha",
  STARTED: "iniciado",
  PICKED_UP: "recolhido",
  READY_TO_DELIVER: "a_caminho",
  OUT_FOR_DELIVERY: "a_caminho",
  ON_THE_WAY: "a_caminho",
  DELIVERED: "entregue",
  FAILED: "cancelado",
  CANCELLED: "cancelado",
  REJECTED: "cancelado",
};

export const SHIPDAY_TO_ESTADO_INTERNO = {
  ACCEPTED: "estafeta_aceitou",
  ASSIGNED: "estafeta_aceitou",
  ACTIVE: "estafeta_aceitou",
  STARTED: "iniciado",
  DISPATCHED: "a_caminho",
  OUT_FOR_DELIVERY: "a_caminho",
  ALREADY_DELIVERING: "a_caminho",
  REJECTED: "aceite",
  NOT_ACCEPTED: "aceite",
  UNASSIGNED: "aceite",
  DELETED: "aceite",
  READY: "pronto_recolha",
  READY_FOR_PICKUP: "pronto_recolha",
  PICKED_UP: "recolhido",
  READY_TO_DELIVER: "a_caminho",
  ON_THE_WAY: "a_caminho",
  DELIVERED: "entregue",
  SUCCESSFUL: "entregue",
  COMPLETED: "entregue",
  ALREADY_DELIVERED: "entregue",
  FAILED: "cancelado",
  CANCELLED: "cancelado",
};

export const ESTADO_INTERNO_TO_LEGACY_STATUS = {
  pendente: "PENDING",
  aceite: "CONFIRMED",
  atribuindo_estafeta: "ASSIGNING_DRIVER",
  estafeta_aceitou: "ASSIGNED",
  em_preparacao: "PREPARING",
  pronto_recolha: "READY_FOR_PICKUP",
  iniciado: "STARTED",
  recolhido: "PICKED_UP",
  pronto_entregar: "READY_TO_DELIVER",
  a_caminho: "OUT_FOR_DELIVERY",
  entregue: "DELIVERED",
  cancelado: "CANCELLED",
};

export const ESTADO_INTERNO_TO_SHIPDAY = {
  pendente: null,
  aceite: null,
  atribuindo_estafeta: null,
  estafeta_aceitou: null,
  em_preparacao: "ASSIGNED",
  pronto_recolha: "READY_FOR_PICKUP",
  iniciado: "STARTED",
  recolhido: "PICKED_UP",
  pronto_entregar: "READY_TO_DELIVER",
  a_caminho: "ON_THE_WAY",
  entregue: "DELIVERED",
  cancelado: "FAILED",
};

export const ESTADO_INTERNO_LABEL_PT = {
  pendente: "Pendente",
  aceite: "Aceite",
  atribuindo_estafeta: "Atribuindo estafeta",
  estafeta_aceitou: "Estafeta Atribuído",
  em_preparacao: "Em preparacao",
  pronto_recolha: "Pronto para recolha",
  iniciado: "Estafeta a caminho da loja",
  recolhido: "Recolhido",
  pronto_entregar: "Pronto para Entregar",
  a_caminho: "A caminho",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export function normalizeShipdayState(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function normalizeEstadoInterno(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ESTADO_INTERNO_SEQUENCE.includes(normalized) ? normalized : null;
}

export function mapShipdayToEstadoInterno(shipdayState) {
  const key = normalizeShipdayState(shipdayState);
  return SHIPDAY_TO_ESTADO_INTERNO[key] || null;
}

export function mapLegacyStatusToEstadoInterno(legacyStatus) {
  const key = normalizeShipdayState(legacyStatus);
  return LEGACY_TO_ESTADO_INTERNO[key] || null;
}

export function mapEstadoInternoToLegacyStatus(estadoInterno) {
  const key = normalizeEstadoInterno(estadoInterno);
  return key ? ESTADO_INTERNO_TO_LEGACY_STATUS[key] || null : null;
}

export function mapEstadoInternoToShipdayState(estadoInterno) {
  const key = normalizeEstadoInterno(estadoInterno);
  if (!key) return null;
  return ESTADO_INTERNO_TO_SHIPDAY[key] || null;
}

export function resolveOrderEstadoInterno(order) {
  const direct = normalizeEstadoInterno(order?.estado_interno);
  if (direct) return direct;

  const fromLegacy = mapLegacyStatusToEstadoInterno(order?.status);
  if (fromLegacy) return fromLegacy;

  return "pendente";
}

export function getEstadoInternoLabelPt(estadoInterno) {
  const key = normalizeEstadoInterno(estadoInterno);
  return key ? ESTADO_INTERNO_LABEL_PT[key] || key : "Pendente";
}

export function getEstadoInternoTone(estadoInterno) {
  const key = normalizeEstadoInterno(estadoInterno);
  if (!key) return "warn";
  if (["a_caminho", "entregue"].includes(key)) return "ok";
  if (key === "cancelado") return "bad";
  return "warn";
}

export function getEstadoInternoTagClass(estadoInterno) {
  const tone = getEstadoInternoTone(estadoInterno);
  if (tone === "ok") return "tag ok";
  if (tone === "bad") return "tag bad";
  return "tag warn";
}

export function getRestaurantActionsForEstado(estadoInterno) {
  const key = normalizeEstadoInterno(estadoInterno);
  if (!key) return [];

  if (key === "pendente") {
    return [
      { action: "aceitar", toEstado: "aceite", label: "Aceitar Pedido", variant: "primary" },
      { action: "recusar", toEstado: "cancelado", label: "Recusar", variant: "secondary" },
    ];
  }

  if (key === "estafeta_aceitou" || key === "iniciado") {
    return [{ action: "preparar", toEstado: "em_preparacao", label: "Comecar a Preparar", variant: "primary" }];
  }

  if (key === "em_preparacao") {
    return [
      { action: "desfazer_aceite", toEstado: "estafeta_aceitou", label: "⏪ Desfazer", variant: "secondary" },
      { action: "pronto", toEstado: "pronto_recolha", label: "Pronto para Recolha", variant: "primary" },
    ];
  }

  if (key === "pronto_recolha") {
    return [
      { action: "desfazer_preparacao", toEstado: "em_preparacao", label: "⏪ Voltar a Preparar", variant: "secondary" },
    ];
  }

  return [];
}

export function resolveNextEstadoInterno(currentEstadoInterno, shipdayState) {
  const current = normalizeEstadoInterno(currentEstadoInterno);
  const normalizedShipdayState = normalizeShipdayState(shipdayState);

  if (current === "atribuindo_estafeta") {
    if (["ASSIGNED", "ACTIVE", "ACCEPTED"].includes(normalizedShipdayState)) {
      return "estafeta_aceitou";
    }

    if (normalizedShipdayState === "STARTED") {
      return "iniciado";
    }

    if (["REJECTED", "DELETED"].includes(normalizedShipdayState)) {
      return "aceite";
    }

    return "atribuindo_estafeta";
  }

  const mapped = mapShipdayToEstadoInterno(normalizedShipdayState);
  if (!mapped) return current || "pendente";
  return mapped;
}

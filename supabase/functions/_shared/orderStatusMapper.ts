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
] as const;

export type EstadoInterno = (typeof ESTADO_INTERNO_SEQUENCE)[number];

export const SHIPDAY_TO_ESTADO_INTERNO: Partial<Record<string, EstadoInterno>> = {
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

export const ESTADO_INTERNO_TO_LEGACY_STATUS: Record<EstadoInterno, string> = {
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

export function normalizeShipdayState(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function normalizeEstadoInterno(value: unknown): EstadoInterno | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ESTADO_INTERNO_SEQUENCE.includes(normalized as EstadoInterno)
    ? (normalized as EstadoInterno)
    : null;
}

export function mapShipdayToEstadoInterno(shipdayState: unknown): EstadoInterno | null {
  const key = normalizeShipdayState(shipdayState);
  return SHIPDAY_TO_ESTADO_INTERNO[key] ?? null;
}

export function mapEstadoInternoToLegacyStatus(estadoInterno: unknown): string | null {
  const key = normalizeEstadoInterno(estadoInterno);
  return key ? ESTADO_INTERNO_TO_LEGACY_STATUS[key] ?? null : null;
}

export function resolveNextEstadoInterno(currentEstadoInterno: unknown, shipdayState: unknown): EstadoInterno {
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
  if (!mapped) return current ?? "pendente";
  return mapped;
}

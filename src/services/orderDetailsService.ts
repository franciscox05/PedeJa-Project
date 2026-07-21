import { supabase } from "./supabaseClient";
import { extractRestaurantId, extractUserId, resolveUserRole } from "../utils/roles";
import { getEstadoInternoLabelPt, getEstadoInternoTone, resolveOrderEstadoInterno } from "./orderStatusMapper";

export interface DriverInfo {
  name: string | null;
  phone: string | null;
  vehicle: string | null;
}

export interface OrderDetailsOrder {
  id: number;
  loja_id: number | string | null;
  customer_nome: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  customer_address_label: string | null;
  customer_notes: string | null;
  subtotal: number;
  taxa_entrega: number;
  total: number;
  payment_method?: string | null;
  payment_label?: string | null;
  status: string;
  status_legacy_label: string;
  estado_interno: string;
  status_label: string;
  status_tone: string;
  previsao_entrega?: string | null;
  veiculo_estafeta?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  created_at: string | null;
  updated_at: string | null;
  submitted_at: string | null;
  order_timing_mode: string;
  scheduled_for?: string | null;
  aceite_em?: string | null;
  atribuido_em?: string | null;
  recolhido_em?: string | null;
  entregue_em?: string | null;
}

export interface OrderDetailsItem {
  id: number | string;
  order_id: number | string;
  menu_id?: number | string | null;
  nome: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
  opcoes_selecionadas?: Array<Record<string, unknown>>;
  created_at?: string | null;
}

export interface OrderDetailsResult {
  order: OrderDetailsOrder;
  items: OrderDetailsItem[];
  store: {
    id: number | string | null;
    nome: string;
    contacto: string | null;
    morada: string | null;
    icon: string | null;
  };
  timeline: Array<Record<string, unknown>>;
  workflow: {
    estado_interno: string;
    current_label: string;
    is_canceled: boolean;
    steps: Array<{
      key: string;
      label: string;
      index: number;
      is_current: boolean;
      is_completed: boolean;
      is_pending: boolean;
    }>;
  };
  driver: DriverInfo;
  estimated_delivery: string | null;
  payment_method_label: string | null;
  is_live: boolean;
}

const TERMINAL_ESTADO_INTERNO = new Set<string>(["entregue", "cancelado"]);

const WORKFLOW_STEPS = [
  "pendente",
  "aceite",
  "estafeta_aceitou",
  "em_preparacao",
  "pronto_recolha",
  "recolhido",
  "a_caminho",
  "entregue",
];

const WORKFLOW_INDEX_BY_ESTADO: Record<string, number> = {
  pendente: 0,
  aceite: 1,
  atribuindo_estafeta: 2,
  estafeta_aceitou: 2,
  iniciado: 2,
  em_preparacao: 3,
  pronto_recolha: 4,
  recolhido: 5,
  a_caminho: 6,
  entregue: 7,
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizeStatus(value: unknown, fallback = "PENDING") {
  const text = String(value || fallback).trim().toUpperCase();
  return text || fallback;
}

function statusLabelPt(status: unknown) {
  const key = normalizeStatus(status);
  const map = {
    PENDING_PAYMENT: "Pagamento pendente",
    PENDING: "Pendente",
    CREATED: "Criado",
    CONFIRMED: "Confirmado",
    PREPARING: "Em preparacao",
    READY_FOR_PICKUP: "Pronto para recolha",
    OUT_FOR_DELIVERY: "Em entrega",
    DISPATCHED: "Enviado",
    DELIVERED: "Entregue",
    CANCELLED: "Cancelado",
    FAILED: "Falhada",
    APPROVED: "Aprovado",
    REJECTED: "Rejeitado",
    ON_THE_WAY: "A caminho",
    PICKED_UP: "Recolhido",
  };
  return map[key] || key;
}

function statusTone(status: unknown) {
  const key = normalizeStatus(status);
  if (["DELIVERED", "CONFIRMED", "APPROVED"].includes(key)) return "success";
  if (["FAILED", "CANCELLED", "REJECTED"].includes(key)) return "danger";
  return "warning";
}

function mapEstadoToneToUi(tone: string | null | undefined) {
  if (tone === "ok") return "success";
  if (tone === "bad") return "danger";
  return "warning";
}

function buildWorkflowProgress(estadoInterno: string | null | undefined) {
  const normalizedEstado = resolveOrderEstadoInterno({ estado_interno: estadoInterno });
  const rawCurrentIndex = WORKFLOW_INDEX_BY_ESTADO[normalizedEstado] ?? 0;
  const acceptedIndex = WORKFLOW_INDEX_BY_ESTADO.aceite ?? 1;
  const effectiveCurrentIndex = normalizedEstado === "atribuindo_estafeta"
    ? acceptedIndex
    : rawCurrentIndex;

  return {
    estado_interno: normalizedEstado,
    current_label: getEstadoInternoLabelPt(normalizedEstado),
    is_canceled: normalizedEstado === "cancelado",
    steps: WORKFLOW_STEPS.map((step, index) => ({
      key: step,
      label: getEstadoInternoLabelPt(step),
      index,
      is_current: normalizedEstado !== "cancelado" && index === effectiveCurrentIndex,
      is_completed: normalizedEstado !== "cancelado" && index <= effectiveCurrentIndex,
      is_pending: normalizedEstado === "cancelado" ? index > 0 : index > effectiveCurrentIndex,
    })),
  };
}
function parseSelectedOptions(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeVehicleSegment(value: unknown) {
  const text = toText(value);
  if (!text) return null;

  return text
    .replace(/\bmotorcycle\b/gi, "Mota")
    .replace(/\bbike\b/gi, "Bicicleta")
    .replace(/\bbicycle\b/gi, "Bicicleta")
    .replace(/\bcar\b/gi, "Carro")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveDriverInfo(order: Record<string, unknown>): DriverInfo {
  return {
    name: toText(order?.driver_name),
    phone: toText(order?.driver_phone),
    vehicle: normalizeVehicleSegment(order?.veiculo_estafeta),
  };
}

function resolvePaymentMethod(order: Record<string, unknown>) {
  const value = String(
    toText(order?.payment_label) || toText(order?.payment_method) || "",
  )
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");

  if (!value) return null;
  if (value === "CASH" || value === "DINHEIRO") return "Dinheiro";
  if (value === "MBWAY") return "MB WAY";
  if (value === "CREDIT_CARD") return "Cartao";
  return value;
}

function formatEstimatedDelivery(value: unknown) {
  const text = toText(value);
  if (!text) return null;

  if (/^\d{1,2}:\d{2}$/.test(text)) {
    return `~ ${text.padStart(5, "0")}`;
  }

  const numericTimestamp = /^\d{13}$/.test(text)
    ? Number(text)
    : (/^\d{10}$/.test(text) ? Number(text) * 1000 : null);
  const parsed = numericTimestamp ?? Date.parse(text);

  if (!Number.isFinite(parsed)) return null;

  return `~ ${new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(parsed))}`;
}

function canUserAccessOrder(
  order: Record<string, unknown>,
  user: Record<string, unknown> | null,
  { allowGuestState = false }: { allowGuestState?: boolean } = {},
) {
  if (!order) return false;

  const role = resolveUserRole(user);
  if (role === "admin" || role === "dev") return true;

  if (role === "restaurant") {
    const restaurantStoreId = extractRestaurantId(user);
    return String(restaurantStoreId || "") === String(order.loja_id || "");
  }

  const userId = extractUserId(user);
  const orderUserId = toText(order.customer_user_id);
  if (userId && orderUserId && String(userId) === String(orderUserId)) {
    return true;
  }

  const userEmail = normalizeEmail(user?.email);
  const orderEmail = normalizeEmail(order.customer_email);
  if (userEmail && orderEmail && userEmail === orderEmail) {
    return true;
  }

  return Boolean(allowGuestState);
}

function buildTimeline({
  order,
}: {
  order: Record<string, unknown>;
}) {
  const timeline: Array<Record<string, unknown>> = [];
  const dedupe = new Set<string>();

  const pushUnique = (entry: Record<string, unknown>) => {
    const createdAt = toText(entry?.created_at);
    if (!createdAt) return;

    const label = String(entry?.label || "");
    const type = String(entry?.type || "EVENT");
    const key = `${type}|${label}|${createdAt}`;
    if (dedupe.has(key)) return;

    dedupe.add(key);
    timeline.push({
      ...entry,
      created_at: createdAt,
    });
  };

  const createdAt = toText(order?.submitted_at) || toText(order?.created_at);
  const acceptedAt = toText(order?.aceite_em) || toText(order?.data_aceitacao);
  const assignedAt = toText(order?.atribuido_em);
  const pickedUpAt = toText(order?.recolhido_em);
  const deliveredAt = toText(order?.entregue_em);
  const updatedAt = toText(order?.updated_at);
  const currentEstado = resolveOrderEstadoInterno(order);
  const currentEstadoLabel = getEstadoInternoLabelPt(currentEstado);

  pushUnique({
    type: "ORDER_CREATED",
    label: "Pedido criado",
    status: normalizeStatus(order?.status),
    created_at: createdAt,
    payload: null,
  });

  if (String(order?.order_timing_mode || "").toUpperCase() === "SCHEDULED" && toText(order?.scheduled_for)) {
    pushUnique({
      type: "ORDER_SCHEDULED",
      label: "Entrega agendada",
      status: "SCHEDULED",
      created_at: order?.scheduled_for,
      payload: null,
    });
  }

  if (acceptedAt) {
    pushUnique({
      type: "ORDER_ACCEPTED",
      label: "Restaurante aceitou",
      status: "CONFIRMED",
      created_at: acceptedAt,
      payload: null,
    });
  }

  if (assignedAt) {
    pushUnique({
      type: "DRIVER_ASSIGNED",
      label: "Estafeta atribuido",
      status: "ASSIGNED",
      created_at: assignedAt,
      payload: null,
    });
  }

  if (pickedUpAt) {
    pushUnique({
      type: "ORDER_PICKED_UP",
      label: "Pedido recolhido",
      status: "PICKED_UP",
      created_at: pickedUpAt,
      payload: null,
    });
  }

  if (deliveredAt) {
    pushUnique({
      type: "ORDER_DELIVERED",
      label: "Pedido entregue",
      status: "DELIVERED",
      created_at: deliveredAt,
      payload: null,
    });
  }

  if (currentEstado === "cancelado" && updatedAt) {
    pushUnique({
      type: "ORDER_CANCELLED",
      label: "Pedido cancelado",
      status: "CANCELLED",
      created_at: updatedAt,
      payload: null,
    });
  }

  const timelineStageTimestamps: Record<string, string | null> = {
    pendente: createdAt,
    aceite: acceptedAt,
    atribuindo_estafeta: assignedAt,
    estafeta_aceitou: assignedAt,
    recolhido: pickedUpAt,
    entregue: deliveredAt,
    cancelado: updatedAt,
  };

  if (!timelineStageTimestamps[currentEstado] && updatedAt) {
    pushUnique({
      type: "ORDER_STATUS",
      label: `Estado atual: ${currentEstadoLabel}`,
      status: currentEstado,
      created_at: updatedAt,
      payload: null,
    });
  }

  return timeline.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

async function fetchOrderRecordWithCompatibility(normalizedOrderId: number) {
  return supabase.rpc("get_order_by_id", { order_id_input: normalizedOrderId });
}

export async function fetchOrderDetails(
  orderId: number | string,
  {
    user = null,
    allowGuestState = false,
  }: {
    user?: Record<string, unknown> | null;
    allowGuestState?: boolean;
  } = {},
): Promise<OrderDetailsResult> {
  const normalizedOrderId = Number(orderId);
  if (!Number.isFinite(normalizedOrderId)) {
    throw new Error("ID de pedido invalido.");
  }

  const { data: order, error: orderError } = await fetchOrderRecordWithCompatibility(normalizedOrderId);

  if (orderError) throw orderError;
  if (!order) throw new Error("Pedido nao encontrado.");

  if (!canUserAccessOrder(order, user, { allowGuestState })) {
    throw new Error("Sem permissao para ver este pedido.");
  }

  const [itemsRes, lojaRes] = await Promise.all([
    supabase.rpc("get_order_items_by_order_id", { order_id_input: normalizedOrderId }),
    supabase
      .from("lojas")
      .select("idloja, nome, contacto, morada_completa, icon")
      .eq("idloja", Number(order.loja_id))
      .maybeSingle(),
  ]);

  if (itemsRes.error) throw itemsRes.error;
  const itemsData = itemsRes.data || [];
  if (lojaRes.error) throw lojaRes.error;

  const driver = resolveDriverInfo(order);
  const estimatedDelivery = formatEstimatedDelivery(toText(order.previsao_entrega));
  const paymentMethodLabel = resolvePaymentMethod(order);

  const orderStatus = normalizeStatus(order.status);
  const orderEstadoInterno = resolveOrderEstadoInterno(order);
  const orderEstadoTone = mapEstadoToneToUi(getEstadoInternoTone(orderEstadoInterno));

  return {
    order: {
      ...order,
      subtotal: toNumber(order.subtotal, 0),
      taxa_entrega: toNumber(order.taxa_entrega, 0),
      total: toNumber(order.total, 0),
      submitted_at: order.submitted_at || null,
      order_timing_mode: order.order_timing_mode || "ASAP",
      scheduled_for: order.scheduled_for || (String(order.order_timing_mode || "").toUpperCase() === "SCHEDULED" ? order.created_at || null : null),
      aceite_em: order.aceite_em || order.data_aceitacao || null,
      atribuido_em: order.atribuido_em || null,
      recolhido_em: order.recolhido_em || null,
      entregue_em: order.entregue_em || null,
      status: orderStatus,
      status_legacy_label: statusLabelPt(orderStatus),
      estado_interno: orderEstadoInterno,
      status_label: getEstadoInternoLabelPt(orderEstadoInterno),
      status_tone: orderEstadoTone,
    },
    items: itemsData.map((item) => ({
      ...item,
      quantidade: toNumber(item.quantidade, 1),
      preco_unitario: toNumber(item.preco_unitario, 0),
      subtotal: toNumber(item.subtotal, 0),
      opcoes_selecionadas: parseSelectedOptions((item as Record<string, unknown>)?.opcoes_selecionadas),
    })),
    store: lojaRes.data
      ? {
        id: lojaRes.data.idloja,
        nome: lojaRes.data.nome || `Loja ${order.loja_id}`,
        contacto: toText(lojaRes.data.contacto),
        morada: toText(lojaRes.data.morada_completa),
        icon: toText(lojaRes.data.icon),
      }
      : {
        id: order.loja_id,
        nome: `Loja ${order.loja_id}`,
        contacto: null,
        morada: null,
        icon: null,
      },
    timeline: buildTimeline({ order }),
    workflow: buildWorkflowProgress(orderEstadoInterno),
    driver,
    estimated_delivery: estimatedDelivery,
    payment_method_label: paymentMethodLabel,
    is_live: !TERMINAL_ESTADO_INTERNO.has(orderEstadoInterno),
  };
}

export function getStatusLabelPt(status: unknown) {
  return statusLabelPt(status);
}

export function getStatusTone(status: unknown) {
  return statusTone(status);
}











import { supabase } from "./supabaseClient";
import { mapEstadoInternoToShipdayState, normalizeEstadoInterno } from "./orderStatusMapper";

const SHIPDAY_API_FUNCTION = "shipday-api";
const SHIPDAY_STATUS_FUNCTION = "update-shipday-status";
const SHIPDAY_ASSIGN_ORDER_ENDPOINT = (orderId, carrierId) => `/orders/assign/${encodeURIComponent(orderId)}/${encodeURIComponent(carrierId)}`;

function toText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

async function invokeShipdayApi(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke(SHIPDAY_API_FUNCTION, {
    body: {
      action,
      ...payload,
    },
  });

  if (error) {
    throw new Error(String(error?.message || "Falha ao invocar shipday-api"));
  }

  if (data?.error) {
    throw new Error(String(data.error));
  }

  return data;
}

function normalizeCarriersPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.carriers)) return payload.carriers;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

function normalizeCarrier(carrier, index) {
  const id = carrier?.id
    ?? carrier?.carrierId
    ?? carrier?.driverId
    ?? carrier?.userId
    ?? carrier?.employeeId
    ?? null;

  const firstName = toText(carrier?.firstName);
  const lastName = toText(carrier?.lastName);
  const fullNameFromParts = `${firstName} ${lastName}`.trim();

  const name = toText(
    carrier?.name
    || carrier?.fullName
    || carrier?.driverName
    || fullNameFromParts
    || `Estafeta ${index + 1}`,
  );

  const phone = toText(
    carrier?.phone
    || carrier?.phoneNumber
    || carrier?.mobile
    || carrier?.mobileNumber
    || carrier?.driverPhoneNumber
    || "",
  );

  const status = toText(
    carrier?.status
    || carrier?.availability
    || carrier?.state
    || (carrier?.active === false ? "INACTIVE" : "ACTIVE"),
  ).toUpperCase();

  const explicitAvailable = carrier?.isAvailable ?? carrier?.available ?? carrier?.online;
  const statusUnavailable = ["INACTIVE", "OFFLINE", "UNAVAILABLE", "BUSY"].includes(status);
  const isAvailable = explicitAvailable === null || explicitAvailable === undefined
    ? !statusUnavailable
    : Boolean(explicitAvailable);

  return {
    id: id !== null && id !== undefined ? String(id) : "",
    name,
    phone,
    status,
    is_available: isAvailable,
    raw: carrier,
  };
}

export async function retrieveShipdayCarriers() {
  const response = await invokeShipdayApi("get_carriers");
  const rawCarriers = normalizeCarriersPayload(response?.data ?? response);

  const carriers = rawCarriers
    .map((carrier, index) => normalizeCarrier(carrier, index))
    .filter((carrier) => carrier.id && carrier.is_available);

  return carriers;
}

export async function assignShipdayOrder({ shipdayOrderId, carrierId }) {
  const orderId = toText(shipdayOrderId);
  const targetCarrierId = toText(carrierId);

  if (!orderId) {
    throw new Error("ID do pedido Shipday em falta para atribuir estafeta.");
  }

  if (!targetCarrierId) {
    throw new Error("ID do estafeta em falta.");
  }

  const response = await invokeShipdayApi("assign_order", {
    shipdayOrderId: orderId,
    carrierId: targetCarrierId,
  });

  return {
    ok: true,
    endpoint: SHIPDAY_ASSIGN_ORDER_ENDPOINT(orderId, targetCarrierId),
    data: response?.data ?? response,
  };
}

export async function assignOrderToShipdayCarrier({ order, carrier }) {
  if (!order?.id) {
    throw new Error("Pedido invalido para atribuicao.");
  }

  if (!carrier?.id) {
    throw new Error("Estafeta invalido para atribuicao.");
  }

  const shipdayOrderId = toText(order.shipday_order_id) || toText(order.id);
  const assignResponse = await assignShipdayOrder({
    shipdayOrderId,
    carrierId: carrier.id,
  });

  return {
    ...assignResponse,
    orderId: order.id,
    shipdayOrderId,
    carrier: {
      id: carrier.id,
      name: carrier.name || "",
      phone: carrier.phone || "",
    },
  };
}

export async function createShipdayOrderForOrder({ orderId }) {
  const normalizedOrderId = toText(orderId);

  if (!normalizedOrderId) {
    throw new Error("orderId em falta para criar pedido no Shipday.");
  }

  const response = await invokeShipdayApi("create_order", {
    orderId: normalizedOrderId,
  });

  return {
    ok: true,
    action: "create_order",
    orderId: normalizedOrderId,
    shipdayOrderId: toText(response?.shipday_order_id || response?.data?.orderId || response?.data?.id || ""),
    data: response?.data ?? response,
  };
}

export async function markShipdayOrderReadyForPickup({ shipdayOrderId, orderId = null }) {
  const normalizedShipdayOrderId = toText(shipdayOrderId);
  const normalizedOrderId = toText(orderId);

  if (!normalizedShipdayOrderId && !normalizedOrderId) {
    throw new Error("shipdayOrderId/orderId em falta para marcar pronto para recolha.");
  }

  const response = await invokeShipdayApi("ready_for_pickup", {
    shipdayOrderId: normalizedShipdayOrderId || undefined,
    orderId: normalizedOrderId || undefined,
  });

  return {
    ok: true,
    action: "ready_for_pickup",
    shipdayOrderId: toText(response?.shipday_order_id || normalizedShipdayOrderId || ""),
    orderId: normalizedOrderId || "",
    warning: response?.warning || null,
    data: response?.data ?? response,
  };
}

export async function updateShipdayOrderStatus({
  shipdayOrderId,
  newStatus,
  orderId = null,
  lojaId = null,
}) {
  const normalizedShipdayOrderId = toText(shipdayOrderId);
  const normalizedNewStatus = toText(newStatus);

  if (!normalizedShipdayOrderId) {
    return {
      ok: false,
      skipped: true,
      reason: "shipday_order_id_ausente",
    };
  }

  if (!normalizedNewStatus) {
    return {
      ok: false,
      skipped: true,
      reason: "new_status_ausente",
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke(SHIPDAY_STATUS_FUNCTION, {
      body: {
        shipday_order_id: normalizedShipdayOrderId,
        new_status: normalizedNewStatus,
        order_id: orderId ?? undefined,
        loja_id: lojaId ?? undefined,
      },
    });

    if (error) {
      return {
        ok: false,
        skipped: false,
        functionName: SHIPDAY_STATUS_FUNCTION,
        error: String(error?.message || "Falha ao invocar update-shipday-status"),
      };
    }

    const functionOk = data?.ok === true || data?.success === true;

    if (!functionOk) {
      return {
        ok: false,
        skipped: false,
        functionName: SHIPDAY_STATUS_FUNCTION,
        error: String(data?.error || "Shipday rejeitou atualizacao de estado"),
        data,
      };
    }

    return {
      ok: true,
      skipped: false,
      functionName: SHIPDAY_STATUS_FUNCTION,
      message: data?.message || null,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      functionName: SHIPDAY_STATUS_FUNCTION,
      error: String(error?.message || "Falha ao atualizar estado no Shipday"),
    };
  }
}
export async function syncOrderStatusWithShipday({
  orderId,
  lojaId = null,
  shipdayOrderId,
  estadoInterno,
}) {
  const normalizedEstado = normalizeEstadoInterno(estadoInterno);
  const shipdayState = mapEstadoInternoToShipdayState(normalizedEstado);

  if (!normalizedEstado || !shipdayState) {
    return {
      ok: false,
      skipped: true,
      reason: "estado_sem_mapeamento_shipday",
    };
  }

  if (!shipdayOrderId) {
    return {
      ok: false,
      skipped: true,
      reason: "shipday_order_id_ausente",
    };
  }

  try {
    const data = await invokeShipdayApi("update_status", {
      shipdayOrderId: String(shipdayOrderId),
      shipdayState,
      orderId,
      lojaId,
      estadoInterno: normalizedEstado,
    });

    return {
      ok: true,
      skipped: false,
      functionName: SHIPDAY_API_FUNCTION,
      shipdayState,
      warning: data?.warning || null,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      shipdayState,
      error: String(error?.message || "Falha ao sincronizar estado no Shipday"),
    };
  }
}



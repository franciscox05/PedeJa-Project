import { supabase } from "./supabaseClient";

function toInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function unwrap({ data, error }, context) {
  if (error) {
    console.error(`estafetaService: ${context}`, { error: error?.message || String(error) });
    throw error;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Auto-servico do estafeta (usado pela app do estafeta, Fase 1)
// ---------------------------------------------------------------------------

export async function toggleEstafetaOnline(callerUserId, online) {
  const response = await supabase.rpc("estafeta_toggle_online", {
    caller_user_id: toInt(callerUserId),
    online_input: Boolean(online),
  });
  return unwrap(response, "toggleEstafetaOnline");
}

export async function setEstafetaDisponivel(callerUserId, disponivel) {
  const response = await supabase.rpc("estafeta_set_disponivel", {
    caller_user_id: toInt(callerUserId),
    disponivel_input: Boolean(disponivel),
  });
  return unwrap(response, "setEstafetaDisponivel");
}

export async function updateEstafetaLocation(callerUserId, lat, lng) {
  const response = await supabase.rpc("estafeta_update_location", {
    caller_user_id: toInt(callerUserId),
    lat_input: lat,
    lng_input: lng,
  });
  return unwrap(response, "updateEstafetaLocation");
}

export async function changeEstafetaPassword(callerUserId, currentPassword, newPassword) {
  const response = await supabase.rpc("estafeta_change_password", {
    caller_user_id: toInt(callerUserId),
    current_password: currentPassword,
    new_password: newPassword,
  });
  return unwrap(response, "changeEstafetaPassword");
}

export async function saveEstafetaPushSubscription(callerUserId, subscription) {
  const response = await supabase.rpc("estafeta_save_push_subscription", {
    caller_user_id: toInt(callerUserId),
    subscription_input: subscription,
  });
  return unwrap(response, "saveEstafetaPushSubscription");
}

export async function removeEstafetaPushSubscription(callerUserId, endpoint) {
  const response = await supabase.rpc("estafeta_remove_push_subscription", {
    caller_user_id: toInt(callerUserId),
    endpoint_input: endpoint,
  });
  return unwrap(response, "removeEstafetaPushSubscription");
}

export async function fetchMyEstafetaState(callerUserId) {
  const response = await supabase.rpc("estafeta_get_my_state", {
    caller_user_id: toInt(callerUserId),
  });
  return unwrap(response, "fetchMyEstafetaState");
}

export async function fetchMyEstafetaEarningsByDay(callerUserId, days = 35) {
  const response = await supabase.rpc("estafeta_get_earnings_by_day", {
    caller_user_id: toInt(callerUserId),
    days_input: days,
  });
  return unwrap(response, "fetchMyEstafetaEarningsByDay") || [];
}

export async function fetchMyEstafetaHistory(callerUserId, limit = 50) {
  const response = await supabase.rpc("estafeta_get_my_history", {
    caller_user_id: toInt(callerUserId),
    limit_input: limit,
  });
  return unwrap(response, "fetchMyEstafetaHistory") || [];
}

export async function acceptOrRejectAssignment(callerUserId, assignmentId, accept, motivo = null) {
  const response = await supabase.rpc("estafeta_accept_or_reject_assignment", {
    caller_user_id: toInt(callerUserId),
    assignment_id_input: toInt(assignmentId),
    accept_input: Boolean(accept),
    motivo_input: motivo,
  });
  return unwrap(response, "acceptOrRejectAssignment");
}

export async function advanceDeliveryStatus(callerUserId, assignmentId, newEstado) {
  const response = await supabase.rpc("estafeta_advance_status", {
    caller_user_id: toInt(callerUserId),
    assignment_id_input: toInt(assignmentId),
    new_estado_input: newEstado,
  });
  return unwrap(response, "advanceDeliveryStatus");
}

export async function cancelDeliveryAssignment(callerUserId, assignmentId, motivo = null) {
  const response = await supabase.rpc("cancel_delivery_assignment", {
    caller_user_id: toInt(callerUserId),
    assignment_id_input: toInt(assignmentId),
    motivo_input: motivo,
  });
  return unwrap(response, "cancelDeliveryAssignment");
}

// ---------------------------------------------------------------------------
// Gestao/despacho (admin e staff de restaurante, Fase 2)
// ---------------------------------------------------------------------------

export async function assignDeliveryToEstafeta(callerUserId, orderId, estafetaId) {
  const response = await supabase.rpc("assign_delivery", {
    caller_user_id: toInt(callerUserId),
    order_id_input: toInt(orderId),
    estafeta_id_input: toInt(estafetaId),
  });
  return unwrap(response, "assignDeliveryToEstafeta");
}

export async function reassignDeliveryToEstafeta(callerUserId, assignmentId, newEstafetaId) {
  const response = await supabase.rpc("admin_reassign_delivery", {
    caller_user_id: toInt(callerUserId),
    assignment_id_input: toInt(assignmentId),
    new_estafeta_id_input: toInt(newEstafetaId),
  });
  return unwrap(response, "reassignDeliveryToEstafeta");
}

export async function forceDeliverAssignment(callerUserId, assignmentId) {
  const response = await supabase.rpc("admin_force_deliver_assignment", {
    caller_user_id: toInt(callerUserId),
    assignment_id_input: toInt(assignmentId),
  });
  return unwrap(response, "forceDeliverAssignment");
}

export async function listEstafetasForDispatch(callerUserId) {
  const response = await supabase.rpc("list_estafetas_for_dispatch", {
    caller_user_id: toInt(callerUserId),
  });
  return unwrap(response, "listEstafetasForDispatch") || [];
}

export async function listActiveAtribuicoes(callerUserId, lojaId = null) {
  const response = await supabase.rpc("list_active_atribuicoes", {
    caller_user_id: toInt(callerUserId),
    loja_id_input: lojaId === null || lojaId === undefined ? null : toInt(lojaId),
  });
  return unwrap(response, "listActiveAtribuicoes") || [];
}

export async function adminCreateEstafeta(callerUserId, { nome, email, telemovel, veiculo = "mota" }) {
  const response = await supabase.rpc("admin_create_estafeta", {
    caller_user_id: toInt(callerUserId),
    nome_input: nome,
    email_input: email,
    telemovel_input: telemovel,
    veiculo_input: veiculo,
  });
  return unwrap(response, "adminCreateEstafeta");
}

export async function adminSetEstafetaAtivo(callerUserId, estafetaId, ativo) {
  const response = await supabase.rpc("admin_set_estafeta_ativo", {
    caller_user_id: toInt(callerUserId),
    estafeta_id_input: toInt(estafetaId),
    ativo_input: Boolean(ativo),
  });
  return unwrap(response, "adminSetEstafetaAtivo");
}

export async function adminResetEstafetaPassword(callerUserId, estafetaId) {
  const response = await supabase.rpc("admin_reset_estafeta_password", {
    caller_user_id: toInt(callerUserId),
    estafeta_id_input: toInt(estafetaId),
  });
  return unwrap(response, "adminResetEstafetaPassword");
}

// ---------------------------------------------------------------------------
// Avaliacoes do cliente ao estafeta (Fase 4 backlog)
// ---------------------------------------------------------------------------

export async function rateDelivery(callerUserId, orderId, classificacao, comentario = null) {
  const response = await supabase.rpc("customer_rate_delivery", {
    caller_user_id: toInt(callerUserId),
    order_id_input: toInt(orderId),
    classificacao_input: toInt(classificacao),
    comentario_input: comentario,
  });
  return unwrap(response, "rateDelivery");
}

export async function fetchMyDeliveryRating(callerUserId, orderId) {
  const response = await supabase.rpc("get_my_delivery_rating", {
    caller_user_id: toInt(callerUserId),
    order_id_input: toInt(orderId),
  });
  return unwrap(response, "fetchMyDeliveryRating");
}

// ---------------------------------------------------------------------------
// Tracking em tempo real do pedido (mapa in-house, Fase 4 backlog)
// ---------------------------------------------------------------------------

export async function fetchOrderTrackingInfo(callerUserId, orderId) {
  const response = await supabase.rpc("get_order_tracking_info", {
    caller_user_id: toInt(callerUserId),
    order_id_input: toInt(orderId),
  });
  return unwrap(response, "fetchOrderTrackingInfo");
}

// ---------------------------------------------------------------------------
// Helpers partilhados para os boards ao vivo (LiveOperationsBoard) do dispatch
// interno -- usados por dashboardEstafetas, dashboardAdmin, dashboardGeoBoard
// e dashboardRestaurante.
// ---------------------------------------------------------------------------

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function buildActiveOrdersForBoard(activeAtribuicoes) {
  return ensureArray(activeAtribuicoes).map((assignment) => ({
    id: assignment.order_id,
    loja_id: assignment.loja_id,
    estado_interno: assignment.estado_interno,
    customer_nome: assignment.customer_nome,
    customer_lat: assignment.customer_lat,
    customer_lng: assignment.customer_lng,
  }));
}

export function buildEstafetaBoardEntries(estafetas, activeAtribuicoes, stores) {
  const storesById = new Map(ensureArray(stores).map((store) => [String(store?.idloja || ""), store]));
  const assignmentByEstafetaId = new Map(
    ensureArray(activeAtribuicoes).map((assignment) => [String(assignment.estafeta_id), assignment]),
  );

  return ensureArray(estafetas)
    .filter((estafeta) => Number.isFinite(Number(estafeta.ultima_localizacao_lat)) && Number.isFinite(Number(estafeta.ultima_localizacao_lng)))
    .map((estafeta) => {
      const assignment = assignmentByEstafetaId.get(String(estafeta.id));
      const orderEstado = assignment?.estado_interno || null;
      const status = orderEstado
        ? (["recolhido", "a_caminho", "entregue"].includes(orderEstado) ? "delivery" : "pickup")
        : "available";

      return {
        id: String(estafeta.id),
        name: estafeta.nome,
        phone: estafeta.telefone,
        lat: Number(estafeta.ultima_localizacao_lat),
        lng: Number(estafeta.ultima_localizacao_lng),
        status,
        coordsSource: "carrier",
        orderId: assignment?.order_id || null,
        orderEstado,
        lojaId: assignment?.loja_id || null,
        lojaNome: assignment?.loja_id
          ? (storesById.get(String(assignment.loja_id))?.nome || `Loja ${assignment.loja_id}`)
          : null,
        raw: estafeta,
      };
    });
}

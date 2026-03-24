import { supabase } from "./supabaseClient";
import { getStoreScheduleStatus, isStoreOpenAt } from "../utils/storeHours";
import { resolveDisplayPrice } from "./pricingService";
import { buildSupabaseFunctionHeaders, getSupabaseFunctionUrl } from "./supabaseClient";

function parseJsonSafely(rawText) {
  if (!rawText || !String(rawText).trim()) return null;
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

async function invokePublicEdgeFunction(functionName, payload) {
  const headers = await buildSupabaseFunctionHeaders();

  const response = await fetch(getSupabaseFunctionUrl(functionName), {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  const parsed = parseJsonSafely(rawText);

  if (!response.ok) {
    console.error("Falha ao invocar edge function publica", {
      functionName,
      status: response.status,
      payload,
      response: parsed || rawText || null,
    });
    throw new Error(
      parsed?.error
      || parsed?.message
      || rawText
      || `Falha ao invocar ${functionName} (${response.status}).`,
    );
  }

  return parsed;
}

function normalizeItems(cart, storePricingSource = null) {
  return cart.map((item) => ({
    menu_id: item.idmenu,
    nome: item.nome,
    preco_unitario: resolveDisplayPrice(item, storePricingSource),
    quantidade: Number(item.qtd || 1),
    subtotal: resolveDisplayPrice(item, storePricingSource) * Number(item.qtd || 1),
    opcoes_selecionadas: Array.isArray(item?.opcoes_selecionadas) ? item.opcoes_selecionadas : [],
  }));
}

function toDate(value) {
  return String(value).padStart(2, "0");
}

function formatShipdayDate(date) {
  return `${date.getFullYear()}-${toDate(date.getMonth() + 1)}-${toDate(date.getDate())}`;
}

function formatShipdayTime(date) {
  return `${toDate(date.getHours())}:${toDate(date.getMinutes())}:${toDate(date.getSeconds())}`;
}

function parseScheduledDateTime(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function resolveDeliveryWindow(deliverySchedule) {
  const now = new Date();

  if (deliverySchedule?.mode === "SCHEDULED") {
    const scheduled = parseScheduledDateTime(deliverySchedule?.scheduledAt);
    if (!scheduled) {
      throw new Error("Horario de entrega invalido.");
    }

    if (scheduled.getTime() <= now.getTime()) {
      throw new Error("Escolhe um horario de entrega no futuro.");
    }

    let expectedPickup = new Date(scheduled.getTime() - 20 * 60000);
    if (expectedPickup.getTime() <= now.getTime()) {
      expectedPickup = new Date(now.getTime() + 10 * 60000);
    }

    return {
      expectedDelivery: scheduled,
      expectedPickup,
    };
  }

  return {
    expectedDelivery: new Date(now.getTime() + 45 * 60000),
    expectedPickup: new Date(now.getTime() + 25 * 60000),
  };
}

async function assertStoreOpenForSchedule(lojaId, deliverySchedule) {
  const { data, error } = await supabase
    .from("lojas")
    .select("idloja, nome, ativo, horario_funcionamento")
    .eq("idloja", lojaId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Loja nao encontrada.");

  if (data.ativo === false || data.ativo === null) {
    throw new Error("Loja fechada no momento.");
  }

  if (!data.horario_funcionamento) return;

  const referenceDate = deliverySchedule?.mode === "SCHEDULED"
    ? parseScheduledDateTime(deliverySchedule?.scheduledAt)
    : new Date();

  if (!referenceDate) {
    throw new Error("Horario de entrega invalido.");
  }

  if (!isStoreOpenAt(data.horario_funcionamento, referenceDate)) {
    const scheduleStatus = getStoreScheduleStatus(data.horario_funcionamento, referenceDate);
    const detail = scheduleStatus?.message && scheduleStatus.message !== "Fechado"
      ? ` (${scheduleStatus.message})`
      : "";
    throw new Error(`Loja fechada para o horario escolhido${detail}. Escolhe um horario dentro do funcionamento.`);
  }
}

export async function criarPedidoCheckout({
  cart,
  storePricingSource = null,
  customer,
  deliveryFee = 2.5,
  deliverySchedule = { mode: "ASAP", scheduledAt: null },
  paymentMethod = "CASH",
}) {
  if (!Array.isArray(cart) || cart.length === 0) {
    throw new Error("Carrinho vazio.");
  }

  const lojaId = cart[0]?.idloja;
  if (!lojaId) {
    throw new Error("Nao foi possivel identificar a loja do pedido.");
  }

  await assertStoreOpenForSchedule(lojaId, deliverySchedule);

  const items = normalizeItems(cart, storePricingSource);
  const subtotal = items.reduce((acc, item) => acc + item.subtotal, 0);

  const tax = Number(customer?.tax || 0);
  const tips = Number(customer?.tips || 0);
  const discount = Number(customer?.discount_amount || 0);
  const total = subtotal + Number(deliveryFee || 0) + tax + tips - discount;

  const { expectedDelivery, expectedPickup } = resolveDeliveryWindow(deliverySchedule);

  const selectedPayment = String(paymentMethod || customer?.payment_method || "CASH").toUpperCase();
  const shipdayPaymentMethod = selectedPayment === "MBWAY" ? "CREDIT_CARD" : selectedPayment;

  const payload = {
    loja_id: lojaId,
    customer,
    subtotal,
    taxa_entrega: Number(deliveryFee || 0),
    total,
    tax,
    tips,
    discount_amount: discount,
    items,
    expected_delivery_date: formatShipdayDate(expectedDelivery),
    expected_delivery_time: formatShipdayTime(expectedDelivery),
    expected_pickup_time: formatShipdayTime(expectedPickup),
    order_source: customer?.order_source || "PedeJa",
    additional_id: customer?.user_id || null,
    client_restaurant_id: Number(customer?.client_restaurant_id || lojaId),
    payment_method: shipdayPaymentMethod,
    payment_label: selectedPayment,
    credit_card_type: customer?.credit_card_type || null,
    order_timing_mode: deliverySchedule?.mode === "SCHEDULED" ? "SCHEDULED" : "ASAP",
    scheduled_for: deliverySchedule?.mode === "SCHEDULED" ? expectedDelivery.toISOString() : null,
  };

  const data = await invokePublicEdgeFunction("create-order", payload);

  if (!data?.order_id) {
    throw new Error("Resposta invalida do checkout.");
  }

  return data;
}

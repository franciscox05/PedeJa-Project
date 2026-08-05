import { supabase } from "./supabaseClient";
import { getStoreScheduleStatus, isStoreOpenAt } from "../utils/storeHours";
import { normalizePricedItem } from "./pricingService";
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
  return cart.map((item, index) => {
    const specialInstructions = String(
      item?.instrucoes_especiais
      || item?.specialInstructions
      || item?.special_instructions
      || "",
    ).trim();
    const selectedOptions = Array.isArray(item?.opcoes_selecionadas) ? item.opcoes_selecionadas : [];
    const optionsWithInstructions = specialInstructions
      ? [
        ...selectedOptions,
        {
          group_id: "special_instructions",
          group_title: "Instruções especiais",
          group_type: "observacao",
          option_id: `note-${item?.idmenu || item?.menu_id || index}`,
          option_name: specialInstructions,
          price_base: 0,
          price_cliente: 0,
        },
      ]
      : selectedOptions;

    // normalizePricedItem calcula preco final e preco base (com o mesmo
    // arredondamento) numa so passagem -- preco_base_unitario fica guardado
    // no pedido para os relatorios de comissao deixarem de ter de adivinhar
    // (e de errar as opcoes pagas) a partir da configuracao atual.
    const priced = normalizePricedItem(item, storePricingSource);
    const precoUnitario = priced.preco_cliente_total;
    const precoBaseUnitario = Number((priced.preco_base + priced.selected_options_total_base).toFixed(2));

    return {
      menu_id: item.idmenu,
      nome: item.nome,
      preco_unitario: precoUnitario,
      preco_base_unitario: precoBaseUnitario,
      comissao_percent_aplicada: priced.comissao_pedeja_percent_aplicada,
      quantidade: Number(item.qtd || 1),
      subtotal: precoUnitario * Number(item.qtd || 1),
      opcoes_selecionadas: optionsWithInstructions,
      instrucoes_especiais: specialInstructions || null,
    };
  });
}

function parseScheduledDateTime(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function resolveExpectedDelivery(deliverySchedule) {
  const now = new Date();

  if (deliverySchedule?.mode === "SCHEDULED") {
    const scheduled = parseScheduledDateTime(deliverySchedule?.scheduledAt);
    if (!scheduled) {
      throw new Error("Horário de entrega inválido.");
    }

    if (scheduled.getTime() <= now.getTime()) {
      throw new Error("Escolhe um horário de entrega no futuro.");
    }

    return scheduled;
  }

  return new Date(now.getTime() + 45 * 60000);
}

async function assertStoreOpenForSchedule(lojaId, deliverySchedule) {
  const { data, error } = await supabase
    .from("lojas")
    .select("idloja, nome, ativo, horario_funcionamento")
    .eq("idloja", lojaId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Loja não encontrada.");

  if (data.ativo === false || data.ativo === null) {
    throw new Error("Loja fechada no momento.");
  }

  if (!data.horario_funcionamento) return;

  const referenceDate = deliverySchedule?.mode === "SCHEDULED"
    ? parseScheduledDateTime(deliverySchedule?.scheduledAt)
    : new Date();

  if (!referenceDate) {
    throw new Error("Horário de entrega inválido.");
  }

  if (!isStoreOpenAt(data.horario_funcionamento, referenceDate)) {
    const scheduleStatus = getStoreScheduleStatus(data.horario_funcionamento, referenceDate);
    const detail = scheduleStatus?.message && scheduleStatus.message !== "Fechado"
      ? ` (${scheduleStatus.message})`
      : "";
    throw new Error(`Loja fechada para o horário escolhido${detail}. Escolhe um horário dentro do funcionamento.`);
  }
}

export async function criarPedidoCheckout({
  cart,
  storePricingSource = null,
  customer,
  deliveryFee = 2.5,
  deliverySchedule = { mode: "ASAP", scheduledAt: null },
  paymentMethod = "CASH",
  couponCode = "",
}) {
  if (!Array.isArray(cart) || cart.length === 0) {
    throw new Error("Carrinho vazio.");
  }

  const lojaId = cart[0]?.idloja;
  if (!lojaId) {
    throw new Error("Não foi possível identificar a loja do pedido.");
  }

  await assertStoreOpenForSchedule(lojaId, deliverySchedule);

  const items = normalizeItems(cart, storePricingSource);
  const subtotal = items.reduce((acc, item) => acc + item.subtotal, 0);

  const tax = Number(customer?.tax || 0);
  const tips = Number(customer?.tips || 0);
  const discount = Number(customer?.discount_amount || 0);
  const total = subtotal + Number(deliveryFee || 0) + tax + tips - discount;

  const expectedDelivery = resolveExpectedDelivery(deliverySchedule);

  const selectedPayment = String(paymentMethod || customer?.payment_method || "CASH").toUpperCase();

  const payload = {
    loja_id: lojaId,
    customer,
    subtotal,
    taxa_entrega: Number(deliveryFee || 0),
    total,
    tax,
    tips,
    discount_amount: discount,
    coupon_code: couponCode ? String(couponCode).trim().toUpperCase() : null,
    items,
    payment_method: selectedPayment,
    payment_label: selectedPayment,
    order_timing_mode: deliverySchedule?.mode === "SCHEDULED" ? "SCHEDULED" : "ASAP",
    scheduled_for: deliverySchedule?.mode === "SCHEDULED" ? expectedDelivery.toISOString() : null,
  };

  const data = await invokePublicEdgeFunction("create-order", payload);

  if (!data?.order_id) {
    throw new Error("Resposta inválida do checkout.");
  }

  return data;
}

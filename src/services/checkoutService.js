import { supabase } from "./supabaseClient";
import { getStoreScheduleStatus, isStoreOpenAt } from "../utils/storeHours";
import { resolveDisplayPrice } from "./pricingService";
import { buildSupabaseFunctionHeaders, getSupabaseFunctionUrl } from "./supabaseClient";
import { autoAssignOrderInShipday, createShipdayOrderForOrder } from "./shipdayService";

function parseJsonSafely(rawText) {
  if (!rawText || !String(rawText).trim()) return null;
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function toBooleanFlag(value) {
  if (value === true) return true;
  if (value === false) return false;
  const normalized = String(value || "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "sim"].includes(normalized);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function toText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeOrderStage(value) {
  return toText(value).toLowerCase();
}

function normalizeOrderStatus(value) {
  return toText(value).toUpperCase();
}

function hasAssignedDriverData(source) {
  return Boolean(
    toText(source?.driver_name)
    || toText(source?.driver_phone)
    || toText(source?.shipday_driver_name)
    || toText(source?.shipday_driver_phone),
  );
}

function isMissingStoreSettingsColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("column")
    && message.includes("lojas")
    && (
      message.includes("atribuicao_automatica_estafeta")
      || message.includes("configuracao_auto_assign")
    );
}

function resolveStoreAutoAssignEnabled(storeRow) {
  if (!storeRow) return false;

  const explicitBoolean = Boolean(storeRow?.atribuicao_automatica_estafeta);
  const config = storeRow?.configuracao_auto_assign;
  const configEnabled = typeof config === "boolean"
    ? config
    : Boolean(config && typeof config === "object" && config.enabled === true);

  return explicitBoolean || configEnabled;
}

function shouldBootstrapByState(estadoInterno, status) {
  if (status === "CONFIRMED") return true;
  return [
    "aceite",
    "atribuindo_estafeta",
    "estafeta_aceitou",
    "iniciado",
    "em_preparacao",
    "pronto_recolha",
    "recolhido",
    "a_caminho",
  ].includes(estadoInterno);
}

function hasShipdayBootstrapSignal(payload = {}) {
  return Boolean(
    toBooleanFlag(payload?.shipday_auto_created)
    || toBooleanFlag(payload?.auto_accept_applied)
    || toBooleanFlag(payload?.auto_accept_enabled)
    || toBooleanFlag(payload?.auto_assign_enabled)
    || toBooleanFlag(payload?.global_auto_assign_enabled)
    || toText(payload?.shipday_error),
  );
}

function isTerminalOrderState(estadoInterno, status) {
  return ["cancelado", "entregue"].includes(estadoInterno)
    || ["CANCELLED", "DELIVERED"].includes(status);
}

async function fetchOrderBootstrapContext(orderId) {
  if (!Number.isFinite(orderId) || orderId <= 0) return null;

  let response = await supabase
    .from("orders")
    .select("id, loja_id, shipday_order_id, estado_interno, status, driver_name, driver_phone, shipday_driver_name, shipday_driver_phone")
    .eq("id", orderId)
    .maybeSingle();

  if (
    response.error
    && /shipday_driver_name|shipday_driver_phone/i.test(String(response.error.message || ""))
  ) {
    response = await supabase
      .from("orders")
      .select("id, loja_id, shipday_order_id, estado_interno, status, driver_name, driver_phone")
      .eq("id", orderId)
      .maybeSingle();
  }

  if (response.error) {
    throw response.error;
  }

  return response.data || null;
}

async function fetchStoreAutomationSettings(lojaId) {
  if (!Number.isFinite(lojaId) || lojaId <= 0) return null;

  let response = await supabase
    .from("lojas")
    .select("idloja, aceitacao_automatica_pedidos, atribuicao_automatica_estafeta, configuracao_auto_assign")
    .eq("idloja", lojaId)
    .maybeSingle();

  if (response.error && isMissingStoreSettingsColumnError(response.error)) {
    response = await supabase
      .from("lojas")
      .select("idloja, aceitacao_automatica_pedidos")
      .eq("idloja", lojaId)
      .maybeSingle();
  }

  if (response.error) {
    throw response.error;
  }

  return response.data || null;
}

async function ensureShipdayBootstrapAfterCheckout(responsePayload) {
  const orderId = Number(responsePayload?.order_id || 0);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return responsePayload;
  }

  let orderContext = null;
  try {
    orderContext = await fetchOrderBootstrapContext(orderId);
  } catch (error) {
    console.warn("Checkout bootstrap: falha ao ler contexto do pedido", {
      orderId,
      error: String(error?.message || error || "unknown_error"),
    });
  }

  const lojaId = Number(
    responsePayload?.loja_id
    || orderContext?.loja_id
    || responsePayload?.store_id
    || 0,
  );

  let storeContext = null;
  if (Number.isFinite(lojaId) && lojaId > 0) {
    try {
      storeContext = await fetchStoreAutomationSettings(lojaId);
    } catch (error) {
      console.warn("Checkout bootstrap: falha ao ler configuracao da loja", {
        orderId,
        lojaId,
        error: String(error?.message || error || "unknown_error"),
      });
    }
  }

  const autoAcceptFromStore = Boolean(storeContext?.aceitacao_automatica_pedidos);
  const autoAssignFromStore = resolveStoreAutoAssignEnabled(storeContext);
  const existingShipdayOrderId = toText(orderContext?.shipday_order_id || responsePayload?.shipday_order_id);
  const hasAssignedDriver = hasAssignedDriverData(orderContext || responsePayload);
  const estadoInterno = normalizeOrderStage(orderContext?.estado_interno || responsePayload?.estado_interno);
  const status = normalizeOrderStatus(orderContext?.status || responsePayload?.status);
  const isTerminal = isTerminalOrderState(estadoInterno, status);
  const timingMode = normalizeOrderStatus(
    responsePayload?.order_timing_mode
    || orderContext?.order_timing_mode
    || "ASAP",
  );
  const scheduledForRaw = toText(
    responsePayload?.scheduled_for
    || orderContext?.scheduled_for,
  );
  const scheduledForTimestamp = scheduledForRaw ? new Date(scheduledForRaw).getTime() : Number.NaN;
  const isScheduledOutsideReleaseWindow = timingMode === "SCHEDULED"
    && Number.isFinite(scheduledForTimestamp)
    && (scheduledForTimestamp - Date.now()) > (35 * 60 * 1000);
  const shouldBootstrap = !existingShipdayOrderId && Boolean(
    !isTerminal
    && !isScheduledOutsideReleaseWindow,
  );
  const shouldAutoAssign = Boolean(
    !isTerminal
    && !hasAssignedDriver
    && (
      toBooleanFlag(responsePayload?.auto_assign_enabled)
      || toBooleanFlag(responsePayload?.global_auto_assign_enabled)
      || autoAssignFromStore
    )
    && (
      toBooleanFlag(responsePayload?.auto_accept_applied)
      || toBooleanFlag(responsePayload?.auto_accept_enabled)
      || autoAcceptFromStore
      || status === "CONFIRMED"
      || ["aceite", "atribuindo_estafeta", "estafeta_aceitou", "iniciado", "em_preparacao"].includes(estadoInterno)
    ),
  );

  let currentPayload = {
    ...responsePayload,
    loja_id: responsePayload?.loja_id || orderContext?.loja_id || null,
    estado_interno: estadoInterno || responsePayload?.estado_interno || null,
    status: status || responsePayload?.status || null,
    auto_accept_enabled: toBooleanFlag(responsePayload?.auto_accept_enabled) || autoAcceptFromStore,
    auto_assign_enabled: toBooleanFlag(responsePayload?.auto_assign_enabled) || autoAssignFromStore,
  };
  let currentShipdayOrderId = existingShipdayOrderId;

  if (currentShipdayOrderId || !shouldBootstrap) {
    // segue para tentativa de auto-atribuicao (se aplicavel)
  } else {
    const maxAttempts = shouldAutoAssign ? 16 : 12;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const refreshedContext = await fetchOrderBootstrapContext(orderId);
        if (refreshedContext) {
          const refreshedShipdayOrderId = toText(refreshedContext?.shipday_order_id);
          if (refreshedShipdayOrderId) {
            currentShipdayOrderId = refreshedShipdayOrderId;
            currentPayload = {
              ...currentPayload,
              shipday_order_id: refreshedShipdayOrderId,
            };
            if (hasAssignedDriverData(refreshedContext)) {
              return {
                ...currentPayload,
                driver_name: refreshedContext?.driver_name || currentPayload.driver_name || null,
                driver_phone: refreshedContext?.driver_phone || currentPayload.driver_phone || null,
                estado_interno: refreshedContext?.estado_interno || currentPayload.estado_interno || "atribuindo_estafeta",
                status: refreshedContext?.status || currentPayload.status || "ASSIGNED",
              };
            }
            break;
          }
        }
      } catch (refreshError) {
        console.warn("Checkout Shipday bootstrap: refresh de contexto falhou", {
          orderId,
          attempt,
          maxAttempts,
          error: String(refreshError?.message || refreshError || "unknown_error"),
        });
      }

      try {
        const bootstrap = await createShipdayOrderForOrder({
          orderId,
          autoAssign: shouldAutoAssign,
        });
        const shipdayOrderId = String(bootstrap?.shipdayOrderId || "").trim();
        if (shipdayOrderId) {
          currentShipdayOrderId = shipdayOrderId;
          currentPayload = {
            ...currentPayload,
            shipday_order_id: shipdayOrderId,
          };
          if (bootstrap?.autoAssign?.carrier) {
            currentPayload = {
              ...currentPayload,
              driver_name: bootstrap.autoAssign.carrier?.name || currentPayload.driver_name || null,
              driver_phone: bootstrap.autoAssign.carrier?.phone || currentPayload.driver_phone || null,
              estado_interno: "atribuindo_estafeta",
              status: "ASSIGNED",
            };
          }
          break;
        }
      } catch (error) {
        console.warn("Checkout Shipday bootstrap fallback falhou", {
          orderId,
          attempt,
          maxAttempts,
          error: String(error?.message || error || "unknown_error"),
        });
      }

      if (attempt < maxAttempts) await delay(1100 * attempt);
    }
  }

  if (!currentShipdayOrderId && shouldBootstrap) {
    try {
      const refreshedContext = await fetchOrderBootstrapContext(orderId);
      const refreshedShipdayOrderId = toText(refreshedContext?.shipday_order_id);
      if (refreshedShipdayOrderId) {
        currentShipdayOrderId = refreshedShipdayOrderId;
        currentPayload = {
          ...currentPayload,
          shipday_order_id: refreshedShipdayOrderId,
        };
      }
    } catch (refreshError) {
      console.warn("Checkout Shipday bootstrap: validacao final do contexto falhou", {
        orderId,
        error: String(refreshError?.message || refreshError || "unknown_error"),
      });
    }
  }

  if (!shouldAutoAssign || !currentShipdayOrderId) {
    return currentPayload;
  }

  const maxAttempts = 8;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const refreshedContext = await fetchOrderBootstrapContext(orderId);
      if (refreshedContext && hasAssignedDriverData(refreshedContext)) {
        return {
          ...currentPayload,
          shipday_order_id: toText(refreshedContext?.shipday_order_id || currentShipdayOrderId),
          driver_name: refreshedContext?.driver_name || currentPayload.driver_name || null,
          driver_phone: refreshedContext?.driver_phone || currentPayload.driver_phone || null,
          estado_interno: refreshedContext?.estado_interno || "atribuindo_estafeta",
          status: refreshedContext?.status || "ASSIGNED",
        };
      }
    } catch (refreshError) {
      console.warn("Checkout auto-assign: refresh de contexto falhou", {
        orderId,
        attempt,
        maxAttempts,
        error: String(refreshError?.message || refreshError || "unknown_error"),
      });
    }

    try {
      const autoAssignResult = await autoAssignOrderInShipday({
        orderId,
        shipdayOrderId: currentShipdayOrderId,
      });

      if (autoAssignResult?.ok && !autoAssignResult?.skipped && autoAssignResult?.carrier) {
        return {
          ...currentPayload,
          shipday_order_id: autoAssignResult.shipdayOrderId || currentShipdayOrderId,
          driver_name: autoAssignResult.carrier?.name || currentPayload.driver_name || null,
          driver_phone: autoAssignResult.carrier?.phone || currentPayload.driver_phone || null,
          estado_interno: "atribuindo_estafeta",
          status: "ASSIGNED",
        };
      }

      if (autoAssignResult?.skipped) {
        return currentPayload;
      }
    } catch (error) {
      console.warn("Checkout auto-assign fallback falhou", {
        orderId,
        attempt,
        maxAttempts,
        error: String(error?.message || error || "unknown_error"),
      });
    }

    if (attempt < maxAttempts) {
      await delay(800 * attempt);
    }
  }

  return currentPayload;
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
          group_title: "Instrucoes especiais",
          group_type: "observacao",
          option_id: `note-${item?.idmenu || item?.menu_id || index}`,
          option_name: specialInstructions,
          price_base: 0,
          price_cliente: 0,
        },
      ]
      : selectedOptions;

    return {
      menu_id: item.idmenu,
      nome: item.nome,
      preco_unitario: resolveDisplayPrice(item, storePricingSource),
      quantidade: Number(item.qtd || 1),
      subtotal: resolveDisplayPrice(item, storePricingSource) * Number(item.qtd || 1),
      opcoes_selecionadas: optionsWithInstructions,
      instrucoes_especiais: specialInstructions || null,
    };
  });
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
  const ensuredData = await ensureShipdayBootstrapAfterCheckout(data);

  if (!ensuredData?.order_id) {
    throw new Error("Resposta invalida do checkout.");
  }

  return ensuredData;
}

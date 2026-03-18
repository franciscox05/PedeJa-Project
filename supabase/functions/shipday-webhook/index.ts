import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapShipdayToEstadoInterno } from "../_shared/orderStatusMapper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-shipday-token",
};

const ASSIGNING_TIMEOUT_MS = 2 * 60 * 1000;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = String(value).trim();
  return parsed.length ? parsed : null;
}

function pickFirst(...values: unknown[]): string | null {
  for (const value of values) {
    const parsed = toText(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function readPath(payload: any, path: string[]): unknown {
  let current = payload;
  for (const segment of path) {
    if (!current || typeof current !== "object") return undefined;
    current = current[segment];
  }
  return current;
}

function toNumericId(value: unknown): number | null {
  const parsed = toText(value);
  if (!parsed) return null;
  const numeric = Number(parsed);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.trunc(numeric);
}

function extractTokenFromAuthorization(value: string | null): string | null {
  const raw = toText(value);
  if (!raw) return null;

  const [scheme, token] = raw.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer") return null;
  return toText(token);
}

function extractShipdayOrderId(payload: any): string | null {
  return pickFirst(
    readPath(payload, ["order", "order_id"]),
    readPath(payload, ["order", "orderId"]),
    readPath(payload, ["order", "id"]),
    payload?.orderId,
    payload?.order_id,
    readPath(payload, ["order", "shipdayOrderId"]),
    payload?.shipdayOrderId,
  );
}

function extractOrderNumber(payload: any): string | null {
  return pickFirst(
    readPath(payload, ["order", "order_number"]),
    readPath(payload, ["order", "orderNumber"]),
    readPath(payload, ["order", "additionalId"]),
    payload?.order_number,
    payload?.orderNumber,
    payload?.additionalId,
  );
}

function extractRawStatus(payload: any): string | null {
  return pickFirst(
    payload?.order_status,
    readPath(payload, ["order", "orderStatus"]),
    readPath(payload, ["order", "state"]),
    readPath(payload, ["order", "status"]),
    payload?.orderStatus,
    payload?.state,
    payload?.status,
  );
}

function extractDriverName(payload: any): string | null {
  return pickFirst(
    payload?.carrier?.name,
    readPath(payload, ["carrier", "name"]),
    readPath(payload, ["assignedCarrier", "name"]),
    readPath(payload, ["assignedCarrier", "fullName"]),
    readPath(payload, ["driver", "name"]),
    payload?.driverName,
  );
}

function extractDriverPhone(payload: any): string | null {
  return pickFirst(
    payload?.carrier?.phone,
    readPath(payload, ["carrier", "phoneNumber"]),
    readPath(payload, ["carrier", "phone"]),
    readPath(payload, ["assignedCarrier", "phoneNumber"]),
    readPath(payload, ["assignedCarrier", "phone"]),
    readPath(payload, ["driver", "phoneNumber"]),
    readPath(payload, ["driver", "phone"]),
    payload?.driverPhone,
  );
}

function extractTrackingUrl(payload: any): string | null {
  return pickFirst(
    payload?.trackingUrl,
    readPath(payload, ["order", "trackingLink"]),
    readPath(payload, ["order", "trackingUrl"]),
    readPath(payload, ["tracking", "url"]),
    payload?.trackingLink,
    payload?.trackingUrl,
  );
}

function normalizeVehicleSegment(value: unknown): string | null {
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

function buildVehicleSummary(...values: unknown[]): string | null {
  const seen = new Set<string>();
  const parts: string[] = [];

  values.forEach((value) => {
    const normalized = normalizeVehicleSegment(value);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    parts.push(normalized);
  });

  return parts.length ? parts.join(" • ") : null;
}

function normalizeVehiclePlate(value: unknown): string | null {
  const text = toText(value);
  if (!text) return null;
  return text.replace(/\s+/g, "").toUpperCase();
}

function isVehiclePlateLike(value: unknown): boolean {
  const text = normalizeVehiclePlate(value);
  if (!text) return false;
  return /^[A-Z0-9]{2}-?[A-Z0-9]{2}-?[A-Z0-9]{2}$/.test(text);
}

function composeVehicleSummary(
  { description, type, make, model, plate }: {
    description?: unknown;
    type?: unknown;
    make?: unknown;
    model?: unknown;
    plate?: unknown;
  },
): string | null {
  const normalizedDescription = normalizeVehicleSegment(description);
  const normalizedType = normalizeVehicleSegment(type);
  const normalizedMake = normalizeVehicleSegment(make);
  const normalizedModel = normalizeVehicleSegment(model);
  const normalizedPlate = normalizeVehiclePlate(plate);
  const seenBaseParts = new Set<string>();
  const baseSummary = [normalizedType, normalizedMake, normalizedModel]
    .filter((value): value is string => {
      if (!value) return false;
      const key = value.toLowerCase();
      if (seenBaseParts.has(key)) return false;
      seenBaseParts.add(key);
      return true;
    })
    .join(" ")
    .trim();
  const descriptionLooksLikePlate = isVehiclePlateLike(normalizedDescription);
  const descriptionWithoutPlate = normalizedDescription
    && !descriptionLooksLikePlate
    && normalizeVehiclePlate(normalizedDescription) !== normalizedPlate
    ? normalizedDescription
    : null;

  if (baseSummary && normalizedPlate) return `${baseSummary} (${normalizedPlate})`;
  if (baseSummary) return baseSummary;

  if (descriptionWithoutPlate && normalizedPlate) {
    return descriptionWithoutPlate.includes(normalizedPlate)
      ? descriptionWithoutPlate
      : `${descriptionWithoutPlate} (${normalizedPlate})`;
  }

  if (descriptionWithoutPlate) return descriptionWithoutPlate;
  if (normalizedPlate) return normalizedPlate;
  return normalizedDescription || null;
}

function extractExpectedDelivery(payload: any): string | null {
  return pickFirst(
    payload?.eta,
    payload?.expected_delivery_time,
    payload?.expectedDeliveryTime,
    readPath(payload, ["order", "eta"]),
    readPath(payload, ["order", "expected_delivery_time"]),
    readPath(payload, ["order", "expectedDeliveryTime"]),
    readPath(payload, ["delivery", "eta"]),
    readPath(payload, ["delivery", "expected_delivery_time"]),
    readPath(payload, ["delivery", "expectedDeliveryTime"]),
    readPath(payload, ["tracking", "eta"]),
  );
}

function extractVehicleDescription(payload: any): string | null {
  const description = pickFirst(
    readPath(payload, ["carrier", "vehicle_description"]),
    readPath(payload, ["carrier", "vehicleDescription"]),
    readPath(payload, ["carrier", "vehicle"]),
    readPath(payload, ["delivery_details", "vehicle_description"]),
    readPath(payload, ["delivery_details", "vehicleDescription"]),
    readPath(payload, ["delivery_details", "vehicle"]),
    readPath(payload, ["delivery_details", "carrier", "vehicle_description"]),
    readPath(payload, ["delivery_details", "carrier", "vehicleDescription"]),
    readPath(payload, ["delivery_details", "carrier", "vehicle"]),
    readPath(payload, ["deliveryDetails", "vehicle_description"]),
    readPath(payload, ["deliveryDetails", "vehicleDescription"]),
    readPath(payload, ["deliveryDetails", "vehicle"]),
    readPath(payload, ["deliveryDetails", "carrier", "vehicle_description"]),
    readPath(payload, ["deliveryDetails", "carrier", "vehicleDescription"]),
    readPath(payload, ["deliveryDetails", "carrier", "vehicle"]),
    readPath(payload, ["order", "carrier", "vehicle_description"]),
    readPath(payload, ["order", "carrier", "vehicleDescription"]),
    readPath(payload, ["order", "carrier", "vehicle"]),
    readPath(payload, ["driver", "vehicle_description"]),
    readPath(payload, ["driver", "vehicleDescription"]),
    readPath(payload, ["driver", "vehicle"]),
    readPath(payload, ["assignedCarrier", "vehicle_description"]),
    readPath(payload, ["assignedCarrier", "vehicleDescription"]),
    readPath(payload, ["assignedCarrier", "vehicle"]),
    readPath(payload, ["assignedDriver", "vehicle_description"]),
    readPath(payload, ["assignedDriver", "vehicleDescription"]),
    readPath(payload, ["assignedDriver", "vehicle"]),
  );

  const type = pickFirst(
    readPath(payload, ["carrier", "vehicle_type"]),
    readPath(payload, ["carrier", "vehicleType"]),
    readPath(payload, ["carrier", "type"]),
    readPath(payload, ["delivery_details", "vehicle_type"]),
    readPath(payload, ["delivery_details", "vehicleType"]),
    readPath(payload, ["delivery_details", "type"]),
    readPath(payload, ["delivery_details", "carrier", "vehicle_type"]),
    readPath(payload, ["delivery_details", "carrier", "vehicleType"]),
    readPath(payload, ["delivery_details", "carrier", "type"]),
    readPath(payload, ["deliveryDetails", "vehicle_type"]),
    readPath(payload, ["deliveryDetails", "vehicleType"]),
    readPath(payload, ["deliveryDetails", "type"]),
    readPath(payload, ["deliveryDetails", "carrier", "vehicle_type"]),
    readPath(payload, ["deliveryDetails", "carrier", "vehicleType"]),
    readPath(payload, ["deliveryDetails", "carrier", "type"]),
    readPath(payload, ["order", "carrier", "vehicle_type"]),
    readPath(payload, ["order", "carrier", "vehicleType"]),
    readPath(payload, ["driver", "vehicle_type"]),
    readPath(payload, ["driver", "vehicleType"]),
    readPath(payload, ["driver", "type"]),
    readPath(payload, ["assignedCarrier", "vehicle_type"]),
    readPath(payload, ["assignedCarrier", "vehicleType"]),
    readPath(payload, ["assignedCarrier", "type"]),
    readPath(payload, ["assignedDriver", "vehicle_type"]),
    readPath(payload, ["assignedDriver", "vehicleType"]),
    readPath(payload, ["assignedDriver", "type"]),
  );

  const make = pickFirst(
    readPath(payload, ["carrier", "vehicle_make"]),
    readPath(payload, ["carrier", "vehicleMake"]),
    readPath(payload, ["carrier", "make"]),
    readPath(payload, ["delivery_details", "vehicle_make"]),
    readPath(payload, ["delivery_details", "vehicleMake"]),
    readPath(payload, ["delivery_details", "make"]),
    readPath(payload, ["delivery_details", "carrier", "vehicle_make"]),
    readPath(payload, ["delivery_details", "carrier", "vehicleMake"]),
    readPath(payload, ["delivery_details", "carrier", "make"]),
    readPath(payload, ["deliveryDetails", "vehicle_make"]),
    readPath(payload, ["deliveryDetails", "vehicleMake"]),
    readPath(payload, ["deliveryDetails", "make"]),
    readPath(payload, ["deliveryDetails", "carrier", "vehicle_make"]),
    readPath(payload, ["deliveryDetails", "carrier", "vehicleMake"]),
    readPath(payload, ["deliveryDetails", "carrier", "make"]),
    readPath(payload, ["order", "carrier", "vehicle_make"]),
    readPath(payload, ["order", "carrier", "vehicleMake"]),
    readPath(payload, ["driver", "vehicle_make"]),
    readPath(payload, ["driver", "vehicleMake"]),
    readPath(payload, ["driver", "make"]),
    readPath(payload, ["assignedCarrier", "vehicle_make"]),
    readPath(payload, ["assignedCarrier", "vehicleMake"]),
    readPath(payload, ["assignedCarrier", "make"]),
    readPath(payload, ["assignedDriver", "vehicle_make"]),
    readPath(payload, ["assignedDriver", "vehicleMake"]),
    readPath(payload, ["assignedDriver", "make"]),
  );

  const model = pickFirst(
    readPath(payload, ["carrier", "vehicle_model"]),
    readPath(payload, ["carrier", "vehicleModel"]),
    readPath(payload, ["carrier", "model"]),
    readPath(payload, ["delivery_details", "vehicle_model"]),
    readPath(payload, ["delivery_details", "vehicleModel"]),
    readPath(payload, ["delivery_details", "model"]),
    readPath(payload, ["delivery_details", "carrier", "vehicle_model"]),
    readPath(payload, ["delivery_details", "carrier", "vehicleModel"]),
    readPath(payload, ["delivery_details", "carrier", "model"]),
    readPath(payload, ["deliveryDetails", "vehicle_model"]),
    readPath(payload, ["deliveryDetails", "vehicleModel"]),
    readPath(payload, ["deliveryDetails", "model"]),
    readPath(payload, ["deliveryDetails", "carrier", "vehicle_model"]),
    readPath(payload, ["deliveryDetails", "carrier", "vehicleModel"]),
    readPath(payload, ["deliveryDetails", "carrier", "model"]),
    readPath(payload, ["order", "carrier", "vehicle_model"]),
    readPath(payload, ["order", "carrier", "vehicleModel"]),
    readPath(payload, ["driver", "vehicle_model"]),
    readPath(payload, ["driver", "vehicleModel"]),
    readPath(payload, ["driver", "model"]),
    readPath(payload, ["assignedCarrier", "vehicle_model"]),
    readPath(payload, ["assignedCarrier", "vehicleModel"]),
    readPath(payload, ["assignedCarrier", "model"]),
    readPath(payload, ["assignedDriver", "vehicle_model"]),
    readPath(payload, ["assignedDriver", "vehicleModel"]),
    readPath(payload, ["assignedDriver", "model"]),
  );

  const plate = pickFirst(
    readPath(payload, ["carrier", "license_plate"]),
    readPath(payload, ["carrier", "licensePlate"]),
    readPath(payload, ["carrier", "plate_number"]),
    readPath(payload, ["carrier", "plateNumber"]),
    readPath(payload, ["carrier", "plate"]),
    readPath(payload, ["carrier", "registration"]),
    readPath(payload, ["delivery_details", "license_plate"]),
    readPath(payload, ["delivery_details", "licensePlate"]),
    readPath(payload, ["delivery_details", "plate_number"]),
    readPath(payload, ["delivery_details", "plateNumber"]),
    readPath(payload, ["delivery_details", "plate"]),
    readPath(payload, ["delivery_details", "registration"]),
    readPath(payload, ["delivery_details", "carrier", "license_plate"]),
    readPath(payload, ["delivery_details", "carrier", "licensePlate"]),
    readPath(payload, ["delivery_details", "carrier", "plate_number"]),
    readPath(payload, ["delivery_details", "carrier", "plateNumber"]),
    readPath(payload, ["delivery_details", "carrier", "plate"]),
    readPath(payload, ["delivery_details", "carrier", "registration"]),
    readPath(payload, ["deliveryDetails", "license_plate"]),
    readPath(payload, ["deliveryDetails", "licensePlate"]),
    readPath(payload, ["deliveryDetails", "plate_number"]),
    readPath(payload, ["deliveryDetails", "plateNumber"]),
    readPath(payload, ["deliveryDetails", "plate"]),
    readPath(payload, ["deliveryDetails", "registration"]),
    readPath(payload, ["deliveryDetails", "carrier", "license_plate"]),
    readPath(payload, ["deliveryDetails", "carrier", "licensePlate"]),
    readPath(payload, ["deliveryDetails", "carrier", "plate_number"]),
    readPath(payload, ["deliveryDetails", "carrier", "plateNumber"]),
    readPath(payload, ["deliveryDetails", "carrier", "plate"]),
    readPath(payload, ["deliveryDetails", "carrier", "registration"]),
    readPath(payload, ["order", "carrier", "license_plate"]),
    readPath(payload, ["order", "carrier", "licensePlate"]),
    readPath(payload, ["driver", "license_plate"]),
    readPath(payload, ["driver", "licensePlate"]),
    readPath(payload, ["driver", "plate_number"]),
    readPath(payload, ["driver", "plateNumber"]),
    readPath(payload, ["driver", "plate"]),
    readPath(payload, ["driver", "registration"]),
    readPath(payload, ["assignedCarrier", "license_plate"]),
    readPath(payload, ["assignedCarrier", "licensePlate"]),
    readPath(payload, ["assignedCarrier", "plate_number"]),
    readPath(payload, ["assignedCarrier", "plateNumber"]),
    readPath(payload, ["assignedCarrier", "plate"]),
    readPath(payload, ["assignedCarrier", "registration"]),
    readPath(payload, ["assignedDriver", "license_plate"]),
    readPath(payload, ["assignedDriver", "licensePlate"]),
    readPath(payload, ["assignedDriver", "plate_number"]),
    readPath(payload, ["assignedDriver", "plateNumber"]),
    readPath(payload, ["assignedDriver", "plate"]),
    readPath(payload, ["assignedDriver", "registration"]),
  );

  return composeVehicleSummary({
    description,
    type,
    make,
    model,
    plate,
  });
}

function hasOwnField(value: unknown, field: string): boolean {
  return !!value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, field);
}

function extractCarrierPayload(payload: any): unknown {
  if (hasOwnField(payload, "carrier")) return payload?.carrier;
  const orderPayload = readPath(payload, ["order"]);
  if (hasOwnField(orderPayload, "carrier")) return (orderPayload as any)?.carrier;
  return undefined;
}

function isCarrierEmpty(carrierPayload: unknown): boolean {
  if (carrierPayload === null) return true;
  if (carrierPayload === undefined) return false;
  if (typeof carrierPayload === "string") return carrierPayload.trim().length === 0;
  if (typeof carrierPayload !== "object") return false;

  const carrier = carrierPayload as Record<string, unknown>;
  if (Object.keys(carrier).length === 0) return true;

  const carrierName = toText(carrier?.name ?? carrier?.fullName);
  const carrierPhone = toText(carrier?.phoneNumber ?? carrier?.phone);
  const carrierId = toText(carrier?.id ?? carrier?.carrierId ?? carrier?.driverId);

  return !carrierName && !carrierPhone && !carrierId;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const expectedToken = toText(Deno.env.get("SHIPDAY_WEBHOOK_TOKEN"));
  if (expectedToken) {
    const headerToken = pickFirst(
      req.headers.get("token"),
      req.headers.get("client-id"),
      req.headers.get("x-shipday-token"),
      extractTokenFromAuthorization(req.headers.get("authorization")),
    );

    if (!headerToken || headerToken !== expectedToken) {
      return json({ error: "Unauthorized webhook" }, 401);
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Missing Supabase service credentials" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const payload = await req.json();
    console.log("📦 PAYLOAD SHIPDAY RECEBIDO:", JSON.stringify(payload));
    const parsedOrderId = parseInt(String(payload.order?.order_number ?? "").split("-")[0], 10);
    const orderId = Number.isFinite(parsedOrderId) && parsedOrderId > 0 ? parsedOrderId : null;

    const shipdayOrderId = extractShipdayOrderId(payload);
    const orderNumber = extractOrderNumber(payload);
    const rawStatus = extractRawStatus(payload);
    const shipdayState = String(rawStatus ?? "")
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_");
    const carrierPayload = extractCarrierPayload(payload);
    const shouldClearCarrier = carrierPayload !== undefined && isCarrierEmpty(carrierPayload);
    const shouldClearCarrierByState =
      shipdayState === "REJECTED" || shipdayState === "DELETED";

    const estadoInternoMapeado = mapShipdayToEstadoInterno(rawStatus);
    const isEstadoTerminal = estadoInternoMapeado === "entregue" || estadoInternoMapeado === "cancelado";

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    const driverName = extractDriverName(payload);
    const driverPhone = extractDriverPhone(payload);
    const trackingUrl = extractTrackingUrl(payload);
    const expectedDelivery = extractExpectedDelivery(payload);
    const vehicleDescription = extractVehicleDescription(payload);

    let currentEstadoInterno: string | null = null;
    let currentOrderUpdatedAt: string | null = null;
    let currentEstadoLookupSource: "id" | "shipday_order_id" | null = null;
    let currentEstadoLookupError: string | null = null;

    async function readCurrentEstadoById(targetOrderId: number) {
      const { data, error } = await supabase
        .from("orders")
        .select("estado_interno, updated_at")
        .eq("id", targetOrderId)
        .maybeSingle();

      if (error) {
        currentEstadoLookupError = `lookup_por_id:${error.message}`;
        console.error("shipday-webhook lookup error por id", {
          orderId: targetOrderId,
          shipdayOrderId,
          rawStatus,
          error,
        });
        return false;
      }

      currentEstadoInterno = toText(data?.estado_interno);
      currentOrderUpdatedAt = toText(data?.updated_at);
      currentEstadoLookupSource = "id";
      return true;
    }

    async function readCurrentEstadoByShipdayId(targetShipdayOrderId: string) {
      const { data, error } = await supabase
        .from("orders")
        .select("estado_interno, updated_at")
        .eq("shipday_order_id", targetShipdayOrderId)
        .limit(1)
        .maybeSingle();

      if (error) {
        currentEstadoLookupError = `lookup_por_shipday_order_id:${error.message}`;
        console.error("shipday-webhook lookup error por shipday_order_id", {
          orderId,
          shipdayOrderId: targetShipdayOrderId,
          rawStatus,
          error,
        });
        return false;
      }

      currentEstadoInterno = toText(data?.estado_interno);
      currentOrderUpdatedAt = toText(data?.updated_at);
      currentEstadoLookupSource = "shipday_order_id";
      return true;
    }

    if (orderId !== null) {
      const lookupOk = await readCurrentEstadoById(orderId);
      if (!lookupOk) {
        return json({
          error: "Falha a ler estado_interno atual por id antes de processar webhook.",
          order_id: orderId,
          shipday_order_id: shipdayOrderId,
          raw_status: rawStatus,
          lookup_error: currentEstadoLookupError,
        }, 500);
      }
    }

    if (currentEstadoInterno === null && shipdayOrderId) {
      const lookupOk = await readCurrentEstadoByShipdayId(shipdayOrderId);
      if (!lookupOk) {
        return json({
          error: "Falha a ler estado_interno atual por shipday_order_id antes de processar webhook.",
          order_id: orderId,
          shipday_order_id: shipdayOrderId,
          raw_status: rawStatus,
          lookup_error: currentEstadoLookupError,
        }, 500);
      }
    }

    if (currentEstadoInterno === null) {
      console.log("shipday-webhook decision", {
        currentEstadoInterno,
        currentEstadoLookupSource,
        shipdayState,
        rawStatus,
        decisionReason: "estado_atual_indisponivel_sem_update",
        orderId,
        shipdayOrderId,
      });
      return json({
        ok: true,
        warning: "Estado interno atual indisponivel. Webhook ignorado para evitar regressao de estado.",
        order_id: orderId,
        shipday_order_id: shipdayOrderId,
        raw_status: rawStatus,
        lookup_source: currentEstadoLookupSource,
      });
    }

    const isAwaitingCarrierDecision = currentEstadoInterno === "atribuindo_estafeta";
    const currentUpdatedTimestamp = currentOrderUpdatedAt ? new Date(currentOrderUpdatedAt).getTime() : NaN;
    const elapsedSinceUpdateMs = Number.isFinite(currentUpdatedTimestamp)
      ? Date.now() - currentUpdatedTimestamp
      : null;
    const timeoutMinutesSinceUpdate = elapsedSinceUpdateMs !== null
      ? Math.floor(elapsedSinceUpdateMs / 60000)
      : null;
    const didAssignmentTimeout =
      isAwaitingCarrierDecision
      && shipdayState === "UNASSIGNED"
      && elapsedSinceUpdateMs !== null
      && elapsedSinceUpdateMs >= ASSIGNING_TIMEOUT_MS;
    const isAssignmentAccepted = ["ASSIGNED", "ACTIVE", "STARTED"].includes(shipdayState);
    const isRealAssignmentCancellation = ["REJECTED", "DELETED"].includes(shipdayState);
    const shouldKeepAssigningState =
      isAwaitingCarrierDecision
      && !isAssignmentAccepted
      && !isRealAssignmentCancellation
      && !didAssignmentTimeout;
    const shouldRollbackToAceite =
      !estadoInternoMapeado && shouldClearCarrier && !isEstadoTerminal && !shouldKeepAssigningState;

    let decisionReason = "mapped_shipday_status";

    if (!estadoInternoMapeado && !shouldRollbackToAceite && !shouldKeepAssigningState) {
      decisionReason = "estado_shipday_sem_mapeamento_sem_update";
      console.log("shipday-webhook decision", {
        currentEstadoInterno,
        currentEstadoLookupSource,
        shipdayState,
        rawStatus,
        decisionReason,
        orderId,
        shipdayOrderId,
      });
      return json({
        ok: true,
        warning: "Estado Shipday sem mapeamento. Sem atualizacao na base de dados.",
        raw_status: rawStatus,
        shipday_order_id: shipdayOrderId,
        order_number: orderNumber,
      });
    }

    let finalStatus = shouldKeepAssigningState
      ? "atribuindo_estafeta"
      : (isAssignmentAccepted ? "estafeta_aceitou" : (didAssignmentTimeout ? "aceite" : (isRealAssignmentCancellation ? "aceite" : (shouldRollbackToAceite ? "aceite" : estadoInternoMapeado))));

    if (shouldKeepAssigningState) {
      decisionReason = "MAINTAIN_ASSIGNING";
    } else if (isAssignmentAccepted) {
      decisionReason = "shipday_reportou_aceitacao_do_estafeta";
    } else if (didAssignmentTimeout) {
      decisionReason = "ASSIGNING_TIMEOUT_ROLLBACK";
    } else if (isRealAssignmentCancellation) {
      decisionReason = "shipday_reportou_cancelamento_real_da_atribuicao";
    } else if (shouldRollbackToAceite) {
      decisionReason = "rollback_para_aceite_por_limpeza_sem_mapeamento";
    }

    if (isAwaitingCarrierDecision && finalStatus === "aceite" && !isRealAssignmentCancellation && !didAssignmentTimeout) {
      finalStatus = "atribuindo_estafeta";
      decisionReason = "bloqueio_total_contra_regressao_para_aceite";
    }
    const isDriverAssignmentProgress =
      finalStatus === "iniciado" ||
      finalStatus === "estafeta_atribuido" ||
      finalStatus === "estafeta_aceitou" ||
      finalStatus === "atribuindo_estafeta";

    if (isDriverAssignmentProgress && currentEstadoInterno === "recolhido") {
      finalStatus = "pronto_recolha";
      decisionReason = "mantido_em_fluxo_logistico_recolhido_para_pronto_recolha";
    } else if (
      isDriverAssignmentProgress &&
      (currentEstadoInterno === "em_preparacao" || currentEstadoInterno === "pronto_recolha")
    ) {
      finalStatus = currentEstadoInterno;
      decisionReason = "mantido_no_estado_operacional_atual_da_loja";
    }

    console.log("shipday-webhook decision", {
      currentEstadoInterno,
      currentOrderUpdatedAt,
      currentEstadoLookupSource,
      shipdayState,
      rawStatus,
      estadoInternoMapeado,
      finalStatus,
      decisionReason,
      elapsedSinceUpdateMs,
      timeoutMinutesSinceUpdate,
      didAssignmentTimeout,
      orderId,
      shipdayOrderId,
      shouldKeepAssigningState,
      isAssignmentAccepted,
      isRealAssignmentCancellation,
      shouldRollbackToAceite,
      shouldClearCarrier,
      shouldClearCarrierByState,
    });

    if (finalStatus) {
      patch.estado_interno = finalStatus;
    }

    if (shouldClearCarrierByState || didAssignmentTimeout) {
      patch.driver_name = null;
      patch.driver_phone = null;
      patch.shipday_tracking_url = null;
      patch.shipday_driver_name = null;
      patch.shipday_driver_phone = null;
      patch.previsao_entrega = null;
      patch.veiculo_estafeta = null;
    } else {
      if (driverName) patch.driver_name = driverName;
      if (driverPhone) patch.driver_phone = driverPhone;
      if (trackingUrl) patch.shipday_tracking_url = trackingUrl;
      if (expectedDelivery) patch.previsao_entrega = expectedDelivery;
      if (vehicleDescription) patch.veiculo_estafeta = vehicleDescription;
    }

    let updatedRows: Array<{ id: number }> = [];
    let matchedBy: "shipday_order_id" | "order_number" | null = null;

    if (shipdayOrderId) {
      console.log(
        "🛠️ A tentar atualizar DB... ID:",
        orderId,
        "Dados:",
        JSON.stringify(patch),
        "Match:",
        "shipday_order_id",
        "Valor:",
        shipdayOrderId,
      );
      let response = await supabase
        .from("orders")
        .update(patch)
        .eq("shipday_order_id", shipdayOrderId)
        .select("id");

      if (
        response.error
        && /shipday_driver_name|shipday_driver_phone|previsao_entrega|veiculo_estafeta/i.test(String(response.error.message || ""))
      ) {
        delete patch.shipday_driver_name;
        delete patch.shipday_driver_phone;
        delete patch.previsao_entrega;
        delete patch.veiculo_estafeta;
        response = await supabase
          .from("orders")
          .update(patch)
          .eq("shipday_order_id", shipdayOrderId)
          .select("id");
      }

      if (response.error) {
        console.error("🚨 ERRO FATAL NA DB:", JSON.stringify(response.error));
        return json({ error: `Falha ao atualizar por shipday_order_id: ${response.error.message}` }, 500);
      }

      console.log("✅ DB ATUALIZADA COM SUCESSO!");

      if (response.data && response.data.length > 0) {
        updatedRows = response.data;
        matchedBy = "shipday_order_id";
      }
    }

    const numericOrderNumber = orderId ?? toNumericId(orderNumber);
    if (updatedRows.length === 0 && numericOrderNumber !== null) {
      console.log("🛠️ A tentar atualizar DB... ID:", numericOrderNumber, "Dados:", JSON.stringify(patch));
      let updateResponse = await supabase.from("orders").update(patch).eq("id", numericOrderNumber);

      if (
        updateResponse.error
        && /shipday_driver_name|shipday_driver_phone|previsao_entrega|veiculo_estafeta/i.test(String(updateResponse.error.message || ""))
      ) {
        delete patch.shipday_driver_name;
        delete patch.shipday_driver_phone;
        delete patch.previsao_entrega;
        delete patch.veiculo_estafeta;
        updateResponse = await supabase.from("orders").update(patch).eq("id", numericOrderNumber);
      }

      if (updateResponse.error) {
        console.error("🚨 ERRO FATAL NA DB:", JSON.stringify(updateResponse.error));
        return json({ error: `Falha ao atualizar por orderNumber: ${updateResponse.error.message}` }, 500);
      } else {
        console.log("✅ DB ATUALIZADA COM SUCESSO!");
      }

      const { data: updatedById, error: fetchUpdatedError } = await supabase
        .from("orders")
        .select("id")
        .eq("id", numericOrderNumber);

      if (fetchUpdatedError) {
        return json({ error: `Falha ao confirmar update por orderNumber: ${fetchUpdatedError.message}` }, 500);
      }

      if (updatedById && updatedById.length > 0) {
        updatedRows = updatedById;
        matchedBy = "order_number";
      }
    }

    if (updatedRows.length === 0) {
      return json({
        ok: true,
        warning: "Pedido nao encontrado para atualizar.",
        shipday_order_id: shipdayOrderId,
        order_number: orderNumber,
        estado_interno: finalStatus ?? null,
      });
    }

    return json({
      ok: true,
      matched_by: matchedBy,
      updated_order_ids: updatedRows.map((row) => row.id),
      estado_interno: finalStatus ?? null,
      driver_name: shouldClearCarrierByState || didAssignmentTimeout ? null : driverName,
      driver_phone: shouldClearCarrierByState || didAssignmentTimeout ? null : driverPhone,
      shipday_tracking_url: shouldClearCarrierByState || didAssignmentTimeout ? null : trackingUrl,
      previsao_entrega: shouldClearCarrierByState || didAssignmentTimeout ? null : expectedDelivery,
      veiculo_estafeta: shouldClearCarrierByState || didAssignmentTimeout ? null : vehicleDescription,
      shipday_order_id: shipdayOrderId,
    });
  } catch (error: any) {
    console.error("shipday-webhook error", error);
    return json({ error: error?.message || "Unexpected server error" }, 500);
  }
});

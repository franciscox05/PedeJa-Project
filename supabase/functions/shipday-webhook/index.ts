import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapShipdayToEstadoInterno } from "../_shared/orderStatusMapper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-shipday-token",
};

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
    readPath(payload, ["driver", "name"]),
    payload?.driverName,
  );
}

function extractDriverPhone(payload: any): string | null {
  return pickFirst(
    payload?.carrier?.phone,
    readPath(payload, ["carrier", "phoneNumber"]),
    readPath(payload, ["carrier", "phone"]),
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
      shipdayState === "NOT_ACCEPTED" || shipdayState === "UNASSIGNED" || shipdayState === "REJECTED";

    const estadoInternoMapeado = mapShipdayToEstadoInterno(rawStatus);
    const isEstadoTerminal = estadoInternoMapeado === "entregue" || estadoInternoMapeado === "cancelado";
    const shouldRollbackToAceite = !estadoInternoMapeado && shouldClearCarrier && !isEstadoTerminal;

    if (!estadoInternoMapeado && !shouldRollbackToAceite) {
      return json({
        ok: true,
        warning: "Estado Shipday sem mapeamento. Sem atualizacao na base de dados.",
        raw_status: rawStatus,
        shipday_order_id: shipdayOrderId,
        order_number: orderNumber,
      });
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    const driverName = extractDriverName(payload);
    const driverPhone = extractDriverPhone(payload);
    const trackingUrl = extractTrackingUrl(payload);

    let currentEstadoInterno: string | null = null;

    if (orderId !== null) {
      const { data: orderById, error: orderByIdError } = await supabase
        .from("orders")
        .select("estado_interno")
        .eq("id", orderId)
        .maybeSingle();

      if (!orderByIdError) {
        currentEstadoInterno = toText(orderById?.estado_interno);
      }
    } else if (shipdayOrderId) {
      const { data: orderByShipdayId, error: orderByShipdayIdError } = await supabase
        .from("orders")
        .select("estado_interno")
        .eq("shipday_order_id", shipdayOrderId)
        .limit(1)
        .maybeSingle();

      if (!orderByShipdayIdError) {
        currentEstadoInterno = toText(orderByShipdayId?.estado_interno);
      }
    }

    let finalStatus = shouldRollbackToAceite ? "aceite" : estadoInternoMapeado;
    const isDriverAssignmentProgress =
      finalStatus === "iniciado" ||
      finalStatus === "estafeta_atribuido" ||
      finalStatus === "estafeta_aceitou" ||
      finalStatus === "atribuindo_estafeta";

    if (isDriverAssignmentProgress && currentEstadoInterno === "recolhido") {
      finalStatus = "pronto_recolha";
    } else if (
      isDriverAssignmentProgress &&
      (currentEstadoInterno === "em_preparacao" || currentEstadoInterno === "pronto_recolha")
    ) {
      finalStatus = currentEstadoInterno;
    }

    if (finalStatus) {
      patch.estado_interno = finalStatus;
    }

    if (shouldClearCarrierByState) {
      patch.driver_name = null;
      patch.driver_phone = null;
      patch.shipday_tracking_url = null;
    } else {
      if (driverName) patch.driver_name = driverName;
      if (driverPhone) patch.driver_phone = driverPhone;
      if (trackingUrl) patch.shipday_tracking_url = trackingUrl;
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
      const { data, error } = await supabase
        .from("orders")
        .update(patch)
        .eq("shipday_order_id", shipdayOrderId)
        .select("id");

      if (error) {
        console.error("🚨 ERRO FATAL NA DB:", JSON.stringify(error));
        return json({ error: `Falha ao atualizar por shipday_order_id: ${error.message}` }, 500);
      }

      console.log("✅ DB ATUALIZADA COM SUCESSO!");

      if (data && data.length > 0) {
        updatedRows = data;
        matchedBy = "shipday_order_id";
      }
    }

    const numericOrderNumber = orderId ?? toNumericId(orderNumber);
    if (updatedRows.length === 0 && numericOrderNumber !== null) {
      console.log("🛠️ A tentar atualizar DB... ID:", numericOrderNumber, "Dados:", JSON.stringify(patch));
      const { error: dbUpdateError } = await supabase.from("orders").update(patch).eq("id", numericOrderNumber);

      if (dbUpdateError) {
        console.error("🚨 ERRO FATAL NA DB:", JSON.stringify(dbUpdateError));
        return json({ error: `Falha ao atualizar por orderNumber: ${dbUpdateError.message}` }, 500);
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
      driver_name: shouldClearCarrierByState ? null : driverName,
      driver_phone: shouldClearCarrierByState ? null : driverPhone,
      shipday_tracking_url: shouldClearCarrierByState ? null : trackingUrl,
      shipday_order_id: shipdayOrderId,
    });
  } catch (error: any) {
    console.error("shipday-webhook error", error);
    return json({ error: error?.message || "Unexpected server error" }, 500);
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:suporte@pedeja.pt";

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Missing Supabase service credentials" }, 500);
  }
  if (!vapidPublicKey || !vapidPrivateKey) {
    return json({
      error: "VAPID keys nao configuradas. Corre: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...",
    }, 500);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  try {
    const payload = await req.json();
    const idutilizador = Number(payload?.idutilizador);
    const title = String(payload?.title || "PedeJa");
    const body = String(payload?.body || "");
    const url = String(payload?.url || "/");

    if (!Number.isFinite(idutilizador)) {
      return json({ error: "idutilizador em falta ou invalido" }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: subscriptions, error: subsError } = await supabase
      .from("estafeta_push_subscriptions")
      .select("id, endpoint, subscription")
      .eq("idutilizador", idutilizador)
      .eq("ativo", true);

    if (subsError) {
      return json({ error: subsError.message }, 500);
    }

    if (!subscriptions || subscriptions.length === 0) {
      return json({ ok: true, sent: 0, reason: "sem subscricoes ativas" });
    }

    const notificationPayload = JSON.stringify({ title, body, url });

    const results = await Promise.allSettled(
      subscriptions.map((row) => webpush.sendNotification(row.subscription, notificationPayload)),
    );

    let sent = 0;
    const staleIds: number[] = [];

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        sent += 1;
        return;
      }

      const statusCode = (result.reason as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        staleIds.push(subscriptions[index].id);
      }
    });

    if (staleIds.length > 0) {
      await supabase.from("estafeta_push_subscriptions").update({ ativo: false }).in("id", staleIds);
    }

    return json({ ok: true, sent, total: subscriptions.length, deactivated: staleIds.length });
  } catch (error: any) {
    return json({ error: error?.message || "Unexpected server error" }, 500);
  }
});

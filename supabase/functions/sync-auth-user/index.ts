import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function isAlreadyRegisteredError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("already been registered") || normalized.includes("already exists");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Missing Supabase service credentials" }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const payload = await req.json();
    const email = String(payload?.email || "").trim().toLowerCase();

    if (!email) {
      return json({ error: "Missing email" }, 400);
    }

    // So sincroniza emails que correspondem a uma conta real na tabela
    // custom `utilizadores` - impede que este endpoint crie entradas
    // fantasma em auth.users para emails arbitrarios.
    const { data: existingUser, error: lookupError } = await supabaseAdmin
      .from("utilizadores")
      .select("idutilizador")
      .eq("email", email)
      .maybeSingle();

    if (lookupError) {
      return json({ error: lookupError.message }, 500);
    }

    if (!existingUser) {
      return json({ error: "Nenhuma conta encontrada com este email." }, 404);
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
    });

    if (createError) {
      if (isAlreadyRegisteredError(createError.message || "")) {
        return json({ ok: true, alreadyExisted: true });
      }
      return json({ error: createError.message }, 400);
    }

    return json({ ok: true, userId: created?.user?.id || null });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido" }, 500);
  }
});

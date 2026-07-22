import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_BUCKETS = new Set(["store-images", "menu-images", "delivery-proofs"]);
const ALLOWED_STORE_IMAGE_SCOPES = new Set(["restaurantes/background", "restaurantes/icon"]);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeFileName(name: unknown) {
  return String(name || "image").replace(/[^a-zA-Z0-9._-]/g, "-");
}

function toInt(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

async function isAuthorizedForLoja(
  supabase: ReturnType<typeof createClient>,
  callerUserId: number,
  lojaId: number,
) {
  const [ownerRes, staffRes, adminRes] = await Promise.all([
    supabase.from("lojas").select("idloja").eq("idloja", lojaId).eq("idutilizador", callerUserId).maybeSingle(),
    supabase.from("restaurant_staff_access").select("loja_id").eq("loja_id", lojaId).eq("user_id", String(callerUserId)).maybeSingle(),
    supabase.rpc("is_caller_admin", { caller_user_id: callerUserId }),
  ]);

  if (ownerRes.error) throw ownerRes.error;
  if (staffRes.error) throw staffRes.error;
  if (adminRes.error) throw adminRes.error;

  return Boolean(ownerRes.data || staffRes.data || adminRes.data);
}

async function isAuthorizedForActiveAssignment(
  supabase: ReturnType<typeof createClient>,
  callerUserId: number,
  assignmentId: number,
) {
  const { data: estafeta, error: estafetaError } = await supabase
    .from("estafetas")
    .select("id")
    .eq("idutilizador", callerUserId)
    .eq("eliminado", false)
    .maybeSingle();

  if (estafetaError) throw estafetaError;
  if (!estafeta) return false;

  const { data: assignment, error: assignmentError } = await supabase
    .from("atribuicoes_entrega")
    .select("id")
    .eq("id", assignmentId)
    .eq("estafeta_id", estafeta.id)
    .eq("ativo", true)
    .maybeSingle();

  if (assignmentError) throw assignmentError;
  return Boolean(assignment);
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

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const payload = await req.json();
    const bucket = String(payload?.bucket || "").trim();
    const scope = String(payload?.scope || "").trim();
    const filename = payload?.filename;
    const contentType = String(payload?.content_type || "").trim();
    const callerUserId = toInt(payload?.caller_user_id);
    const lojaId = toInt(payload?.loja_id);
    const assignmentId = toInt(payload?.assignment_id);

    if (!ALLOWED_BUCKETS.has(bucket)) {
      return json({ error: "Bucket invalido." }, 400);
    }

    if (!contentType.startsWith("image/")) {
      return json({ error: "Só são permitidas imagens." }, 400);
    }

    let path: string;

    if (bucket === "delivery-proofs") {
      if (!callerUserId) {
        return json({ error: "Sessão inválida: inicia sessão novamente." }, 401);
      }
      if (!assignmentId) {
        return json({ error: "assignment_id em falta." }, 400);
      }

      const authorized = await isAuthorizedForActiveAssignment(supabase, callerUserId, assignmentId);
      if (!authorized) {
        return json({ error: "Sem permissão para esta entrega." }, 403);
      }

      path = `${assignmentId}/${Date.now()}-${sanitizeFileName(filename)}`;
    } else if (bucket === "menu-images") {
      if (!lojaId) {
        return json({ error: "loja_id em falta." }, 400);
      }
      if (!callerUserId) {
        return json({ error: "Sessão inválida: inicia sessão novamente." }, 401);
      }

      const authorized = await isAuthorizedForLoja(supabase, callerUserId, lojaId);
      if (!authorized) {
        return json({ error: "Sem permissão para editar imagens desta loja." }, 403);
      }

      path = `${lojaId}/${Date.now()}-${sanitizeFileName(filename)}`;
    } else {
      // store-images
      if (lojaId) {
        // Edição de perfil de uma loja existente -- exige dono/staff/admin.
        if (!callerUserId) {
          return json({ error: "Sessão inválida: inicia sessão novamente." }, 401);
        }

        const authorized = await isAuthorizedForLoja(supabase, callerUserId, lojaId);
        if (!authorized) {
          return json({ error: "Sem permissão para editar imagens desta loja." }, 403);
        }
      }
      // Sem loja_id: candidatura pública de parceiro (visitante sem conta ainda) --
      // permitido, mas restrito a scopes fixos conhecidos para não permitir path
      // arbitrário.
      if (!ALLOWED_STORE_IMAGE_SCOPES.has(scope)) {
        return json({ error: "Scope de imagem inválido." }, 400);
      }

      path = `${scope}/${Date.now()}-${sanitizeFileName(filename)}`;
    }

    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);

    if (error) {
      return json({ error: error.message || "Falha ao preparar upload." }, 500);
    }

    return json({
      ok: true,
      path: data.path,
      token: data.token,
      signedUrl: data.signedUrl,
    });
  } catch (error: any) {
    return json({ error: error?.message || "Unexpected server error" }, 500);
  }
});

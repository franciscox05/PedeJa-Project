import { supabase, buildSupabaseFunctionHeaders, getSupabaseFunctionUrl } from "./supabaseClient";

/**
 * Envia o email de recuperação usando o sistema nativo de Auth do Supabase
 * (auth.users). O link de recuperação aponta para /nova-password.
 */
export async function requestPasswordReset(email) {
  const redirectTo = `${window.location.origin}/nova-password`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

/**
 * Define a nova password na sessão de recuperação do Supabase Auth
 * (criada automaticamente quando o utilizador clica no link do email).
 */
export async function updateAuthPassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/**
 * O login da app usa a RPC customizada `login_utilizador` (tabela
 * `utilizadores` / `private.utilizador_credenciais`), não o Supabase Auth
 * diretamente. Para que uma password redefinida via /recuperar-password
 * também funcione no login normal, é preciso escrevê-la nas duas tabelas
 * (dual-write): esta função trata do lado da tabela custom, através da RPC
 * `sync_custom_password_from_auth`, que identifica a conta pelo email do
 * token de sessão do Supabase Auth (nunca por um parâmetro manipulável).
 */
export async function syncPasswordWithCustomAuthTable(newPassword) {
  const { error } = await supabase.rpc("sync_custom_password_from_auth", { nova_senha: newPassword });
  if (error) throw error;
}

/**
 * Garante que existe um utilizador correspondente em auth.users para que
 * /recuperar-password consiga enviar o email de reset. Chamada depois de um
 * registo bem-sucedido via `registar_utilizador`; falhas aqui não devem
 * bloquear o registo (a conta continua a funcionar via login_utilizador).
 */
export async function syncAuthUserForEmail(email) {
  const headers = await buildSupabaseFunctionHeaders();
  const response = await fetch(getSupabaseFunctionUrl("sync-auth-user"), {
    method: "POST",
    headers,
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const rawText = await response.text();
    throw new Error(rawText || `Falha ao sincronizar conta (${response.status}).`);
  }
}

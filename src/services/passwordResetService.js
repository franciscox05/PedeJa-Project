import { supabase } from "./supabaseClient";

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
 * TODO (decisão do dono do projeto): o login da app NÃO usa o Supabase Auth
 * (auth.users) — usa a RPC customizada `login_utilizador`, que verifica a
 * password guardada na tabela `utilizadores`. `updateAuthPassword` acima só
 * atualiza a password do lado do Supabase Auth, por isso a password nova
 * ainda não fica válida para entrar via `login_utilizador`.
 *
 * Duas abordagens possíveis para fechar este gap (ambas exigem trabalho no
 * backend/Supabase que não é visível a partir do frontend):
 *   1. Dual-write: criar/atualizar também um registo em auth.users no
 *      registo e no reset, e passar `login_utilizador` a validar contra
 *      auth.users em vez da coluna de password em `utilizadores`.
 *   2. Migração completa: mover a autenticação toda para o Supabase Auth
 *      (signUp/signInWithPassword) e usar `utilizadores` só como perfil.
 *
 * Escolhe a abordagem e implementa aqui a sincronização (ex: RPC que recebe
 * o novo hash/plaintext via Edge Function autenticada e atualiza
 * `utilizadores.password`).
 */
export async function syncPasswordWithCustomAuthTable(_newPassword) {
  console.warn(
    "[passwordResetService] syncPasswordWithCustomAuthTable não está implementado — " +
    "a password só foi atualizada no Supabase Auth, não na tabela utilizadores.",
  );
}

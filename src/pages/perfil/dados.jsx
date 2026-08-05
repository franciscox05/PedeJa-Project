import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import toast from "react-hot-toast";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import { supabase } from "../../services/supabaseClient.js";
import { useAuth } from "../../context/AuthContext";
import { extractUserId } from "../../utils/roles";
import { useAlert } from "../../context/AlertContext";

function normalizeRpcPayload(payload) {
  if (Array.isArray(payload)) return payload[0] || null;
  return payload || null;
}

const inputClass =
  "w-full rounded-xl border border-gray-200 p-2.5 text-sm outline-none transition-colors focus:border-[#e62429] disabled:bg-gray-100 disabled:text-gray-500 disabled:border-gray-100";

export default function ProfileDados() {
  const { user } = useOutletContext();
  const { updateUser } = useAuth();
  const { showError } = useAlert();
  const userId = extractUserId(user);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: user?.username || "",
    email: user?.email || "",
    telemovel: user?.telemovel || "",
  });
  const [verifyStep, setVerifyStep] = useState("idle"); // idle | sending | sent | confirming
  const [verifyCode, setVerifyCode] = useState("");

  useEffect(() => {
    setFormData({
      username: user?.username || "",
      email: user?.email || "",
      telemovel: user?.telemovel || "",
    });
  }, [user?.username, user?.email, user?.telemovel]);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.rpc("atualizar_utilizador", {
        caller_user_id: userId,
        id_user: userId,
        novo_nome: formData.username,
        novo_email: formData.email,
        novo_telemovel: formData.telemovel,
        nova_senha: null,
      });

      if (error) throw error;

      updateUser(normalizeRpcPayload(data) || formData);
      toast.success("Dados atualizados com sucesso!");
      setEditing(false);
    } catch (error) {
      console.error("Erro ao atualizar dados:", error);
      showError(`Erro ao atualizar perfil: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSendVerificationCode = async () => {
    setVerifyStep("sending");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: user?.email,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      setVerifyStep("sent");
      toast.success("Enviámos um código de confirmação para o teu email.");
    } catch (error) {
      console.error("Erro ao enviar código de verificação:", error);
      showError(error?.message || "Não foi possível enviar o código de verificação.");
      setVerifyStep("idle");
    }
  };

  const handleConfirmVerificationCode = async (e) => {
    e.preventDefault();
    if (!verifyCode.trim()) return;

    setVerifyStep("confirming");
    try {
      const { error: otpError } = await supabase.auth.verifyOtp({
        email: user?.email,
        token: verifyCode.trim(),
        type: "email",
      });
      if (otpError) throw otpError;

      const { error: rpcError } = await supabase.rpc("marcar_email_verificado");
      if (rpcError) throw rpcError;

      updateUser({ ...user, email_verificado: true });
      toast.success("Email confirmado com sucesso!");
      setVerifyStep("idle");
      setVerifyCode("");
    } catch (error) {
      console.error("Erro ao confirmar código:", error);
      showError(error?.message || "Código inválido ou expirado.");
      setVerifyStep("sent");
    }
  };

  return (
    <form onSubmit={handleSave} className="grid gap-4">
      <div>
        <label htmlFor="username" className="mb-1.5 block text-sm font-semibold text-gray-700">Nome</label>
        <input
          type="text"
          id="username"
          value={formData.username}
          onChange={handleChange}
          disabled={!editing}
          className={inputClass}
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor="email" className="block text-sm font-semibold text-gray-700">Email</label>
          {user?.email_verificado ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Verificado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              Por verificar
            </span>
          )}
        </div>
        <input
          type="email"
          id="email"
          value={formData.email}
          onChange={handleChange}
          disabled={!editing}
          className={inputClass}
        />

        {!user?.email_verificado && !editing ? (
          verifyStep === "idle" ? (
            <button
              type="button"
              className="mt-2 text-sm font-bold text-[#e62429] hover:underline"
              onClick={handleSendVerificationCode}
            >
              Enviar código de confirmação
            </button>
          ) : verifyStep === "sending" ? (
            <p className="mt-2 text-sm text-gray-500">A enviar código...</p>
          ) : (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                placeholder="Código de 6 dígitos"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                className="w-40 rounded-xl border border-gray-200 p-2 text-sm outline-none focus:border-[#e62429]"
              />
              <button
                type="button"
                disabled={verifyStep === "confirming"}
                onClick={handleConfirmVerificationCode}
                className="rounded-xl bg-[#e62429] px-3 py-2 text-sm font-bold text-white hover:bg-[#c91b20] disabled:opacity-60"
              >
                {verifyStep === "confirming" ? "A confirmar..." : "Confirmar"}
              </button>
              <button
                type="button"
                className="text-sm font-semibold text-gray-500 hover:underline"
                onClick={handleSendVerificationCode}
              >
                Reenviar
              </button>
            </div>
          )
        ) : null}
      </div>

      <div>
        <label htmlFor="telemovel" className="mb-1.5 block text-sm font-semibold text-gray-700">Telemóvel</label>
        <input
          type="tel"
          id="telemovel"
          value={formData.telemovel}
          onChange={handleChange}
          disabled={!editing}
          className={inputClass}
        />
      </div>

      <div className="flex flex-wrap justify-end gap-2.5">
        {!editing ? (
          <button
            type="button"
            className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800"
            onClick={() => setEditing(true)}
          >
            Editar dados
          </button>
        ) : (
          <>
            <button
              type="button"
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-900 hover:bg-gray-50"
              onClick={() => {
                setEditing(false);
                setFormData({
                  username: user?.username || "",
                  email: user?.email || "",
                  telemovel: user?.telemovel || "",
                });
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#e62429] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#c91b20] disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "A guardar..." : "Guardar alterações"}
            </button>
          </>
        )}
      </div>
    </form>
  );
}

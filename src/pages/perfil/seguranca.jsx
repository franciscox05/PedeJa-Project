import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import toast from "react-hot-toast";
import { supabase } from "../../services/supabaseClient.js";
import { useAuth } from "../../context/AuthContext";
import { extractUserId } from "../../utils/roles";
import { useAlert } from "../../context/AlertContext";

function normalizeRpcPayload(payload) {
  if (Array.isArray(payload)) return payload[0] || null;
  return payload || null;
}

const inputClass =
  "w-full rounded-xl border border-gray-200 p-2.5 text-sm outline-none transition-colors focus:border-[#e62429]";

export default function ProfileSeguranca() {
  const { user } = useOutletContext();
  const { updateUser } = useAuth();
  const { showError } = useAlert();
  const userId = extractUserId(user);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ senhaAtual: "", novaSenha: "", confirmarSenha: "" });

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (!formData.senhaAtual) {
      showError("Introduz a tua password atual para confirmar a alteração.");
      return;
    }

    if (!formData.novaSenha || !formData.confirmarSenha) {
      showError("Preenche os dois campos de nova password.");
      return;
    }

    if (formData.novaSenha.length < 6) {
      showError("A nova password deve ter pelo menos 6 caracteres.");
      return;
    }

    if (formData.novaSenha !== formData.confirmarSenha) {
      showError("As novas passwords não coincidem!");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc("atualizar_utilizador", {
        caller_user_id: userId,
        id_user: userId,
        novo_nome: user?.username,
        novo_email: user?.email,
        novo_telemovel: user?.telemovel,
        nova_senha: formData.novaSenha,
        current_password: formData.senhaAtual,
      });

      if (error) throw error;

      updateUser(normalizeRpcPayload(data) || {});
      toast.success("Password atualizada com sucesso!");
      setFormData({ senhaAtual: "", novaSenha: "", confirmarSenha: "" });
    } catch (error) {
      console.error("Erro ao atualizar password:", error);
      showError(`Erro ao atualizar password: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="grid gap-4">
      <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800">
        Atualiza a password da conta. Os restantes dados do perfil mantêm-se inalterados.
      </p>

      <div>
        <label htmlFor="senhaAtual" className="mb-1.5 block text-sm font-semibold text-gray-700">Password atual</label>
        <input
          type="password"
          id="senhaAtual"
          placeholder="Introduz a password atual"
          value={formData.senhaAtual}
          onChange={handleChange}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="novaSenha" className="mb-1.5 block text-sm font-semibold text-gray-700">Nova password</label>
        <input
          type="password"
          id="novaSenha"
          placeholder="Introduz nova password"
          value={formData.novaSenha}
          onChange={handleChange}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="confirmarSenha" className="mb-1.5 block text-sm font-semibold text-gray-700">Confirmar password</label>
        <input
          type="password"
          id="confirmarSenha"
          placeholder="Repete a nova password"
          value={formData.confirmarSenha}
          onChange={handleChange}
          className={inputClass}
        />
      </div>

      <div className="flex flex-wrap justify-end gap-2.5">
        <button
          type="submit"
          className="rounded-xl bg-[#e62429] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#c91b20] disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "A atualizar..." : "Atualizar password"}
        </button>
      </div>
    </form>
  );
}

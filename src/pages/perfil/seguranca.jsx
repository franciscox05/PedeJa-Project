import { useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { AlertTriangle } from "lucide-react";
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
  const { updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const { showError } = useAlert();
  const userId = extractUserId(user);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ senhaAtual: "", novaSenha: "", confirmarSenha: "" });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  const handleDeleteAccount = async (e) => {
    e.preventDefault();

    if (!deletePassword) {
      showError("Introduz a tua password para confirmar a eliminação da conta.");
      return;
    }

    setDeleteLoading(true);
    try {
      const { error } = await supabase.rpc("eliminar_conta_utilizador", {
        caller_user_id: userId,
        id_user: userId,
        current_password: deletePassword,
      });

      if (error) throw error;

      toast.success("A tua conta foi eliminada.");
      logout();
      navigate("/");
    } catch (error) {
      console.error("Erro ao eliminar conta:", error);
      showError(`Erro ao eliminar conta: ${error.message}`);
      setDeleteLoading(false);
    }
  };

  return (
    <div className="grid gap-6">
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

      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-center gap-2 text-red-800">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <h3 className="text-sm font-bold">Eliminar conta</h3>
        </div>
        <p className="mt-1.5 text-sm text-red-700">
          A tua conta é desativada de imediato e deixas de conseguir iniciar sessão. O histórico de pedidos mantém-se
          guardado; contacta o suporte se quiseres reativar a conta mais tarde.
        </p>

        {!deleteOpen ? (
          <button
            type="button"
            className="mt-3 rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100"
            onClick={() => setDeleteOpen(true)}
          >
            Eliminar a minha conta
          </button>
        ) : (
          <form onSubmit={handleDeleteAccount} className="mt-3 grid gap-2.5">
            <label htmlFor="deletePassword" className="text-sm font-semibold text-red-800">
              Confirma a tua password para eliminar a conta
            </label>
            <input
              type="password"
              id="deletePassword"
              placeholder="Password atual"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className="w-full rounded-xl border border-red-300 bg-white p-2.5 text-sm outline-none transition-colors focus:border-red-600"
            />
            <div className="flex flex-wrap gap-2.5">
              <button
                type="submit"
                className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-60"
                disabled={deleteLoading}
              >
                {deleteLoading ? "A eliminar..." : "Confirmar eliminação"}
              </button>
              <button
                type="button"
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-900 hover:bg-gray-50"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeletePassword("");
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

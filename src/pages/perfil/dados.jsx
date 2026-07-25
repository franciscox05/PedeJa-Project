import { useEffect, useState } from "react";
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
        <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-gray-700">Email</label>
        <input
          type="email"
          id="email"
          value={formData.email}
          onChange={handleChange}
          disabled={!editing}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="telemovel" className="mb-1.5 block text-sm font-semibold text-gray-700">Telemovel</label>
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
              {loading ? "A guardar..." : "Guardar alteracoes"}
            </button>
          </>
        )}
      </div>
    </form>
  );
}

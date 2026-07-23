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
    <form onSubmit={handleSave} className="profile-form-grid">
      <div className="profile-field">
        <label htmlFor="username">Nome</label>
        <input
          type="text"
          id="username"
          value={formData.username}
          onChange={handleChange}
          disabled={!editing}
          className={!editing ? "input-disabled" : ""}
        />
      </div>

      <div className="profile-field">
        <label htmlFor="email">Email</label>
        <input
          type="email"
          id="email"
          value={formData.email}
          onChange={handleChange}
          disabled={!editing}
          className={!editing ? "input-disabled" : ""}
        />
      </div>

      <div className="profile-field">
        <label htmlFor="telemovel">Telemovel</label>
        <input
          type="tel"
          id="telemovel"
          value={formData.telemovel}
          onChange={handleChange}
          disabled={!editing}
          className={!editing ? "input-disabled" : ""}
        />
      </div>

      <div className="profile-actions-row">
        {!editing ? (
          <button type="button" className="profile-btn secondary" onClick={() => setEditing(true)}>
            Editar dados
          </button>
        ) : (
          <>
            <button
              type="button"
              className="profile-btn ghost"
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
            <button type="submit" className="profile-btn primary" disabled={loading}>
              {loading ? "A guardar..." : "Guardar alteracoes"}
            </button>
          </>
        )}
      </div>
    </form>
  );
}

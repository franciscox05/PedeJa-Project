import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../services/supabaseClient.js";
import { useAuth } from "../../context/AuthContext";
import { extractUserId } from "../../utils/roles";

function normalizeRpcPayload(payload) {
  if (Array.isArray(payload)) return payload[0] || null;
  return payload || null;
}

export default function ProfileSeguranca() {
  const { user } = useOutletContext();
  const { updateUser } = useAuth();
  const userId = extractUserId(user);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ novaSenha: "", confirmarSenha: "" });

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (!formData.novaSenha || !formData.confirmarSenha) {
      alert("Preenche os dois campos de password.");
      return;
    }

    if (formData.novaSenha !== formData.confirmarSenha) {
      alert("As novas passwords nao coincidem!");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc("atualizar_utilizador", {
        id_user: userId,
        novo_nome: user?.username,
        novo_email: user?.email,
        novo_telemovel: user?.telemovel,
        nova_senha: formData.novaSenha,
      });

      if (error) throw error;

      updateUser(normalizeRpcPayload(data) || {});
      alert("Password atualizada com sucesso!");
      setFormData({ novaSenha: "", confirmarSenha: "" });
    } catch (error) {
      console.error("Erro ao atualizar password:", error);
      alert(`Erro ao atualizar password: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="profile-form-grid profile-security-form">
      <p className="profile-note">
        Atualiza a password da conta. Os restantes dados do perfil mantem-se inalterados.
      </p>

      <div className="profile-field">
        <label htmlFor="novaSenha">Nova password</label>
        <input
          type="password"
          id="novaSenha"
          placeholder="Introduz nova password"
          value={formData.novaSenha}
          onChange={handleChange}
        />
      </div>

      <div className="profile-field">
        <label htmlFor="confirmarSenha">Confirmar password</label>
        <input
          type="password"
          id="confirmarSenha"
          placeholder="Repete a nova password"
          value={formData.confirmarSenha}
          onChange={handleChange}
        />
      </div>

      <div className="profile-actions-row">
        <button type="submit" className="profile-btn primary" disabled={loading}>
          {loading ? "A atualizar..." : "Atualizar password"}
        </button>
      </div>
    </form>
  );
}

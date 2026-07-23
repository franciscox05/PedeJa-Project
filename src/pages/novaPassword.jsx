import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import "../css/components/LoginInterfaces.css";
import { syncPasswordWithCustomAuthTable, updateAuthPassword } from "../services/passwordResetService";
import { useAlert } from "../context/AlertContext";

export default function NovaPasswordPage() {
  const navigate = useNavigate();
  const { showError } = useAlert();
  const [formData, setFormData] = useState({ senha: "", confirmacaoSenha: "" });
  const [loading, setLoading] = useState(false);
  const [error, setErrorState] = useState("");
  const setError = useCallback((message) => {
    setErrorState(message);
    if (message) showError(message);
  }, [showError]);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (formData.senha !== formData.confirmacaoSenha) {
      setError("As passwords não coincidem.");
      return;
    }

    setLoading(true);

    try {
      await updateAuthPassword(formData.senha);
      await syncPasswordWithCustomAuthTable(formData.senha);
      setSuccess(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      console.error("Erro ao definir nova password:", err);
      setError("Não foi possível definir a nova password. O link pode ter expirado — pede um novo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-shell">
      <Logo />
      <div className="auth-form">
        <h2>Definir nova password</h2>
        <hr />

        {error && <div className="auth-page-feedback error">{error}</div>}
        {success && (
          <div className="auth-page-feedback success">Password atualizada! A redirecionar para o login...</div>
        )}

        <form className="form" onSubmit={handleSubmit}>
          <label htmlFor="senha">Nova password:</label>
          <input
            id="senha"
            type="password"
            placeholder="Nova password"
            required
            value={formData.senha}
            onChange={handleChange}
          />

          <label htmlFor="confirmacaoSenha">Confirmar password:</label>
          <input
            id="confirmacaoSenha"
            type="password"
            placeholder="Confirmar password"
            required
            value={formData.confirmacaoSenha}
            onChange={handleChange}
          />

          <input type="submit" value={loading ? "A guardar..." : "Guardar"} disabled={loading || success} />
        </form>

        <p>
          <Link to="/login"><strong>Voltar ao login</strong></Link>
        </p>
      </div>
    </div>
  );
}

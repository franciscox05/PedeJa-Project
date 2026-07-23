import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import "../css/components/LoginInterfaces.css";
import { requestPasswordReset } from "../services/passwordResetService";
import { useAlert } from "../context/AlertContext";

export default function RecuperarPasswordPage() {
  const { showError } = useAlert();
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setErrorState] = useState("");
  const setError = useCallback((message) => {
    setErrorState(message);
    if (message) showError(message);
  }, [showError]);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await requestPasswordReset(identifier);
      setSent(true);
    } catch (err) {
      console.error("Erro ao pedir recuperação de password:", err);
      setError("Não foi possível enviar o email de recuperação. Verifica o endereço e tenta novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-shell">
      <Logo />
      <div className="auth-form">
        <h2>Recuperar password</h2>
        <hr />

        {error && <div className="auth-page-feedback error">{error}</div>}
        {sent ? (
          <div className="auth-page-feedback success">
            Se existir uma conta associada a esse email, vais receber um link para definires uma nova password.
          </div>
        ) : (
          <form className="form" onSubmit={handleSubmit}>
            <label htmlFor="identifier">Email:</label>
            <input
              id="identifier"
              type="email"
              placeholder="O teu email"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />

            <input type="submit" value={loading ? "A enviar..." : "Recuperar"} disabled={loading} />
          </form>
        )}

        <div className="NaoTemConta">
          <p>
            Já tem conta? <Link to="/login"><strong>Fazer Login</strong></Link>
          </p>
        </div>
      </div>
    </div>
  );
}

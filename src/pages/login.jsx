import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import "../css/components/LoginInterfaces.css";
import { useAuth } from "../context/AuthContext";
import { getDefaultPathByRole, resolveUserRole } from "../utils/roles";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [formData, setFormData] = useState({ identifier: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const redirectTarget = location.state?.from?.pathname;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const sessionUser = await login({
        identifier: formData.identifier,
        password: formData.password,
      });

      if (!sessionUser) {
        setError("Email ou Password incorretos.");
        return;
      }

      const role = resolveUserRole(sessionUser);
      navigate(redirectTarget || getDefaultPathByRole(role), { replace: true });
    } catch (err) {
      console.error("Erro de login:", err);
      setError(err?.message || "Ocorreu um erro ao tentar entrar. Tenta novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-shell">
      <Logo />
      <div className="auth-form">
        <h2>Entrar</h2>
        <hr />

        {error && <div className="auth-page-feedback error">{error}</div>}

        <form className="form" onSubmit={handleLogin}>
          <label htmlFor="identifier">Email ou Telemóvel:</label>
          <input
            id="identifier"
            type="text"
            placeholder="Email ou Telemóvel"
            required
            value={formData.identifier}
            onChange={handleChange}
          />

          <label htmlFor="password">Password:</label>
          <input
            id="password"
            type="password"
            placeholder="Password"
            required
            value={formData.password}
            onChange={handleChange}
          />

          <input type="submit" value={loading ? "A entrar..." : "Entrar"} disabled={loading} />
        </form>

        <div className="NaoTemConta">
          <p>
            Não tem conta? <Link to="/registo"><strong>Criar agora</strong></Link>
          </p>
        </div>
        <div>
          <p>
            Esqueceu-se da password?{" "}
            <Link to="/recuperar-password"><strong>Recuperar</strong></Link>
          </p>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { loginAndBuildSession } from "../services/authSessionService";
import "../css/components/LoginInterfaces.css";

function LoginAccount({ aoMudarVista, aoAutenticar }) {
  const [formData, setFormData] = useState({ identifier: "", password: "" });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const sessionUser = await loginAndBuildSession({
        identifier: formData.identifier,
        password: formData.password,
      });

      if (!sessionUser) {
        alert("Email ou Password incorretos.");
        return;
      }

      aoAutenticar(sessionUser);
    } catch (error) {
      console.error("Erro de login:", error);
      alert("Ocorreu um erro ao tentar entrar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form">
      <h2>Entrar</h2>
      <hr />
      <div>
        <form className="form" onSubmit={handleLogin}>
          <label htmlFor="identifier">Email ou Telemovel:</label>
          <input
            id="identifier"
            type="text"
            placeholder="Email ou Telemovel"
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

          <input
            type="submit"
            value={loading ? "A entrar..." : "Entrar"}
            disabled={loading}
          />
        </form>

        <div className="NaoTemConta">
          <p>
            Nao tem conta?{" "}
            <strong onClick={() => aoMudarVista("criar")}>Criar agora</strong>
          </p>
        </div>
        <div>
          <p>
            Esqueceu-se da password?{" "}
            <strong onClick={() => aoMudarVista("recuperar")}>Recuperar</strong>
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginAccount;
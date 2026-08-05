import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import "../css/components/LoginInterfaces.css";
import { supabase } from "../services/supabaseClient.js";
import { syncAuthUserForEmail } from "../services/passwordResetService";
import { useAlert } from "../context/AlertContext";

export default function RegistoPage() {
  const navigate = useNavigate();
  const { showError } = useAlert();
  const [loading, setLoading] = useState(false);
  const [error, setErrorState] = useState("");
  const setError = useCallback((message) => {
    setErrorState(message);
    if (message) showError(message);
  }, [showError]);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    telefone: "",
    senha: "",
    confirmacaoSenha: "",
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (formData.senha !== formData.confirmacaoSenha) {
      setError("As passwords não coincidem.");
      return;
    }

    setLoading(true);

    try {
      const dataFormatada = new Date().toLocaleString("pt-PT", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      const { error: rpcError } = await supabase.rpc("registar_utilizador", {
        nome_input: formData.username,
        email_input: formData.email,
        senha_input: formData.senha,
        tel_input: formData.telefone,
        data_input: dataFormatada,
      });

      if (rpcError) throw rpcError;

      try {
        await syncAuthUserForEmail(formData.email);
      } catch (syncError) {
        console.error("Não foi possível sincronizar a conta com o Supabase Auth:", syncError);
      }

      setSuccess(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      console.error("Erro ao registar:", err.message);
      if (err.message.includes("utilizadores_email_key")) {
        setError("Este email já está registado.");
      } else if (err.message.includes("utilizadores_username_key")) {
        setError("Este nome de utilizador já existe.");
      } else {
        setError(`Erro ao criar conta: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-shell">
      <Logo />
      <div className="auth-form">
        <h2>Criar Conta</h2>
        <hr />

        {error && <div className="auth-page-feedback error">{error}</div>}
        {success && (
          <div className="auth-page-feedback success">Conta criada com sucesso! A redirecionar para o login...</div>
        )}

        <form onSubmit={handleRegister} className="form">
          <label htmlFor="username">Nome:</label>
          <input type="text" id="username" placeholder="Nome" required value={formData.username} onChange={handleChange} />

          <label htmlFor="email">Email:</label>
          <input type="email" id="email" placeholder="Email" required value={formData.email} onChange={handleChange} />

          <label htmlFor="telefone">Telemóvel:</label>
          <input type="tel" id="telefone" placeholder="Telemóvel" value={formData.telefone} onChange={handleChange} />

          <label htmlFor="senha">Password:</label>
          <input type="password" id="senha" placeholder="Password" required value={formData.senha} onChange={handleChange} />

          <label htmlFor="confirmacaoSenha">Confirmar Password:</label>
          <input
            type="password"
            id="confirmacaoSenha"
            placeholder="Confirmar Password"
            required
            value={formData.confirmacaoSenha}
            onChange={handleChange}
          />

          <p className="muted" style={{ marginTop: "-4px" }}>
            Contas de restaurante são associadas pelo administrador após o registo.
          </p>

          <input type="submit" value={loading ? "A processar..." : "Criar Conta"} disabled={loading || success} />
        </form>

        <p>
          Já tem conta? <Link to="/login"><strong>Fazer Login</strong></Link>
        </p>
      </div>
    </div>
  );
}

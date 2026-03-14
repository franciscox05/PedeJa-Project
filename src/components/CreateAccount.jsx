import { useState } from "react";
import { supabase } from "../services/supabaseClient.js";
import "../css/components/LoginInterfaces.css";

function CreateAccount({ aoMudarVista }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    telefone: "",
    senha: "",
    confirmacaoSenha: "",
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.id]: e.target.value,
    });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (formData.senha !== formData.confirmacaoSenha) {
      alert("As passwords nao coincidem!");
      setLoading(false);
      return;
    }

    try {
      const dataFormatada = new Date().toLocaleString("pt-PT", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      const { error } = await supabase.rpc("registar_utilizador", {
        nome_input: formData.username,
        email_input: formData.email,
        senha_input: formData.senha,
        tel_input: formData.telefone,
        data_input: dataFormatada,
      });

      if (error) throw error;

      alert("Conta criada com sucesso! Se fores parceiro restaurante, o admin associa-te depois a uma loja.");
      aoMudarVista("login");
    } catch (error) {
      console.error("Erro ao registar:", error.message);
      if (error.message.includes("utilizadores_email_key")) {
        alert("Este Email ja esta registado.");
      } else if (error.message.includes("utilizadores_username_key")) {
        alert("Este Nome de Utilizador ja existe.");
      } else {
        alert(`Erro ao criar conta: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form">
      <h2>Criar Conta</h2>
      <hr />
      <form onSubmit={handleRegister} className="form">
        <label htmlFor="username">Nome:</label>
        <input type="text" id="username" placeholder="Nome" required value={formData.username} onChange={handleChange} />

        <label htmlFor="email">Email:</label>
        <input type="email" id="email" placeholder="Email" required value={formData.email} onChange={handleChange} />

        <label htmlFor="telefone">Telemovel:</label>
        <input type="phone" id="telefone" placeholder="Telemovel" value={formData.telefone} onChange={handleChange} />

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
          Contas de restaurante sao associadas pelo administrador apos o registo.
        </p>

        <input
          type="submit"
          value={loading ? "A processar..." : "Criar Conta"}
          disabled={loading}
        />
      </form>

      <p>
        Ja tem conta? <strong onClick={() => aoMudarVista("login")}>Fazer Login</strong>
      </p>
    </div>
  );
}

export default CreateAccount;
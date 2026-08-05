import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { User, Mail, Phone, Lock, UserPlus } from "lucide-react";
import Logo from "../components/Logo";
import { supabase } from "../services/supabaseClient.js";
import { syncAuthUserForEmail } from "../services/passwordResetService";
import { useAlert } from "../context/AlertContext";

const inputClass =
  "h-12 w-full rounded-xl border-2 border-gray-100 bg-gray-50 pl-10 pr-3 text-sm outline-none transition-colors focus:border-[#e62429] focus:bg-white";

function IconField(props) {
  const { icon: FieldIcon, ...inputProps } = props;
  return (
    <div className="relative">
      <FieldIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
      <input className={inputClass} {...inputProps} />
    </div>
  );
}

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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Logo />
      <div className="w-full max-w-[400px] rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-black text-gray-900">Criar Conta</h1>
          <p className="mt-1 text-sm text-gray-500">Regista-te para começar a pedir</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">{error}</div>
        )}
        {success && (
          <div className="mb-4 rounded-lg bg-green-50 px-3 py-2.5 text-sm font-medium text-green-700">
            Conta criada com sucesso! A redirecionar para o login...
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-3">
          <IconField icon={User} type="text" id="username" placeholder="Nome" required value={formData.username} onChange={handleChange} />
          <IconField icon={Mail} type="email" id="email" placeholder="Email" required value={formData.email} onChange={handleChange} />
          <IconField icon={Phone} type="tel" id="telefone" placeholder="Telemóvel" value={formData.telefone} onChange={handleChange} />
          <IconField icon={Lock} type="password" id="senha" placeholder="Password" required value={formData.senha} onChange={handleChange} />
          <IconField
            icon={Lock}
            type="password"
            id="confirmacaoSenha"
            placeholder="Confirmar Password"
            required
            value={formData.confirmacaoSenha}
            onChange={handleChange}
          />

          <p className="text-xs text-gray-500">
            Contas de restaurante são associadas pelo administrador após o registo.
          </p>

          <button
            type="submit"
            disabled={loading || success}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#e62429] text-sm font-bold text-white transition-colors hover:bg-[#c91b20] disabled:opacity-60"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {loading ? "A processar..." : "Criar Conta"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          Já tem conta? <Link to="/login" className="font-bold text-[#e62429] hover:underline">Fazer Login</Link>
        </p>
      </div>
    </div>
  );
}

import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock, Save } from "lucide-react";
import Logo from "../components/Logo";
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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Logo />
      <div className="w-full max-w-[400px] rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-black text-gray-900">Definir nova password</h1>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">{error}</div>
        )}
        {success && (
          <div className="mb-4 rounded-lg bg-green-50 px-3 py-2.5 text-sm font-medium text-green-700">
            Password atualizada! A redirecionar para o login...
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="senha" className="mb-1.5 block text-sm font-semibold text-gray-700">Nova password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input
                id="senha"
                type="password"
                placeholder="Nova password"
                required
                value={formData.senha}
                onChange={handleChange}
                className="h-12 w-full rounded-xl border-2 border-gray-100 bg-gray-50 pl-10 pr-3 text-sm outline-none transition-colors focus:border-[#e62429] focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label htmlFor="confirmacaoSenha" className="mb-1.5 block text-sm font-semibold text-gray-700">Confirmar password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input
                id="confirmacaoSenha"
                type="password"
                placeholder="Confirmar password"
                required
                value={formData.confirmacaoSenha}
                onChange={handleChange}
                className="h-12 w-full rounded-xl border-2 border-gray-100 bg-gray-50 pl-10 pr-3 text-sm outline-none transition-colors focus:border-[#e62429] focus:bg-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || success}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#e62429] text-sm font-bold text-white transition-colors hover:bg-[#c91b20] disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {loading ? "A guardar..." : "Guardar"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          <Link to="/login" className="font-bold text-[#e62429] hover:underline">Voltar ao login</Link>
        </p>
      </div>
    </div>
  );
}

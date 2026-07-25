import { useCallback, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Mail, Lock, LogIn } from "lucide-react";
import Logo from "../components/Logo";
import { useAuth } from "../context/AuthContext";
import { getDefaultPathByRole, resolveUserRole } from "../utils/roles";
import { useAlert } from "../context/AlertContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { showError } = useAlert();
  const [formData, setFormData] = useState({ identifier: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setErrorState] = useState("");
  const setError = useCallback((message) => {
    setErrorState(message);
    if (message) showError(message);
  }, [showError]);

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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Logo />
      <div className="w-full max-w-[400px] rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-black text-gray-900">Bem-vindo de volta!</h1>
          <p className="mt-1 text-sm text-gray-500">Entra para continuar a pedir</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleLogin}>
          <div>
            <label htmlFor="identifier" className="mb-1.5 block text-sm font-semibold text-gray-700">
              Email ou Telemóvel
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input
                id="identifier"
                type="text"
                placeholder="Email ou Telemóvel"
                required
                value={formData.identifier}
                onChange={handleChange}
                className="h-12 w-full rounded-xl border-2 border-gray-100 bg-gray-50 pl-10 pr-3 text-sm outline-none transition-colors focus:border-[#e62429] focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-gray-700">
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input
                id="password"
                type="password"
                placeholder="Password"
                required
                value={formData.password}
                onChange={handleChange}
                className="h-12 w-full rounded-xl border-2 border-gray-100 bg-gray-50 pl-10 pr-3 text-sm outline-none transition-colors focus:border-[#e62429] focus:bg-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#e62429] text-sm font-bold text-white transition-colors hover:bg-[#c91b20] disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            {loading ? "A entrar..." : "Entrar"}
          </button>
        </form>

        <div className="mt-5 text-center text-sm text-gray-500">
          <p>
            Não tem conta? <Link to="/registo" className="font-bold text-[#e62429] hover:underline">Criar agora</Link>
          </p>
          <p className="mt-1.5">
            Esqueceu-se da password?{" "}
            <Link to="/recuperar-password" className="font-bold text-[#e62429] hover:underline">Recuperar</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

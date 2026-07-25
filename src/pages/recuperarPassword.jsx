import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Send } from "lucide-react";
import Logo from "../components/Logo";
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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Logo />
      <div className="w-full max-w-[400px] rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-black text-gray-900">Recuperar password</h1>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">{error}</div>
        )}

        {sent ? (
          <div className="rounded-lg bg-green-50 px-3 py-2.5 text-sm font-medium text-green-700">
            Se existir uma conta associada a esse email, vais receber um link para definires uma nova password.
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="identifier" className="mb-1.5 block text-sm font-semibold text-gray-700">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input
                  id="identifier"
                  type="email"
                  placeholder="O teu email"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="h-12 w-full rounded-xl border-2 border-gray-100 bg-gray-50 pl-10 pr-3 text-sm outline-none transition-colors focus:border-[#e62429] focus:bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#e62429] text-sm font-bold text-white transition-colors hover:bg-[#c91b20] disabled:opacity-60"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              {loading ? "A enviar..." : "Recuperar"}
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-sm text-gray-500">
          Já tem conta? <Link to="/login" className="font-bold text-[#e62429] hover:underline">Fazer Login</Link>
        </p>
      </div>
    </div>
  );
}

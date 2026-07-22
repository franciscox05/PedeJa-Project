import { useNavigate } from "react-router-dom";
import { extractUserId, getDefaultPathByRole, resolveUserRole } from "../utils/roles";

function readSessionUser() {
  try {
    const raw = localStorage.getItem("pedeja_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function NaoEncontrado() {
  const navigate = useNavigate();
  const user = readSessionUser();
  const role = resolveUserRole(user);
  const homePath = extractUserId(user) ? getDefaultPathByRole(role) : "/";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: 14, letterSpacing: 1, textTransform: "uppercase", color: "#94a3b8", margin: 0 }}>
        Erro 404
      </p>
      <h1 style={{ margin: 0, fontSize: "clamp(1.5rem, 4vw, 2.2rem)" }}>Esta página não existe.</h1>
      <p style={{ margin: 0, color: "#64748b", maxWidth: 420 }}>
        O link que seguiste pode estar desatualizado ou mal escrito.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={() => navigate(homePath, { replace: true })}
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            border: "none",
            background: "#e62429",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Ir para o início
        </button>
      </div>
    </main>
  );
}

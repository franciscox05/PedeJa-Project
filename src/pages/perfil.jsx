import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import Logo from "../components/Logo";
import Login from "../components/LoginButton";
import CartWidget from "../components/CartWidget";
import Voltar from "../components/Voltar";
import MenuGlobal from "../components/MenuGlobal";
import MeuPerfil from "../components/MeuPerfil";
import "../css/pages/perfil.css";

function readSessionUser() {
  try {
    const raw = localStorage.getItem("pedeja_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function PerfilPage() {
  const [user, setUser] = useState(readSessionUser());
  const isLogged = useMemo(() => Boolean(user), [user]);

  if (!isLogged) {
    return <Navigate to="/" replace />;
  }

  const handleUserUpdate = (updatedUserPayload) => {
    const nextUser = {
      ...user,
      ...(updatedUserPayload || {}),
    };

    localStorage.setItem("pedeja_user", JSON.stringify(nextUser));
    window.dispatchEvent(new Event("pedeja-user-updated"));
    setUser(nextUser);
  };

  return (
    <main className="perfil-main">
      <Logo />

      <div className="header-right-actions">
        <Login />
        <CartWidget />
      </div>

      <div id="wave-top"></div>

      <div className="container perfil-container">
        <section className="perfil-card-shell">
          <MeuPerfil user={user} aoAtualizarUser={handleUserUpdate} />
        </section>
      </div>

      <Voltar />
      <MenuGlobal />
    </main>
  );
}

import { useState, useEffect, useRef } from "react";
import userGif from "../assets/img/perfil.gif";
import logoutImg from "../assets/img/logout.png";
import profileImg from "../assets/img/user.png";
import "../css/components/LoginInterfaces.css";

function UserProfileMenu({ user, canOpenPortal = false, onLogout, onOpenProfile, onOpenPortal }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  const toggleMenu = () => setIsOpen(!isOpen);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getNomeFormatado = (nomeCompleto) => {
    if (!nomeCompleto) return "Utilizador";
    const partes = nomeCompleto.trim().split(" ");
    if (partes.length === 1) return partes[0];
    return `${partes[0]} ${partes[partes.length - 1]}`;
  };

  return (
    <div className="user-profile-container" ref={menuRef}>
      <div className="user-profile" onClick={toggleMenu} style={{ cursor: "pointer" }}>
        <div className="user-profile-inner">
          <img src={userGif} className="user-icon-img" alt="Perfil" />
          <p style={{ fontWeight: "bold" }}>{getNomeFormatado(user.username)}</p>
        </div>
      </div>

      <div className={`user-dropdown-menu ${isOpen ? "active" : ""}`}>
        <div className="dropdown-item-info">Ola, {getNomeFormatado(user.username)}!</div>

        {canOpenPortal && (
          <div
            className="dropdown-item-logout"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
              onOpenPortal();
            }}
            style={{ borderBottom: "1px solid #f0f0f0", marginBottom: "5px" }}
          >
            <span className="material-icons" style={{ fontSize: "18px" }}>dashboard</span>
            <span className="profile-static">Painel</span>
          </div>
        )}

        <div
          className="dropdown-item-logout"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
            onOpenProfile();
          }}
          style={{ borderBottom: "1px solid #f0f0f0", marginBottom: "5px" }}
        >
          <img src={profileImg} className="profile-icon" alt="Editar" />
          <span className="profile-static">Meu Perfil</span>
        </div>

        <div
          className="dropdown-item-logout"
          onClick={(e) => {
            e.stopPropagation();
            onLogout();
          }}
        >
          <img src={logoutImg} className="logout-icon" alt="Sair" />
          <span className="logout-text">Sair</span>
        </div>
      </div>
    </div>
  );
}

export default UserProfileMenu;

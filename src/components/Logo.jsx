import { useNavigate } from "react-router-dom";
import logoImg from "../assets/iconSite/logo-b.png";
import "../css/index.css";

function Logo() {
  const navigate = useNavigate();

  return (
    <img
      id="logoini"
      src={logoImg}
      alt="Logo"
      
      // 1. Clique Esquerdo: Navega para o início
      onClick={() => navigate("/")}
      
      // 2. Clique da Roda (Botão do Meio): Bloqueia
      onMouseDown={(e) => {
        if (e.button === 1) { // 1 = Roda do rato
          e.preventDefault();
          return false;
        }
      }}
      
      // Garante que o cursor fica com a mãozinha (caso não esteja no CSS)
      style={{ cursor: "pointer" }}
    />
  );
}

export default Logo;
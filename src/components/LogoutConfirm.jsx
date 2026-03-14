import "../css/components/LoginInterfaces.css";
import sadImg from "../assets/img/sad.png"; 
// 1. IMPORTAR O LOGÓTIPO
import logoPedeJa from "../assets/iconSite/logo-b.png"; 

function LogoutConfirm({ aoConfirmar, aoCancelar }) {
  return (
    <div className="auth-overlay logout-overlay">
      <div className="auth-modal logout-modal">
        
        <div className="logout-header">
          <img src={sadImg} className="logout-icon-img" alt="Triste" />
          
          {/* 2. INSERIR A IMAGEM NO MEIO DO TEXTO */}
          <h3>
            Vais sair? Mas o teu estômago ainda 
            <img src={logoPedeJa} className="logo-text-inline" alt="PedeJá" /> 
            mais!
          </h3>
        </div>

        <p className="logout-subtext">
          Se saíres agora, vais ter de iniciar sessão outra vez para matar a fome.
        </p>

        <div className="logout-actions">
          <button
            onClick={aoCancelar}
            className="btn-logout btn-cancel"
          >
            Fica e PedeJá
          </button>

          <button
            onClick={aoConfirmar}
            className="btn-logout btn-confirm"
          >
            Passar Fome
          </button>
        </div>
      </div>
    </div>
  );
}

export default LogoutConfirm;
import "../css/index.css";
import { useNavigate } from "react-router-dom";
import iconBack from "../assets/img/arrow_back.png"; 

function Voltar() {
  const navigate = useNavigate();

  return (
    <div className="btn-voltar-fixo" onClick={() => navigate(-1)}>
      {/* Adicionei a classe icon-red para a seta ficar vermelha */}
      <img src={iconBack} className="voltar-icon-img icon-red" alt="Voltar" />
    </div>
  );
}

export default Voltar;
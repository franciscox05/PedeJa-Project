import "../css/index.css";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

function Voltar() {
  const navigate = useNavigate();

  return (
    <div className="btn-voltar-fixo" onClick={() => navigate(-1)}>
      <ArrowLeft className="voltar-icon-img" aria-hidden="true" />
    </div>
  );
}

export default Voltar;

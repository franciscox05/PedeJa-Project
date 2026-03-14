import { useNavigate } from "react-router-dom";
import "../css/index.css";
import iconChevron from "../assets/img/chevron_right.png"; 

function TipoLojaCard({ cat, city }) {
  const navigate = useNavigate();

  return (
    <li>
      <div
        className="categoria-btn"
        onClick={() => navigate(`/lojas/${city}/${cat.slug}`)}
      >
        <img
          className="cat-img"
          src={`/src/assets/img/categorias/${cat.img}`}
          alt={cat.nome}
        />

        <span className="cat-nome">{cat.nome}</span>
        <img 
            src={iconChevron} 
            className="cat-chevron-img" 
            alt="Ir" 
        />
      </div>
    </li>
  );
}

export default TipoLojaCard;
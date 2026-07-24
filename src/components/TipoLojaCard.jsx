import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import "../css/index.css";

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
        <ChevronRight className="cat-chevron-img" aria-hidden="true" />
      </div>
    </li>
  );
}

export default TipoLojaCard;
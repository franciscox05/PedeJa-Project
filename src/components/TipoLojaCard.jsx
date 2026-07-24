import { useNavigate } from "react-router-dom";

function TipoLojaCard({ cat, city }) {
  const navigate = useNavigate();

  return (
    <li className="list-none">
      <button
        type="button"
        onClick={() => navigate(`/lojas/${city}/${cat.slug}`)}
        className="group flex w-full flex-col items-center gap-2 rounded-3xl bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 transition-colors group-hover:bg-[#e62429]/10">
          <img
            className="h-8 w-8 object-contain"
            src={`/src/assets/img/categorias/${cat.img}`}
            alt={cat.nome}
          />
        </div>
        <span className="text-center text-xs font-bold leading-tight text-gray-700">{cat.nome}</span>
      </button>
    </li>
  );
}

export default TipoLojaCard;

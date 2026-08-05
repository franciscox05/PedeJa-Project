import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Info, Ban, Heart, X, Bike } from "lucide-react";

import { getImageUrl } from "../services/partnerService";

const DAY_LABELS = {
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sab",
  0: "Dom",
};

function summarizeSchedule(schedule) {
  const weekly = Array.isArray(schedule?.weekly) ? schedule.weekly : [];
  if (weekly.length === 0) return "Horário não definido.";

  return weekly
    .map((block) => {
      const days = Array.isArray(block.days) ? block.days : [];
      const label = days.map((day) => DAY_LABELS[day]).filter(Boolean).join(", ") || "Dias";
      return `${label}: ${block.open || "--:--"} - ${block.close || "--:--"}`;
    })
    .join(" | ");
}

function RestauranteCard({
  restaurante,
  showFavoriteButton = false,
  isFavorite = false,
  favoriteBusy = false,
  onToggleFavorite = null,
}) {
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);

  const handleOpenStore = () => {
    if (!restaurante.isIndisponivel) {
      navigate(`/menus/${restaurante.id}`);
    }
  };

  const handleInfoClick = (event) => {
    event.stopPropagation();
    setShowDetails(true);
  };

  const handleCloseDetails = () => {
    setShowDetails(false);
  };

  const handleFavoriteClick = (event) => {
    event.stopPropagation();
    if (typeof onToggleFavorite === "function") {
      onToggleFavorite(restaurante);
    }
  };

  const currentStatusColor = restaurante.isIndisponivel
    ? "#9e9e9e"
    : restaurante.statusCor;

  const currentStatusText = restaurante.isIndisponivel
    ? "Indisponível"
    : restaurante.status;

  const backgroundImage = getImageUrl(restaurante.imagemfundo);
  const iconImage = getImageUrl(restaurante.icon);

  const subCategoryNames = useMemo(
    () => (restaurante.subCategorias || []).map((cat) => cat.categoria).filter(Boolean),
    [restaurante.subCategorias],
  );

  const scheduleSummary = useMemo(
    () => summarizeSchedule(restaurante.horario_funcionamento),
    [restaurante.horario_funcionamento],
  );

  return (
    <>
      <div className="col-12 col-md-6 col-lg-4 restaurante-col">
        <div
          className="group"
          onClick={handleOpenStore}
          style={{
            cursor: restaurante.isIndisponivel ? "default" : "pointer",
          }}
        >
          <div className="relative h-[150px] w-full overflow-hidden rounded-xl bg-gray-100 shadow-sm">
            {backgroundImage ? (
              <img
                src={backgroundImage}
                alt={restaurante.nome}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                style={{ filter: restaurante.isIndisponivel ? "grayscale(100%)" : "none" }}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : null}

            {restaurante.isIndisponivel ? (
              <div className="absolute inset-0 rounded-xl bg-black/45" />
            ) : null}

            {showFavoriteButton ? (
              <button
                type="button"
                className={`absolute left-2 top-2 flex h-9 w-9 items-center justify-center rounded-full shadow-md transition-colors ${
                  isFavorite ? "bg-[#e62429] text-white" : "bg-black/60 text-white hover:bg-black/80"
                }`}
                onClick={handleFavoriteClick}
                disabled={favoriteBusy}
                title={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              >
                <Heart className="h-[18px] w-[18px]" fill={isFavorite ? "currentColor" : "none"} aria-hidden="true" />
              </button>
            ) : null}

            <span
              className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow-sm"
              style={{ backgroundColor: currentStatusColor }}
            >
              {currentStatusText}
            </span>

            {iconImage ? (
              <div className="absolute -bottom-3 left-3 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-white shadow-md">
                <img
                  src={iconImage}
                  alt="Logo"
                  className="h-full w-full object-cover"
                  style={{ filter: restaurante.isIndisponivel ? "grayscale(100%)" : "none" }}
                  onError={(e) => {
                    e.currentTarget.parentElement.style.display = "none";
                  }}
                />
              </div>
            ) : null}
          </div>

          <div className={`mt-3 space-y-1 px-1 ${restaurante.isIndisponivel ? "opacity-60" : ""}`}>
            <h3 className="truncate text-sm font-bold text-gray-900">{restaurante.nome}</h3>

            <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
              {restaurante.taxaentrega > 0 ? (
                <>
                  <span className="flex items-center gap-1">
                    <Bike className="h-3 w-3" aria-hidden="true" />
                    {Number(restaurante.taxaentrega).toFixed(2)}€
                  </span>
                  <span className="text-gray-300">·</span>
                </>
              ) : null}
              {restaurante.isIndisponivel ? (
                <span className="flex items-center gap-1 text-gray-400">
                  <Ban className="h-3 w-3" aria-hidden="true" />
                  Indisponível
                </span>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-1 hover:text-[#e62429]"
                  onClick={handleInfoClick}
                  title="Mais informações"
                >
                  <Info className="h-3 w-3" aria-hidden="true" />
                  Info
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showDetails && (
        <div className="store-details-backdrop" onClick={handleCloseDetails}>
          <div className="store-details-sheet" onClick={(e) => e.stopPropagation()}>
            <button className="store-details-close" onClick={handleCloseDetails} aria-label="Fechar">
              <X aria-hidden="true" />
            </button>

            <div className="store-details-header">
              <h3>{restaurante.nome}</h3>
              <span style={{ color: currentStatusColor, fontWeight: 700 }}>{currentStatusText}</span>
            </div>

            <div className="store-details-blocks">
              <div className="store-details-block">
                <span>Morada</span>
                <p>{restaurante.morada || "Morada não definida"}</p>
              </div>

              <div className="store-details-block">
                <span>Contacto</span>
                <p>{restaurante.contacto || "Sem contacto"}</p>
              </div>

              <div className="store-details-block">
                <span>Horário</span>
                <p>{scheduleSummary}</p>
              </div>

              {restaurante.statusDetalhe ? (
                <div className="store-details-block">
                  <span>Horário especial</span>
                  <p>{restaurante.statusDetalhe}</p>
                </div>
              ) : null}

              <div className="store-details-block">
                <span>Categorias</span>
                <p>{subCategoryNames.length > 0 ? subCategoryNames.join(", ") : "Sem categorias"}</p>
              </div>
            </div>

            <div className="store-details-actions">
              <button className="btn-details secondary" onClick={handleCloseDetails}>Fechar</button>
              <button className="btn-details primary" onClick={handleOpenStore} disabled={restaurante.isIndisponivel}>
                {restaurante.isIndisponivel ? "Indisponível" : "Abrir restaurante"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default RestauranteCard;

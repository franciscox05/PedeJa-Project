import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import iconInfo from "../assets/img/info.png";
import iconAberto from "../assets/img/dot_green.png";
import iconFechado from "../assets/img/dot_red.png";
import iconBloqueado from "../assets/img/block.png";

const DAY_LABELS = {
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sab",
  0: "Dom",
};

function resolveStoreImage(value, folder) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")) {
    return raw;
  }

  if (raw.startsWith("/")) {
    return raw;
  }

  return `/src/assets/img/restaurantes/${folder}/${raw}`;
}

function summarizeSchedule(schedule) {
  const weekly = Array.isArray(schedule?.weekly) ? schedule.weekly : [];
  if (weekly.length === 0) return "Horario nao definido.";

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
    ? "Indisponivel"
    : restaurante.status;

  const statusImage = restaurante.isIndisponivel
    ? iconBloqueado
    : restaurante.status === "Fechado"
      ? iconFechado
      : iconAberto;

  const backgroundImage = resolveStoreImage(restaurante.imagemfundo, "fundo");
  const iconImage = resolveStoreImage(restaurante.icon, "icon");

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
          className="restaurante-card"
          onClick={handleOpenStore}
          style={{
            cursor: restaurante.isIndisponivel ? "default" : "pointer",
            opacity: restaurante.isIndisponivel ? 0.8 : 1,
          }}
        >
          <div className="card-image-container">
            {showFavoriteButton ? (
              <button
                type="button"
                className={`card-favorite-btn${isFavorite ? " is-active" : ""}`}
                onClick={handleFavoriteClick}
                disabled={favoriteBusy}
                title={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              >
                {isFavorite ? "♥" : "♡"}
              </button>
            ) : null}

            {backgroundImage ? (
              <img
                src={backgroundImage}
                alt={restaurante.nome}
                className="card-bg-img"
                style={{ filter: restaurante.isIndisponivel ? "grayscale(100%)" : "none" }}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : null}

            <div className="card-overlay"></div>

            <h3 className="card-center-title">{restaurante.nome}</h3>

            <div className="card-logo-badge">
              {iconImage ? (
                <img
                  src={iconImage}
                  alt="Logo"
                  style={{ filter: restaurante.isIndisponivel ? "grayscale(100%)" : "none" }}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : null}
            </div>
          </div>

          <div className="card-footer-info">
            <button className="footer-info-btn" onClick={handleInfoClick} title="Mais informacoes">
              <img src={iconInfo} className="info-icon-img" alt="Info" />
              <span className="footer-text">Info</span>
            </button>

            <div className="footer-right">
              <img src={statusImage} className="status-icon-img" alt={currentStatusText} />
              <span className="status-text-dynamic" style={{ color: currentStatusColor }}>
                {currentStatusText}
              </span>
            </div>
          </div>
        </div>
      </div>

      {showDetails && (
        <div className="store-details-backdrop" onClick={handleCloseDetails}>
          <div className="store-details-sheet" onClick={(e) => e.stopPropagation()}>
            <button className="store-details-close" onClick={handleCloseDetails}>x</button>

            <div className="store-details-header">
              <h3>{restaurante.nome}</h3>
              <span style={{ color: currentStatusColor, fontWeight: 800 }}>{currentStatusText}</span>
            </div>

            <div className="store-details-block">
              <span>Morada</span>
              <p>{restaurante.morada || "Morada nao definida"}</p>
            </div>

            <div className="store-details-block">
              <span>Contacto</span>
              <p>{restaurante.contacto || "Sem contacto"}</p>
            </div>

            <div className="store-details-block">
              <span>Horario</span>
              <p>{scheduleSummary}</p>
            </div>

            {restaurante.statusDetalhe ? (
              <div className="store-details-block">
                <span>Horario especial</span>
                <p>{restaurante.statusDetalhe}</p>
              </div>
            ) : null}

            <div className="store-details-block">
              <span>Categorias</span>
              <p>{subCategoryNames.length > 0 ? subCategoryNames.join(", ") : "Sem categorias"}</p>
            </div>

            <div className="store-details-actions">
              <button className="btn-details secondary" onClick={handleCloseDetails}>Fechar</button>
              <button className="btn-details primary" onClick={handleOpenStore} disabled={restaurante.isIndisponivel}>
                {restaurante.isIndisponivel ? "Indisponivel" : "Abrir restaurante"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default RestauranteCard;

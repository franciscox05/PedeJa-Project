import "/src/css/index.css";

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
  if (!weekly.length) return "Horario nao definido";

  return weekly
    .slice(0, 2)
    .map((block) => {
      const days = Array.isArray(block.days) ? block.days : [];
      const label = days.map((day) => DAY_LABELS[day]).filter(Boolean).join(", ") || "Dias";
      return `${label} ${block.open || "--:--"}-${block.close || "--:--"}`;
    })
    .join(" | ");
}

function MenuHeader({ lojaInfo }) {
  const nome = lojaInfo?.nome || "Restaurante";
  const status = lojaInfo?.status || "Indisponivel";
  const bannerImage = resolveStoreImage(lojaInfo?.imagemfundo, "fundo");
  const logoImage = resolveStoreImage(lojaInfo?.icon, "icon");

  return (
    <div className="container">
      <div
        className="menu-hero-banner"
        style={{
          backgroundImage: bannerImage
            ? `linear-gradient(110deg, rgba(18,24,35,0.78), rgba(230,36,41,0.55)), url(${bannerImage})`
            : "linear-gradient(110deg, rgba(18,24,35,0.9), rgba(230,36,41,0.78))",
        }}
      >
        <div className="menu-hero-content">
          <div className="menu-hero-title-row">
            <h1>{nome}</h1>
            {logoImage ? <img src={logoImage} alt={nome} className="menu-hero-logo" /> : null}
          </div>

          <span
            className={`badge-status ${
              status === "Aberto" ? "status-aberto" : status === "Fechado" ? "status-fechado" : "status-indisponivel"
            }`}
          >
            {status}
          </span>

          <div className="menu-hero-meta">
            <span><b>Horario:</b> {summarizeSchedule(lojaInfo?.horario_funcionamento)}</span>
            {lojaInfo?.statusDetalhe ? <span><b>Excecao:</b> {lojaInfo.statusDetalhe}</span> : null}
            {lojaInfo?.morada ? <span><b>Morada:</b> {lojaInfo.morada}</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MenuHeader;

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

  const base = `/src/assets/img/restaurantes/`;
  const prefix = `restaurantes/${folder}/`;
  if (raw.startsWith(prefix)) {
    return `${base}${raw.slice("restaurantes/".length)}`;
  }
  if (raw.startsWith(`${folder}/`)) {
    return `${base}${raw}`;
  }

  return `${base}${folder}/${raw}`;
}

function summarizeSchedule(schedule) {
  const weekly = Array.isArray(schedule?.weekly) ? schedule.weekly : [];
  if (!weekly.length) return "Horário não definido";

  return weekly
    .slice(0, 2)
    .map((block) => {
      const days = Array.isArray(block.days) ? block.days : [];
      const label = days.map((day) => DAY_LABELS[day]).filter(Boolean).join(", ") || "Dias";
      return `${label} ${block.open || "--:--"}-${block.close || "--:--"}`;
    })
    .join(" | ");
}

const STATUS_PILL_CLASS = {
  Aberto: "bg-green-500/90 text-white",
  Fechado: "bg-red-500/90 text-white",
};

function MenuHeader({ lojaInfo }) {
  const nome = lojaInfo?.nome || "Restaurante";
  const status = lojaInfo?.status || "Indisponível";
  const bannerImage = resolveStoreImage(lojaInfo?.imagemfundo, "fundo");
  const logoImage = resolveStoreImage(lojaInfo?.icon, "icon");

  return (
    <div className="container">
      <div className="relative h-56 overflow-hidden rounded-2xl">
        {bannerImage ? (
          <img src={bannerImage} alt={nome} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-gray-800 to-[#e62429]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {logoImage ? (
          <div className="absolute right-4 top-4 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-white shadow-md">
            <img src={logoImage} alt={nome} className="h-full w-full object-cover" />
          </div>
        ) : null}

        <div className="absolute bottom-4 left-4 right-4">
          <h1 className="text-2xl font-black text-white">{nome}</h1>

          <span
            className={`mt-2 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold backdrop-blur-sm ${
              STATUS_PILL_CLASS[status] || "bg-white/20 text-white"
            }`}
          >
            {status}
          </span>

          <div className="mt-2 space-y-0.5 text-xs text-white/85">
            <p><span className="font-semibold text-white">Horário:</span> {summarizeSchedule(lojaInfo?.horario_funcionamento)}</p>
            {lojaInfo?.statusDetalhe ? <p><span className="font-semibold text-white">Exceção:</span> {lojaInfo.statusDetalhe}</p> : null}
            {lojaInfo?.morada ? <p><span className="font-semibold text-white">Morada:</span> {lojaInfo.morada}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MenuHeader;

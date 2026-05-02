import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import LoginButton from "../components/LoginButton";
import {
  fetchRestaurantProfileByUser,
  fetchStoreTypes,
  submitPartnerRequest,
  updateRestaurantProfile,
  uploadStoreImage,
  getImageUrl,
} from "../services/partnerService";
import { searchAddressSuggestions } from "../services/addressService";
import LocationPickerModal from "../components/LocationPickerModal";
import { geocodeAddressWithGoogle } from "../services/googleMapsService";
import { extractRestaurantId, extractUserId, resolveUserRole } from "../utils/roles";
import "../css/pages/parceiros.css";

const DAYS = [
  { id: 1, label: "Segunda", short: "Seg" },
  { id: 2, label: "Terca", short: "Ter" },
  { id: 3, label: "Quarta", short: "Qua" },
  { id: 4, label: "Quinta", short: "Qui" },
  { id: 5, label: "Sexta", short: "Sex" },
  { id: 6, label: "Sabado", short: "Sab" },
  { id: 0, label: "Domingo", short: "Dom" },
];

const DAY_PRESETS = [
  { id: "workdays", label: "Dias uteis", days: [1, 2, 3, 4, 5] },
  { id: "weekend", label: "Fim de semana", days: [6, 0] },
  { id: "all", label: "Todos os dias", days: [1, 2, 3, 4, 5, 6, 0] },
];

const SHIFT_PRESETS = [
  { id: "almoco", label: "Almoco 12:00-15:00", open: "12:00", close: "15:00" },
  { id: "jantar", label: "Jantar 19:00-23:00", open: "19:00", close: "23:00" },
  { id: "dia", label: "Dia inteiro 09:00-22:00", open: "09:00", close: "22:00" },
];

function createBlock(id, days = [1, 2, 3, 4, 5], open = "09:00", close = "22:00") {
  return { id, days, open, close };
}

function formatBlockDays(days = []) {
  const selected = DAYS.filter((day) => days.includes(day.id)).map((day) => day.short);
  return selected.length ? selected.join(", ") : "Sem dias selecionados";
}

function scheduleToBlocks(schedule) {
  const weekly = Array.isArray(schedule?.weekly) ? schedule.weekly : [];
  if (!weekly.length) return [createBlock(1)];

  return weekly.map((entry, index) => createBlock(
    index + 1,
    Array.isArray(entry.days) ? entry.days.map((day) => Number(day)).filter((day) => day >= 0 && day <= 6) : [],
    entry.open || "09:00",
    entry.close || "22:00",
  ));
}

function buildSchedule(blocks) {
  return {
    timezone: "Europe/Lisbon",
    weekly: blocks.map((block) => ({
      days: block.days,
      open: block.open,
      close: block.close,
    })),
  };
}

function normalizeCoordinate(value) {
  const parsed = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

export default function Parceiros() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [user, setUser] = useState(null);
  const [role, setRole] = useState("customer");
  const [storeProfile, setStoreProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const [storeTypes, setStoreTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  const [form, setForm] = useState({
    restauranteNome: "",
    nif: "",
    telefone: "",
    idtipoloja: "",
  });

  const [scheduleBlocks, setScheduleBlocks] = useState([createBlock(1)]);
  const [nextBlockId, setNextBlockId] = useState(2);

  const [addressQuery, setAddressQuery] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [location, setLocation] = useState({ lat: null, lng: null, place_id: null });
  const [manualCoords, setManualCoords] = useState({ lat: "", lng: "" });
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [openingMap, setOpeningMap] = useState(false);

  const [imageState, setImageState] = useState({
    backgroundFile: null,
    iconFile: null,
    backgroundUrl: "",
    iconUrl: "",
  });

  const isRestaurantRole = role === "restaurant";
  const editRequested = searchParams.get("edit") === "1";
  const queryLojaId = searchParams.get("loja") || "";
  const isEditMode = isRestaurantRole && !!storeProfile;

  useEffect(() => {
    const raw = localStorage.getItem("pedeja_user");
    const parsedUser = raw ? JSON.parse(raw) : null;
    setUser(parsedUser);
    setRole(resolveUserRole(parsedUser));
  }, []);

  useEffect(() => {
    const loadStoreTypes = async () => {
      try {
        const data = await fetchStoreTypes();
        setStoreTypes(data);
      } catch {
        setStoreTypes([]);
      }
    };

    loadStoreTypes();
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!isRestaurantRole && !editRequested) return;

    let cancelled = false;

    const loadStoreProfile = async () => {
      setLoadingProfile(true);

      try {
        const profile = await fetchRestaurantProfileByUser({
          lojaId: queryLojaId || extractRestaurantId(user),
          userId: extractUserId(user),
          email: user?.email,
        });

        if (cancelled) return;

        if (profile) {
          setStoreProfile(profile);
          setForm({
            restauranteNome: profile.nome || "",
            nif: profile.nif || "",
            telefone: profile.contacto || "",
            idtipoloja: profile.idtipoloja ? String(profile.idtipoloja) : "",
          });

          setAddressQuery(profile.morada_completa || "");
          setLocation({
            lat: profile.latitude ?? null,
            lng: profile.longitude ?? null,
            place_id: profile.place_id || null,
          });
          setManualCoords({
            lat: profile.latitude ? String(profile.latitude) : "",
            lng: profile.longitude ? String(profile.longitude) : "",
          });

          const blocks = scheduleToBlocks(profile.horario_funcionamento);
          setScheduleBlocks(blocks);
          setNextBlockId(blocks.length + 1);

          setImageState((prev) => ({
            ...prev,
            backgroundUrl: profile.imagemfundo || "",
            iconUrl: profile.icon || "",
          }));
        }
      } catch {
        if (!cancelled) setStoreProfile(null);
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    };

    loadStoreProfile();

    return () => {
      cancelled = true;
    };
  }, [editRequested, isRestaurantRole, queryLojaId, user]);

  useEffect(() => {
    if (!addressQuery || addressQuery.length < 3) {
      setAddressSuggestions([]);
      return;
    }

    const handle = setTimeout(async () => {
      try {
        const suggestions = await searchAddressSuggestions(addressQuery, { barcelosOnly: true });
        setAddressSuggestions(suggestions);
      } catch {
        setAddressSuggestions([]);
      }
    }, 350);

    return () => clearTimeout(handle);
  }, [addressQuery]);

  const scheduleLabel = useMemo(() => {
    return scheduleBlocks
      .map((block) => {
        const daysLabel = DAYS.filter((day) => block.days.includes(day.id))
          .map((day) => day.short)
          .join(", ");
        return `${daysLabel || "--"} ${block.open} - ${block.close}`;
      })
      .join(" | ");
  }, [scheduleBlocks]);
  const hasLocationCoordinates = Number.isFinite(normalizeCoordinate(location.lat))
    && Number.isFinite(normalizeCoordinate(location.lng));

  const toggleDay = (blockId, dayId) => {
    setScheduleBlocks((prev) => prev.map((block) => {
      if (block.id !== blockId) return block;
      const exists = block.days.includes(dayId);
      const nextDays = exists
        ? block.days.filter((day) => day !== dayId)
        : [...block.days, dayId];
      return { ...block, days: nextDays };
    }));
  };

  const applyDayPreset = (blockId, presetDays) => {
    const normalizedDays = DAYS
      .map((day) => day.id)
      .filter((dayId) => presetDays.includes(dayId));

    setScheduleBlocks((prev) => prev.map((block) => (
      block.id === blockId ? { ...block, days: normalizedDays } : block
    )));
  };

  const updateBlockTime = (blockId, key, value) => {
    setScheduleBlocks((prev) => prev.map((block) => (
      block.id === blockId ? { ...block, [key]: value } : block
    )));
  };

  const applyTimePreset = (blockId, preset) => {
    setScheduleBlocks((prev) => prev.map((block) => (
      block.id === blockId ? { ...block, open: preset.open, close: preset.close } : block
    )));
  };

  const addBlock = () => {
    setScheduleBlocks((prev) => [...prev, createBlock(nextBlockId, [], "12:00", "15:00")]);
    setNextBlockId((prev) => prev + 1);
  };

  const duplicateBlock = (blockId) => {
    setNextBlockId((currentNextId) => {
      setScheduleBlocks((prev) => {
        const source = prev.find((block) => block.id === blockId);
        if (!source) return prev;
        return [
          ...prev,
          {
            id: currentNextId,
            days: [...source.days],
            open: source.open,
            close: source.close,
          },
        ];
      });
      return currentNextId + 1;
    });
  };

  const removeBlock = (blockId) => {
    setScheduleBlocks((prev) => prev.filter((block) => block.id !== blockId));
  };

  const handlePickSuggestion = (suggestion) => {
    setAddressQuery(suggestion.label);
    setLocation({
      lat: suggestion.lat,
      lng: suggestion.lng,
      place_id: suggestion.id,
    });
    setManualCoords({
      lat: Number.isFinite(Number(suggestion.lat)) ? String(suggestion.lat) : "",
      lng: Number.isFinite(Number(suggestion.lng)) ? String(suggestion.lng) : "",
    });
    setAddressSuggestions([]);
  };

  const handleOpenMapPicker = async () => {
    setOpeningMap(true);
    setStatus((prev) => (prev.type === "error" ? { type: "", message: "" } : prev));

    try {
      let nextLat = normalizeCoordinate(location.lat);
      let nextLng = normalizeCoordinate(location.lng);
      let nextPlaceId = location.place_id || null;

      if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
        const manualLat = normalizeCoordinate(manualCoords.lat);
        const manualLng = normalizeCoordinate(manualCoords.lng);

        if (Number.isFinite(manualLat) && Number.isFinite(manualLng)) {
          nextLat = manualLat;
          nextLng = manualLng;
        } else if (addressQuery.trim().length >= 8) {
          try {
            const geocoded = await geocodeAddressWithGoogle(addressQuery.trim());
            if (Number.isFinite(geocoded?.lat) && Number.isFinite(geocoded?.lng)) {
              nextLat = geocoded.lat;
              nextLng = geocoded.lng;
              nextPlaceId = geocoded.place_id || null;
              setAddressQuery(geocoded.address_line || addressQuery);
            }
          } catch {
            // Se nao geocodificar, o utilizador pode marcar manualmente no mapa.
          }
        }
      }

      if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) {
        setLocation({ lat: nextLat, lng: nextLng, place_id: nextPlaceId });
        setManualCoords({ lat: String(nextLat), lng: String(nextLng) });
      }

      setShowMapPicker(true);
    } finally {
      setOpeningMap(false);
    }
  };

  const promptLogin = () => {
    window.dispatchEvent(new Event("abrirLogin"));
  };

  const validateBeforeSubmit = () => {
    if (!user) {
      return "Precisas de iniciar sessao para continuar.";
    }

    if (!form.restauranteNome.trim()) {
      return "Indica o nome do estabelecimento.";
    }

    const nifDigits = digitsOnly(form.nif);
    if (nifDigits.length < 9 || nifDigits.length > 15) {
      return "Indica um NIF valido (9 a 15 digitos).";
    }

    const phoneDigits = digitsOnly(form.telefone);
    if (phoneDigits.length < 9 || phoneDigits.length > 15) {
      return "Indica um contacto valido (9 a 15 digitos).";
    }

    if (!form.idtipoloja) {
      return "Seleciona o tipo de loja.";
    }

    if (!addressQuery.trim() || addressQuery.trim().length < 8) {
      return "Indica uma morada completa valida.";
    }

    const validBlocks = scheduleBlocks.filter((block) => block.days.length > 0 && block.open && block.close && block.open !== block.close);
    if (validBlocks.length === 0) {
      return "Adiciona pelo menos um bloco de horario valido.";
    }

    const hasBackground = Boolean(imageState.backgroundFile || imageState.backgroundUrl);
    const hasIcon = Boolean(imageState.iconFile || imageState.iconUrl);

    if (!hasBackground || !hasIcon) {
      return "Imagem de fundo e icon sao obrigatorios para publicar no card dos restaurantes.";
    }

    return "";
  };

  // --- HANDLERS DE IMAGEM COM PREVIEW LOCAL ---
  const handleImageChange = (e, tipo) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Criamos um URL temporário para o utilizador ver a imagem antes do upload
    const localPreview = URL.createObjectURL(file);

    setImageState((prev) => ({
      ...prev,
      [tipo === "icon" ? "iconFile" : "backgroundFile"]: file,
      [tipo === "icon" ? "iconUrl" : "backgroundUrl"]: localPreview,
    }));
  };

const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ type: "", message: "" });

    const validationError = validateBeforeSubmit();
    if (validationError) {
      setStatus({ type: "error", message: validationError });
      return;
    }

    setLoading(true);

    try {
      let resolvedLocation = location;

      if (!resolvedLocation.lat || !resolvedLocation.lng) {
        const manualLat = normalizeCoordinate(manualCoords.lat);
        const manualLng = normalizeCoordinate(manualCoords.lng);

        if (manualLat && manualLng) {
          resolvedLocation = {
            lat: manualLat,
            lng: manualLng,
            place_id: resolvedLocation.place_id || null,
          };
        } else {
          const suggestions = await searchAddressSuggestions(addressQuery);
          if (suggestions.length > 0) {
            resolvedLocation = {
              lat: suggestions[0].lat,
              lng: suggestions[0].lng,
              place_id: suggestions[0].id,
            };
          }
        }
      }

      if (!resolvedLocation.lat || !resolvedLocation.lng) {
        setStatus({ type: "error", message: "Nao foi possivel obter coordenadas validas para a morada." });
        setLoading(false);
        return;
      }

      const userId = extractUserId(user);
      const uploadScope = isEditMode
        ? `loja-${storeProfile.idloja}`
        : `request-${userId || Date.now()}`;

      let backgroundUrl = imageState.backgroundUrl;
      let iconUrl = imageState.iconUrl;

        // Se o utilizador selecionou um ficheiro novo, fazemos o upload para a pasta correta
      if (imageState.backgroundFile) {
        // Agora usamos o scope fixo para bater certo com a estrutura da DB
        backgroundUrl = await uploadStoreImage(imageState.backgroundFile, "restaurantes/background");
      }

      if (imageState.iconFile) {
        // Agora usamos o scope fixo para bater certo com a estrutura da DB
        iconUrl = await uploadStoreImage(imageState.iconFile, "restaurantes/icon");
      }

      const payload = {
        restaurante_nome: form.restauranteNome,
        nif: form.nif,
        telefone: form.telefone,
        idtipoloja: Number(form.idtipoloja),
        morada_completa: addressQuery.trim(),
        horario_funcionamento: buildSchedule(scheduleBlocks.filter(b => b.days.length > 0)),
        latitude: location.lat,
        longitude: location.lng,
        place_id: location.place_id,
        imagemfundo: backgroundUrl,
        icon: iconUrl,              
        user_id: String(extractUserId(user) || user.email || ""),
      };

      if (isEditMode) {
        await updateRestaurantProfile(storeProfile.idloja, payload);
        setStatus({ type: "success", message: "Dados da loja atualizados com sucesso." });
      } else {
        await submitPartnerRequest(payload);
        setStatus({ type: "success", message: "Candidatura enviada com sucesso. A equipa PedeJa vai validar os teus dados." });

        setForm({ restauranteNome: "", nif: "", telefone: "", idtipoloja: "" });
        setScheduleBlocks([createBlock(1)]);
        setNextBlockId(2);
        setAddressQuery("");
        setAddressSuggestions([]);
        setLocation({ lat: null, lng: null, place_id: null });
        setManualCoords({ lat: "", lng: "" });
        setImageState({ backgroundFile: null, iconFile: null, backgroundUrl: "", iconUrl: "" });
      }
    } catch (error) {
      setStatus({ type: "error", message: error.message || "Erro ao submeter dados." });
    } finally {
      setLoading(false);
    }
  };

  const heroTitle = isEditMode
    ? "Atualiza os dados da tua loja PedeJa"
    : "Faz crescer o teu restaurante com a PedeJa";

  const heroLead = isEditMode
    ? "Mantem horarios, imagens e dados fiscais sempre atualizados para melhorar a conversao no marketplace."
    : "Chega a novos clientes, gere o teu menu em minutos e recebe pedidos integrados com Shipday.";

  return (
    <main className="partners-page">
      <header className="partners-topbar">
        <div className="partners-logo">PEDEJA</div>
        <LoginButton />
      </header>

      <section className="partners-hero">
        <div className="partners-hero-content">
          <p className="partners-badge">PedeJa Partners</p>
          <h1>{heroTitle}</h1>
          <p className="partners-lead">{heroLead}</p>
          <div className="partners-hero-actions">
            <button className="btn-primary" onClick={() => document.getElementById("partner-form")?.scrollIntoView({ behavior: "smooth" })}>
              {isEditMode ? "Editar dados" : "Tornar-me parceiro"}
            </button>
            {isEditMode && (
              <button className="btn-secondary" onClick={() => navigate("/")}>
                Voltar ao website
              </button>
            )}
            <button className="btn-secondary" onClick={() => window.open("https://pedeja.pt/contatos.html", "_blank")}>Falar com a equipa</button>
          </div>
        </div>
        <div className="partners-hero-card">
          <div className="metric">
            <span className="metric-value">+42%</span>
            <span className="metric-label">media de crescimento mensal</span>
          </div>
          <div className="metric">
            <span className="metric-value">24/7</span>
            <span className="metric-label">suporte para parceiros</span>
          </div>
          <div className="metric">
            <span className="metric-value">15 min</span>
            <span className="metric-label">setup inicial do menu</span>
          </div>
        </div>
      </section>

      <section className="partners-benefits">
        <h2>{isEditMode ? "Gestao continua da tua loja" : "Porque vale a pena juntar-se"}</h2>
        <div className="benefits-grid">
          <article>
            <h3>Mais visibilidade</h3>
            <p>O teu restaurante aparece na app PedeJa para milhares de clientes locais.</p>
          </article>
          <article>
            <h3>Gestao simples</h3>
            <p>Controla menu, horarios e dados da loja num painel unico.</p>
          </article>
          <article>
            <h3>Logistica integrada</h3>
            <p>Envios sincronizados com Shipday para entregas consistentes.</p>
          </article>
        </div>
      </section>

      <section className="partners-form" id="partner-form">
        <div className="form-header">
          <h2>{isEditMode ? "Editar dados da loja" : "Pedido de parceria"}</h2>
          <p>
            {isEditMode
              ? "Atualiza os dados para manter a loja sempre correta no marketplace."
              : "Preenche os dados abaixo e validamos o teu estabelecimento em poucas horas."}
          </p>
        </div>

        {!user ? (
          <div className="login-prompt">
            <p>Para continuar precisas de iniciar sessao.</p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn-primary" onClick={promptLogin}>Iniciar sessao</button>
              <button className="btn-secondary" onClick={() => navigate("/")}>Voltar ao inicio</button>
            </div>
          </div>
        ) : loadingProfile ? (
          <div className="login-prompt">
            <p>A carregar dados da loja...</p>
          </div>
        ) : isRestaurantRole && !storeProfile ? (
          <div className="login-prompt">
            <p>Conta restaurante sem loja associada. Contacta o admin para finalizar a associacao.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="form-field">
              <label>Nome do estabelecimento</label>
              <input
                type="text"
                value={form.restauranteNome}
                onChange={(e) => setForm((prev) => ({ ...prev, restauranteNome: e.target.value }))}
                placeholder="Ex: Tasca do Centro"
                required
              />
            </div>

            <div className="form-field">
              <label>NIF</label>
              <input
                type="text"
                value={form.nif}
                onChange={(e) => setForm((prev) => ({ ...prev, nif: e.target.value }))}
                placeholder="000000000"
                required
              />
            </div>

            <div className="form-field">
              <label>Telefone do estabelecimento</label>
              <input
                type="text"
                value={form.telefone}
                onChange={(e) => setForm((prev) => ({ ...prev, telefone: e.target.value }))}
                placeholder="9XXXXXXXX"
                required
              />
            </div>

            <div className="form-field">
              <label>Tipo de loja</label>
              <select
                value={form.idtipoloja}
                onChange={(e) => setForm((prev) => ({ ...prev, idtipoloja: e.target.value }))}
                required
              >
                <option value="">Selecionar tipo</option>
                {storeTypes.map((type) => (
                  <option key={type.idtipoloja} value={String(type.idtipoloja)}>
                    {type.descricao || type.tipoloja}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field full">
              <label>Morada completa do estabelecimento</label>
              <input
                type="text"
                value={addressQuery}
                onChange={(e) => {
                  setAddressQuery(e.target.value);
                  setLocation({ lat: null, lng: null, place_id: null });
                }}
                placeholder="Rua, porta, codigo postal e cidade"
                required
              />
              <div className="address-tools">
                <button
                  type="button"
                  className="address-map-btn"
                  onClick={handleOpenMapPicker}
                  disabled={openingMap}
                >
                  {openingMap
                    ? "A preparar mapa..."
                    : (hasLocationCoordinates ? "Ajustar no mapa" : "Marcar no mapa")}
                </button>
                <p className={`coords-hint ${hasLocationCoordinates ? "ok" : ""}`}>
                  {hasLocationCoordinates
                    ? `Coordenadas: ${Number(location.lat).toFixed(6)}, ${Number(location.lng).toFixed(6)}`
                    : "Sem coordenadas. Usa o mapa para marcar com precisao."}
                </p>
              </div>
              {addressSuggestions.length > 0 ? (
                <div className="suggestions">
                  {addressSuggestions.map((item) => (
                    <button type="button" key={item.id} onClick={() => handlePickSuggestion(item)}>
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : (
                addressQuery.length >= 3 && <p className="hint">Sem sugestoes. Podes introduzir coordenadas manualmente.</p>
              )}
              <p className="hint">Sugestoes e mapa limitados a Portugal Continental e zona Barcelos.</p>
            </div>

            <div className="form-field full">
              <label>Coordenadas (opcional, se a morada nao aparecer)</label>
              <div className="coords-row">
                <input
                  type="text"
                  placeholder="Latitude"
                  value={manualCoords.lat}
                  onChange={(e) => setManualCoords((prev) => ({ ...prev, lat: e.target.value }))}
                />
                <input
                  type="text"
                  placeholder="Longitude"
                  value={manualCoords.lng}
                  onChange={(e) => setManualCoords((prev) => ({ ...prev, lng: e.target.value }))}
                />
              </div>
            </div>

            <div className="form-field">
            <label>Imagem de fundo (Banner)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleImageChange(e, "background")}
            />
          </div>

          <div className="form-field">
            <label>Icon da loja (Logo)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleImageChange(e, "icon")}
            />
          </div>

            {/* PREVIEW DAS IMAGENS ATUALIZADO */}
          {(imageState.backgroundUrl || imageState.iconUrl) && (
            <div className="form-field full" style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
              {imageState.backgroundUrl && (
                <div style={{ textAlign: "center" }}>
                  <p className="hint">Fundo atual/selecionado:</p>
                  <img 
                    src={getImageUrl(imageState.backgroundUrl)} 
                    alt="Preview Fundo" 
                    style={{ width: "220px", height: "120px", borderRadius: "12px", objectCover: "cover", border: "1px solid #ddd" }} 
                  />
                </div>
              )}
              {imageState.iconUrl && (
                <div style={{ textAlign: "center" }}>
                  <p className="hint">Ícone:</p>
                  <img 
                    src={getImageUrl(imageState.iconUrl)} 
                    alt="Preview Icon" 
                    style={{ width: "84px", height: "84px", borderRadius: "12px", objectCover: "cover", border: "1px solid #ddd" }} 
                  />
                </div>
              )}
            </div>
          )}

            <div className="form-field full">
              <label>Horario de funcionamento</label>
              <div className="schedule-builder">
                <p className="schedule-help">
                  Define os turnos em que a loja abre. Podes criar mais do que um bloco para fazer pausa de almoco.
                </p>
                {scheduleBlocks.map((block) => (
                  <div key={block.id} className="schedule-block">
                    <div className="schedule-block-head">
                      <strong>Turno #{block.id}</strong>
                      <div className="schedule-block-actions">
                        <button type="button" className="schedule-duplicate-btn" onClick={() => duplicateBlock(block.id)}>
                          Duplicar
                        </button>
                        {scheduleBlocks.length > 1 && (
                          <button type="button" className="schedule-remove-btn" onClick={() => removeBlock(block.id)}>
                            Remover
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="schedule-presets">
                      {DAY_PRESETS.map((preset) => (
                        <button
                          type="button"
                          key={`${block.id}-${preset.id}`}
                          className="schedule-preset-btn"
                          onClick={() => applyDayPreset(block.id, preset.days)}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <div className="day-list">
                      {DAYS.map((day) => (
                        <button
                          type="button"
                          key={day.id}
                          className={block.days.includes(day.id) ? "active" : ""}
                          onClick={() => toggleDay(block.id, day.id)}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                    <div className="time-presets">
                      {SHIFT_PRESETS.map((preset) => (
                        <button
                          type="button"
                          key={`${block.id}-${preset.id}`}
                          className="time-preset-btn"
                          onClick={() => applyTimePreset(block.id, preset)}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <div className="time-grid">
                      <label className="time-field">
                        <span>Abertura</span>
                        <input
                          type="time"
                          value={block.open}
                          onChange={(e) => updateBlockTime(block.id, "open", e.target.value)}
                        />
                      </label>
                      <label className="time-field">
                        <span>Fecho</span>
                        <input
                          type="time"
                          value={block.close}
                          onChange={(e) => updateBlockTime(block.id, "close", e.target.value)}
                        />
                      </label>
                    </div>
                    <p className="preview">{`${formatBlockDays(block.days)} ${block.open} - ${block.close}`}</p>
                  </div>
                ))}
                <button type="button" className="schedule-add-btn" onClick={addBlock}>
                  + Adicionar novo turno
                </button>
                <span className="preview schedule-summary">{scheduleLabel}</span>
              </div>
            </div>

            {status.message && (
              <div className={`form-status ${status.type}`}>{status.message}</div>
            )}

            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? "A guardar..." : isEditMode ? "Guardar alteracoes" : "Enviar candidatura"}
            </button>
          </form>
        )}
      </section>

      <LocationPickerModal
        isOpen={showMapPicker}
        title={isEditMode ? "Ajustar localizacao da loja" : "Selecionar localizacao do estabelecimento"}
        subtitle="Marca no mapa a entrada do estabelecimento para evitar erros de geolocalizacao."
        initialLat={normalizeCoordinate(location.lat) || normalizeCoordinate(manualCoords.lat)}
        initialLng={normalizeCoordinate(location.lng) || normalizeCoordinate(manualCoords.lng)}
        showDeliveryPricing={false}
        enforceDeliveryZone={false}
        onCancel={() => setShowMapPicker(false)}
        onConfirm={async (pickedLocation) => {
          setShowMapPicker(false);
          setAddressSuggestions([]);
          setAddressQuery(pickedLocation?.address_line || addressQuery);
          setLocation({
            lat: pickedLocation?.lat ?? null,
            lng: pickedLocation?.lng ?? null,
            place_id: pickedLocation?.place_id || null,
          });
          setManualCoords({
            lat: Number.isFinite(Number(pickedLocation?.lat)) ? String(pickedLocation.lat) : "",
            lng: Number.isFinite(Number(pickedLocation?.lng)) ? String(pickedLocation.lng) : "",
          });
        }}
      />
    </main>
  );
}




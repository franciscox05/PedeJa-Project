import { useEffect, useMemo, useState } from "react";
import {
  fetchRestaurantProfileByUser,
  fetchStoreTypes,
  updateRestaurantProfile,
  uploadStoreImage,
  getImageUrl,
} from "../../services/partnerService";
import { searchAddressSuggestions } from "../../services/addressService";
import { geocodeAddressWithGoogle } from "../../services/googleMapsService";
import LocationPickerModal from "../LocationPickerModal";
import {
  DAYS,
  DAY_PRESETS,
  SHIFT_PRESETS,
  createBlock,
  formatBlockDays,
  scheduleToBlocks,
  buildSchedule,
} from "../../utils/storeWeeklyScheduleBuilder";

function normalizeCoordinate(value) {
  const parsed = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

// Editor compacto dos dados base de uma loja (nome, NIF, contacto, tipo,
// morada, imagens, horario semanal) -- a mesma logica de negocio usada em
// /parceiros (fetchRestaurantProfileByUser/updateRestaurantProfile), so que
// embutido diretamente no dashboard do admin em vez de obrigar a saltar
// para outra pagina para editar estes campos.
export default function StoreProfileEditor({ lojaId, callerUserId, onSaved }) {
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [storeProfile, setStoreProfile] = useState(null);
  const [storeTypes, setStoreTypes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  const [form, setForm] = useState({ nome: "", nif: "", telefone: "", idtipoloja: "" });
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

  useEffect(() => {
    fetchStoreTypes().then(setStoreTypes).catch(() => setStoreTypes([]));
  }, []);

  useEffect(() => {
    if (!lojaId) return undefined;
    let cancelled = false;

    const load = async () => {
      setLoadingProfile(true);
      setStatus({ type: "", message: "" });

      try {
        const profile = await fetchRestaurantProfileByUser({ lojaId });
        if (cancelled || !profile) return;

        setStoreProfile(profile);
        setForm({
          nome: profile.nome || "",
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

        setImageState({
          backgroundFile: null,
          iconFile: null,
          backgroundUrl: profile.imagemfundo || "",
          iconUrl: profile.icon || "",
        });
      } catch (error) {
        if (!cancelled) {
          setStatus({ type: "error", message: error?.message || "Nao foi possivel carregar os dados da loja." });
        }
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [lojaId]);

  useEffect(() => {
    if (!addressQuery || addressQuery.length < 3) {
      setAddressSuggestions([]);
      return undefined;
    }

    const handle = setTimeout(async () => {
      try {
        setAddressSuggestions(await searchAddressSuggestions(addressQuery, { barcelosOnly: true }));
      } catch {
        setAddressSuggestions([]);
      }
    }, 350);

    return () => clearTimeout(handle);
  }, [addressQuery]);

  const hasLocationCoordinates = Number.isFinite(normalizeCoordinate(location.lat))
    && Number.isFinite(normalizeCoordinate(location.lng));
  const scheduleLabel = useMemo(
    () => scheduleBlocks.map((block) => `${formatBlockDays(block.days)} ${block.open}-${block.close}`).join(" | "),
    [scheduleBlocks],
  );

  const toggleDay = (blockId, dayId) => {
    setScheduleBlocks((prev) => prev.map((block) => {
      if (block.id !== blockId) return block;
      const exists = block.days.includes(dayId);
      return { ...block, days: exists ? block.days.filter((day) => day !== dayId) : [...block.days, dayId] };
    }));
  };

  const applyDayPreset = (blockId, presetDays) => {
    setScheduleBlocks((prev) => prev.map((block) => (
      block.id === blockId ? { ...block, days: DAYS.map((day) => day.id).filter((dayId) => presetDays.includes(dayId)) } : block
    )));
  };

  const updateBlockTime = (blockId, key, value) => {
    setScheduleBlocks((prev) => prev.map((block) => (block.id === blockId ? { ...block, [key]: value } : block)));
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

  const removeBlock = (blockId) => {
    setScheduleBlocks((prev) => prev.filter((block) => block.id !== blockId));
  };

  const handlePickSuggestion = (suggestion) => {
    setAddressQuery(suggestion.label);
    setLocation({ lat: suggestion.lat, lng: suggestion.lng, place_id: suggestion.id });
    setManualCoords({
      lat: Number.isFinite(Number(suggestion.lat)) ? String(suggestion.lat) : "",
      lng: Number.isFinite(Number(suggestion.lng)) ? String(suggestion.lng) : "",
    });
    setAddressSuggestions([]);
  };

  const handleOpenMapPicker = async () => {
    setOpeningMap(true);

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
            // Sem geocodificacao automatica -- o admin marca manualmente no mapa.
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

  const handleImageChange = (event, tipo) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const localPreview = URL.createObjectURL(file);
    setImageState((prev) => ({
      ...prev,
      [tipo === "icon" ? "iconFile" : "backgroundFile"]: file,
      [tipo === "icon" ? "iconUrl" : "backgroundUrl"]: localPreview,
    }));
  };

  const validateBeforeSubmit = () => {
    if (!form.nome.trim()) return "Indica o nome do estabelecimento.";

    const nifDigits = digitsOnly(form.nif);
    if (nifDigits.length < 9 || nifDigits.length > 15) return "Indica um NIF valido (9 a 15 digitos).";

    const phoneDigits = digitsOnly(form.telefone);
    if (phoneDigits.length < 9 || phoneDigits.length > 15) return "Indica um contacto valido (9 a 15 digitos).";

    if (!form.idtipoloja) return "Seleciona o tipo de loja.";
    if (!addressQuery.trim() || addressQuery.trim().length < 8) return "Indica uma morada completa valida.";

    const validBlocks = scheduleBlocks.filter((block) => block.days.length > 0 && block.open && block.close && block.open !== block.close);
    if (validBlocks.length === 0) return "Adiciona pelo menos um turno valido no horario semanal.";

    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus({ type: "", message: "" });

    const validationError = validateBeforeSubmit();
    if (validationError) {
      setStatus({ type: "error", message: validationError });
      return;
    }

    setSaving(true);

    try {
      let resolvedLocation = location;
      if (!resolvedLocation.lat || !resolvedLocation.lng) {
        const manualLat = normalizeCoordinate(manualCoords.lat);
        const manualLng = normalizeCoordinate(manualCoords.lng);
        if (manualLat && manualLng) {
          resolvedLocation = { lat: manualLat, lng: manualLng, place_id: resolvedLocation.place_id || null };
        }
      }

      if (!resolvedLocation.lat || !resolvedLocation.lng) {
        setStatus({ type: "error", message: "Nao foi possivel obter coordenadas validas para a morada." });
        setSaving(false);
        return;
      }

      const uploadContext = { lojaId, callerUserId };
      let backgroundUrl = imageState.backgroundUrl;
      let iconUrl = imageState.iconUrl;

      if (imageState.backgroundFile) {
        backgroundUrl = await uploadStoreImage(imageState.backgroundFile, "restaurantes/background", uploadContext);
      }
      if (imageState.iconFile) {
        iconUrl = await uploadStoreImage(imageState.iconFile, "restaurantes/icon", uploadContext);
      }

      const payload = {
        restaurante_nome: form.nome,
        nif: form.nif,
        telefone: form.telefone,
        idtipoloja: Number(form.idtipoloja),
        morada_completa: addressQuery.trim(),
        horario_funcionamento: buildSchedule(scheduleBlocks.filter((block) => block.days.length > 0)),
        latitude: resolvedLocation.lat,
        longitude: resolvedLocation.lng,
        place_id: resolvedLocation.place_id,
        imagemfundo: backgroundUrl,
        icon: iconUrl,
      };

      await updateRestaurantProfile(lojaId, payload, callerUserId);
      setStatus({ type: "success", message: "Dados da loja atualizados com sucesso." });
      await onSaved?.();
    } catch (error) {
      setStatus({ type: "error", message: error?.message || "Erro ao guardar os dados da loja." });
    } finally {
      setSaving(false);
    }
  };

  if (!lojaId) {
    return <p className="muted">Seleciona uma loja para editar os dados base.</p>;
  }

  if (loadingProfile) {
    return <p className="muted">A carregar dados da loja...</p>;
  }

  if (!storeProfile) {
    return <p className="muted">Nao foi possivel carregar os dados desta loja.</p>;
  }

  return (
    <form className="store-profile-editor" onSubmit={handleSubmit}>
      {status.message ? (
        <p className={status.type === "error" ? "admin-inline-error" : "admin-inline-success"}>{status.message}</p>
      ) : null}

      <div className="special-hours-grid">
        <label>
          <span className="muted">Nome do estabelecimento</span>
          <input
            type="text"
            value={form.nome}
            onChange={(event) => setForm((prev) => ({ ...prev, nome: event.target.value }))}
            placeholder="Ex: Tasca do Centro"
          />
        </label>

        <label>
          <span className="muted">NIF</span>
          <input
            type="text"
            value={form.nif}
            onChange={(event) => setForm((prev) => ({ ...prev, nif: event.target.value }))}
            placeholder="000000000"
          />
        </label>

        <label>
          <span className="muted">Telefone do estabelecimento</span>
          <input
            type="text"
            value={form.telefone}
            onChange={(event) => setForm((prev) => ({ ...prev, telefone: event.target.value }))}
            placeholder="9XXXXXXXX"
          />
        </label>

        <label>
          <span className="muted">Tipo de loja</span>
          <select
            value={form.idtipoloja}
            onChange={(event) => setForm((prev) => ({ ...prev, idtipoloja: event.target.value }))}
          >
            <option value="">Selecionar tipo</option>
            {storeTypes.map((type) => (
              <option key={type.idtipoloja} value={String(type.idtipoloja)}>
                {type.descricao || type.tipoloja}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="store-profile-field-full">
        <span className="muted">Morada completa do estabelecimento</span>
        <input
          type="text"
          value={addressQuery}
          onChange={(event) => {
            setAddressQuery(event.target.value);
            setLocation({ lat: null, lng: null, place_id: null });
          }}
          placeholder="Rua, porta, codigo postal e cidade"
        />
        <div className="store-profile-address-tools">
          <button type="button" className="btn-dashboard small secondary" onClick={handleOpenMapPicker} disabled={openingMap}>
            {openingMap ? "A preparar mapa..." : (hasLocationCoordinates ? "Ajustar no mapa" : "Marcar no mapa")}
          </button>
          <span className={`store-profile-coords-hint${hasLocationCoordinates ? " is-ok" : ""}`}>
            {hasLocationCoordinates
              ? `Coordenadas: ${Number(location.lat).toFixed(6)}, ${Number(location.lng).toFixed(6)}`
              : "Sem coordenadas. Usa o mapa para marcar com precisao."}
          </span>
        </div>
        {addressSuggestions.length > 0 ? (
          <div className="store-profile-suggestions">
            {addressSuggestions.map((item) => (
              <button type="button" key={item.id} onClick={() => handlePickSuggestion(item)}>
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </label>

      <div className="special-hours-grid">
        <label>
          <span className="muted">Imagem de fundo (banner)</span>
          <input type="file" accept="image/*" onChange={(event) => handleImageChange(event, "background")} />
        </label>
        <label>
          <span className="muted">Icon da loja (logo)</span>
          <input type="file" accept="image/*" onChange={(event) => handleImageChange(event, "icon")} />
        </label>
      </div>

      {(imageState.backgroundUrl || imageState.iconUrl) ? (
        <div className="store-profile-image-preview">
          {imageState.backgroundUrl ? (
            <div>
              <p className="muted">Fundo atual/selecionado</p>
              <img src={getImageUrl(imageState.backgroundUrl)} alt="Preview do fundo" />
            </div>
          ) : null}
          {imageState.iconUrl ? (
            <div>
              <p className="muted">Icon</p>
              <img src={getImageUrl(imageState.iconUrl)} alt="Preview do icon" className="is-icon" />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="store-profile-schedule">
        <p className="muted">Define os turnos em que a loja abre. Podes criar mais do que um bloco para pausa de almoço.</p>
        {scheduleBlocks.map((block) => (
          <div key={block.id} className="store-profile-schedule-block">
            <div className="store-profile-schedule-block-head">
              <strong>Turno #{block.id}</strong>
              {scheduleBlocks.length > 1 ? (
                <button type="button" className="btn-dashboard small secondary" onClick={() => removeBlock(block.id)}>
                  Remover
                </button>
              ) : null}
            </div>

            <div className="store-profile-schedule-presets">
              {DAY_PRESETS.map((preset) => (
                <button type="button" key={preset.id} className="restaurant-card-jump-link" onClick={() => applyDayPreset(block.id, preset.days)}>
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="store-profile-schedule-days">
              {DAYS.map((day) => (
                <button
                  type="button"
                  key={day.id}
                  className={`store-profile-day-btn${block.days.includes(day.id) ? " is-active" : ""}`}
                  onClick={() => toggleDay(block.id, day.id)}
                >
                  {day.short}
                </button>
              ))}
            </div>

            <div className="store-profile-schedule-presets">
              {SHIFT_PRESETS.map((preset) => (
                <button type="button" key={preset.id} className="restaurant-card-jump-link" onClick={() => applyTimePreset(block.id, preset)}>
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="special-hours-grid">
              <label>
                <span className="muted">Abertura</span>
                <input type="time" value={block.open} onChange={(event) => updateBlockTime(block.id, "open", event.target.value)} />
              </label>
              <label>
                <span className="muted">Fecho</span>
                <input type="time" value={block.close} onChange={(event) => updateBlockTime(block.id, "close", event.target.value)} />
              </label>
            </div>

            <p className="muted">{formatBlockDays(block.days)} {block.open} - {block.close}</p>
          </div>
        ))}

        <button type="button" className="btn-dashboard small secondary" onClick={addBlock}>
          + Adicionar novo turno
        </button>
        <p className="muted store-profile-schedule-summary">{scheduleLabel}</p>
      </div>

      <div className="restaurant-settings-actions">
        <button type="submit" className="btn-dashboard" disabled={saving}>
          {saving ? "A guardar..." : "Guardar dados da loja"}
        </button>
      </div>

      <LocationPickerModal
        isOpen={showMapPicker}
        title="Ajustar localizacao da loja"
        subtitle="Marca no mapa a entrada do estabelecimento para evitar erros de geolocalizacao."
        initialLat={normalizeCoordinate(location.lat) || normalizeCoordinate(manualCoords.lat)}
        initialLng={normalizeCoordinate(location.lng) || normalizeCoordinate(manualCoords.lng)}
        showDeliveryPricing={false}
        enforceDeliveryZone={false}
        onCancel={() => setShowMapPicker(false)}
        onConfirm={(pickedLocation) => {
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
    </form>
  );
}

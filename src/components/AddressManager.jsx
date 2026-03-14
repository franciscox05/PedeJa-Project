import { useEffect, useState } from "react";
import {
  deleteUserAddress,
  fetchUserAddresses,
  saveUserAddress,
  searchAddressSuggestions,
  setDefaultAddress,
  updateUserAddress,
} from "../services/addressService";
import { computeBarcelosDeliveryQuote } from "../services/deliveryZoneService";
import { geocodeAddressWithGoogle } from "../services/googleMapsService";
import LocationPickerModal from "./LocationPickerModal";

function isFiniteCoordinate(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed);
}

export default function AddressManager({ userId, onDefaultAddressChange }) {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rowLoadingId, setRowLoadingId] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [editAddress, setEditAddress] = useState(null);
  const [form, setForm] = useState({
    label: "Casa",
    custom_label: "",
    address_line: "",
    lat: null,
    lng: null,
    place_id: null,
    is_default: false,
  });

  const loadAddresses = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await fetchUserAddresses(userId);
      setAddresses(data);
      const defaultAddress = data.find((item) => item.is_default) || null;
      if (onDefaultAddressChange) onDefaultAddressChange(defaultAddress);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAddresses();
  }, [userId]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (form.address_line.trim().length < 3) {
        setSuggestions([]);
        return;
      }
      const data = await searchAddressSuggestions(form.address_line, { barcelosOnly: true });
      setSuggestions(data);
    }, 350);

    return () => clearTimeout(timer);
  }, [form.address_line]);

  const resetForm = () => {
    setForm({
      label: "Casa",
      custom_label: "",
      address_line: "",
      lat: null,
      lng: null,
      place_id: null,
      is_default: false,
    });
  };

  const resolveLabel = () => {
    if (form.label !== "Outro") return form.label;
    return String(form.custom_label || "").trim();
  };

  const ensureCoordinatesByAddressLine = async (addressLine, lat, lng, place_id = null) => {
    if (isFiniteCoordinate(lat) && isFiniteCoordinate(lng)) {
      return {
        lat: Number(lat),
        lng: Number(lng),
        place_id: place_id || null,
        address_line: addressLine,
      };
    }

    const geocoded = await geocodeAddressWithGoogle(addressLine);
    if (!geocoded || !isFiniteCoordinate(geocoded.lat) || !isFiniteCoordinate(geocoded.lng)) {
      throw new Error("A morada tem de estar dentro da zona de Barcelos.");
    }

    return {
      lat: Number(geocoded.lat),
      lng: Number(geocoded.lng),
      place_id: geocoded.place_id || null,
      address_line: geocoded.address_line || addressLine,
    };
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!userId || !form.address_line.trim()) return;

    const finalLabel = resolveLabel();
    if (!finalLabel) {
      alert("Indica o nome da etiqueta quando escolhes Outro.");
      return;
    }

    setSaving(true);
    try {
      const coords = await ensureCoordinatesByAddressLine(form.address_line, form.lat, form.lng, form.place_id);
      const quote = computeBarcelosDeliveryQuote(coords);
      if (!quote.deliverable) {
        throw new Error(quote.reason || "Morada fora da zona de entrega.");
      }

      const created = await saveUserAddress({
        ...form,
        address_line: coords.address_line || form.address_line,
        lat: coords.lat,
        lng: coords.lng,
        place_id: coords.place_id,
        user_id: userId,
        label: finalLabel,
      });

      if (form.is_default) {
        await setDefaultAddress(userId, created.id);
      }

      resetForm();
      setSuggestions([]);
      await loadAddresses();
    } catch (error) {
      alert(`Falha ao guardar morada: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const makeDefault = async (addressId) => {
    try {
      await setDefaultAddress(userId, addressId);
      await loadAddresses();
    } catch (error) {
      alert(`Falha ao definir morada principal: ${error.message}`);
    }
  };

  const openEditModal = async (address) => {
    setRowLoadingId(address.id);
    try {
      let lat = address.lat;
      let lng = address.lng;
      let placeId = address.place_id || null;
      let addressLine = address.address_line;

      if (!isFiniteCoordinate(lat) || !isFiniteCoordinate(lng)) {
        const geocoded = await geocodeAddressWithGoogle(address.address_line);
        lat = geocoded.lat;
        lng = geocoded.lng;
        placeId = geocoded.place_id || null;
        addressLine = geocoded.address_line || address.address_line;
      }

      setEditAddress({
        ...address,
        lat,
        lng,
        place_id: placeId,
        address_line: addressLine,
      });
      setShowMapPicker(true);
    } catch (error) {
      alert(`Nao foi possivel abrir o editor de mapa: ${error.message}`);
    } finally {
      setRowLoadingId(null);
    }
  };

  const handleEditConfirm = async (location) => {
    if (!editAddress) return;
    setRowLoadingId(editAddress.id);
    try {
      const quote = computeBarcelosDeliveryQuote({ lat: location.lat, lng: location.lng });
      if (!quote.deliverable) {
        throw new Error(quote.reason || "Morada fora da zona de entrega.");
      }

      await updateUserAddress({
        id: editAddress.id,
        label: editAddress.label,
        address_line: location.address_line || editAddress.address_line,
        lat: location.lat,
        lng: location.lng,
        place_id: location.place_id || null,
      });

      setShowMapPicker(false);
      setEditAddress(null);
      await loadAddresses();
    } catch (error) {
      alert(`Falha ao atualizar morada: ${error.message}`);
    } finally {
      setRowLoadingId(null);
    }
  };

  const handleDelete = async (address) => {
    const ok = window.confirm(`Queres apagar a morada "${address.label}"?`);
    if (!ok) return;

    setRowLoadingId(address.id);
    try {
      await deleteUserAddress(userId, address.id);
      await loadAddresses();
    } catch (error) {
      alert(`Falha ao apagar morada: ${error.message}`);
    } finally {
      setRowLoadingId(null);
    }
  };

  return (
    <section className="profile-address-manager">
      <header className="profile-section-header">
        <h2>Moradas guardadas</h2>
        <p>Gere as tuas moradas de entrega e escolhe uma principal.</p>
      </header>

      {loading ? <p className="profile-note">A carregar moradas...</p> : null}

      <div className="profile-address-grid">
        {addresses.map((address) => (
          <article
            key={address.id}
            className={`profile-address-card ${address.is_default ? "is-default" : ""}`}
          >
            <div className="profile-address-top">
              <strong>{address.label}</strong>
              {address.is_default ? <span className="profile-pill-default">Principal</span> : null}
            </div>

            <p>{address.address_line}</p>

            <div className="profile-address-actions">
              {!address.is_default && (
                <button
                  type="button"
                  className="profile-mini-btn"
                  onClick={() => makeDefault(address.id)}
                  disabled={rowLoadingId === address.id}
                >
                  Tornar principal
                </button>
              )}
              <button
                type="button"
                className="profile-mini-btn dark"
                onClick={() => openEditModal(address)}
                disabled={rowLoadingId === address.id}
              >
                Editar
              </button>
              <button
                type="button"
                className="profile-mini-btn danger"
                onClick={() => handleDelete(address)}
                disabled={rowLoadingId === address.id}
              >
                Apagar
              </button>
            </div>
          </article>
        ))}
      </div>

      <form onSubmit={handleSave} className="profile-address-form">
        <div className="profile-field profile-inline-field">
          <label htmlFor="profileAddressLabel">Etiqueta</label>
          <select
            id="profileAddressLabel"
            value={form.label}
            onChange={(e) => {
              const nextLabel = e.target.value;
              setForm((prev) => ({
                ...prev,
                label: nextLabel,
                custom_label: nextLabel === "Outro" ? prev.custom_label : "",
              }));
            }}
          >
            <option value="Casa">Casa</option>
            <option value="Trabalho">Trabalho</option>
            <option value="Outro">Outro</option>
          </select>
        </div>

        {form.label === "Outro" && (
          <div className="profile-field profile-inline-field">
            <label htmlFor="profileAddressCustomLabel">Nome da etiqueta</label>
            <input
              id="profileAddressCustomLabel"
              type="text"
              placeholder="Ex: Casa dos pais"
              value={form.custom_label}
              onChange={(e) => setForm((prev) => ({ ...prev, custom_label: e.target.value }))}
            />
          </div>
        )}

        <div className="profile-field">
          <label htmlFor="profileAddressInput">Morada</label>
          <input
            id="profileAddressInput"
            type="text"
            placeholder="Pesquisar morada em Barcelos"
            value={form.address_line}
            onChange={(e) => setForm((prev) => ({ ...prev, address_line: e.target.value }))}
          />
        </div>

        <div className="profile-address-tools">
          <button type="button" className="profile-btn secondary compact" onClick={() => setShowMapPicker(true)}>
            Marcar no mapa
          </button>
          {isFiniteCoordinate(form.lat) && isFiniteCoordinate(form.lng) ? (
            <p className="profile-address-coords">
              Coordenadas: {Number(form.lat).toFixed(6)}, {Number(form.lng).toFixed(6)}
            </p>
          ) : (
            <p className="profile-address-coords muted">Sem coordenadas definidas.</p>
          )}
        </div>

        <p className="profile-address-hint">Sugestoes e mapa limitados a freguesias de Barcelos.</p>

        {suggestions.length > 0 && (
          <div className="profile-suggestions-list">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                className="profile-suggestion-item"
                onClick={() => {
                  setForm((prev) => ({
                    ...prev,
                    address_line: suggestion.label,
                    lat: suggestion.lat,
                    lng: suggestion.lng,
                    place_id: suggestion.place_id || null,
                  }));
                  setSuggestions([]);
                }}
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        )}

        <label className="profile-checkbox-row">
          <input
            type="checkbox"
            checked={form.is_default}
            onChange={(e) => setForm((prev) => ({ ...prev, is_default: e.target.checked }))}
          />
          Definir como principal
        </label>

        <button type="submit" className="profile-btn primary" disabled={saving}>
          {saving ? "A guardar..." : "Guardar morada"}
        </button>
      </form>

      <LocationPickerModal
        isOpen={showMapPicker}
        title={editAddress ? `Editar morada: ${editAddress.label}` : "Selecionar morada no mapa"}
        subtitle={editAddress ? "Ajusta o pino para corrigir a localizacao desta morada." : "Marca a tua localizacao exata para evitar erros de entrega."}
        initialLat={editAddress ? editAddress.lat : form.lat}
        initialLng={editAddress ? editAddress.lng : form.lng}
        onCancel={() => {
          setShowMapPicker(false);
          setEditAddress(null);
        }}
        onConfirm={async (location) => {
          if (editAddress) {
            await handleEditConfirm(location);
            return;
          }

          setShowMapPicker(false);
          setForm((prev) => ({
            ...prev,
            address_line: location.address_line || prev.address_line,
            lat: location.lat,
            lng: location.lng,
            place_id: location.place_id || null,
          }));
          setSuggestions([]);
        }}
      />
    </section>
  );
}

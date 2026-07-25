import { useCallback, useEffect, useRef, useState } from "react";
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
import { fetchGlobalDeliveryPricingConfig } from "../services/supabaseClient";
import LocationPickerModal from "./LocationPickerModal";
import { useAlert } from "../context/AlertContext";

function isFiniteCoordinate(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed);
}

function normalizeAddressIdentity(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export default function AddressManager({ userId, onDefaultAddressChange }) {
  const { showError } = useAlert();
  const formRef = useRef(null);
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rowLoadingId, setRowLoadingId] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [editAddress, setEditAddress] = useState(null);
  const [globalDeliveryPricingConfig, setGlobalDeliveryPricingConfig] = useState(null);
  const [form, setForm] = useState({
    label: "Casa",
    custom_label: "",
    address_line: "",
    lat: null,
    lng: null,
    place_id: null,
    is_default: false,
  });

  const isEditing = Boolean(editAddress);

  const loadAddresses = useCallback(async () => {
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
  }, [onDefaultAddressChange, userId]);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  useEffect(() => {
    let active = true;

    fetchGlobalDeliveryPricingConfig()
      .then((settings) => {
        if (!active) return;
        setGlobalDeliveryPricingConfig(settings?.config || null);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Falha ao carregar configuracao global de entrega na gestao de moradas", error);
        setGlobalDeliveryPricingConfig(null);
      });

    return () => {
      active = false;
    };
  }, []);

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

  const cancelEditing = () => {
    setShowMapPicker(false);
    setEditAddress(null);
    setSuggestions([]);
    resetForm();
  };

  const hydrateFormFromAddress = (address, nextCoords = {}) => {
    const normalizedLabel = String(address?.label || "").trim();
    const useCustomLabel = normalizedLabel && !["Casa", "Trabalho"].includes(normalizedLabel);

    setForm({
      label: useCustomLabel ? "Outro" : (normalizedLabel || "Casa"),
      custom_label: useCustomLabel ? normalizedLabel : "",
      address_line: address?.address_line || "",
      lat: isFiniteCoordinate(nextCoords?.lat ?? address?.lat) ? Number(nextCoords?.lat ?? address?.lat) : null,
      lng: isFiniteCoordinate(nextCoords?.lng ?? address?.lng) ? Number(nextCoords?.lng ?? address?.lng) : null,
      place_id: nextCoords?.place_id ?? address?.place_id ?? null,
      is_default: Boolean(address?.is_default),
    });
  };

  const resolveLabel = () => {
    if (form.label !== "Outro") return form.label;
    return String(form.custom_label || "").trim();
  };

  const validateDuplicates = (nextLabel, nextAddressLine) => {
    const normalizedLabel = normalizeAddressIdentity(nextLabel);
    const normalizedAddress = normalizeAddressIdentity(nextAddressLine);
    const currentId = editAddress?.id ?? editAddress?.idmorada ?? null;

    const sameLabel = addresses.find((address) => (
      String(address.id) !== String(currentId)
      && normalizeAddressIdentity(address.label) === normalizedLabel
    ));
    if (sameLabel) {
      throw new Error(`Ja existe uma morada com a etiqueta "${nextLabel}".`);
    }

    const sameAddress = addresses.find((address) => (
      String(address.id) !== String(currentId)
      && normalizeAddressIdentity(address.address_line) === normalizedAddress
    ));
    if (sameAddress) {
      throw new Error(`Ja existe uma morada guardada com este endereco (${sameAddress.label}).`);
    }
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

  const refreshGlobalDeliveryPricing = async () => {
    const settings = await fetchGlobalDeliveryPricingConfig();
    const nextConfig = settings?.config || null;
    setGlobalDeliveryPricingConfig(nextConfig);
    return nextConfig;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!userId || !form.address_line.trim()) return;

    const finalLabel = resolveLabel();
    if (!finalLabel) {
      showError("Indica o nome da etiqueta quando escolhes Outro.");
      return;
    }

    setSaving(true);
    try {
      const latestDeliveryPricingConfig = await refreshGlobalDeliveryPricing();
      const coords = await ensureCoordinatesByAddressLine(form.address_line, form.lat, form.lng, form.place_id);
      validateDuplicates(finalLabel, coords.address_line || form.address_line);

      const quote = computeBarcelosDeliveryQuote(
        coords,
        latestDeliveryPricingConfig,
      );
      if (!quote.deliverable) {
        throw new Error(quote.reason || "Morada fora da zona de entrega.");
      }

      if (editAddress) {
        await updateUserAddress({
          id: editAddress.id,
          user_id: userId,
          label: finalLabel,
          address_line: coords.address_line || form.address_line,
          lat: coords.lat,
          lng: coords.lng,
          place_id: coords.place_id,
        });

        if (form.is_default) {
          await setDefaultAddress(userId, editAddress.id);
        }

        cancelEditing();
      } else {
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
      }

      setSuggestions([]);
      await loadAddresses();
    } catch (error) {
      showError(`Falha ao ${editAddress ? "atualizar" : "guardar"} morada: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const makeDefault = async (addressId) => {
    try {
      await setDefaultAddress(userId, addressId);
      await loadAddresses();
    } catch (error) {
      showError(`Falha ao definir morada principal: ${error.message}`);
    }
  };

  const openEditModal = (address) => {
    setEditAddress(address);
    hydrateFormFromAddress(address);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const openMapPicker = async () => {
    const activeAddress = editAddress;
    const baseAddressLine = form.address_line || activeAddress?.address_line || "";
    if (!baseAddressLine.trim()) {
      showError("Escreve primeiro a morada antes de ajustares o ponto no mapa.");
      return;
    }

    setRowLoadingId(activeAddress?.id || "new");
    try {
      await refreshGlobalDeliveryPricing();
      if (!isFiniteCoordinate(form.lat) || !isFiniteCoordinate(form.lng)) {
        const geocoded = await geocodeAddressWithGoogle(baseAddressLine);
        setForm((prev) => ({
          ...prev,
          address_line: geocoded.address_line || prev.address_line,
          lat: geocoded.lat,
          lng: geocoded.lng,
          place_id: geocoded.place_id || null,
        }));
      }
      setShowMapPicker(true);
    } catch (error) {
      showError(`Nao foi possivel abrir o editor de mapa: ${error.message}`);
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
      showError(`Falha ao apagar morada: ${error.message}`);
    } finally {
      setRowLoadingId(null);
    }
  };

  return (
    <section className="grid gap-5">
      <header>
        <h2 className="text-lg font-bold text-gray-900">Moradas guardadas</h2>
        <p className="mt-0.5 text-sm text-gray-500">Gere as tuas moradas de entrega e escolhe uma principal.</p>
      </header>

      {loading ? <p className="text-sm text-gray-500">A carregar moradas...</p> : null}

      <div className="grid gap-3">
        {addresses.map((address) => (
          <article
            key={address.id}
            className={`grid gap-2 rounded-xl border p-3 ${
              address.is_default ? "border-green-200 bg-green-50" : "border-gray-100 bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-2.5">
              <strong className="text-gray-900">{address.label}</strong>
              {address.is_default ? (
                <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-800">Principal</span>
              ) : null}
            </div>

            <p className="text-sm text-gray-600">{address.address_line}</p>

            <div className="flex flex-wrap gap-2">
              {!address.is_default && (
                <button
                  type="button"
                  className="justify-self-start rounded-lg bg-red-500 px-2.5 py-2 text-sm font-bold text-white disabled:opacity-60"
                  onClick={() => makeDefault(address.id)}
                  disabled={rowLoadingId === address.id}
                >
                  Tornar principal
                </button>
              )}
              <button
                type="button"
                className="justify-self-start rounded-lg bg-gray-900 px-2.5 py-2 text-sm font-bold text-white disabled:opacity-60"
                onClick={() => openEditModal(address)}
                disabled={rowLoadingId === address.id}
              >
                Editar
              </button>
              <button
                type="button"
                className="justify-self-start rounded-lg bg-red-700 px-2.5 py-2 text-sm font-bold text-white disabled:opacity-60"
                onClick={() => handleDelete(address)}
                disabled={rowLoadingId === address.id}
              >
                Apagar
              </button>
            </div>
          </article>
        ))}
      </div>

      <form ref={formRef} onSubmit={handleSave} className="grid gap-2.5 border-t border-gray-100 pt-3">
        <div>
          <h3 className="text-base font-bold text-gray-900">{isEditing ? `Editar morada: ${editAddress.label}` : "Adicionar nova morada"}</h3>
          <p className="mt-0.5 text-sm text-gray-500">
            {isEditing
              ? "Atualiza primeiro a etiqueta e a morada escrita. Depois, se precisares, ajusta o ponto no mapa."
              : "Escreve a morada completa e, se precisares, confirma o ponto exato no mapa."}
          </p>
        </div>

        <div className="max-w-[260px]">
          <label htmlFor="profileAddressLabel" className="mb-1.5 block text-sm font-semibold text-gray-700">Etiqueta</label>
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
            className="w-full rounded-xl border border-gray-200 p-2.5 text-sm outline-none transition-colors focus:border-[#e62429]"
          >
            <option value="Casa">Casa</option>
            <option value="Trabalho">Trabalho</option>
            <option value="Outro">Outro</option>
          </select>
        </div>

        {form.label === "Outro" && (
          <div className="max-w-[260px]">
            <label htmlFor="profileAddressCustomLabel" className="mb-1.5 block text-sm font-semibold text-gray-700">Nome da etiqueta</label>
            <input
              id="profileAddressCustomLabel"
              type="text"
              placeholder="Ex: Casa dos pais"
              value={form.custom_label}
              onChange={(e) => setForm((prev) => ({ ...prev, custom_label: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 p-2.5 text-sm outline-none transition-colors focus:border-[#e62429]"
            />
          </div>
        )}

        <div>
          <label htmlFor="profileAddressInput" className="mb-1.5 block text-sm font-semibold text-gray-700">Morada</label>
          <input
            id="profileAddressInput"
            type="text"
            placeholder="Pesquisar morada em Barcelos"
            value={form.address_line}
            onChange={(e) => setForm((prev) => ({ ...prev, address_line: e.target.value }))}
            className="w-full rounded-xl border border-gray-200 p-2.5 text-sm outline-none transition-colors focus:border-[#e62429]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-900 hover:bg-gray-50 disabled:opacity-60"
            onClick={openMapPicker}
            disabled={rowLoadingId === (editAddress?.id || "new")}
          >
            {rowLoadingId === (editAddress?.id || "new")
              ? "A preparar mapa..."
              : (isEditing ? "Ajustar no mapa" : "Marcar no mapa")}
          </button>
          {isFiniteCoordinate(form.lat) && isFiniteCoordinate(form.lng) ? (
            <p className="text-sm text-gray-600">
              Coordenadas: {Number(form.lat).toFixed(6)}, {Number(form.lng).toFixed(6)}
            </p>
          ) : (
            <p className="text-sm text-gray-400">Sem coordenadas definidas.</p>
          )}
        </div>

        <p className="text-xs text-gray-400">Sugestoes e mapa limitados a freguesias de Barcelos.</p>

        {suggestions.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-gray-100">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                className="block w-full border-b border-gray-100 px-3 py-2.5 text-left text-sm text-gray-800 last:border-b-0 hover:bg-red-50"
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

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.is_default}
            onChange={(e) => setForm((prev) => ({ ...prev, is_default: e.target.checked }))}
          />
          Definir como principal
        </label>

        <div className="flex flex-wrap justify-end gap-2.5">
          {isEditing ? (
            <button
              type="button"
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-900 hover:bg-gray-50"
              onClick={cancelEditing}
            >
              Cancelar edicao
            </button>
          ) : null}
          <button
            type="submit"
            className="rounded-xl bg-[#e62429] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#c91b20] disabled:opacity-60"
            disabled={saving}
          >
            {saving ? (isEditing ? "A atualizar..." : "A guardar...") : (isEditing ? "Guardar alteracoes" : "Guardar morada")}
          </button>
        </div>
      </form>

      <LocationPickerModal
        isOpen={showMapPicker}
        title={editAddress ? `Editar morada: ${editAddress.label}` : "Selecionar morada no mapa"}
        subtitle={editAddress ? "Ajusta o pino para corrigir a localizacao desta morada." : "Marca a tua localizacao exata para evitar erros de entrega."}
        initialLat={form.lat}
        initialLng={form.lng}
        deliveryPricingConfig={globalDeliveryPricingConfig}
        onCancel={() => {
          setShowMapPicker(false);
        }}
        onConfirm={async (location) => {
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

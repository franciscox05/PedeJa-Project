import { useEffect, useMemo, useState } from "react";
import {
  computeDeliveryQuoteByDistance,
  DEFAULT_PER_KM_DELIVERY_CONFIG,
  describeDeliveryPricing,
  formatDeliveryFee,
  sanitizeDeliveryPricingConfig,
} from "../../services/deliveryZoneService";

function buildConfigDraft(config = null) {
  const resolved = sanitizeDeliveryPricingConfig(config, DEFAULT_PER_KM_DELIVERY_CONFIG.base_fee)
    || DEFAULT_PER_KM_DELIVERY_CONFIG;

  return {
    base_fee: String(resolved.base_fee ?? DEFAULT_PER_KM_DELIVERY_CONFIG.base_fee),
    included_km: String(resolved.included_km ?? DEFAULT_PER_KM_DELIVERY_CONFIG.included_km),
    extra_per_km: String(resolved.extra_per_km ?? DEFAULT_PER_KM_DELIVERY_CONFIG.extra_per_km),
    max_km: String(resolved.max_km ?? DEFAULT_PER_KM_DELIVERY_CONFIG.max_km),
  };
}

function validateDraft(draft) {
  const config = sanitizeDeliveryPricingConfig(draft, draft?.base_fee);
  if (!config) {
    return "A configuracao de entrega esta invalida.";
  }

  if (config.base_fee < 2.8) {
    return "A taxa minima nao pode ser inferior a 2.80EUR.";
  }

  if (config.max_km <= 0) {
    return "Define um limite maximo de distancia valido.";
  }

  return "";
}

function buildPreviewRows(config) {
  const resolved = sanitizeDeliveryPricingConfig(config, config?.base_fee);
  if (!resolved) return [];

  const previewDistances = Array.from(new Set([
    Number(resolved.included_km.toFixed(2)),
    Number(Math.min(resolved.max_km, resolved.included_km + 3).toFixed(2)),
    Number(resolved.max_km.toFixed(2)),
  ]))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  return previewDistances.map((distanceKm) => {
    const quote = computeDeliveryQuoteByDistance(distanceKm, resolved);
    return {
      distanceKm,
      fee: quote.fee,
    };
  });
}

export default function StoreDeliveryPricingPanel({
  stores = [],
  globalConfig = null,
  loading = false,
  canEdit = true,
  onSaveDeliveryPricingSettings,
  onSaveGlobalDeliveryPricingSettings,
}) {
  const [globalDraft, setGlobalDraft] = useState(buildConfigDraft(globalConfig));
  const [storeDrafts, setStoreDrafts] = useState({});
  const [overrideEnabledByStore, setOverrideEnabledByStore] = useState({});
  const [savingKey, setSavingKey] = useState("");
  const [savedMap, setSavedMap] = useState({});
  const [feedback, setFeedback] = useState({ tone: "", message: "" });

  useEffect(() => {
    setGlobalDraft(buildConfigDraft(globalConfig));
    setSavedMap((prev) => ({ ...prev, global: false }));
  }, [globalConfig]);

  useEffect(() => {
    const nextDrafts = {};
    const nextOverrides = {};
    const nextSaved = {};

    (stores || []).forEach((store) => {
      const key = String(store.idloja);
      const hasSpecificConfig = Boolean(sanitizeDeliveryPricingConfig(store?.configuracao_entrega, store?.taxaentrega));
      nextDrafts[key] = buildConfigDraft(store?.configuracao_entrega || globalConfig);
      nextOverrides[key] = hasSpecificConfig;
      nextSaved[key] = false;
    });

    setStoreDrafts(nextDrafts);
    setOverrideEnabledByStore(nextOverrides);
    setSavedMap((prev) => ({ ...prev, ...nextSaved }));
  }, [globalConfig, stores]);

  const resolvedGlobalConfig = useMemo(
    () => sanitizeDeliveryPricingConfig(globalDraft, globalDraft?.base_fee),
    [globalDraft],
  );
  const globalPreviewRows = useMemo(
    () => buildPreviewRows(globalDraft),
    [globalDraft],
  );

  const markDirty = (key) => {
    setSavedMap((prev) => ({ ...prev, [key]: false }));
  };

  const handleGlobalDraftChange = (field, value) => {
    setGlobalDraft((prev) => ({ ...prev, [field]: value }));
    markDirty("global");
  };

  const handleStoreDraftChange = (storeKey, field, value) => {
    setStoreDrafts((prev) => ({
      ...prev,
      [storeKey]: {
        ...(prev[storeKey] || {}),
        [field]: value,
      },
    }));
    markDirty(storeKey);
  };

  const handleToggleStoreOverride = (storeKey, enabled) => {
    setOverrideEnabledByStore((prev) => ({ ...prev, [storeKey]: enabled }));

    if (enabled) {
      setStoreDrafts((prev) => ({
        ...prev,
        [storeKey]: prev[storeKey] || buildConfigDraft(globalConfig),
      }));
    }

    markDirty(storeKey);
  };

  const handleSaveGlobal = async () => {
    if (!canEdit || !onSaveGlobalDeliveryPricingSettings) return;

    const validationError = validateDraft(globalDraft);
    if (validationError) {
      setFeedback({ tone: "error", message: validationError });
      return;
    }

    const payload = sanitizeDeliveryPricingConfig(globalDraft, globalDraft?.base_fee);
    if (!payload) {
      setFeedback({ tone: "error", message: "Nao foi possivel preparar a configuracao geral de entrega." });
      return;
    }

    setSavingKey("global");
    setFeedback({ tone: "", message: "" });

    try {
      await onSaveGlobalDeliveryPricingSettings(payload);
      setSavedMap((prev) => ({ ...prev, global: true }));
      setFeedback({
        tone: "success",
        message: "Configuracao geral de entrega atualizada com sucesso.",
      });
    } catch (error) {
      setSavedMap((prev) => ({ ...prev, global: false }));
      setFeedback({
        tone: "error",
        message: error?.message || "Nao foi possivel guardar a configuracao geral de entrega.",
      });
    } finally {
      setSavingKey("");
    }
  };

  const handleSaveStore = async (store) => {
    if (!canEdit || !onSaveDeliveryPricingSettings) return;

    const storeKey = String(store.idloja);
    const isOverrideEnabled = Boolean(overrideEnabledByStore[storeKey]);
    const draft = storeDrafts[storeKey] || buildConfigDraft(globalConfig);

    if (isOverrideEnabled) {
      const validationError = validateDraft(draft);
      if (validationError) {
        setFeedback({ tone: "error", message: validationError });
        return;
      }
    }

    setSavingKey(storeKey);
    setFeedback({ tone: "", message: "" });

    try {
      await onSaveDeliveryPricingSettings(
        store,
        isOverrideEnabled ? sanitizeDeliveryPricingConfig(draft, draft?.base_fee) : null,
      );
      setSavedMap((prev) => ({ ...prev, [storeKey]: true }));
      setFeedback({
        tone: "success",
        message: isOverrideEnabled
          ? `Excecao de entrega guardada para ${store.nome || `Loja ${store.idloja}`}.`
          : `${store.nome || `Loja ${store.idloja}`} voltou a usar a configuracao geral.`,
      });
    } catch (error) {
      setSavedMap((prev) => ({ ...prev, [storeKey]: false }));
      setFeedback({
        tone: "error",
        message: error?.message || "Nao foi possivel guardar a configuracao de entrega da loja.",
      });
    } finally {
      setSavingKey("");
    }
  };

  return (
    <article className="panel restaurant-settings-panel">
      <div className="restaurant-settings-header">
        <div>
          <h3>Entrega por raio / km</h3>
          <p className="muted">O admin define uma configuracao geral e, se quiser, cria excecoes especificas por loja.</p>
        </div>
      </div>

      {feedback.message ? (
        <p className={feedback.tone === "error" ? "shipday-inline-error" : "shipday-inline-success"}>
          {feedback.message}
        </p>
      ) : null}

      <div className="restaurant-settings-list">
        <section className="restaurant-settings-card">
          <div className="restaurant-settings-card-top">
            <div>
              <h4>Configuracao geral da plataforma</h4>
              <p className="muted">{describeDeliveryPricing(resolvedGlobalConfig, resolvedGlobalConfig?.base_fee)}</p>
            </div>
            <button
              type="button"
              className={`btn-dashboard small${savedMap.global ? " success" : ""}`}
              disabled={!canEdit || loading || savingKey === "global"}
              onClick={handleSaveGlobal}
            >
              {savingKey === "global" ? "A guardar..." : savedMap.global ? "Guardado" : "Guardar geral"}
            </button>
          </div>

          <div className="special-hours-grid">
            <label>
              <span className="muted">Taxa minima (EUR)</span>
              <input
                type="number"
                min="2.8"
                step="0.1"
                value={globalDraft.base_fee}
                disabled={!canEdit || loading}
                onChange={(event) => handleGlobalDraftChange("base_fee", event.target.value)}
              />
            </label>

            <label>
              <span className="muted">Km incluidos na taxa minima</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={globalDraft.included_km}
                disabled={!canEdit || loading}
                onChange={(event) => handleGlobalDraftChange("included_km", event.target.value)}
              />
            </label>

            <label>
              <span className="muted">Extra por km (EUR)</span>
              <input
                type="number"
                min="0"
                step="0.05"
                value={globalDraft.extra_per_km}
                disabled={!canEdit || loading}
                onChange={(event) => handleGlobalDraftChange("extra_per_km", event.target.value)}
              />
            </label>

            <label>
              <span className="muted">Limite maximo (km)</span>
              <input
                type="number"
                min="1"
                step="0.5"
                value={globalDraft.max_km}
                disabled={!canEdit || loading}
                onChange={(event) => handleGlobalDraftChange("max_km", event.target.value)}
              />
            </label>
          </div>

          {globalPreviewRows.length > 0 ? (
            <div className="delivery-pricing-preview">
              {globalPreviewRows.map((row) => (
                <div key={`global-${row.distanceKm}`}>
                  <strong>{row.distanceKm.toFixed(2)} km</strong>
                  <span>{formatDeliveryFee(row.fee)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {(stores || []).map((store) => {
          const storeKey = String(store.idloja);
          const isOverrideEnabled = Boolean(overrideEnabledByStore[storeKey]);
          const draft = storeDrafts[storeKey] || buildConfigDraft(globalConfig);
          const effectiveConfig = isOverrideEnabled
            ? sanitizeDeliveryPricingConfig(draft, draft?.base_fee)
            : resolvedGlobalConfig;
          const previewRows = buildPreviewRows(effectiveConfig);

          return (
            <section key={storeKey} className="restaurant-settings-card">
              <div className="restaurant-settings-card-top">
                <div>
                  <h4>{store.nome || `Loja ${store.idloja}`}</h4>
                  <p className="muted">
                    {isOverrideEnabled
                      ? "Esta loja usa uma configuracao especifica."
                      : "Esta loja usa a configuracao geral da plataforma."}
                  </p>
                </div>
                <button
                  type="button"
                  className={`btn-dashboard small${savedMap[storeKey] ? " success" : ""}`}
                  disabled={!canEdit || loading || savingKey === storeKey}
                  onClick={() => handleSaveStore(store)}
                >
                  {savingKey === storeKey ? "A guardar..." : savedMap[storeKey] ? "Guardado" : "Guardar loja"}
                </button>
              </div>

              <div className="restaurant-settings-controls">
                <div className="restaurant-setting-field">
                  <span className="restaurant-setting-label">Excecao por loja</span>
                  <label className={`dashboard-switch${!canEdit ? " is-disabled" : ""}`}>
                    <input
                      type="checkbox"
                      checked={isOverrideEnabled}
                      disabled={!canEdit || loading}
                      onChange={() => handleToggleStoreOverride(storeKey, !isOverrideEnabled)}
                    />
                    <span className="dashboard-switch-track">
                      <span className="dashboard-switch-thumb" />
                    </span>
                    <span className="dashboard-switch-text">
                      {isOverrideEnabled ? "Especifica" : "Geral"}
                    </span>
                  </label>
                </div>
              </div>

              <div className="special-hours-grid">
                <label>
                  <span className="muted">Taxa minima (EUR)</span>
                  <input
                    type="number"
                    min="2.8"
                    step="0.1"
                    value={draft.base_fee}
                    disabled={!canEdit || loading || !isOverrideEnabled}
                    onChange={(event) => handleStoreDraftChange(storeKey, "base_fee", event.target.value)}
                  />
                </label>

                <label>
                  <span className="muted">Km incluidos na taxa minima</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={draft.included_km}
                    disabled={!canEdit || loading || !isOverrideEnabled}
                    onChange={(event) => handleStoreDraftChange(storeKey, "included_km", event.target.value)}
                  />
                </label>

                <label>
                  <span className="muted">Extra por km (EUR)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.05"
                    value={draft.extra_per_km}
                    disabled={!canEdit || loading || !isOverrideEnabled}
                    onChange={(event) => handleStoreDraftChange(storeKey, "extra_per_km", event.target.value)}
                  />
                </label>

                <label>
                  <span className="muted">Limite maximo (km)</span>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    value={draft.max_km}
                    disabled={!canEdit || loading || !isOverrideEnabled}
                    onChange={(event) => handleStoreDraftChange(storeKey, "max_km", event.target.value)}
                  />
                </label>
              </div>

              {previewRows.length > 0 ? (
                <div className="delivery-pricing-preview">
                  {previewRows.map((row) => (
                    <div key={`${storeKey}-${row.distanceKm}`}>
                      <strong>{row.distanceKm.toFixed(2)} km</strong>
                      <span>{formatDeliveryFee(row.fee)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </article>
  );
}

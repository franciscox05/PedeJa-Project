import { useEffect, useState } from "react";
import { sanitizeCommissionConfig } from "../../services/pricingService";

function formatCommissionDraft(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "";
  return String(parsed);
}

function parseCommissionValue(value, { allowBlank = false } = {}) {
  const normalized = String(value || "").trim().replace(",", ".");
  if (!normalized) {
    return allowBlank ? null : 0;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error("A comissao PedeJa deve ser um numero entre 0 e 100.");
  }

  return Number(parsed.toFixed(2));
}

function buildDraftFromStore(store, catalog) {
  const config = sanitizeCommissionConfig(store?.configuracoes_comissao, store?.comissao_pedeja_percent);
  const categoryValues = {};
  const itemValues = {};

  (catalog?.categories || []).forEach((categoryName) => {
    const match = Object.entries(config.category_percents || {}).find(
      ([candidate]) => String(candidate || "").trim().toLowerCase() === String(categoryName || "").trim().toLowerCase(),
    );
    categoryValues[categoryName] = match ? formatCommissionDraft(match[1]) : "";
  });

  (catalog?.items || []).forEach((item) => {
    const itemKey = String(item.idmenu);
    itemValues[itemKey] = Object.prototype.hasOwnProperty.call(config.item_percents || {}, itemKey)
      ? formatCommissionDraft(config.item_percents[itemKey])
      : "";
  });

  return {
    globalPercent: formatCommissionDraft(config.global_percent ?? store?.comissao_pedeja_percent ?? 0),
    mode: config.mode || "global",
    categoryValues,
    itemValues,
  };
}

function buildCommissionPayload(draft, catalog) {
  const globalPercent = parseCommissionValue(draft?.globalPercent);
  const categoryPercents = {};
  const itemPercents = {};

  (catalog?.categories || []).forEach((categoryName) => {
    const value = parseCommissionValue(draft?.categoryValues?.[categoryName], { allowBlank: true });
    if (value !== null) {
      categoryPercents[categoryName] = value;
    }
  });

  (catalog?.items || []).forEach((item) => {
    const itemKey = String(item.idmenu);
    const value = parseCommissionValue(draft?.itemValues?.[itemKey], { allowBlank: true });
    if (value !== null) {
      itemPercents[itemKey] = value;
    }
  });

  return {
    comissao_pedeja_percent: globalPercent,
    configuracoes_comissao: {
      mode: draft?.mode || "global",
      global_percent: globalPercent,
      category_percents: categoryPercents,
      item_percents: itemPercents,
    },
  };
}

function normalizeCatalog(catalog) {
  return {
    categories: Array.isArray(catalog?.categories) ? catalog.categories : [],
    items: Array.isArray(catalog?.items) ? catalog.items : [],
  };
}

export default function RestaurantManagementPanel({
  title = "Gestao de Restaurantes",
  subtitle = "",
  stores = [],
  loading = false,
  error = "",
  canEdit = true,
  emptyText = "Sem restaurantes disponiveis.",
  toolbar = null,
  commissionCatalogByStore = {},
  catalogLoadingByStore = {},
  catalogErrorByStore = {},
  onToggleAutoAccept,
  onSaveCommissionSettings,
}) {
  const [commissionDrafts, setCommissionDrafts] = useState({});
  const [togglingStoreId, setTogglingStoreId] = useState("");
  const [savingStoreId, setSavingStoreId] = useState("");
  const [savedStoreMap, setSavedStoreMap] = useState({});
  const [feedback, setFeedback] = useState({ tone: "", message: "" });

  useEffect(() => {
    const nextDrafts = {};
    const allowedKeys = new Set();

    (stores || []).forEach((store) => {
      const key = String(store.idloja);
      allowedKeys.add(key);
      nextDrafts[key] = buildDraftFromStore(store, normalizeCatalog(commissionCatalogByStore[key]));
    });

    setCommissionDrafts(nextDrafts);
    setSavedStoreMap((prev) => {
      const next = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (allowedKeys.has(key)) next[key] = value;
      });
      return next;
    });
  }, [commissionCatalogByStore, stores]);

  const markRowDirty = (rowKey) => {
    setSavedStoreMap((prev) => ({
      ...prev,
      [rowKey]: false,
    }));
  };

  const updateDraft = (rowKey, updater) => {
    setCommissionDrafts((prev) => ({
      ...prev,
      [rowKey]: updater(prev[rowKey] || buildDraftFromStore({}, { categories: [], items: [] })),
    }));
    markRowDirty(rowKey);
  };

  const handleToggle = async (store) => {
    if (!canEdit || !onToggleAutoAccept) return;

    setFeedback({ tone: "", message: "" });
    setTogglingStoreId(String(store.idloja));

    try {
      await onToggleAutoAccept(store, !store.aceitacao_automatica_pedidos);
      setFeedback({
        tone: "success",
        message: `Aceitacao automatica atualizada para ${store.nome || `Loja ${store.idloja}`}.`,
      });
    } catch (toggleError) {
      setFeedback({
        tone: "error",
        message: toggleError?.message || "Nao foi possivel atualizar a aceitacao automatica.",
      });
    } finally {
      setTogglingStoreId("");
    }
  };

  const handleSaveCommissionSettings = async (store) => {
    if (!canEdit || !onSaveCommissionSettings) return;

    const rowKey = String(store.idloja);
    const catalog = normalizeCatalog(commissionCatalogByStore[rowKey]);

    setFeedback({ tone: "", message: "" });
    setSavingStoreId(rowKey);

    try {
      const payload = buildCommissionPayload(commissionDrafts[rowKey], catalog);
      await onSaveCommissionSettings(store, payload);
      setSavedStoreMap((prev) => ({
        ...prev,
        [rowKey]: true,
      }));
      setFeedback({
        tone: "success",
        message: `Comissao atualizada para ${store.nome || `Loja ${store.idloja}`}.`,
      });
    } catch (saveError) {
      setSavedStoreMap((prev) => ({
        ...prev,
        [rowKey]: false,
      }));
      setFeedback({
        tone: "error",
        message: saveError?.message || "Nao foi possivel guardar a configuracao de comissao.",
      });
    } finally {
      setSavingStoreId("");
    }
  };

  return (
    <article className="panel restaurant-settings-panel">
      <div className="restaurant-settings-header">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
        {toolbar ? <div className="restaurant-settings-toolbar">{toolbar}</div> : null}
      </div>

      {error ? <p className="shipday-inline-error">{error}</p> : null}
      {feedback.message ? (
        <p className={feedback.tone === "error" ? "shipday-inline-error" : "shipday-inline-success"}>
          {feedback.message}
        </p>
      ) : null}

      {(stores || []).length === 0 && !loading ? (
        <p className="muted">{emptyText}</p>
      ) : null}

      <div className="restaurant-settings-list">
        {(stores || []).map((store) => {
          const rowKey = String(store.idloja);
          const rowBusy = togglingStoreId === rowKey || savingStoreId === rowKey;
          const rowSaved = savedStoreMap[rowKey] === true;
          const catalog = normalizeCatalog(commissionCatalogByStore[rowKey]);
          const draft = commissionDrafts[rowKey] || buildDraftFromStore(store, catalog);
          const catalogLoading = Boolean(catalogLoadingByStore[rowKey]);
          const catalogError = catalogErrorByStore[rowKey] || "";

          return (
            <section key={rowKey} className="restaurant-settings-card">
              <div className="restaurant-settings-card-top">
                <div>
                  <h4>{store.nome || `Loja ${store.idloja}`}</h4>
                  <p className="muted">#{store.idloja}</p>
                </div>
                <span className={`tag ${store.ativo ? "ok" : "bad"}`}>
                  {store.ativo ? "Ativa" : "Inativa"}
                </span>
              </div>

              <div className="restaurant-settings-controls">
                <div className="restaurant-setting-field">
                  <span className="restaurant-setting-label">Aceitacao automatica</span>
                  <label className={`dashboard-switch${!canEdit ? " is-disabled" : ""}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(store.aceitacao_automatica_pedidos)}
                      disabled={!canEdit || rowBusy || loading}
                      onChange={() => handleToggle(store)}
                    />
                    <span className="dashboard-switch-track">
                      <span className="dashboard-switch-thumb" />
                    </span>
                    <span className="dashboard-switch-text">
                      {store.aceitacao_automatica_pedidos ? "Ativada" : "Manual"}
                    </span>
                  </label>
                </div>

                <div className="restaurant-setting-field">
                  <span className="restaurant-setting-label">Comissao global (%)</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    className="dashboard-number-input"
                    value={draft.globalPercent}
                    disabled={!canEdit || rowBusy || loading}
                    onChange={(event) => updateDraft(rowKey, (prev) => ({
                      ...prev,
                      globalPercent: event.target.value,
                    }))}
                  />
                </div>
              </div>

              <div className="commission-mode-tabs" role="tablist" aria-label={`Modo de comissao da loja ${store.nome || store.idloja}`}>
                {[
                  { id: "global", label: "Global" },
                  { id: "category", label: "Por Categoria" },
                  { id: "item", label: "Por Prato" },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={`commission-mode-btn${draft.mode === mode.id ? " is-active" : ""}`}
                    disabled={!canEdit || rowBusy || loading}
                    onClick={() => updateDraft(rowKey, (prev) => ({
                      ...prev,
                      mode: mode.id,
                    }))}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              {draft.mode === "global" ? (
                <p className="muted commission-helper-text">
                  Todos os produtos desta loja usam a percentagem global definida acima.
                </p>
              ) : null}

              {draft.mode === "category" ? (
                <div className="commission-editor-card">
                  <div className="commission-editor-header">
                    <h5>Comissao por categoria</h5>
                    <p className="muted">Se um campo ficar vazio, a categoria usa a comissao global.</p>
                  </div>

                  {catalogLoading ? <p className="muted">A carregar categorias do menu...</p> : null}
                  {!catalogLoading && catalogError ? <p className="shipday-inline-error">{catalogError}</p> : null}
                  {!catalogLoading && !catalogError && catalog.categories.length === 0 ? (
                    <p className="muted">Ainda nao existem categorias no menu desta loja.</p>
                  ) : null}

                  {!catalogLoading && !catalogError && catalog.categories.length > 0 ? (
                    <div className="commission-editor-grid">
                      {catalog.categories.map((categoryName) => (
                        <label key={categoryName} className="commission-editor-field">
                          <span>{categoryName}</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            className="dashboard-number-input"
                            placeholder={draft.globalPercent || "0"}
                            value={draft.categoryValues?.[categoryName] ?? ""}
                            disabled={!canEdit || rowBusy || loading}
                            onChange={(event) => updateDraft(rowKey, (prev) => ({
                              ...prev,
                              categoryValues: {
                                ...(prev.categoryValues || {}),
                                [categoryName]: event.target.value,
                              },
                            }))}
                          />
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {draft.mode === "item" ? (
                <div className="commission-editor-card">
                  <div className="commission-editor-header">
                    <h5>Comissao por prato</h5>
                    <p className="muted">O prato usa primeiro este override. Sem valor, cai para categoria e depois global.</p>
                  </div>

                  {catalogLoading ? <p className="muted">A carregar pratos do menu...</p> : null}
                  {!catalogLoading && catalogError ? <p className="shipday-inline-error">{catalogError}</p> : null}
                  {!catalogLoading && !catalogError && catalog.items.length === 0 ? (
                    <p className="muted">Ainda nao existem pratos no menu desta loja.</p>
                  ) : null}

                  {!catalogLoading && !catalogError && catalog.items.length > 0 ? (
                    <div className="commission-item-list">
                      {catalog.items.map((item) => (
                        <label key={item.idmenu} className="commission-item-row">
                          <div>
                            <strong>{item.nome}</strong>
                            <p className="muted">{item.categoria}</p>
                          </div>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            className="dashboard-number-input"
                            placeholder={draft.globalPercent || "0"}
                            value={draft.itemValues?.[String(item.idmenu)] ?? ""}
                            disabled={!canEdit || rowBusy || loading}
                            onChange={(event) => updateDraft(rowKey, (prev) => ({
                              ...prev,
                              itemValues: {
                                ...(prev.itemValues || {}),
                                [String(item.idmenu)]: event.target.value,
                              },
                            }))}
                          />
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="restaurant-settings-actions">
                <button
                  type="button"
                  className={`btn-dashboard small${rowSaved ? " success" : ""}`}
                  disabled={!canEdit || rowBusy || loading}
                  onClick={() => handleSaveCommissionSettings(store)}
                >
                  {savingStoreId === rowKey ? "A guardar..." : rowSaved ? "Guardado" : "Guardar configuracao"}
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </article>
  );
}

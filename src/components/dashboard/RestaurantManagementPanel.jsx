import { useEffect, useState } from "react";
import { sanitizeCommissionConfig } from "../../services/pricingService";
import { useAlert } from "../../context/AlertContext";
import {
  AUTO_ASSIGN_CRITERIA_OPTIONS,
  criteriaSummaryText,
  sanitizeAutoAssignConfig,
} from "../../services/autoAssignConfig";

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
  // comissao_pedeja_percent null = a loja nunca definiu comissao propria e
  // herda a da plataforma; comissao_pedeja_percent_efetiva (calculado no
  // servico) e o valor realmente aplicado (o proprio, ou o da plataforma).
  const hasOwnOverride = store?.comissao_pedeja_percent !== null && store?.comissao_pedeja_percent !== undefined;
  const effectivePercent = store?.comissao_pedeja_percent_efetiva ?? store?.comissao_pedeja_percent ?? 0;
  const config = sanitizeCommissionConfig(store?.configuracoes_comissao, effectivePercent);
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
    hasOwnOverride,
    globalPercent: formatCommissionDraft(config.global_percent ?? effectivePercent),
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
    // Sem override proprio -> grava null explicitamente para a loja voltar a
    // herdar a comissao base da plataforma.
    comissao_pedeja_percent: draft?.hasOwnOverride ? globalPercent : null,
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

function buildAutoAssignDraft(store) {
  return sanitizeAutoAssignConfig(
    store?.configuracao_auto_assign,
    Boolean(store?.atribuicao_automatica_estafeta),
  );
}

export default function RestaurantManagementPanel({
  title = "Gestao de Restaurantes",
  subtitle = "",
  stores = [],
  loading = false,
  error = "",
  canEdit = true,
  isAdmin = true,
  showCommissions = true,
  showCommissionSettings = true,
  showOperationalSettings = true,
  emptyText = "Sem restaurantes disponiveis.",
  toolbar = null,
  globalAutoAssignEnabled = false,
  globalAutoAssignLoading = false,
  globalAutoAssignConfig = null,
  platformCommissionPercent = 0,
  platformCommissionLoading = false,
  commissionCatalogByStore = {},
  catalogLoadingByStore = {},
  catalogErrorByStore = {},
  onToggleGlobalAutoAssign = null,
  onSaveGlobalAutoAssignSettings = null,
  onSaveGlobalCommissionSettings = null,
  onToggleAutoAccept,
  onToggleAutoAssign,
  onSaveAutoAssignConfig = null,
  onSaveCommissionSettings,
}) {
  const [commissionDrafts, setCommissionDrafts] = useState({});
  const [autoAssignDrafts, setAutoAssignDrafts] = useState({});
  const [globalAutoAssignDraft, setGlobalAutoAssignDraft] = useState(
    sanitizeAutoAssignConfig(globalAutoAssignConfig, Boolean(globalAutoAssignEnabled)),
  );
  const [globalCommissionDraft, setGlobalCommissionDraft] = useState(formatCommissionDraft(platformCommissionPercent));
  const [togglingStoreId, setTogglingStoreId] = useState("");
  const [savingStoreId, setSavingStoreId] = useState("");
  const [savingAutoAssignId, setSavingAutoAssignId] = useState("");
  const [savingGlobalCommission, setSavingGlobalCommission] = useState(false);
  const [savedStoreMap, setSavedStoreMap] = useState({});
  const [savedAutoAssignMap, setSavedAutoAssignMap] = useState({});
  const [savedGlobalAutoAssign, setSavedGlobalAutoAssign] = useState(false);
  const [savedGlobalCommission, setSavedGlobalCommission] = useState(false);
  const [feedback, setFeedback] = useState({ tone: "", message: "" });
  const { showError } = useAlert();
  useEffect(() => {
    if (feedback.tone === "error" && feedback.message) showError(feedback.message);
  }, [feedback, showError]);
  const commissionUiEnabled = Boolean(isAdmin && showCommissions && showCommissionSettings);
  const operationalUiEnabled = Boolean(showOperationalSettings);

  const scrollToStoreSection = (rowKey, section) => {
    document.getElementById(`restaurant-store-${rowKey}-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const allTabs = [
    { id: "global", label: "Global" },
    { id: "category", label: "Por Categoria" },
    { id: "item", label: "Por Prato" },
  ];
  const availableTabs = commissionUiEnabled ? allTabs : [];

  useEffect(() => {
    const nextDrafts = {};
    const nextAutoAssignDrafts = {};
    const allowedKeys = new Set();

    (stores || []).forEach((store) => {
      const key = String(store.idloja);
      allowedKeys.add(key);
      nextDrafts[key] = buildDraftFromStore(store, normalizeCatalog(commissionCatalogByStore[key]));
      nextAutoAssignDrafts[key] = buildAutoAssignDraft(store);
    });

    setCommissionDrafts(nextDrafts);
    setAutoAssignDrafts(nextAutoAssignDrafts);
    setSavedStoreMap((prev) => {
      const next = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (allowedKeys.has(key)) next[key] = value;
      });
      return next;
    });
    setSavedAutoAssignMap((prev) => {
      const next = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (allowedKeys.has(key)) next[key] = value;
      });
      return next;
    });
  }, [commissionCatalogByStore, stores]);

  useEffect(() => {
    setGlobalAutoAssignDraft(sanitizeAutoAssignConfig(globalAutoAssignConfig, Boolean(globalAutoAssignEnabled)));
  }, [globalAutoAssignConfig, globalAutoAssignEnabled]);

  useEffect(() => {
    setGlobalCommissionDraft(formatCommissionDraft(platformCommissionPercent));
  }, [platformCommissionPercent]);

  const markCommissionRowDirty = (rowKey) => {
    setSavedStoreMap((prev) => ({
      ...prev,
      [rowKey]: false,
    }));
  };

  const markAutoAssignRowDirty = (rowKey) => {
    setSavedAutoAssignMap((prev) => ({
      ...prev,
      [rowKey]: false,
    }));
  };

  const updateCommissionDraft = (rowKey, updater) => {
    setCommissionDrafts((prev) => ({
      ...prev,
      [rowKey]: updater(prev[rowKey] || buildDraftFromStore({}, { categories: [], items: [] })),
    }));
    markCommissionRowDirty(rowKey);
  };

  const updateAutoAssignDraft = (rowKey, updater) => {
    setAutoAssignDrafts((prev) => ({
      ...prev,
      [rowKey]: updater(prev[rowKey] || buildAutoAssignDraft({})),
    }));
    markAutoAssignRowDirty(rowKey);
  };

  const updateGlobalAutoAssignDraft = (updater) => {
    setGlobalAutoAssignDraft((prev) => updater(prev));
    setSavedGlobalAutoAssign(false);
  };

  const handleToggleSetting = async ({
    store,
    handler,
    nextValue,
    successMessage,
    errorMessage,
  }) => {
    if (!canEdit || !handler) return;

    setFeedback({ tone: "", message: "" });
    setTogglingStoreId(String(store.idloja));

    try {
      await handler(store, nextValue);
      setFeedback({
        tone: "success",
        message: successMessage,
      });
    } catch (toggleError) {
      setFeedback({
        tone: "error",
        message: toggleError?.message || errorMessage,
      });
    } finally {
      setTogglingStoreId("");
    }
  };

  // Uma so gravacao por loja (criterios de auto-atribuicao + comissao), em
  // vez de dois botoes separados que era facil mudar uma coisa e esquecer a
  // outra. So dispara os pedidos que esta loja realmente tem disponiveis.
  const handleSaveStoreSettings = async (store) => {
    if (!canEdit) return;

    const rowKey = String(store.idloja);
    const tasks = [];

    if (isAdmin && operationalUiEnabled && typeof onSaveAutoAssignConfig === "function") {
      const payload = autoAssignDrafts[rowKey] || buildAutoAssignDraft(store);
      tasks.push(onSaveAutoAssignConfig(store, payload));
    }

    if (commissionUiEnabled && typeof onSaveCommissionSettings === "function") {
      const catalog = normalizeCatalog(commissionCatalogByStore[rowKey]);
      const payload = buildCommissionPayload(commissionDrafts[rowKey], catalog);
      tasks.push(onSaveCommissionSettings(store, payload));
    }

    if (tasks.length === 0) return;

    setFeedback({ tone: "", message: "" });
    setSavingStoreId(rowKey);

    try {
      await Promise.all(tasks);
      setSavedStoreMap((prev) => ({ ...prev, [rowKey]: true }));
      setSavedAutoAssignMap((prev) => ({ ...prev, [rowKey]: true }));
      setFeedback({
        tone: "success",
        message: `Alteracoes guardadas para ${store.nome || `Loja ${store.idloja}`}.`,
      });
    } catch (saveError) {
      setSavedStoreMap((prev) => ({ ...prev, [rowKey]: false }));
      setSavedAutoAssignMap((prev) => ({ ...prev, [rowKey]: false }));
      setFeedback({
        tone: "error",
        message: saveError?.message || "Nao foi possivel guardar as alteracoes desta loja.",
      });
    } finally {
      setSavingStoreId("");
    }
  };

  const handleSaveGlobalAutoAssign = async () => {
    if (!canEdit || !isAdmin || !onSaveGlobalAutoAssignSettings) return;

    setFeedback({ tone: "", message: "" });
    setSavingAutoAssignId("global");

    try {
      await onSaveGlobalAutoAssignSettings(globalAutoAssignDraft);
      setSavedGlobalAutoAssign(true);
      setFeedback({
        tone: "success",
        message: "Criterios globais de atribuicao automatica atualizados.",
      });
    } catch (saveError) {
      setSavedGlobalAutoAssign(false);
      setFeedback({
        tone: "error",
        message: saveError?.message || "Nao foi possivel guardar os criterios globais de atribuicao automatica.",
      });
    } finally {
      setSavingAutoAssignId("");
    }
  };

  const handleSaveGlobalCommission = async () => {
    if (!canEdit || !isAdmin || !onSaveGlobalCommissionSettings) return;

    setFeedback({ tone: "", message: "" });
    setSavingGlobalCommission(true);

    try {
      const parsedPercent = parseCommissionValue(globalCommissionDraft);
      await onSaveGlobalCommissionSettings(parsedPercent);
      setSavedGlobalCommission(true);
      setFeedback({
        tone: "success",
        message: "Comissao base da plataforma atualizada.",
      });
    } catch (saveError) {
      setSavedGlobalCommission(false);
      setFeedback({
        tone: "error",
        message: saveError?.message || "Nao foi possivel guardar a comissao base da plataforma.",
      });
    } finally {
      setSavingGlobalCommission(false);
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

      {isAdmin && typeof onToggleGlobalAutoAssign === "function" ? (
        <section className="restaurant-settings-card restaurant-settings-card--global">
          <div className="restaurant-settings-card-top">
            <div>
              <p className="kicker">Configuracao da plataforma · afeta todas as lojas</p>
              <h4>Atribuicao automatica geral</h4>
              <p className="muted">
                Quando ligada, todas as lojas passam a atribuir estafeta automaticamente.
              </p>
            </div>
            <span className={`tag ${globalAutoAssignEnabled ? "ok" : "warn"}`}>
              {globalAutoAssignEnabled ? "Global ativa" : "Por loja"}
            </span>
          </div>

          <div className="restaurant-settings-controls">
            <div className="restaurant-setting-field">
              <span className="restaurant-setting-label">Modo geral da plataforma</span>
              <label className={`dashboard-switch${!canEdit ? " is-disabled" : ""}`}>
                <input
                  type="checkbox"
                  checked={Boolean(globalAutoAssignEnabled)}
                  disabled={!canEdit || globalAutoAssignLoading || loading}
                  onChange={() => handleToggleSetting({
                    store: { idloja: "global", nome: "plataforma" },
                    handler: (_, nextValue) => onToggleGlobalAutoAssign(nextValue),
                    nextValue: !globalAutoAssignEnabled,
                    successMessage: globalAutoAssignEnabled
                      ? "A atribuicao automatica geral foi desligada."
                      : "A atribuicao automatica geral foi ligada para todas as lojas.",
                    errorMessage: "Nao foi possivel atualizar a atribuicao automatica geral.",
                  })}
                />
                <span className="dashboard-switch-track">
                  <span className="dashboard-switch-thumb" />
                </span>
                <span className="dashboard-switch-text">
                  {globalAutoAssignEnabled ? "Ligada para todas" : "Desligada"}
                </span>
              </label>
            </div>
          </div>

          {typeof onSaveGlobalAutoAssignSettings === "function" ? (
            <div className="commission-editor-card">
              <div className="commission-editor-header">
                <h5>Criterios do modo geral</h5>
                <p className="muted">
                  Combina um ou varios criterios para decidir automaticamente qual o melhor estafeta.
                </p>
              </div>

              <div className="auto-assign-criteria-grid">
                {AUTO_ASSIGN_CRITERIA_OPTIONS.map((option) => (
                  <label key={option.key} className="auto-assign-criteria-option">
                    <input
                      type="checkbox"
                      checked={Boolean(globalAutoAssignDraft?.criteria?.[option.key])}
                      disabled={!canEdit || loading || globalAutoAssignLoading}
                      onChange={(event) => updateGlobalAutoAssignDraft((prev) => ({
                        ...prev,
                        enabled: Boolean(globalAutoAssignEnabled),
                        criteria: {
                          ...(prev?.criteria || {}),
                          [option.key]: event.target.checked,
                        },
                      }))}
                    />
                    <div>
                      <strong>{option.label}</strong>
                      <p className="muted">{option.hint}</p>
                    </div>
                  </label>
                ))}
              </div>

              <p className="muted commission-helper-text">
                Prioridade atual: {criteriaSummaryText(globalAutoAssignDraft?.criteria)}
              </p>

              <div className="restaurant-settings-actions">
                <button
                  type="button"
                  className={`btn-dashboard${savedGlobalAutoAssign ? " success" : ""}`}
                  disabled={!canEdit || loading || globalAutoAssignLoading || savingAutoAssignId === "global"}
                  onClick={handleSaveGlobalAutoAssign}
                >
                  {savingAutoAssignId === "global" ? "A guardar..." : savedGlobalAutoAssign ? "Guardado" : "Guardar criterios globais"}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {isAdmin && commissionUiEnabled && typeof onSaveGlobalCommissionSettings === "function" ? (
        <section className="restaurant-settings-card restaurant-settings-card--global">
          <div className="restaurant-settings-card-top">
            <div>
              <p className="kicker">Configuracao da plataforma · afeta todas as lojas</p>
              <h4>Comissao base da plataforma</h4>
              <p className="muted">
                Aplica-se a qualquer loja que ainda nao tenha uma comissao propria definida.
                Lojas com override proprio (por loja, categoria ou prato) nao sao afetadas.
              </p>
            </div>
          </div>

          <div className="restaurant-settings-controls">
            <div className="restaurant-setting-field">
              <span className="restaurant-setting-label">Comissao base (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                className="dashboard-number-input"
                value={globalCommissionDraft}
                disabled={!canEdit || loading || platformCommissionLoading}
                onChange={(event) => {
                  setGlobalCommissionDraft(event.target.value);
                  setSavedGlobalCommission(false);
                }}
              />
            </div>
          </div>

          <div className="restaurant-settings-actions">
            <button
              type="button"
              className={`btn-dashboard${savedGlobalCommission ? " success" : ""}`}
              disabled={!canEdit || loading || platformCommissionLoading || savingGlobalCommission}
              onClick={handleSaveGlobalCommission}
            >
              {savingGlobalCommission ? "A guardar..." : savedGlobalCommission ? "Guardado" : "Guardar comissao base"}
            </button>
          </div>
        </section>
      ) : null}

      {(stores || []).length === 0 && !loading ? (
        <p className="muted">{emptyText}</p>
      ) : null}

      <div className="restaurant-settings-list">
        {(stores || []).map((store) => {
          const rowKey = String(store.idloja);
          const rowBusy = togglingStoreId === rowKey || savingStoreId === rowKey || savingAutoAssignId === rowKey;
          const rowSaved = savedStoreMap[rowKey] === true;
          const rowAutoAssignSaved = savedAutoAssignMap[rowKey] === true;
          const catalog = normalizeCatalog(commissionCatalogByStore[rowKey]);
          const draft = commissionDrafts[rowKey] || buildDraftFromStore(store, catalog);
          const autoAssignDraft = autoAssignDrafts[rowKey] || buildAutoAssignDraft(store);
          const catalogLoading = Boolean(catalogLoadingByStore[rowKey]);
          const catalogError = catalogErrorByStore[rowKey] || "";
          const autoAssignSummary = criteriaSummaryText(autoAssignDraft?.criteria);

          return (
            <section key={rowKey} className="restaurant-settings-card">
              <div className="restaurant-settings-card-top">
                <div>
                  <h4>{store.nome || `Loja ${store.idloja}`}</h4>
                  <p className="muted">#{store.idloja}</p>
                </div>
                <div className="restaurant-settings-card-status">
                  {globalAutoAssignEnabled ? <span className="tag warn">Auto-assign geral</span> : null}
                  <span className={`tag ${store.ativo ? "ok" : "bad"}`}>
                    {store.ativo ? "Ativa" : "Inativa"}
                  </span>
                </div>
              </div>

              {operationalUiEnabled || commissionUiEnabled ? (
                <nav className="restaurant-card-jump-nav" aria-label={`Saltar para seccao da loja ${store.nome || store.idloja}`}>
                  <span className="restaurant-card-jump-label">Ir para:</span>
                  {operationalUiEnabled ? (
                    <button type="button" className="restaurant-card-jump-link" onClick={() => scrollToStoreSection(rowKey, "operacional")}>
                      <span className="material-icons" aria-hidden="true">arrow_downward</span>
                      Operacional
                    </button>
                  ) : null}
                  {isAdmin && operationalUiEnabled && typeof onSaveAutoAssignConfig === "function" ? (
                    <button type="button" className="restaurant-card-jump-link" onClick={() => scrollToStoreSection(rowKey, "auto-assign")}>
                      <span className="material-icons" aria-hidden="true">arrow_downward</span>
                      Auto-atribuicao
                    </button>
                  ) : null}
                  {commissionUiEnabled ? (
                    <button type="button" className="restaurant-card-jump-link" onClick={() => scrollToStoreSection(rowKey, "comissao")}>
                      <span className="material-icons" aria-hidden="true">arrow_downward</span>
                      Comissao
                    </button>
                  ) : null}
                </nav>
              ) : null}

              {operationalUiEnabled ? (
                <div id={`restaurant-store-${rowKey}-operacional`} className="restaurant-settings-controls">
                  <div className="restaurant-setting-field">
                    <span className="restaurant-setting-label">Aceitacao automatica</span>
                    <label className={`dashboard-switch${!canEdit ? " is-disabled" : ""}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(store.aceitacao_automatica_pedidos)}
                        disabled={!canEdit || rowBusy || loading}
                        onChange={() => handleToggleSetting({
                          store,
                          handler: onToggleAutoAccept,
                          nextValue: !store.aceitacao_automatica_pedidos,
                          successMessage: `Aceitacao automatica atualizada para ${store.nome || `Loja ${store.idloja}`}.`,
                          errorMessage: "Nao foi possivel atualizar a aceitacao automatica.",
                        })}
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
                    <span className="restaurant-setting-label">Atribuicao automatica</span>
                    <label className={`dashboard-switch${!canEdit ? " is-disabled" : ""}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(globalAutoAssignEnabled || store.atribuicao_automatica_estafeta)}
                        disabled={!canEdit || rowBusy || loading || globalAutoAssignEnabled}
                        onChange={() => handleToggleSetting({
                          store,
                          handler: onToggleAutoAssign,
                          nextValue: !store.atribuicao_automatica_estafeta,
                          successMessage: `Atribuicao automatica atualizada para ${store.nome || `Loja ${store.idloja}`}.`,
                          errorMessage: "Nao foi possivel atualizar a atribuicao automatica.",
                        })}
                      />
                      <span className="dashboard-switch-track">
                        <span className="dashboard-switch-thumb" />
                      </span>
                      <span className="dashboard-switch-text">
                        {globalAutoAssignEnabled ? "Geral" : (store.atribuicao_automatica_estafeta ? "Ligada" : "Manual")}
                      </span>
                    </label>
                  </div>

                  {commissionUiEnabled ? (
                    <div className="restaurant-setting-field">
                      <span className="restaurant-setting-label">Comissao propria desta loja</span>
                      <label className={`dashboard-switch${!canEdit ? " is-disabled" : ""}`}>
                        <input
                          type="checkbox"
                          checked={Boolean(draft.hasOwnOverride)}
                          disabled={!canEdit || rowBusy || loading}
                          onChange={() => updateCommissionDraft(rowKey, (prev) => ({
                            ...prev,
                            hasOwnOverride: !prev.hasOwnOverride,
                          }))}
                        />
                        <span className="dashboard-switch-track">
                          <span className="dashboard-switch-thumb" />
                        </span>
                        <span className="dashboard-switch-text">
                          {draft.hasOwnOverride
                            ? "Valor proprio"
                            : `A usar ${formatCommissionDraft(platformCommissionPercent)}% da plataforma`}
                        </span>
                      </label>
                    </div>
                  ) : null}

                  {commissionUiEnabled ? (
                    <div className="restaurant-setting-field">
                      <span className="restaurant-setting-label">Comissao global (%)</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        className="dashboard-number-input"
                        value={draft.globalPercent}
                        disabled={!canEdit || rowBusy || loading || !draft.hasOwnOverride}
                        onChange={(event) => updateCommissionDraft(rowKey, (prev) => ({
                          ...prev,
                          globalPercent: event.target.value,
                        }))}
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="restaurant-settings-controls">
                  <div className="restaurant-setting-readonly">
                    <span className="restaurant-setting-label">Aceitacao automatica</span>
                    <span className={`tag ${store.aceitacao_automatica_pedidos ? "ok" : "warn"}`}>
                      {store.aceitacao_automatica_pedidos ? "Ativada" : "Manual"}
                    </span>
                  </div>
                  <div className="restaurant-setting-readonly">
                    <span className="restaurant-setting-label">Atribuicao automatica</span>
                    <span className={`tag ${(globalAutoAssignEnabled || store.atribuicao_automatica_estafeta) ? "ok" : "warn"}`}>
                      {globalAutoAssignEnabled ? "Geral" : (store.atribuicao_automatica_estafeta ? "Ligada" : "Manual")}
                    </span>
                  </div>
                </div>
              )}

              {isAdmin && operationalUiEnabled && typeof onSaveAutoAssignConfig === "function" ? (
                <div id={`restaurant-store-${rowKey}-auto-assign`} className="commission-editor-card">
                  <div className="commission-editor-header">
                    <h5>Criterios por loja</h5>
                    <p className="muted">
                      {globalAutoAssignEnabled
                        ? "O modo geral esta ativo. Estes criterios ficam guardados para quando a loja voltar ao modo individual."
                        : "Escolhe um ou varios criterios para o auto-assign desta loja."}
                    </p>
                  </div>

                  <div className="auto-assign-criteria-grid">
                    {AUTO_ASSIGN_CRITERIA_OPTIONS.map((option) => (
                      <label key={option.key} className="auto-assign-criteria-option">
                        <input
                          type="checkbox"
                          checked={Boolean(autoAssignDraft?.criteria?.[option.key])}
                          disabled={!canEdit || rowBusy || loading}
                          onChange={(event) => updateAutoAssignDraft(rowKey, (prev) => ({
                            ...prev,
                            enabled: Boolean(store?.atribuicao_automatica_estafeta),
                            criteria: {
                              ...(prev?.criteria || {}),
                              [option.key]: event.target.checked,
                            },
                          }))}
                        />
                        <div>
                          <strong>{option.label}</strong>
                          <p className="muted">{option.hint}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  <p className="muted commission-helper-text">
                    Prioridade atual: {autoAssignSummary}
                  </p>
                </div>
              ) : null}

              {commissionUiEnabled ? (
                <>
                  <div id={`restaurant-store-${rowKey}-comissao`} className="commission-mode-tabs" role="tablist" aria-label={`Modo de comissao da loja ${store.nome || store.idloja}`}>
                    {availableTabs.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        className={`commission-mode-btn${draft.mode === mode.id ? " is-active" : ""}`}
                        disabled={!canEdit || rowBusy || loading}
                        onClick={() => updateCommissionDraft(rowKey, (prev) => ({
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
                                onChange={(event) => updateCommissionDraft(rowKey, (prev) => ({
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
                                onChange={(event) => updateCommissionDraft(rowKey, (prev) => ({
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
                </>
              ) : null}

              {(isAdmin && operationalUiEnabled && typeof onSaveAutoAssignConfig === "function") || commissionUiEnabled ? (
                <div className="restaurant-settings-actions">
                  <button
                    type="button"
                    className={`btn-dashboard${rowSaved && rowAutoAssignSaved ? " success" : ""}`}
                    disabled={!canEdit || rowBusy || loading}
                    onClick={() => handleSaveStoreSettings(store)}
                  >
                    {savingStoreId === rowKey
                      ? "A guardar..."
                      : (rowSaved && rowAutoAssignSaved ? "Guardado" : "Guardar alteracoes desta loja")}
                  </button>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </article>
  );
}

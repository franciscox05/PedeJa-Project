import { useEffect, useState } from "react";
import DatePickerCustom from "../ui/DatePickerCustom";
import {
  formatScheduleExceptionLabel,
  formatScheduleLabel,
  sanitizeScheduleWithExceptions,
} from "../../utils/storeHours";

function createEmptyException() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: `exception-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "closed",
    label: "",
    startDate: today,
    endDate: today,
    open: "12:00",
    close: "18:00",
  };
}

function buildDraft(store) {
  const sanitized = sanitizeScheduleWithExceptions(store?.horario_funcionamento);
  return {
    weeklyLabel: sanitized ? formatScheduleLabel(sanitized) : "Horario nao definido",
    exceptions: Array.isArray(sanitized?.exceptions) ? sanitized.exceptions : [],
  };
}

function validateDraft(draft) {
  const exceptions = Array.isArray(draft?.exceptions) ? draft.exceptions : [];

  for (const exception of exceptions) {
    if (!String(exception.startDate || "").trim()) {
      return "Cada excecao precisa de data inicial.";
    }

    if (!String(exception.endDate || "").trim()) {
      return "Cada excecao precisa de data final.";
    }

    if (String(exception.endDate) < String(exception.startDate)) {
      return "A data final nao pode ser anterior a data inicial.";
    }

    if (String(exception.type) === "custom_hours") {
      if (!String(exception.open || "").trim() || !String(exception.close || "").trim()) {
        return "Os horarios especiais precisam de hora de abertura e fecho.";
      }

      if (String(exception.open) === String(exception.close)) {
        return "No horario especial, a abertura e o fecho nao podem ser iguais.";
      }
    }
  }

  return "";
}

export default function StoreSpecialHoursPanel({
  stores = [],
  loading = false,
  canEdit = true,
  onSaveScheduleSettings,
}) {
  const [drafts, setDrafts] = useState({});
  const [savingStoreId, setSavingStoreId] = useState("");
  const [savedStoreMap, setSavedStoreMap] = useState({});
  const [feedback, setFeedback] = useState({ tone: "", message: "" });

  useEffect(() => {
    const nextDrafts = {};
    const nextSaved = {};

    (stores || []).forEach((store) => {
      const key = String(store.idloja);
      nextDrafts[key] = buildDraft(store);
      nextSaved[key] = false;
    });

    setDrafts(nextDrafts);
    setSavedStoreMap(nextSaved);
  }, [stores]);

  const markDirty = (rowKey) => {
    setSavedStoreMap((prev) => ({ ...prev, [rowKey]: false }));
  };

  const updateDraft = (rowKey, updater) => {
    setDrafts((prev) => ({
      ...prev,
      [rowKey]: typeof updater === "function" ? updater(prev[rowKey] || buildDraft({})) : updater,
    }));
    markDirty(rowKey);
  };

  const addException = (rowKey) => {
    updateDraft(rowKey, (prev) => ({
      ...prev,
      exceptions: [...(prev?.exceptions || []), createEmptyException()],
    }));
  };

  const updateException = (rowKey, exceptionId, patch) => {
    updateDraft(rowKey, (prev) => ({
      ...prev,
      exceptions: (prev?.exceptions || []).map((exception) => (
        exception.id === exceptionId ? { ...exception, ...patch } : exception
      )),
    }));
  };

  const removeException = (rowKey, exceptionId) => {
    updateDraft(rowKey, (prev) => ({
      ...prev,
      exceptions: (prev?.exceptions || []).filter((exception) => exception.id !== exceptionId),
    }));
  };

  const handleSave = async (store) => {
    if (!canEdit || !onSaveScheduleSettings) return;

    const rowKey = String(store.idloja);
    const draft = drafts[rowKey] || buildDraft(store);
    const validationError = validateDraft(draft);

    if (validationError) {
      setFeedback({ tone: "error", message: validationError });
      return;
    }

    const currentSchedule = sanitizeScheduleWithExceptions(store?.horario_funcionamento);
    const nextSchedule = sanitizeScheduleWithExceptions({
      ...(currentSchedule || {
        timezone: "Europe/Lisbon",
        weekly: [],
      }),
      exceptions: draft.exceptions,
    });

    if (!nextSchedule) {
      setFeedback({ tone: "error", message: "Nao foi possivel preparar o horario especial da loja." });
      return;
    }

    setSavingStoreId(rowKey);
    setFeedback({ tone: "", message: "" });

    try {
      await onSaveScheduleSettings(store, nextSchedule);
      setSavedStoreMap((prev) => ({ ...prev, [rowKey]: true }));
      setFeedback({
        tone: "success",
        message: `Horarios especiais atualizados para ${store.nome || `Loja ${store.idloja}`}.`,
      });
    } catch (error) {
      setSavedStoreMap((prev) => ({ ...prev, [rowKey]: false }));
      setFeedback({
        tone: "error",
        message: error?.message || "Nao foi possivel guardar os horarios especiais.",
      });
    } finally {
      setSavingStoreId("");
    }
  };

  return (
    <article className="panel restaurant-settings-panel">
      <div className="restaurant-settings-header">
        <div>
          <h3>Horarios especiais</h3>
          <p className="muted">Define ferias, folgas excecionais ou aberturas especiais sem mexer no horario semanal base.</p>
        </div>
      </div>

      {feedback.message ? (
        <p className={feedback.tone === "error" ? "shipday-inline-error" : "shipday-inline-success"}>
          {feedback.message}
        </p>
      ) : null}

      <div className="restaurant-settings-list">
        {(stores || []).map((store) => {
          const rowKey = String(store.idloja);
          const draft = drafts[rowKey] || buildDraft(store);
          const rowSaved = savedStoreMap[rowKey] === true;

          return (
            <section key={rowKey} className="restaurant-settings-card">
              <div className="restaurant-settings-card-top">
                <div>
                  <h4>{store.nome || `Loja ${store.idloja}`}</h4>
                  <p className="muted">Horario base: {draft.weeklyLabel}</p>
                </div>
                <button
                  type="button"
                  className={`btn-dashboard small${rowSaved ? " success" : ""}`}
                  disabled={!canEdit || loading || savingStoreId === rowKey}
                  onClick={() => handleSave(store)}
                >
                  {savingStoreId === rowKey ? "A guardar..." : rowSaved ? "Guardado" : "Guardar horarios especiais"}
                </button>
              </div>

              {(draft.exceptions || []).length === 0 ? (
                <p className="muted">Sem ferias ou folgas excecionais configuradas.</p>
              ) : (
                <div className="special-hours-list">
                  {(draft.exceptions || []).map((exception) => (
                    <div key={exception.id} className="special-hours-card">
                      <div className="special-hours-grid">
                        <label>
                          <span className="muted">Motivo</span>
                          <input
                            type="text"
                            placeholder="Ex: Ferias, folga, evento privado"
                            value={exception.label || ""}
                            disabled={!canEdit || loading}
                            onChange={(event) => updateException(rowKey, exception.id, { label: event.target.value })}
                          />
                        </label>

                        <label>
                          <span className="muted">Tipo</span>
                          <select
                            value={exception.type}
                            disabled={!canEdit || loading}
                            onChange={(event) => updateException(rowKey, exception.id, { type: event.target.value })}
                          >
                            <option value="closed">Encerrado</option>
                            <option value="custom_hours">Horario especial</option>
                          </select>
                        </label>

                        <label>
                          <span className="muted">Data inicial</span>
                          <DatePickerCustom
                            mode="date"
                            placeholder="Selecionar data"
                            value={exception.startDate || ""}
                            disabled={!canEdit || loading}
                            onChange={(value) => updateException(rowKey, exception.id, { startDate: value })}
                          />
                        </label>

                        <label>
                          <span className="muted">Data final</span>
                          <DatePickerCustom
                            mode="date"
                            placeholder="Selecionar data"
                            value={exception.endDate || ""}
                            disabled={!canEdit || loading}
                            min={exception.startDate || null}
                            onChange={(value) => updateException(rowKey, exception.id, { endDate: value })}
                          />
                        </label>

                        {exception.type === "custom_hours" ? (
                          <>
                            <label>
                              <span className="muted">Abre</span>
                              <input
                                type="time"
                                value={exception.open || ""}
                                disabled={!canEdit || loading}
                                onChange={(event) => updateException(rowKey, exception.id, { open: event.target.value })}
                              />
                            </label>

                            <label>
                              <span className="muted">Fecha</span>
                              <input
                                type="time"
                                value={exception.close || ""}
                                disabled={!canEdit || loading}
                                onChange={(event) => updateException(rowKey, exception.id, { close: event.target.value })}
                              />
                            </label>
                          </>
                        ) : null}
                      </div>

                      <div className="special-hours-footer">
                        <p className="muted">{formatScheduleExceptionLabel(exception)}</p>
                        <button
                          type="button"
                          className="btn-dashboard small secondary"
                          disabled={!canEdit || loading}
                          onClick={() => removeException(rowKey, exception.id)}
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="restaurant-settings-actions" style={{ justifyContent: "flex-start" }}>
                <button
                  type="button"
                  className="btn-dashboard secondary small"
                  disabled={!canEdit || loading}
                  onClick={() => addException(rowKey)}
                >
                  Adicionar ferias / excecao
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </article>
  );
}

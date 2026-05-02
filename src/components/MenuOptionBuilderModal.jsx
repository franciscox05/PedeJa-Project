import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  createMenuOptionGroupForMenu,
  deleteMenuOptionLibraryGroup,
  duplicateMenuOptionLibraryGroup,
  fetchMenuOptionGroupsByMenu,
  reorderMenuOptionGroupsByMenu,
  unlinkMenuOptionLibraryGroupFromMenu,
  updateMenuOptionLibraryGroup,
} from "../services/menuManagerService";
import { describeMenuOptionSelectionMode } from "../services/menuOptionsService";
import "../css/components/MenuOptionBuilderModal.css";

const formatCurrency = (value) => `${Number(value || 0).toFixed(2)}EUR`;
const normalizeNumericId = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};
const createDraftOption = (index = 0) => ({
  id: `draft-option-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
  name: "",
  price_modifier: "0",
  dependsOnOptionIds: [],
});

const createEmptyDraftGroup = () => ({
  name: "",
  is_required: false,
  min_choices: 0,
  max_choices: 1,
  dependsOnOptionIds: [],
  options: [createDraftOption(0)],
});

const getGroupKey = (group) => String(group?.library_group_id || group?.id || "");

function normalizeGroupToDraft(group = null) {
  if (!group) return createEmptyDraftGroup();

  const maxChoices = Math.max(1, Number(group?.maxSelections ?? group?.max_selecoes ?? group?.max_choices ?? 1) || 1);
  const required = Boolean(group?.required ?? group?.obrigatorio ?? group?.is_required);
  const minFromGroup = Number(group?.minSelections ?? group?.min_selecoes ?? group?.min_choices ?? (required ? 1 : 0));
  const safeMin = Number.isFinite(minFromGroup) ? Math.max(0, Math.min(maxChoices, Math.trunc(minFromGroup))) : (required ? 1 : 0);
  const mappedOptions = Array.isArray(group?.options) && group.options.length > 0
    ? group.options.map((option, index) => ({
      id: option?.id || createDraftOption(index).id,
      name: String(option?.name || option?.nome || "").trim(),
      price_modifier: String(option?.price ?? option?.preco ?? 0),
      dependsOnOptionIds: Array.isArray(option?.dependsOnOptionIds)
        ? option.dependsOnOptionIds.map((entry) => String(entry))
        : Array.isArray(option?.depends_on_option_ids)
          ? option.depends_on_option_ids.map((entry) => String(entry))
          : [],
    }))
    : [createDraftOption(0)];

  const explicitGroupDependencies = Array.isArray(group?.dependsOnOptionIds)
    ? group.dependsOnOptionIds.map((entry) => String(entry))
    : Array.isArray(group?.depends_on_option_ids)
      ? group.depends_on_option_ids.map((entry) => String(entry))
      : [];

  // Compatibilidade: se o schema antigo nao tiver dependencias ao nivel do grupo,
  // deduz o grupo pelo conjunto comum presente nas opcoes.
  const inferredGroupDependencies = mappedOptions.reduce((acc, option, index) => {
    const optionDependencies = Array.isArray(option?.dependsOnOptionIds)
      ? option.dependsOnOptionIds
      : [];
    if (index === 0) return optionDependencies;
    return acc.filter((entry) => optionDependencies.includes(entry));
  }, []);
  const groupDependencies = [...new Set(
    (explicitGroupDependencies.length > 0 ? explicitGroupDependencies : inferredGroupDependencies)
      .map((entry) => String(entry || ""))
      .filter(Boolean),
  )];

  return {
    name: String(group?.title || group?.titulo || group?.name || "").trim(),
    is_required: required,
    min_choices: required ? Math.max(1, safeMin) : safeMin,
    max_choices: maxChoices,
    dependsOnOptionIds: groupDependencies,
    options: mappedOptions,
  };
}

function normalizeDraftPayload(draft) {
  const maxChoices = Math.max(1, Number(draft?.max_choices) || 1);
  const required = Boolean(draft?.is_required);
  const minChoicesRaw = Number(draft?.min_choices);
  const minChoicesSafe = Number.isFinite(minChoicesRaw)
    ? Math.max(0, Math.min(maxChoices, Math.trunc(minChoicesRaw)))
    : (required ? 1 : 0);
  const minChoices = required ? Math.max(1, minChoicesSafe) : minChoicesSafe;
  const groupDependsOnOptionIds = [...new Set(
    (Array.isArray(draft?.dependsOnOptionIds) ? draft.dependsOnOptionIds : [])
      .map((entry) => normalizeNumericId(entry))
      .filter((entry) => Number.isFinite(entry)),
  )];

  return {
    title: String(draft?.name || "").trim(),
    type: "extra",
    required,
    minSelections: minChoices,
    maxSelections: maxChoices,
    dependsOnOptionIds: groupDependsOnOptionIds,
    options: (Array.isArray(draft?.options) ? draft.options : [])
      .map((option) => ({
        id: normalizeNumericId(option?.id),
        name: String(option?.name || "").trim(),
        price: Number(String(option?.price_modifier ?? "0").replace(",", ".")),
        dependsOnOptionIds: [...new Set(
          [
            ...groupDependsOnOptionIds,
            ...(Array.isArray(option?.dependsOnOptionIds) ? option.dependsOnOptionIds : []),
          ]
            .map((entry) => normalizeNumericId(entry))
            .filter((entry) => Number.isFinite(entry)),
        )],
      }))
      .filter((option) => option.name),
  };
}

function validateDraftGroup(draft) {
  const name = String(draft?.name || "").trim();
  const maxChoices = Number(draft?.max_choices);
  const minChoices = Number(draft?.min_choices);
  const required = Boolean(draft?.is_required);
  const options = Array.isArray(draft?.options) ? draft.options : [];

  if (name.length < 2) return "O grupo precisa de nome com pelo menos 2 caracteres.";
  if (!Number.isFinite(maxChoices) || maxChoices < 1) return "Define um maximo de escolhas valido (>= 1).";
  if (!Number.isFinite(minChoices) || minChoices < 0) return "Define um minimo de escolhas valido (>= 0).";
  if (required && minChoices < 1) return "Se o grupo e obrigatorio, o minimo tem de ser pelo menos 1.";
  if (minChoices > maxChoices) return "O minimo nao pode ser superior ao maximo.";

  const validOptions = options.filter((option) => String(option?.name || "").trim());
  if (validOptions.length === 0) return "Adiciona pelo menos uma opcao ao grupo.";

  const hasInvalidPrice = validOptions.some((option) => {
    const value = Number(String(option?.price_modifier ?? "0").replace(",", "."));
    return !Number.isFinite(value) || value < 0;
  });
  if (hasInvalidPrice) return "Todas as opcoes precisam de um preco valido (>= 0).";

  return "";
}

export default function MenuOptionBuilderModal({
  isOpen,
  lojaId,
  menuItem,
  onClose,
  onSaved,
}) {
  const menuId = useMemo(() => Number(menuItem?.idmenu), [menuItem?.idmenu]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [draft, setDraft] = useState(createEmptyDraftGroup());
  const [orderingInProgress, setOrderingInProgress] = useState(false);
  const [groupOrderDraft, setGroupOrderDraft] = useState([]);
  const [groupOrderDirty, setGroupOrderDirty] = useState(false);

  const orderedGroups = useMemo(() => {
    const source = Array.isArray(groups) ? groups : [];
    if (!Array.isArray(groupOrderDraft) || groupOrderDraft.length === 0) return source;

    const byId = new Map(source.map((group) => [getGroupKey(group), group]));
    const ordered = groupOrderDraft
      .map((groupId) => byId.get(String(groupId)))
      .filter(Boolean);
    const leftovers = source.filter((group) => !groupOrderDraft.includes(getGroupKey(group)));
    return [...ordered, ...leftovers];
  }, [groupOrderDraft, groups]);

  const editableGroupPosition = useMemo(() => {
    if (!editingGroupId) return -1;
    return orderedGroups.findIndex(
      (group) => String(group?.library_group_id || group?.id || "") === String(editingGroupId),
    );
  }, [editingGroupId, orderedGroups]);

  const dependencySourceGroups = useMemo(() => orderedGroups.filter((group, index) => {
    const groupId = String(group?.library_group_id || group?.id || "");
    if (editingGroupId && groupId === String(editingGroupId)) return false;
    if (editableGroupPosition >= 0) return index < editableGroupPosition;
    return true;
  }), [editableGroupPosition, editingGroupId, orderedGroups]);

  const dependencySourceOptionIds = useMemo(() => new Set(
    dependencySourceGroups.flatMap((group) => (group?.options || []))
      .map((option) => String(option?.id || ""))
      .filter(Boolean),
  ), [dependencySourceGroups]);

  const loadGroups = useCallback(async () => {
    if (!isOpen || !lojaId || !Number.isFinite(menuId)) {
      setGroups([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await fetchMenuOptionGroupsByMenu(lojaId, menuId);
      const nextGroups = Array.isArray(result) ? result : [];
      setGroups(nextGroups);
      setGroupOrderDraft(nextGroups.map((group) => getGroupKey(group)).filter(Boolean));
      setGroupOrderDirty(false);
    } catch (err) {
      setError(err?.message || "Falha ao carregar os modificadores do prato.");
      setGroups([]);
      setGroupOrderDraft([]);
      setGroupOrderDirty(false);
    } finally {
      setLoading(false);
    }
  }, [isOpen, lojaId, menuId]);

  const resetDraft = useCallback(() => {
    setEditingGroupId(null);
    setDraft(createEmptyDraftGroup());
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    loadGroups();
    resetDraft();
  }, [isOpen, loadGroups, resetDraft]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    setDraft((prev) => {
      let changed = false;
      const options = (prev.options || []).map((option) => {
        const nextDependencies = [...new Set(
          (Array.isArray(option?.dependsOnOptionIds) ? option.dependsOnOptionIds : [])
            .map((entry) => String(entry))
            .filter((entry) => dependencySourceOptionIds.has(entry)),
        )];

        if (nextDependencies.length !== (Array.isArray(option?.dependsOnOptionIds) ? option.dependsOnOptionIds.length : 0)) {
          changed = true;
          return {
            ...option,
            dependsOnOptionIds: nextDependencies,
          };
        }
        return option;
      });

      const nextGroupDependencies = [...new Set(
        (Array.isArray(prev?.dependsOnOptionIds) ? prev.dependsOnOptionIds : [])
          .map((entry) => String(entry))
          .filter((entry) => dependencySourceOptionIds.has(entry)),
      )];
      const currentGroupDependencies = Array.isArray(prev?.dependsOnOptionIds)
        ? prev.dependsOnOptionIds.map(String)
        : [];

      if (nextGroupDependencies.length !== currentGroupDependencies.length) {
        changed = true;
      }

      return changed
        ? { ...prev, options, dependsOnOptionIds: nextGroupDependencies }
        : prev;
    });
  }, [dependencySourceOptionIds, isOpen]);

  const patchDraft = (patch) => setDraft((prev) => ({ ...prev, ...patch }));

  const addOption = () => setDraft((prev) => ({
    ...prev,
    options: [...prev.options, createDraftOption(prev.options.length)],
  }));

  const updateOption = (optionId, patch) => setDraft((prev) => ({
    ...prev,
    options: prev.options.map((option) => (option.id === optionId ? { ...option, ...patch } : option)),
  }));

  const removeOption = (optionId) => setDraft((prev) => {
    const next = prev.options.filter((option) => option.id !== optionId);
    return { ...prev, options: next.length > 0 ? next : [createDraftOption(0)] };
  });

  const moveOption = (optionId, direction) => {
    setDraft((prev) => {
      const options = Array.isArray(prev.options) ? [...prev.options] : [];
      const currentIndex = options.findIndex((option) => option.id === optionId);
      if (currentIndex < 0) return prev;

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= options.length) return prev;

      [options[currentIndex], options[targetIndex]] = [options[targetIndex], options[currentIndex]];
      return { ...prev, options };
    });
  };

  const toggleOptionDependency = (optionId, dependencyOptionId) => {
    const dependencyKey = String(dependencyOptionId || "");
    if (!dependencyKey || !dependencySourceOptionIds.has(dependencyKey)) return;

    setDraft((prev) => ({
      ...prev,
      options: prev.options.map((option) => {
        if (option.id !== optionId) return option;
        const current = Array.isArray(option.dependsOnOptionIds) ? option.dependsOnOptionIds.map(String) : [];
        const next = current.includes(dependencyKey)
          ? current.filter((entry) => entry !== dependencyKey)
          : [...current, dependencyKey];
        return { ...option, dependsOnOptionIds: next };
      }),
    }));
  };

  const toggleGroupDependency = (dependencyOptionId) => {
    const dependencyKey = String(dependencyOptionId || "");
    if (!dependencyKey || !dependencySourceOptionIds.has(dependencyKey)) return;

    setDraft((prev) => {
      const current = Array.isArray(prev?.dependsOnOptionIds)
        ? prev.dependsOnOptionIds.map(String)
        : [];
      const next = current.includes(dependencyKey)
        ? current.filter((entry) => entry !== dependencyKey)
        : [...current, dependencyKey];
      return { ...prev, dependsOnOptionIds: next };
    });
  };

  const clearGroupDependencies = () => {
    setDraft((prev) => ({ ...prev, dependsOnOptionIds: [] }));
  };

  const clearOptionDependencies = (optionId) => {
    setDraft((prev) => ({
      ...prev,
      options: prev.options.map((option) => (
        option.id === optionId
          ? { ...option, dependsOnOptionIds: [] }
          : option
      )),
    }));
  };

  const startEditGroup = (group) => {
    const groupId = group?.library_group_id || group?.id;
    setEditingGroupId(groupId ? String(groupId) : null);
    setDraft(normalizeGroupToDraft(group));
  };

  const persistGroupOrder = useCallback(async ({
    includeGroupId = null,
    silent = false,
  } = {}) => {
    if (!Number.isFinite(menuId)) return false;

    const normalizedOrder = [...new Set(
      [
        ...(Array.isArray(groupOrderDraft) ? groupOrderDraft : []),
        ...(includeGroupId ? [String(includeGroupId)] : []),
      ]
        .map((entry) => String(entry || "").trim())
        .filter(Boolean),
    )];

    if (normalizedOrder.length === 0) return false;
    if (!groupOrderDirty && !includeGroupId) return false;

    await reorderMenuOptionGroupsByMenu(menuId, normalizedOrder);
    setGroupOrderDirty(false);
    if (!silent) setError("");
    return true;
  }, [groupOrderDraft, groupOrderDirty, menuId]);

  const handleSaveGroup = async (event) => {
    event.preventDefault();
    if (!lojaId || !Number.isFinite(menuId)) {
      setError("Define uma loja e prato validos antes de guardar modificadores.");
      return;
    }

    const validationError = validateDraftGroup(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = normalizeDraftPayload(draft);
    setSaving(true);
    setError("");
    try {
      if (editingGroupId) {
        await updateMenuOptionLibraryGroup(lojaId, editingGroupId, payload);
      } else {
        await createMenuOptionGroupForMenu(lojaId, menuId, payload);
      }

      resetDraft();
      await loadGroups();
      await onSaved?.();
    } catch (err) {
      setError(err?.message || "Erro ao guardar grupo de modificadores.");
    } finally {
      setSaving(false);
    }
  };

  const handleUnlinkGroup = async (group) => {
    const groupId = group?.library_group_id || group?.id;
    if (!groupId) return;
    if (!window.confirm(`Remover o grupo "${group?.title || "sem nome"}" deste prato?`)) return;

    setSaving(true);
    setError("");
    try {
      await unlinkMenuOptionLibraryGroupFromMenu(menuId, groupId);
      if (String(editingGroupId || "") === String(groupId)) resetDraft();
      await loadGroups();
      await onSaved?.();
    } catch (err) {
      setError(err?.message || "Erro ao remover grupo deste prato.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = async (group) => {
    const groupId = group?.library_group_id || group?.id;
    if (!groupId) return;

    const linkedCount = Number(group?.linked_menu_count || 0);
    const warnText = linkedCount > 1
      ? `Este grupo esta ligado a ${linkedCount} pratos. Apagar vai remover em todos. Continuar?`
      : "Apagar este grupo permanentemente?";
    if (!window.confirm(warnText)) return;

    setSaving(true);
    setError("");
    try {
      await deleteMenuOptionLibraryGroup(lojaId, groupId);
      if (String(editingGroupId || "") === String(groupId)) resetDraft();
      await loadGroups();
      await onSaved?.();
    } catch (err) {
      setError(err?.message || "Erro ao apagar grupo.");
    } finally {
      setSaving(false);
    }
  };

  const handleMoveGroup = async (group, direction) => {
    const groupId = String(group?.library_group_id || group?.id || "");
    if (!groupId || !Number.isFinite(menuId)) return;

    const currentOrder = (
      Array.isArray(groupOrderDraft) && groupOrderDraft.length > 0
        ? groupOrderDraft
        : orderedGroups.map((entry) => getGroupKey(entry))
    ).map((entry) => String(entry || "").trim()).filter(Boolean);
    const currentIndex = currentOrder.findIndex((entry) => entry === groupId);
    if (currentIndex < 0) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) return;

    const nextOrder = [...currentOrder];
    [nextOrder[currentIndex], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[currentIndex]];

    setGroupOrderDraft(nextOrder);
    setGroupOrderDirty(true);
  };

  const handleSaveGroupOrder = async () => {
    if (!groupOrderDirty) return;
    setOrderingInProgress(true);
    setError("");
    try {
      await persistGroupOrder();
      await loadGroups();
      await onSaved?.();
    } catch (err) {
      setError(err?.message || "Erro ao guardar a ordem dos grupos.");
    } finally {
      setOrderingInProgress(false);
    }
  };

  const handleResetGroupOrder = () => {
    const defaultOrder = (Array.isArray(groups) ? groups : [])
      .map((group) => getGroupKey(group))
      .filter(Boolean);
    setGroupOrderDraft(defaultOrder);
    setGroupOrderDirty(false);
  };

  const handleDuplicateGroup = async (group) => {
    const sourceGroupId = group?.library_group_id || group?.id;
    if (!sourceGroupId) return;

    const suggestedName = `${group?.title || "Grupo"} (Copia)`;
    const duplicateName = window.prompt("Nome do grupo duplicado:", suggestedName);
    if (!duplicateName || !duplicateName.trim()) return;

    setSaving(true);
    setError("");
    try {
      await duplicateMenuOptionLibraryGroup(lojaId, sourceGroupId, {
        title: duplicateName.trim(),
        attachToMenuId: menuId,
      });
      await loadGroups();
      await onSaved?.();
    } catch (err) {
      setError(err?.message || "Erro ao duplicar grupo.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !menuItem || typeof document === "undefined") return null;

  const selectionModePreview = describeMenuOptionSelectionMode({
    required: draft.is_required,
    minSelections: draft.min_choices,
    maxSelections: draft.max_choices,
  });

  return createPortal(
    <div className="menu-option-modal-backdrop" onClick={onClose}>
      <section className="menu-option-modal-card" onClick={(event) => event.stopPropagation()}>
        <header className="menu-option-modal-header">
          <div>
            <p className="kicker">Modificadores do prato</p>
            <h3>{menuItem?.nome || "Prato"}</h3>
            <p className="muted">Cria grupos obrigatorios/opcionais e liga opcoes com preco extra para este menu.</p>
          </div>
          <button type="button" className="btn-dashboard small secondary" onClick={onClose}>
            Fechar
          </button>
        </header>

        {error ? <p className="menu-option-inline-error">{error}</p> : null}

        <div className="menu-option-modal-grid">
          <article className="menu-option-panel">
            <div className="menu-option-panel-head">
              <h4>{editingGroupId ? "Editar grupo" : "Novo grupo"}</h4>
              {editingGroupId ? (
                <button type="button" className="btn-dashboard small secondary" onClick={resetDraft} disabled={saving}>
                  Criar novo
                </button>
              ) : null}
            </div>

            <form className="menu-form" onSubmit={handleSaveGroup}>
              <label>
                <span className="muted">Nome do grupo</span>
                <input
                  type="text"
                  placeholder="Ex: Escolha a sua bebida"
                  value={draft.name}
                  onChange={(event) => patchDraft({ name: event.target.value })}
                  required
                />
              </label>

              <label className="menu-form-checkbox">
                <input
                  type="checkbox"
                  checked={draft.is_required}
                  onChange={(event) => {
                    const required = event.target.checked;
                    patchDraft({
                      is_required: required,
                      min_choices: required ? Math.max(1, Number(draft.min_choices) || 1) : Number(draft.min_choices) || 0,
                    });
                  }}
                />
                <span className="menu-form-checkbox-box">
                  <strong>Grupo obrigatorio</strong>
                  <small className="muted">{selectionModePreview}</small>
                </span>
              </label>

              <div className="menu-form-row">
                <label>
                  <span className="muted">Minimo de escolhas</span>
                  <input
                    type="number"
                    min={draft.is_required ? "1" : "0"}
                    step="1"
                    value={draft.min_choices}
                    onChange={(event) => patchDraft({ min_choices: event.target.value })}
                  />
                </label>
                <label>
                  <span className="muted">Maximo de escolhas</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={draft.max_choices}
                    onChange={(event) => patchDraft({ max_choices: event.target.value })}
                  />
                </label>
              </div>

              <section className="menu-option-dependency-editor menu-option-group-dependency-editor">
                <div className="menu-option-dependency-head">
                  <strong>Regras de exibicao do grupo</strong>
                  <button
                    type="button"
                    className="btn-dashboard secondary small"
                    onClick={clearGroupDependencies}
                    disabled={!Array.isArray(draft.dependsOnOptionIds) || draft.dependsOnOptionIds.length === 0}
                  >
                    Limpar
                  </button>
                </div>

                {dependencySourceGroups.length === 0 ? (
                  <p className="menu-builder-caption muted">
                    Sem grupos anteriores disponiveis. Este grupo aparece sempre.
                  </p>
                ) : (
                  <div className="menu-option-dependency-groups">
                    {dependencySourceGroups.map((sourceGroup) => {
                      const sourceGroupId = String(sourceGroup?.library_group_id || sourceGroup?.id || "");
                      return (
                        <details key={`group-rule-${sourceGroupId}`} className="menu-option-dependency-group">
                          <summary>
                            <span>{sourceGroup?.title || "Grupo sem nome"}</span>
                            <small>{sourceGroup?.options?.length || 0} opcoes</small>
                          </summary>
                          <div className="menu-option-dependency-options">
                            {(sourceGroup?.options || []).map((sourceOption) => {
                              const sourceOptionId = String(sourceOption?.id || "");
                              const isSelected = Array.isArray(draft?.dependsOnOptionIds)
                                && draft.dependsOnOptionIds.map(String).includes(sourceOptionId);
                              return (
                                <label key={sourceOptionId} className={`menu-option-dependency-choice ${isSelected ? "selected" : ""}`}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleGroupDependency(sourceOptionId)}
                                  />
                                  <span>{sourceOption?.name || "Opcao sem nome"}</span>
                                </label>
                              );
                            })}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="menu-options-builder">
                <div className="menu-options-builder-head">
                  <div>
                    <h4>Opcoes do grupo</h4>
                    <p className="menu-builder-caption muted">Define o nome e o preco extra de cada opcao.</p>
                  </div>
                  <button type="button" className="btn-dashboard secondary small" onClick={addOption}>
                    Adicionar opcao
                  </button>
                </div>

                <div className="menu-option-builder-list">
                  {draft.options.map((option, index) => (
                    <div key={option.id} className="menu-option-builder-row">
                      <label>
                        <span className="muted">Opcao {index + 1}</span>
                        <input
                          type="text"
                          placeholder="Ex: Coca-Cola"
                          value={option.name}
                          onChange={(event) => updateOption(option.id, { name: event.target.value })}
                        />
                      </label>
                      <label>
                        <span className="muted">Preco extra</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={option.price_modifier}
                          onChange={(event) => updateOption(option.id, { price_modifier: event.target.value })}
                        />
                      </label>
                      <div className="menu-option-builder-actions">
                        <button
                          type="button"
                          className="btn-dashboard small secondary"
                          onClick={() => moveOption(option.id, "up")}
                          disabled={index === 0}
                          title="Mover item para cima"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn-dashboard small secondary"
                          onClick={() => moveOption(option.id, "down")}
                          disabled={index >= draft.options.length - 1}
                          title="Mover item para baixo"
                        >
                          ↓
                        </button>
                        <button type="button" className="btn-dashboard small secondary" onClick={() => removeOption(option.id)}>
                          Remover
                        </button>
                      </div>

                      <div className="menu-option-dependency-editor">
                        <div className="menu-option-dependency-head">
                          <strong>Regras de exibicao desta opcao</strong>
                          <button
                            type="button"
                            className="btn-dashboard secondary small"
                            onClick={() => clearOptionDependencies(option.id)}
                            disabled={!Array.isArray(option.dependsOnOptionIds) || option.dependsOnOptionIds.length === 0}
                          >
                            Limpar
                          </button>
                        </div>

                        {dependencySourceGroups.length === 0 ? (
                          <p className="menu-builder-caption muted">
                            Sem grupos anteriores disponiveis. Esta opcao aparece sempre.
                          </p>
                        ) : (
                          <div className="menu-option-dependency-groups">
                            {dependencySourceGroups.map((sourceGroup) => {
                              const sourceGroupId = String(sourceGroup?.library_group_id || sourceGroup?.id || "");
                              return (
                                <details key={sourceGroupId} className="menu-option-dependency-group">
                                  <summary>
                                    <span>{sourceGroup?.title || "Grupo sem nome"}</span>
                                    <small>{sourceGroup?.options?.length || 0} opcoes</small>
                                  </summary>
                                  <div className="menu-option-dependency-options">
                                    {(sourceGroup?.options || []).map((sourceOption) => {
                                      const sourceOptionId = String(sourceOption?.id || "");
                                      const isSelected = Array.isArray(option?.dependsOnOptionIds)
                                        && option.dependsOnOptionIds.map(String).includes(sourceOptionId);
                                      return (
                                        <label key={sourceOptionId} className={`menu-option-dependency-choice ${isSelected ? "selected" : ""}`}>
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleOptionDependency(option.id, sourceOptionId)}
                                          />
                                          <span>{sourceOption?.name || "Opcao sem nome"}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </details>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="menu-form-actions">
                <button type="submit" className="btn-dashboard" disabled={saving || orderingInProgress}>
                  {saving ? "A guardar..." : editingGroupId ? "Guardar grupo" : "Criar grupo"}
                </button>
                {editingGroupId ? (
                  <button type="button" className="btn-dashboard secondary" onClick={resetDraft} disabled={saving || orderingInProgress}>
                    Cancelar edicao
                  </button>
                ) : null}
              </div>
            </form>
          </article>

          <article className="menu-option-panel">
            <div className="menu-option-panel-head">
              <div>
                <h4>Grupos deste prato</h4>
                <p className="menu-builder-caption muted">Ajusta a sequencia para controlar a ordem no checkout.</p>
              </div>
              <div className="menu-option-panel-head-actions">
                <span className="menu-library-count">{orderedGroups.length} grupos</span>
                <button
                  type="button"
                  className="btn-dashboard secondary small"
                  onClick={handleResetGroupOrder}
                  disabled={!groupOrderDirty || saving || orderingInProgress}
                >
                  Repor ordem
                </button>
                <button
                  type="button"
                  className="btn-dashboard small"
                  onClick={handleSaveGroupOrder}
                  disabled={!groupOrderDirty || saving || orderingInProgress}
                >
                  {orderingInProgress ? "A guardar..." : "Guardar ordem"}
                </button>
              </div>
            </div>

            {loading ? (
              <p className="muted">A carregar grupos...</p>
            ) : orderedGroups.length === 0 ? (
              <p className="muted">Este prato ainda nao tem modificadores. Cria o primeiro grupo no painel ao lado.</p>
            ) : (
              <div className="menu-option-group-list">
                {orderedGroups.map((group) => {
                  const groupId = group?.library_group_id || group?.id;
                  const position = orderedGroups.findIndex(
                    (entry) => String(entry?.library_group_id || entry?.id || "") === String(groupId),
                  );
                  const orderLabel = position >= 0 ? position + 1 : "?";
                  const canMoveUp = position > 0;
                  const canMoveDown = position >= 0 && position < orderedGroups.length - 1;
                  const groupDependencies = Array.isArray(group?.dependsOnOptionIds)
                    ? group.dependsOnOptionIds
                    : Array.isArray(group?.depends_on_option_ids)
                      ? group.depends_on_option_ids
                      : [];
                  return (
                    <article key={String(groupId)} className="menu-option-group-card">
                      <div className="menu-option-group-head">
                        <div>
                          <h5>{group?.title || "Grupo sem titulo"}</h5>
                          <p className="muted">{describeMenuOptionSelectionMode(group)}</p>
                          {groupDependencies.length > 0 ? (
                            <p className="muted">Condicional - {groupDependencies.length} regra(s) de exibicao</p>
                          ) : null}
                        </div>
                        <div className="menu-option-group-order-controls">
                          <span className="menu-library-count">#{orderLabel} - {group?.options?.length || 0} opcoes</span>
                          <div className="menu-option-group-order-buttons">
                            <button
                              type="button"
                              className="btn-dashboard secondary small"
                              onClick={() => handleMoveGroup(group, "up")}
                              disabled={!canMoveUp || saving || orderingInProgress}
                              title="Mover para cima"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="btn-dashboard secondary small"
                              onClick={() => handleMoveGroup(group, "down")}
                              disabled={!canMoveDown || saving || orderingInProgress}
                              title="Mover para baixo"
                            >
                              ↓
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="menu-option-group-items">
                        {(group?.options || []).map((option) => (
                          <div key={option?.id} className="menu-option-group-item">
                            <span>{option?.name || "Opcao sem nome"}</span>
                            <strong>{Number(option?.price || 0) > 0 ? `+${formatCurrency(option?.price)}` : "Sem extra"}</strong>
                          </div>
                        ))}
                      </div>

                      <div className="menu-card-actions">
                        <button type="button" className="btn-dashboard small" onClick={() => startEditGroup(group)} disabled={saving}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn-dashboard small secondary"
                          onClick={() => handleDuplicateGroup(group)}
                          disabled={saving || orderingInProgress}
                        >
                          Duplicar
                        </button>
                        <button type="button" className="btn-dashboard small secondary" onClick={() => handleUnlinkGroup(group)} disabled={saving}>
                          Remover do prato
                        </button>
                        <button type="button" className="btn-dashboard small secondary" onClick={() => handleDeleteGroup(group)} disabled={saving}>
                          Apagar grupo
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </article>
        </div>
      </section>
    </div>,
    document.body,
  );
}

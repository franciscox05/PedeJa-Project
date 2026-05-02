import { useEffect, useMemo, useState } from "react";
import { normalizePricedItem } from "../services/pricingService";
import {
  buildDefaultMenuOptionSelections,
  buildSelectedMenuOptions,
  describeMenuOptionSelectionMode,
  sanitizeMenuOptionsConfig,
  validateMenuOptionSelections,
} from "../services/menuOptionsService";
import { fetchMenuOptionGroupsByMenuId } from "../services/menuOptionsDataService";
import "../css/components/MenuProductModal.css";

function toSafeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveDisplayUnitPrice(item) {
  const total = Number(item?.preco_cliente_total);
  if (Number.isFinite(total)) return total;

  const display = Number(item?.preco_cliente);
  if (Number.isFinite(display)) return display;

  return toSafeNumber(item?.preco, 0);
}

function resolveDescription(prato) {
  return prato?.desc ?? prato?.descricao ?? prato?.desricao ?? "Sem descricao adicional.";
}

function buildSelectedOptionIdSet(selections = {}) {
  const ids = new Set();
  Object.values(selections || {}).forEach((groupSelection) => {
    if (!Array.isArray(groupSelection)) return;
    groupSelection.forEach((value) => {
      const key = String(value || "");
      if (key) ids.add(key);
    });
  });
  return ids;
}

function buildEffectiveOptionGroups(groups = [], selections = {}) {
  const selectedOptionIds = buildSelectedOptionIdSet(selections);
  return (Array.isArray(groups) ? groups : []).reduce((acc, group) => {
    const groupDependencies = (
      Array.isArray(group?.dependsOnOptionIds)
        ? group.dependsOnOptionIds
        : Array.isArray(group?.depends_on_option_ids)
          ? group.depends_on_option_ids
          : []
    )
      .map((entry) => String(entry || ""))
      .filter(Boolean);

    const groupVisible = groupDependencies.length === 0
      || groupDependencies.some((dependencyId) => selectedOptionIds.has(dependencyId));

    if (!groupVisible) return acc;

    const sourceOptions = Array.isArray(group?.options) ? group.options : [];
    const options = sourceOptions.filter((option) => {
      const dependencies = Array.isArray(option?.dependsOnOptionIds)
        ? option.dependsOnOptionIds
        : Array.isArray(option?.depends_on_option_ids)
          ? option.depends_on_option_ids
          : [];
      const normalizedDependencies = dependencies
        .map((entry) => String(entry || ""))
        .filter(Boolean);
      if (normalizedDependencies.length === 0) return true;
      return normalizedDependencies.some((dependencyId) => selectedOptionIds.has(dependencyId));
    });

    // UX: nunca mostrar grupo vazio. Se nao houver opcoes validas para o contexto atual,
    // o grupo fica oculto por completo.
    if (options.length === 0) return acc;

    acc.push({
      ...group,
      options,
    });
    return acc;
  }, []);
}

export default function MenuProductModal({
  isOpen,
  prato,
  isSoldOut = false,
  onClose,
  onAdd,
}) {
  const basePrato = useMemo(() => normalizePricedItem(prato || {}), [prato]);
  const appliedCommissionPercent = Number(basePrato?.comissao_pedeja_percent_aplicada || 0);

  const [optionGroups, setOptionGroups] = useState([]);
  const [selections, setSelections] = useState({});
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [interactionErrors, setInteractionErrors] = useState({});

  const effectiveOptionGroups = useMemo(
    () => buildEffectiveOptionGroups(optionGroups, selections),
    [optionGroups, selections],
  );

  useEffect(() => {
    if (!isOpen || !prato) return;

    let active = true;
    setLoadingGroups(true);
    setLoadError("");
    setInteractionErrors({});
    setSpecialInstructions("");
    setQuantity(1);

    const loadGroups = async () => {
      try {
        const { groups } = await fetchMenuOptionGroupsByMenuId(
          prato?.idmenu || prato?.id,
          prato?.configuracao_opcoes || [],
        );
        if (!active) return;

        const normalizedGroups = sanitizeMenuOptionsConfig(groups);
        setOptionGroups(normalizedGroups);
        setSelections(buildDefaultMenuOptionSelections(normalizedGroups));
      } catch (error) {
        if (!active) return;
        const fallbackGroups = sanitizeMenuOptionsConfig(prato?.configuracao_opcoes || []);
        setOptionGroups(fallbackGroups);
        setSelections(buildDefaultMenuOptionSelections(fallbackGroups));
        setLoadError(error?.message || "Nao foi possivel carregar as opcoes deste produto.");
      } finally {
        if (active) setLoadingGroups(false);
      }
    };

    loadGroups();

    return () => {
      active = false;
    };
  }, [isOpen, prato]);

  useEffect(() => {
    if (!isOpen) return;

    setSelections((prev) => {
      const next = { ...(prev || {}) };
      const validGroupIds = new Set(effectiveOptionGroups.map((group) => String(group?.id || "")));
      let changed = false;

      effectiveOptionGroups.forEach((group) => {
        const groupId = String(group?.id || "");
        if (!groupId) return;

        const validOptionIds = new Set((group?.options || []).map((option) => String(option?.id || "")));
        const current = Array.isArray(prev?.[groupId]) ? prev[groupId].map((value) => String(value)) : [];
        let cleaned = [...new Set(current.filter((value) => validOptionIds.has(value)))];

        if (cleaned.length === 0 && Array.isArray(group?.options) && group.options.length > 0) {
          const max = Math.max(1, Number(group?.maxSelections ?? 1) || 1);
          const defaults = group.options
            .filter((option) => option?.defaultSelected)
            .map((option) => String(option?.id || ""))
            .filter(Boolean)
            .slice(0, max);
          if (defaults.length > 0) cleaned = defaults;
        }

        const unchanged = current.length === cleaned.length && current.every((value, index) => value === cleaned[index]);
        if (!unchanged) changed = true;

        if (cleaned.length > 0) next[groupId] = cleaned;
        else if (Array.isArray(prev?.[groupId]) && prev[groupId].length > 0) {
          delete next[groupId];
          changed = true;
        } else {
          delete next[groupId];
        }
      });

      Object.keys(prev || {}).forEach((groupId) => {
        if (!validGroupIds.has(String(groupId))) {
          delete next[groupId];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [effectiveOptionGroups, isOpen]);

  const validation = useMemo(
    () => validateMenuOptionSelections(effectiveOptionGroups, selections),
    [effectiveOptionGroups, selections],
  );

  const selectedOptions = useMemo(
    () => buildSelectedMenuOptions(effectiveOptionGroups, selections, appliedCommissionPercent),
    [appliedCommissionPercent, effectiveOptionGroups, selections],
  );

  const configuredPrato = useMemo(
    () => normalizePricedItem({ ...basePrato, opcoes_selecionadas: selectedOptions }),
    [basePrato, selectedOptions],
  );

  const unitPrice = useMemo(
    () => resolveDisplayUnitPrice(configuredPrato),
    [configuredPrato],
  );
  const totalPrice = useMemo(
    () => Number((unitPrice * quantity).toFixed(2)),
    [quantity, unitPrice],
  );

  const canAddToCart = !isSoldOut && !loadingGroups && !validation.hasBlockingError;

  if (!isOpen || !prato) return null;

  const setGroupSelection = (groupId, nextValues) => {
    setSelections((prev) => ({
      ...prev,
      [groupId]: nextValues,
    }));
  };

  const handleRadioSelect = (groupId, optionId) => {
    setGroupSelection(groupId, [optionId]);
    setInteractionErrors((prev) => ({ ...prev, [groupId]: "" }));
  };

  const handleCheckboxToggle = (group, optionId) => {
    const groupId = group.id;
    const selected = Array.isArray(selections?.[groupId]) ? selections[groupId] : [];
    const alreadySelected = selected.includes(optionId);
    const maxSelections = Math.max(1, Number(group?.maxSelections ?? 1) || 1);

    if (alreadySelected) {
      setGroupSelection(groupId, selected.filter((id) => id !== optionId));
      setInteractionErrors((prev) => ({ ...prev, [groupId]: "" }));
      return;
    }

    if (selected.length >= maxSelections) {
      setInteractionErrors((prev) => ({
        ...prev,
        [groupId]: `Limite maximo atingido (${maxSelections}).`,
      }));
      return;
    }

    setGroupSelection(groupId, [...selected, optionId]);
    setInteractionErrors((prev) => ({ ...prev, [groupId]: "" }));
  };

  const handleSubmit = () => {
    if (!canAddToCart) return;

    const payload = {
      ...configuredPrato,
      qtd: quantity,
      quantityToAdd: quantity,
      opcoes_selecionadas: selectedOptions,
      selectedOptions,
      instrucoes_especiais: specialInstructions.trim() || null,
      specialInstructions: specialInstructions.trim(),
    };

    const success = onAdd?.(payload);
    if (success !== false) {
      onClose?.();
    }
  };

  const renderGroupRule = (group) => {
    const fallback = describeMenuOptionSelectionMode(group);
    const minSelections = Number(group?.minSelections ?? 0);
    const maxSelections = Math.max(1, Number(group?.maxSelections ?? 1) || 1);
    const isRequired = Boolean(group?.required);

    if (isRequired && maxSelections === 1) {
      return "Obrigatorio - escolha 1";
    }
    if (isRequired) {
      return minSelections > 1
        ? `Obrigatorio - escolha de ${minSelections} ate ${maxSelections}`
        : `Obrigatorio - escolha ate ${maxSelections}`;
    }
    if (maxSelections > 1) {
      return minSelections > 0
        ? `Opcional - escolha de ${minSelections} ate ${maxSelections}`
        : `Opcional - escolha ate ${maxSelections}`;
    }
    return fallback;
  };

  return (
    <div className="menu-product-modal-backdrop" onClick={onClose}>
      <div className="menu-product-modal-sheet" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="menu-product-modal-close" onClick={onClose}>x</button>

        <div className="menu-product-modal-media">
          {prato.imagem ? (
            <img src={prato.imagem} alt={prato.nome} />
          ) : (
            <div className="menu-product-modal-media-placeholder">
              <span className="material-icons">restaurant</span>
            </div>
          )}
        </div>

        <div className="menu-product-modal-content">
          <header className="menu-product-modal-head">
            <div>
              <h3>{prato.nome}</h3>
              <p>{resolveDescription(prato)}</p>
            </div>
            <div className="menu-product-modal-price-box">
              <span>Preco base</span>
              <strong>{resolveDisplayUnitPrice(basePrato).toFixed(2)}EUR</strong>
            </div>
          </header>

          {loadError ? <p className="menu-product-modal-error">{loadError}</p> : null}

          {loadingGroups ? (
            <p className="menu-product-modal-loading">A carregar opcoes...</p>
          ) : (
            <section className="menu-product-modal-groups">
              {effectiveOptionGroups.map((group) => {
                const selectedIds = Array.isArray(selections?.[group.id]) ? selections[group.id] : [];
                const canUseRadio = Boolean(group.required) && Number(group.maxSelections) === 1;
                const maxSelections = Math.max(1, Number(group?.maxSelections ?? 1) || 1);
                const ruleError = interactionErrors[group.id] || validation.byGroup[group.id] || "";

                return (
                  <article className="menu-product-modal-group" key={group.id}>
                    <div className="menu-product-modal-group-head">
                      <strong>{group.title}</strong>
                      <span>{renderGroupRule(group)}</span>
                    </div>

                    {Array.isArray(group?.options) && group.options.length > 0 ? (
                      <div className="menu-product-modal-options-list">
                        {group.options.map((option) => {
                          const checked = selectedIds.includes(option.id);
                          const optionPrice = Number(
                            (
                              toSafeNumber(option?.price, 0)
                              * (1 + (appliedCommissionPercent || 0) / 100)
                            ).toFixed(2),
                          );
                          const disableCheckbox = !checked && !canUseRadio && selectedIds.length >= maxSelections;

                          return (
                            <label
                              key={option.id}
                              className={`menu-product-modal-option ${checked ? "selected" : ""}${disableCheckbox ? "disabled" : ""}`}
                            >
                              <input
                                type={canUseRadio ? "radio" : "checkbox"}
                                name={`group-${group.id}`}
                                checked={checked}
                                disabled={disableCheckbox}
                                onChange={() => {
                                  if (canUseRadio) {
                                    handleRadioSelect(group.id, option.id);
                                  } else {
                                    handleCheckboxToggle(group, option.id);
                                  }
                                }}
                              />
                              <span className="menu-product-modal-option-name">{option.name}</span>
                              <strong className="menu-product-modal-option-price">
                                {optionPrice > 0 ? `+${optionPrice.toFixed(2)}EUR` : "Incluido"}
                              </strong>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="menu-product-modal-group-hint">
                        Escolhe primeiro os complementos anteriores para desbloquear este grupo.
                      </p>
                    )}

                    {ruleError ? (
                      <p className="menu-product-modal-group-error">{ruleError}</p>
                    ) : null}
                  </article>
                );
              })}
            </section>
          )}

          <section className="menu-product-modal-special">
            <label htmlFor="menu-special-instructions">Instrucoes especiais</label>
            <textarea
              id="menu-special-instructions"
              rows={3}
              maxLength={250}
              placeholder="Ex: sem cebola, molho a parte..."
              value={specialInstructions}
              onChange={(event) => setSpecialInstructions(event.target.value)}
            />
          </section>

          <footer className="menu-product-modal-footer">
            <div className="menu-product-modal-quantity">
              <button
                type="button"
                onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                disabled={quantity <= 1}
              >
                -
              </button>
              <span>{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((prev) => prev + 1)}
              >
                +
              </button>
            </div>

            <button
              type="button"
              className="menu-product-modal-submit"
              disabled={!canAddToCart}
              onClick={handleSubmit}
            >
              Adicionar ao carrinho - {totalPrice.toFixed(2)}EUR
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}

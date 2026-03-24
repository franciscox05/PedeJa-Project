import React, { useMemo, useState } from "react";
import { useCart } from "../context/CartContext";
import { normalizePricedItem, resolveDisplayPrice } from "../services/pricingService";
import {
  buildDefaultMenuOptionSelections,
  buildSelectedMenuOptions,
  getMenuOptionTypeLabel,
  hasMissingRequiredMenuOptions,
  sanitizeMenuOptionsConfig,
} from "../services/menuOptionsService";

function resolveCategoryName(prato) {
  if (prato?.categoria_menu) {
    return prato.categoria_menu;
  }
  const relation = prato?.tiposmenu;
  if (Array.isArray(relation)) {
    return relation[0]?.tipomenu || "Geral";
  }
  return relation?.tipomenu || "Geral";
}

export default function MenuCard({ prato }) {
  const { addToCart } = useCart();
  const [animacao, setAnimacao] = useState(false);
  const [notificacao, setNotificacao] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showSoldOutNotice, setShowSoldOutNotice] = useState(false);
  const [optionSelections, setOptionSelections] = useState({});
  const [selectionError, setSelectionError] = useState("");

  const isSoldOut = prato?.ativo === false;
  const categoryName = useMemo(() => resolveCategoryName(prato), [prato]);
  const pricedPrato = useMemo(() => normalizePricedItem(prato), [prato]);
  const optionGroups = useMemo(() => sanitizeMenuOptionsConfig(prato?.configuracao_opcoes), [prato]);
  const hasConfigurableOptions = optionGroups.length > 0;
  const appliedCommissionPercent = Number(pricedPrato?.comissao_pedeja_percent_aplicada || 0);
  const selectedOptions = useMemo(
    () => buildSelectedMenuOptions(optionGroups, optionSelections, appliedCommissionPercent),
    [appliedCommissionPercent, optionGroups, optionSelections],
  );
  const configuredPrato = useMemo(
    () => normalizePricedItem({ ...pricedPrato, opcoes_selecionadas: selectedOptions }),
    [pricedPrato, selectedOptions],
  );
  const displayPrice = useMemo(
    () => configuredPrato.preco_cliente_total ?? configuredPrato.preco_cliente ?? resolveDisplayPrice(prato),
    [configuredPrato, prato],
  );

  const dispararSucesso = () => {
    setAnimacao(true);
    setTimeout(() => setAnimacao(false), 300);
    setNotificacao(true);
    setTimeout(() => setNotificacao(false), 2000);
  };

  const dispararAvisoEsgotado = () => {
    setShowSoldOutNotice(true);
    setTimeout(() => setShowSoldOutNotice(false), 2000);
  };

  const handleAdd = (event) => {
    event?.stopPropagation?.();

    if (isSoldOut) {
      dispararAvisoEsgotado();
      return;
    }

    const sessaoUtilizador = localStorage.getItem("pedeja_user");

    if (!sessaoUtilizador) {
      window.dispatchEvent(new Event("abrirLogin"));
      return;
    }

    if (hasConfigurableOptions && !showDetails) {
      setOptionSelections(buildDefaultMenuOptionSelections(optionGroups));
      setSelectionError("");
      setShowDetails(true);
      return;
    }

    if (hasMissingRequiredMenuOptions(optionGroups, optionSelections)) {
      setSelectionError("Seleciona as opcoes obrigatorias antes de adicionar ao carrinho.");
      if (!showDetails) setShowDetails(true);
      return;
    }

    const sucesso = addToCart(configuredPrato);

    if (sucesso) {
      setSelectionError("");
      dispararSucesso();
      setShowDetails(false);
    } else {
      setShowModal(true);
    }
  };

  const confirmarTroca = () => {
    if (isSoldOut) {
      dispararAvisoEsgotado();
      setShowModal(false);
      return;
    }

    if (hasMissingRequiredMenuOptions(optionGroups, optionSelections)) {
      setSelectionError("Seleciona as opcoes obrigatorias antes de adicionar ao carrinho.");
      setShowModal(false);
      setShowDetails(true);
      return;
    }

    addToCart(configuredPrato, true);
    setShowModal(false);
    dispararSucesso();
  };

  const openDetails = () => {
    setOptionSelections(buildDefaultMenuOptionSelections(optionGroups));
    setSelectionError("");
    setShowDetails(true);
  };

  const closeDetails = () => {
    setSelectionError("");
    setShowDetails(false);
  };

  const toggleOption = (group, optionId) => {
    setOptionSelections((prev) => {
      const current = Array.isArray(prev?.[group.id]) ? prev[group.id] : [];
      const exists = current.includes(optionId);

      if (group.maxSelections <= 1) {
        if (exists) {
          return {
            ...prev,
            [group.id]: group.required ? [optionId] : [],
          };
        }

        return {
          ...prev,
          [group.id]: [optionId],
        };
      }

      if (exists) {
        return {
          ...prev,
          [group.id]: current.filter((id) => id !== optionId),
        };
      }

      if (current.length >= group.maxSelections) {
        return prev;
      }

      return {
        ...prev,
        [group.id]: [...current, optionId],
      };
    });
    setSelectionError("");
  };

  return (
    <>
      <div className="col-12 col-lg-6">
        <div
          className={`menu-item-card ${isSoldOut ? "menu-item-card-sold-out" : ""}`}
          onClick={openDetails}
          style={{
            backgroundColor: "white",
            borderRadius: "15px",
            padding: "15px",
            boxShadow: "0 4px 15px rgba(0,0,0,0.05)",
            display: "flex",
            alignItems: "center",
            marginBottom: "20px",
            position: "relative",
            minHeight: "110px",
            border: `1px solid ${isSoldOut ? "#f5c2c7" : "#f9f9f9"}`,
            cursor: "pointer",
            opacity: isSoldOut ? 0.88 : 1,
          }}
        >
          {notificacao && (
            <div className="menu-toast success">Adicionado ao carrinho.</div>
          )}

          {showSoldOutNotice && (
            <div className="menu-toast error">Prato esgotado de momento.</div>
          )}

          <div style={{ marginRight: "15px", flexShrink: 0 }}>
            <div
              style={{
                width: "80px",
                height: "80px",
                background: "#f0f0f0",
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {prato.imagem ? (
                <img src={prato.imagem} alt={prato.nome} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span className="material-icons" style={{ color: "white", fontSize: "40px", textShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
                  restaurant
                </span>
              )}
            </div>
          </div>

          <div style={{ flex: 1, paddingRight: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
              <div style={{ fontSize: "1.05rem", color: "#222", fontWeight: "700", lineHeight: "1.2" }}>
                {prato.nome}
              </div>
              {isSoldOut && <span className="menu-item-badge-soldout">Esgotado</span>}
            </div>
            </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              justifyContent: "space-between",
              height: "80px",
              minWidth: "80px",
              flexShrink: 0,
            }}
          >
            <span style={{ fontWeight: "800", color: "#d32f2f", fontSize: "1.1rem" }}>
              {displayPrice.toFixed(2)}EUR
            </span>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openDetails();
                }}
                className="menu-mini-btn info"
                title="Ver detalhes"
              >
                i
              </button>
              <button
                onClick={handleAdd}
                disabled={isSoldOut}
                className={`menu-mini-btn add ${isSoldOut ? "disabled" : ""}`}
                style={{
                  transform: animacao ? "scale(1.2)" : "scale(1)",
                  transition: "transform 0.2s",
                }}
                title={isSoldOut ? "Prato esgotado" : "Adicionar ao carrinho"}
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {showDetails && (
        <div className="menu-details-backdrop" onClick={closeDetails}>
          <div className="menu-details-sheet" onClick={(e) => e.stopPropagation()}>
            <button className="menu-details-close" onClick={closeDetails}>x</button>

            <div className="menu-details-top">
              {prato.imagem ? (
                <img src={prato.imagem} alt={prato.nome} className="menu-details-image" />
              ) : (
                <div className="menu-details-image placeholder">
                  <span className="material-icons">restaurant</span>
                </div>
              )}
            </div>

            <div className="menu-details-content">
              <div className="menu-details-title-row">
                <h3>{prato.nome}</h3>
                {isSoldOut ? <span className="menu-item-badge-soldout">Esgotado</span> : <span className="menu-item-badge-ok">Disponivel</span>}
              </div>

              <p className="menu-details-description">{prato.desc ?? prato.descricao ?? prato.desricao ?? "Sem descricao adicional."}</p>

              <div className="menu-details-meta">
                <div>
                  <span>Categoria</span>
                  <strong>{categoryName}</strong>
                </div>
                <div>
                  <span>Preco</span>
                  <strong>{displayPrice.toFixed(2)}EUR</strong>
                </div>
              </div>

              {optionGroups.length > 0 ? (
                <div className="menu-options-configurator">
                  <h4>Complementos e extras</h4>
                  {optionGroups.map((group) => {
                    const selectedIds = Array.isArray(optionSelections?.[group.id]) ? optionSelections[group.id] : [];

                    return (
                      <div key={group.id} className="menu-options-group">
                        <div className="menu-options-group-head">
                          <strong>{group.title}</strong>
                          <span>
                            {getMenuOptionTypeLabel(group.type)}
                            {group.required ? " • Obrigatorio" : " • Opcional"}
                            {group.maxSelections > 1 ? ` • max ${group.maxSelections}` : ""}
                          </span>
                        </div>

                        <div className="menu-options-list">
                          {group.options.map((option) => {
                            const checked = selectedIds.includes(option.id);
                            const optionPrice = Number(
                              (Number(option.price || 0) * (1 + (appliedCommissionPercent || 0) / 100)).toFixed(2),
                            );

                            return (
                              <label key={option.id} className={`menu-option-row ${checked ? "selected" : ""}`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleOption(group, option.id)}
                                />
                                <span>{option.name}</span>
                                <strong>{optionPrice > 0 ? `+${optionPrice.toFixed(2)}EUR` : "Incluido"}</strong>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {selectionError ? <p className="menu-options-error">{selectionError}</p> : null}
                </div>
              ) : null}

              <div className="menu-details-actions">
                <button className="btn-details secondary" onClick={closeDetails}>Fechar</button>
                <button className="btn-details primary" onClick={handleAdd} disabled={isSoldOut}>
                  {isSoldOut ? "Indisponivel" : "Adicionar ao carrinho"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
            padding: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              padding: "25px",
              borderRadius: "15px",
              maxWidth: "350px",
              width: "100%",
              textAlign: "center",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            }}
          >
            <span className="material-icons" style={{ fontSize: "50px", color: "#ff9800", marginBottom: "15px" }}>
              warning_amber
            </span>
            <h3 style={{ margin: "0 0 10px 0", color: "#333" }}>Atencao</h3>
            <p style={{ color: "#666", marginBottom: "25px", fontSize: "0.95rem" }}>
              Ja tens produtos de outro restaurante no carrinho. Desejas limpar o carrinho e iniciar um novo pedido aqui?
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  backgroundColor: "white",
                  color: "#666",
                  fontWeight: "bold",
                  cursor: "pointer",
                  flex: 1,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarTroca}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "#d32f2f",
                  color: "white",
                  fontWeight: "bold",
                  cursor: "pointer",
                  flex: 1,
                }}
              >
                Sim, Limpar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}



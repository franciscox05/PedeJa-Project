import { useMemo, useState } from "react";
import { useCart } from "../context/CartContext";
import { normalizePricedItem, resolveDisplayPrice } from "../services/pricingService";
import MenuProductModal from "./MenuProductModal";

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
  const [showStoreSwitchModal, setShowStoreSwitchModal] = useState(false);
  const [showSoldOutNotice, setShowSoldOutNotice] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [pendingItem, setPendingItem] = useState(null);

  const isSoldOut = prato?.ativo === false;
  const categoryName = useMemo(() => resolveCategoryName(prato), [prato]);
  const pricedPrato = useMemo(() => normalizePricedItem(prato), [prato]);
  const displayPrice = useMemo(
    () => pricedPrato.preco_cliente_total ?? pricedPrato.preco_cliente ?? resolveDisplayPrice(prato),
    [pricedPrato, prato],
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

  const openProductModal = (event) => {
    event?.stopPropagation?.();
    setShowProductModal(true);
  };

  const handleAddFromModal = (itemPayload) => {
    if (isSoldOut) {
      dispararAvisoEsgotado();
      return false;
    }

    const sessaoUtilizador = localStorage.getItem("pedeja_user");
    if (!sessaoUtilizador) {
      window.dispatchEvent(new Event("abrirLogin"));
      return false;
    }

    const sucesso = addToCart(itemPayload);
    if (sucesso) {
      dispararSucesso();
      return true;
    }

    setPendingItem(itemPayload);
    setShowStoreSwitchModal(true);
    return false;
  };

  const confirmarTroca = () => {
    if (!pendingItem) {
      setShowStoreSwitchModal(false);
      return;
    }

    addToCart(pendingItem, true);
    setPendingItem(null);
    setShowStoreSwitchModal(false);
    setShowProductModal(false);
    dispararSucesso();
  };

  return (
    <>
      <div className="col-12 col-lg-6">
        <div
          className={`menu-item-card ${isSoldOut ? "menu-item-card-sold-out" : ""}`}
          onClick={openProductModal}
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
              {isSoldOut ? <span className="menu-item-badge-soldout">Esgotado</span> : null}
            </div>
            <small style={{ color: "#64748b", fontWeight: 600 }}>{categoryName}</small>
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

            <button
              onClick={openProductModal}
              disabled={isSoldOut}
              className={`menu-mini-btn add ${isSoldOut ? "disabled" : ""}`}
              style={{
                transform: animacao ? "scale(1.2)" : "scale(1)",
                transition: "transform 0.2s",
              }}
              title={isSoldOut ? "Prato esgotado" : "Personalizar e adicionar ao carrinho"}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <MenuProductModal
        isOpen={showProductModal}
        prato={prato}
        isSoldOut={isSoldOut}
        onClose={() => setShowProductModal(false)}
        onAdd={handleAddFromModal}
      />

      {showStoreSwitchModal && (
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
            zIndex: 1190,
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
                onClick={() => {
                  setShowStoreSwitchModal(false);
                  setPendingItem(null);
                }}
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

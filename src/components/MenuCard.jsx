import { useMemo, useState } from "react";
import { UtensilsCrossed, Plus, AlertTriangle } from "lucide-react";
import { useCart } from "../context/CartContext";
import "../css/pages/menus.css";
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
          className={`relative flex cursor-pointer gap-3 rounded-2xl border bg-white p-3 transition-shadow hover:shadow-md ${
            isSoldOut ? "cursor-default border-gray-100 opacity-60" : "border-gray-100"
          }`}
          onClick={openProductModal}
        >
          {notificacao && (
            <div className="menu-toast success">Adicionado ao carrinho.</div>
          )}
          {showSoldOutNotice && (
            <div className="menu-toast error">Prato esgotado de momento.</div>
          )}

          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-gray-900">{prato.nome}</span>
            <span className="mt-0.5 block text-xs text-gray-400">{categoryName}</span>
            {isSoldOut ? (
              <span className="mt-1 inline-block rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-500">
                Esgotado
              </span>
            ) : null}
            <p className="mt-2 text-sm font-bold text-[#e62429]">{displayPrice.toFixed(2)}€</p>
          </div>

          <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-[#6b1a1a] via-[#b91c1c] to-[#e8a0a0]">
            {prato.imagem ? (
              <img src={prato.imagem} alt={prato.nome} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <UtensilsCrossed className="h-9 w-9 text-white/50" aria-hidden="true" />
              </div>
            )}
            <button
              onClick={openProductModal}
              disabled={isSoldOut}
              className={`absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#e62429] to-[#c91b20] text-white shadow-md transition-transform ${
                isSoldOut ? "cursor-not-allowed from-gray-300 to-gray-400" : "hover:scale-110"
              }`}
              style={{ transform: animacao ? "scale(1.2)" : undefined }}
              title={isSoldOut ? "Prato esgotado" : "Adicionar ao carrinho"}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
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
            <AlertTriangle style={{ width: 50, height: 50, color: "#ff9800", marginBottom: 15 }} aria-hidden="true" />
            <h3 style={{ margin: "0 0 10px 0", color: "#333" }}>Atenção</h3>
            <p style={{ color: "#666", marginBottom: "25px", fontSize: "0.95rem" }}>
              Já tens produtos de outro restaurante no carrinho. Desejas limpar o carrinho e iniciar um novo pedido aqui?
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

/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useContext, useEffect } from "react";
import { normalizePricedItem } from "../services/pricingService";
import { buildCartLineId } from "../services/menuOptionsService";

const CartContext = createContext();

function normalizeSpecialInstructions(value) {
  const text = String(value || "").trim();
  return text || "";
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    const savedCart = localStorage.getItem("pedeja_cart");
    if (!savedCart) return [];

    try {
      const parsed = JSON.parse(savedCart);
      return Array.isArray(parsed)
        ? parsed.map((item) => {
          const normalized = normalizePricedItem(item);
          return { ...normalized, cart_line_id: buildCartLineId(normalized) };
        })
        : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("pedeja_cart", JSON.stringify(cart));
  }, [cart]);

  const clearCart = () => {
    setCart([]);
  };

  const addToCart = (item, limparPrimeiro = false) => {
    // Blindagem: item marcado como esgotado nunca entra no carrinho.
    if (item?.ativo === false) {
      return false;
    }

    const requestedQuantity = Math.max(
      1,
      Number(item?.quantityToAdd || item?.quantity_to_add || item?.qtd_to_add || 1) || 1,
    );
    const specialInstructions = normalizeSpecialInstructions(
      item?.instrucoes_especiais ?? item?.specialInstructions ?? item?.special_instructions,
    );
    const normalizedItem = normalizePricedItem({
      ...item,
      instrucoes_especiais: specialInstructions || null,
      specialInstructions,
      special_instructions: specialInstructions,
    });
    const normalizedLineItem = {
      ...normalizedItem,
      instrucoes_especiais: specialInstructions || null,
      specialInstructions,
      special_instructions: specialInstructions,
    };
    const cartLineId = buildCartLineId(normalizedLineItem);

    // 1. Modo forcado (substituir tudo)
    if (limparPrimeiro) {
      setCart([{ ...normalizedLineItem, cart_line_id: cartLineId, qtd: requestedQuantity }]);
      return true;
    }

    // 2. Verificacao de seguranca: carrinho de 1 loja
    if (cart.length > 0) {
      const lojaNoCarrinho = cart[0].idloja;
      const lojaDoNovoItem = normalizedLineItem.idloja;

      if (lojaNoCarrinho && lojaDoNovoItem && lojaNoCarrinho !== lojaDoNovoItem) {
        return false;
      }
    }

    // 3. Adicionar normalmente
    setCart((prevCart) => {
      const existingItem = prevCart.find((i) => (i.cart_line_id || buildCartLineId(i)) === cartLineId);
      if (existingItem) {
        return prevCart.map((i) =>
          (i.cart_line_id || buildCartLineId(i)) === cartLineId
            ? { ...i, ...normalizedLineItem, cart_line_id: cartLineId, qtd: i.qtd + requestedQuantity }
            : i,
        );
      }
      return [...prevCart, { ...normalizedLineItem, cart_line_id: cartLineId, qtd: requestedQuantity }];
    });

    return true;
  };

  const decreaseQuantity = (id) => {
    setCart((prevCart) => {
      return prevCart.map((item) => {
        if ((item.cart_line_id || buildCartLineId(item)) === id) {
          return { ...item, qtd: Math.max(1, item.qtd - 1) };
        }
        return item;
      });
    });
  };

  const removeFromCart = (id) => {
    setCart((prevCart) => prevCart.filter((item) => (item.cart_line_id || buildCartLineId(item)) !== id));
  };

  return (
    <CartContext.Provider value={{ cart, addToCart, decreaseQuantity, removeFromCart, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}

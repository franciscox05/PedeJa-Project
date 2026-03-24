/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useContext, useEffect } from "react";
import { normalizePricedItem } from "../services/pricingService";
import { buildCartLineId } from "../services/menuOptionsService";

const CartContext = createContext();

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

    const normalizedItem = normalizePricedItem(item);
    const cartLineId = buildCartLineId(normalizedItem);

    // 1. Modo forcado (substituir tudo)
    if (limparPrimeiro) {
      setCart([{ ...normalizedItem, cart_line_id: cartLineId, qtd: 1 }]);
      return true;
    }

    // 2. Verificacao de seguranca: carrinho de 1 loja
    if (cart.length > 0) {
      const lojaNoCarrinho = cart[0].idloja;
      const lojaDoNovoItem = item.idloja;

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
            ? { ...i, ...normalizedItem, cart_line_id: cartLineId, qtd: i.qtd + 1 }
            : i,
        );
      }
      return [...prevCart, { ...normalizedItem, cart_line_id: cartLineId, qtd: 1 }];
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

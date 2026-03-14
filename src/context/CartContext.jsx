import { createContext, useState, useContext, useEffect } from "react";

const CartContext = createContext();

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    const savedCart = localStorage.getItem("pedeja_cart");
    return savedCart ? JSON.parse(savedCart) : [];
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

    // 1. Modo forcado (substituir tudo)
    if (limparPrimeiro) {
      setCart([{ ...item, qtd: 1 }]);
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
      const existingItem = prevCart.find((i) => i.idmenu === item.idmenu);
      if (existingItem) {
        return prevCart.map((i) =>
          i.idmenu === item.idmenu ? { ...i, qtd: i.qtd + 1 } : i,
        );
      }
      return [...prevCart, { ...item, qtd: 1 }];
    });

    return true;
  };

  const decreaseQuantity = (id) => {
    setCart((prevCart) => {
      return prevCart.map((item) => {
        if (item.idmenu === id) {
          return { ...item, qtd: Math.max(1, item.qtd - 1) };
        }
        return item;
      });
    });
  };

  const removeFromCart = (id) => {
    setCart((prevCart) => prevCart.filter((item) => item.idmenu !== id));
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

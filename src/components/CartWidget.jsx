import React from "react";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";

// AQUI ESTÁ O DETALHE: Importamos o CSS específico deste componente
import "../css/CartWidget.css"; 

export default function CartWidget() {
  const { cart } = useCart();
  const qtdTotal = cart.reduce((acc, item) => acc + item.qtd, 0);

  return (
    <Link to="/carrinho" className="cart-widget-header">
      <span className="material-icons" style={{ fontSize: '24px' }}>shopping_cart</span>
      {qtdTotal > 0 && (
        <span className="cart-badge-count">{qtdTotal}</span>
      )}
    </Link>
  );
}
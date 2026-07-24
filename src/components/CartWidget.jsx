import { Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { useCart } from "../context/CartContext";

import "../css/CartWidget.css";

export default function CartWidget() {
  const { cart } = useCart();
  const qtdTotal = cart.reduce((acc, item) => acc + item.qtd, 0);

  return (
    <Link to="/carrinho" className="cart-widget-header">
      <ShoppingCart className="cart-widget-icon" aria-hidden="true" />
      {qtdTotal > 0 && (
        <span className="cart-badge-count">{qtdTotal}</span>
      )}
    </Link>
  );
}
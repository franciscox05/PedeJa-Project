import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Ticket } from "lucide-react";
import { fetchAvailableCoupons } from "../../services/couponsService";
import { extractUserId } from "../../utils/roles";
import { useAlert } from "../../context/AlertContext";

function formatDiscount(coupon) {
  if (coupon.discount_type === "percent") return `-${Number(coupon.discount_value)}%`;
  return `-${Number(coupon.discount_value).toFixed(2)}€`;
}

function formatEndsAt(value) {
  if (!value) return "Sem data limite";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data limite";
  return `Válido até ${date.toLocaleDateString("pt-PT")}`;
}

export default function ProfileCupoes() {
  const { user } = useOutletContext();
  const { showError } = useAlert();
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchAvailableCoupons(extractUserId(user));
        if (active) setCoupons(data);
      } catch (error) {
        if (active) showError(error?.message || "Não foi possível carregar os cupões.");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [user, showError]);

  if (loading) {
    return <p className="text-sm text-gray-500">A carregar cupões disponíveis...</p>;
  }

  if (coupons.length === 0) {
    return (
      <div className="py-10 text-center">
        <Ticket className="mx-auto mb-3 h-12 w-12 text-gray-200" aria-hidden="true" />
        <p className="text-sm text-gray-500">Não há cupões disponíveis para ti neste momento.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {coupons.map((coupon) => (
        <article
          key={coupon.id}
          className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[#e62429]/40 bg-red-50/60 p-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#e62429] text-white">
              <Ticket className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="font-mono text-sm font-bold tracking-wide text-gray-900">{coupon.code}</p>
              <p className="text-xs text-gray-500">
                {coupon.min_order_value > 0
                  ? `Pedido mínimo de ${Number(coupon.min_order_value).toFixed(2)}€`
                  : "Sem valor mínimo de pedido"}
              </p>
              <p className="text-xs text-gray-400">{formatEndsAt(coupon.ends_at)}</p>
            </div>
          </div>
          <span className="flex-shrink-0 text-lg font-black text-[#e62429]">{formatDiscount(coupon)}</span>
        </article>
      ))}
    </div>
  );
}

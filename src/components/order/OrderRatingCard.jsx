import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { fetchMyOrderRating, rateOrder } from "../../services/orderRatingService";
import { useAlert } from "../../context/AlertContext";

const STARS = [1, 2, 3, 4, 5];

export default function OrderRatingCard({ orderId, callerUserId, storeName }) {
  const { showError } = useAlert();
  const [loading, setLoading] = useState(true);
  const [existingRating, setExistingRating] = useState(null);
  const [hoverValue, setHoverValue] = useState(0);
  const [selectedValue, setSelectedValue] = useState(0);
  const [comentario, setComentario] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await fetchMyOrderRating(callerUserId, orderId);
        if (cancelled) return;
        if (data?.id) {
          setExistingRating(data);
          setSelectedValue(data.classificacao);
          setComentario(data.comentario || "");
        }
      } catch (error) {
        console.error("OrderRatingCard: falha ao carregar avaliacao", { error: error?.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (orderId && callerUserId) load();
    else setLoading(false);

    return () => {
      cancelled = true;
    };
  }, [orderId, callerUserId]);

  const handleSubmit = async () => {
    if (!selectedValue) {
      showError("Escolhe de 1 a 5 estrelas antes de enviar.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await rateOrder(callerUserId, orderId, selectedValue, comentario);
      setExistingRating(result);
      toast.success("Obrigado pela tua avaliação!");
    } catch (error) {
      showError(error?.message || "Não foi possível enviar a avaliação.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return null;
  }

  const displayValue = hoverValue || selectedValue;
  const isReadOnly = Boolean(existingRating);

  return (
    <article className="pedido-panel pedido-rating-card">
      <h3>Avalia o pedido{storeName ? ` de ${storeName}` : ""}</h3>

      <div className="pedido-rating-stars" role={isReadOnly ? undefined : "radiogroup"} aria-label="Classificacao de 1 a 5 estrelas">
        {STARS.map((star) => (
          <button
            key={star}
            type="button"
            className={`pedido-rating-star${star <= displayValue ? " is-filled" : ""}`}
            disabled={isReadOnly}
            onMouseEnter={() => !isReadOnly && setHoverValue(star)}
            onMouseLeave={() => !isReadOnly && setHoverValue(0)}
            onClick={() => !isReadOnly && setSelectedValue(star)}
            aria-label={`${star} estrela${star === 1 ? "" : "s"}`}
          >
            {star <= displayValue ? "★" : "☆"}
          </button>
        ))}
      </div>

      {isReadOnly ? (
        existingRating.comentario ? <p className="pedido-muted">"{existingRating.comentario}"</p> : null
      ) : (
        <>
          <textarea
            className="pedido-rating-textarea"
            placeholder="Comentário (opcional)"
            value={comentario}
            maxLength={500}
            onChange={(event) => setComentario(event.target.value)}
          />
          <button
            type="button"
            className="pedido-btn"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? "A enviar..." : "Enviar avaliacao"}
          </button>
        </>
      )}

      {isReadOnly ? <p className="pedido-muted">Avaliação registada. Obrigado!</p> : null}
    </article>
  );
}

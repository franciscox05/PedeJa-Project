import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { fetchFavoriteStores, toggleFavoriteStore } from "../../services/favoriteStoresService";
import { useAlert } from "../../context/AlertContext";

export default function ProfileFavoritos() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const { showError } = useAlert();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    let active = true;

    const loadFavorites = async () => {
      if (!user) {
        if (active) setStores([]);
        return;
      }

      setLoading(true);
      try {
        const data = await fetchFavoriteStores(user);
        if (active) setStores(data);
      } catch (error) {
        console.error("Erro ao carregar favoritos:", error);
        if (active) setStores([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadFavorites();
    window.addEventListener("pedeja-favorites-updated", loadFavorites);
    return () => {
      active = false;
      window.removeEventListener("pedeja-favorites-updated", loadFavorites);
    };
  }, [user]);

  const handleRemove = async (storeId) => {
    setBusyId(String(storeId));
    try {
      await toggleFavoriteStore(user, storeId);
      setStores((prev) => prev.filter((store) => String(store.id) !== String(storeId)));
      window.dispatchEvent(new Event("pedeja-favorites-updated"));
    } catch (error) {
      showError(error?.message || "Nao foi possivel atualizar os favoritos.");
    } finally {
      setBusyId("");
    }
  };

  if (loading) {
    return <p className="profile-note">A carregar restaurantes favoritos...</p>;
  }

  if (stores.length === 0) {
    return <p className="profile-note">Ainda nao adicionaste restaurantes aos favoritos.</p>;
  }

  return (
    <section className="profile-orders-area">
      <div className="profile-favorites-grid">
        {stores.map((store) => (
          <article key={store.id} className="profile-favorite-card">
            <div>
              <p className="profile-order-id">Loja favorita</p>
              <h4>{store.nome}</h4>
              <p className="profile-order-date">{store.morada || "Morada nao definida"}</p>
            </div>

            <div className="profile-order-meta">
              <span className={`profile-status-pill ${store.isIndisponivel ? "is-danger" : "is-success"}`}>
                {store.status}
              </span>
            </div>

            <div className="profile-actions-row profile-actions-row--start">
              <button type="button" className="profile-btn secondary" onClick={() => navigate(`/menus/${store.id}`)}>
                Abrir restaurante
              </button>
              <button
                type="button"
                className="profile-btn ghost"
                disabled={busyId === String(store.id)}
                onClick={() => handleRemove(store.id)}
              >
                {busyId === String(store.id) ? "A remover..." : "Remover dos favoritos"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Heart } from "lucide-react";
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
    return <p className="text-sm text-gray-500">A carregar restaurantes favoritos...</p>;
  }

  if (stores.length === 0) {
    return (
      <div className="py-10 text-center">
        <Heart className="mx-auto mb-3 h-12 w-12 text-gray-200" aria-hidden="true" />
        <p className="text-sm text-gray-500">Ainda nao adicionaste restaurantes aos favoritos.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {stores.map((store) => (
        <article key={store.id} className="grid gap-3 rounded-2xl border border-gray-100 bg-white p-4">
          <div>
            <p className="text-xs font-bold text-[#e62429]">Loja favorita</p>
            <h4 className="mt-0.5 font-bold text-gray-900">{store.nome}</h4>
            <p className="mt-0.5 text-sm text-gray-500">{store.morada || "Morada nao definida"}</p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${
                store.isIndisponivel ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
              }`}
            >
              {store.status}
            </span>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800"
              onClick={() => navigate(`/menus/${store.id}`)}
            >
              Abrir restaurante
            </button>
            <button
              type="button"
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              disabled={busyId === String(store.id)}
              onClick={() => handleRemove(store.id)}
            >
              {busyId === String(store.id) ? "A remover..." : "Remover dos favoritos"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

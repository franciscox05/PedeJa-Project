import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { buscarLojasService } from "../services/supabaseClient.js";
import Logo from "../components/Logo";
import Login from "../components/LoginButton.jsx";
import CartWidget from "../components/CartWidget.jsx";
import Voltar from "../components/Voltar";
import RestauranteCard from "../components/RestauranteCard";
import MenuGlobal from "../components/MenuGlobal.jsx";
import SearchInputLojas from "../components/SearchInputLojas";
import DropDownCategoriasLojas from "../components/DropDownCategoriasLojas";
import {
  fetchFavoriteStoreIds,
  toggleFavoriteStore,
} from "../services/favoriteStoresService";
import { resolveUserRole } from "../utils/roles";

import "../css/index.css";

const FAVORITES_FILTER_ID = "__favorites__";

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export default function Restaurantes() {
  const { city, category } = useParams();
  const [restaurantes, setRestaurantes] = useState([]);
  const [user, setUser] = useState(null);
  const [favoriteStoreIds, setFavoriteStoreIds] = useState([]);
  const [favoriteBusyId, setFavoriteBusyId] = useState("");
  const [selectedSubCats, setSelectedSubCats] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  const isCustomer = resolveUserRole(user) === "customer";

  useEffect(() => {
    const syncUser = () => {
      try {
        const raw = localStorage.getItem("pedeja_user");
        setUser(raw ? JSON.parse(raw) : null);
      } catch {
        setUser(null);
      }
    };

    syncUser();
    window.addEventListener("storage", syncUser);
    window.addEventListener("pedeja-user-updated", syncUser);

    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener("pedeja-user-updated", syncUser);
    };
  }, []);

  useEffect(() => {
    if (city && category) {
      localStorage.setItem("ultima_rota_lojas", `/lojas/${city}/${category}`);
    }
  }, [city, category]);

  useEffect(() => {
    const carregarLojas = async () => {
      setLoading(true);
      const dados = await buscarLojasService(category);
      setRestaurantes(dados);
      setLoading(false);
    };

    carregarLojas();
    setSelectedSubCats([]);
    setSearchTerm("");
  }, [category]);

  useEffect(() => {
    let active = true;

    const loadFavorites = async () => {
      if (!isCustomer || !user) {
        if (active) setFavoriteStoreIds([]);
        return;
      }

      try {
        const ids = await fetchFavoriteStoreIds(user);
        if (active) setFavoriteStoreIds(ids);
      } catch (error) {
        console.error("Erro ao carregar favoritos:", error);
        if (active) setFavoriteStoreIds([]);
      }
    };

    loadFavorites();

    const refreshFavorites = () => loadFavorites();
    window.addEventListener("pedeja-favorites-updated", refreshFavorites);

    return () => {
      active = false;
      window.removeEventListener("pedeja-favorites-updated", refreshFavorites);
    };
  }, [isCustomer, user]);

  const listaSubCategorias = useMemo(() => {
    const map = new Map();

    (restaurantes || []).forEach((res) => {
      (res.subCategorias || []).forEach((cat) => {
        const key = normalizeText(cat?.categoria);
        if (!key || map.has(key)) return;

        map.set(key, {
          idcategoria: cat?.idcategoria ?? key,
          categoria: cat?.categoria,
        });
      });
    });

    const categorias = Array.from(map.values());

    if (isCustomer) {
      return [
        { idcategoria: FAVORITES_FILTER_ID, categoria: "Apenas Favoritos" },
        ...categorias,
      ];
    }

    return categorias;
  }, [isCustomer, restaurantes]);

  const lojasFiltradas = restaurantes.filter((res) => {
    const term = normalizeText(searchTerm);
    const favoritesOnly = selectedSubCats.includes(FAVORITES_FILTER_ID);
    const selectedCategoryIds = selectedSubCats.filter(
      (item) => item !== FAVORITES_FILTER_ID,
    );

    const matchesSearch = !term || normalizeText(res.nome).includes(term);
    const matchesFavorites =
      !favoritesOnly || favoriteStoreIds.includes(Number(res.id));

    const matchesDropdown =
      selectedCategoryIds.length === 0 ||
      (res.subCategorias || []).some((c) =>
        selectedCategoryIds.includes(String(c.idcategoria)),
      );

    return matchesSearch && matchesFavorites && matchesDropdown;
  });

  const hasActiveFilters =
    Boolean(searchTerm.trim()) || selectedSubCats.length > 0;

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedSubCats([]);
  };

  const handleToggleFavorite = async (restaurante) => {
    if (!user) {
      window.dispatchEvent(new Event("abrirLogin"));
      return;
    }

    setFavoriteBusyId(String(restaurante.id));
    try {
      const result = await toggleFavoriteStore(user, restaurante.id);
      setFavoriteStoreIds((prev) => {
        const asSet = new Set(prev.map((item) => Number(item)));
        if (result.isFavorite) {
          asSet.add(Number(restaurante.id));
        } else {
          asSet.delete(Number(restaurante.id));
        }
        return Array.from(asSet);
      });
      window.dispatchEvent(new Event("pedeja-favorites-updated"));
    } catch (error) {
      alert(error?.message || "Nao foi possivel atualizar os favoritos.");
    } finally {
      setFavoriteBusyId("");
    }
  };

  return (
    <main className="restaurantes-main">
      <Logo />

      <div className="header-right-actions">
        <Login />
        <CartWidget />
      </div>

      <div id="wave-top"></div>

      <div className="container restaurantes-container">
        <h1 className="restaurantes-title">
          {category ? category.replace("-", " ") : "Categoria"}
          <span className="restaurantes-subtitle"> em {city}</span>
        </h1>

        <div className="filtros-row">
          <SearchInputLojas value={searchTerm} onSearch={setSearchTerm} />
          <DropDownCategoriasLojas
            categorias={listaSubCategorias}
            valor={selectedSubCats}
            onChange={setSelectedSubCats}
          />
          {hasActiveFilters ? (
            <button
              type="button"
              className="clear-filters-btn"
              onClick={clearFilters}
            >
              Limpar filtros
            </button>
          ) : null}
        </div>

        <div className="row justify-content-center">
          {loading ? (
            <div className="col-12 text-center" style={{ padding: "50px" }}>
              <p style={{ color: "white", fontSize: "1.2rem" }}>
                A carregar...
              </p>
            </div>
          ) : lojasFiltradas.length > 0 ? (
            lojasFiltradas.map((res) => (
              <RestauranteCard
                key={res.id}
                restaurante={res}
                showFavoriteButton={isCustomer}
                isFavorite={favoriteStoreIds.includes(Number(res.id))}
                favoriteBusy={favoriteBusyId === String(res.id)}
                onToggleFavorite={handleToggleFavorite}
              />
            ))
          ) : (
            <div className="col-12 text-center">
              <p style={{ color: "white" }}>
                {hasActiveFilters
                  ? "Nenhum resultado para estes filtros."
                  : "Nenhum estabelecimento encontrado."}
              </p>
            </div>
          )}
        </div>
      </div>

      <Voltar />
      <MenuGlobal />
    </main>
  );
}

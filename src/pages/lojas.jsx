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

import "../css/index.css";

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
  const [selectedSubCats, setSelectedSubCats] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

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

    return Array.from(map.values());
  }, [restaurantes]);

  const lojasFiltradas = restaurantes.filter((res) => {
    const term = normalizeText(searchTerm);

    const matchesSearch = !term || normalizeText(res.nome).includes(term);

    const matchesDropdown =
      selectedSubCats.length === 0
      || (res.subCategorias || []).some((c) => selectedSubCats.includes(String(c.idcategoria)));

    return matchesSearch && matchesDropdown;
  });

  const hasActiveFilters = Boolean(searchTerm.trim()) || selectedSubCats.length > 0;

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedSubCats([]);
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
          <DropDownCategoriasLojas categorias={listaSubCategorias} valor={selectedSubCats} onChange={setSelectedSubCats} />
          {hasActiveFilters ? (
            <button type="button" className="clear-filters-btn" onClick={clearFilters}>
              Limpar filtros
            </button>
          ) : null}
        </div>

        <br />

        <div className="row justify-content-center">
          {loading ? (
            <div className="col-12 text-center" style={{ padding: "50px" }}>
              <p style={{ color: "white", fontSize: "1.2rem" }}>A carregar...</p>
            </div>
          ) : lojasFiltradas.length > 0 ? (
            lojasFiltradas.map((res) => <RestauranteCard key={res.id} restaurante={res} />)
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

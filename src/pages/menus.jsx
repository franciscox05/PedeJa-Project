import { useMemo, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  buscarMenusService,
  buscarDadosLojaService,
  supabase,
} from "../services/supabaseClient.js";
import { normalizeGroupedMenuPricing } from "../services/pricingService";

import Logo from "../components/Logo";
import Voltar from "../components/Voltar";
import MenuHeader from "../components/MenuHeader";
import MenuCategory from "../components/MenuCategory";
import MenuLoading from "../components/MenuLoading";
import MenuEmpty from "../components/MenuEmpty.jsx";
import MenuGlobal from "../components/MenuGlobal.jsx";
import Login from "../components/LoginButton.jsx";
import CartWidget from "../components/CartWidget.jsx";

import "../css/pages/menus.css";

function slugifyCategory(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function Menus() {
  const { idloja } = useParams();
  const [menuBaseAgrupado, setMenuBaseAgrupado] = useState({});
  const [loading, setLoading] = useState(true);

  const [lojaInfo, setLojaInfo] = useState({
    nome: "Carregando...",
    status: "...",
    imagemfundo: "",
    icon: "",
    morada: "",
    taxaentrega: 0,
    comissao_pedeja_percent: 0,
    configuracoes_comissao: null,
    horario_funcionamento: null,
    subCategorias: [],
  });

  useEffect(() => {
    const carregarDados = async () => {
      setLoading(true);

      const [dadosMenu, dadosLoja] = await Promise.all([
        buscarMenusService(idloja),
        buscarDadosLojaService(idloja),
      ]);

      const normalizedLoja = dadosLoja || {};

      setMenuBaseAgrupado(dadosMenu || {});
      setLojaInfo(normalizedLoja);
      setLoading(false);
    };

    carregarDados();
  }, [idloja]);

  const menuAgrupado = useMemo(
    () => normalizeGroupedMenuPricing(menuBaseAgrupado, lojaInfo),
    [lojaInfo, menuBaseAgrupado],
  );

  useEffect(() => {
    if (!idloja) return undefined;

    const channel = supabase
      .channel(`store-commission-menu-${idloja}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "lojas",
          filter: `idloja=eq.${idloja}`,
        },
        (payload) => {
          setLojaInfo((prev) => ({
            ...prev,
            comissao_pedeja_percent: Number(payload?.new?.comissao_pedeja_percent || 0),
            configuracoes_comissao: payload?.new?.configuracoes_comissao || null,
          }));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [idloja]);

  const categorias = useMemo(() => Object.keys(menuAgrupado || {}), [menuAgrupado]);

  const scrollToCategory = (categoria) => {
    const anchorId = `cat-${slugifyCategory(categoria)}`;
    const el = document.getElementById(anchorId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <main className="menus-main">
      <div className="header-right-actions">
        <Login />
        <CartWidget />
      </div>

      <MenuGlobal />
      <Voltar />
      <Logo />
      <div id="wave-top"></div>

      <MenuHeader lojaInfo={lojaInfo} />

      {categorias.length > 1 && (
        <div className="container menu-quicknav-wrap">
          <div className="menu-quicknav">
            {categorias.map((categoria) => (
              <button key={categoria} onClick={() => scrollToCategory(categoria)}>
                {categoria}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="container menu-lista-container">
        {loading ? (
          <MenuLoading />
        ) : categorias.length > 0 ? (
          categorias.map((nome) => (
            <MenuCategory
              key={nome}
              nomeCategoria={nome}
              pratos={menuAgrupado[nome]}
              anchorId={`cat-${slugifyCategory(nome)}`}
            />
          ))
        ) : (
          <MenuEmpty idloja={idloja} />
        )}
      </div>

      <div style={{ height: "100px" }}></div>
    </main>
  );
}


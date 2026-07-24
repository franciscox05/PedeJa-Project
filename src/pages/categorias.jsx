// src/pages/categorias.jsx
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import "../css/index.css";
import Logo from "../components/Logo";
import Voltar from "../components/Voltar";
import Login from "../components/LoginButton.jsx";
import TipoLojaCard from "../components/TipoLojaCard";
import { buscarCategoriasService } from "../services/supabaseClient.js";
import MenuGlobal from "../components/MenuGlobal.jsx";

function Categorias() {
  const { city } = useParams();
  const [categorias, setCategorias] = useState([]);

  useEffect(() => {
    const carregarDados = async () => {
      const dados = await buscarCategoriasService();
      setCategorias(dados);
    };

    carregarDados();
  }, []);

  return (
    <div className="home-container">
      <Logo />
      <Login />
      <div id="wave-top"></div>

      <div id="content" className="row justify-content-lg-center">
        <div id="div-right" className="col-12 col-lg-8">
          <div id="base-right">
            <h1 className="titulo-cidade">{city?.toUpperCase()}</h1>
            <ul className="grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3">
              {categorias.map((cat) => (
                <TipoLojaCard key={cat.id} cat={cat} city={city} />
              ))}
            </ul>
          </div>
        </div>
      </div>

      <Voltar />
      <MenuGlobal />
    </div>
  );
}

export default Categorias;

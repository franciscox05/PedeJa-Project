import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import "../css/index.css";
import BarceloImg from "../assets/img/cidades/barcelos.png";

function Cidades() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const sessionUser = localStorage.getItem("pedeja_user");
    if (sessionUser) {
      setUser(JSON.parse(sessionUser));
    }
  }, []);

  const getPrimeiroNome = (nomeCompleto) => {
    if (!nomeCompleto) return "";
    return nomeCompleto.split(' ')[0].toUpperCase();
  };

  return (
    <div
      className="col-12 col-xs-12 col-sm-12 col-md-12 col-lg-6 col-xl-5"
      id="div-right"
    >
      <div id="base-right">
        <div id="title" className="col-12">
          {/* MUDANÇA AQUI: Adicionei style para diminuir a fonte para 32px (2rem) 
              e ajustei a altura da linha para ficar mais compacto */}
          <h1 style={{ fontSize: "2rem", lineHeight: "1.2", marginBottom: "15px" }}>
            {user ? (
              /* --- MENSAGEM COM O PRIMEIRO NOME --- */
              <>
                OLÁ {getPrimeiroNome(user.username)},
                <br />
                SEJA BEM-VINDO AO PEDEJÁ!
              </>
            ) : (
              /* --- MENSAGEM PADRÃO --- */
              <>
                BEM-VINDO AO
                <br />
                PEDEJÁ!
              </>
            )}
          </h1>
        </div>
        
        <div id="subtitle" className="col-12">
          {/* Também podes ajustar o subtítulo se achares necessário */}
          <h2 style={{ fontSize: "1rem", marginTop: "0" }}>
            Desde Restaurantes a Tabacaria, Sex Shop e muito mais...
          </h2>
        </div>
        
        {/* Removi o <div id="titlebar"> com o texto "Escolha o concelho..." 
            porque estava a ocupar espaço e o subtítulo já diz tudo, 
            mas se quiseres manter, podes descomentar abaixo: 
        */}
        {/* <div id="titlebar" className="col-12">
          <p style={{ fontSize: "0.9rem" }}>Escolha o concelho ou cidade</p>
        </div> 
        */}

        <div id="bar" className="col-12" style={{ marginTop: "20px" }}>
          <img
            onClick={() => navigate("/categorias/barcelos")}
            src={BarceloImg}
            alt="Barcelos"
            // Garante que a imagem não fica gigante
            style={{ maxWidth: "100%", height: "auto" }} 
          />
        </div>
      </div>
    </div>
  );
}

export default Cidades;
import { useNavigate } from "react-router-dom";
import "../css/index.css";
import BarceloImg from "../assets/img/cidades/barcelos.png";
import { useAuth } from "../context/AuthContext";

function Cidades() {
  const navigate = useNavigate();
  const { user } = useAuth();

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
          <h1 style={{ fontSize: "2rem", lineHeight: "1.2", marginBottom: "15px" }}>
            {user ? (
              <>
                OLÁ {getPrimeiroNome(user.username)},
                <br />
                SEJA BEM-VINDO AO PEDEJÁ!
              </>
            ) : (
              <>
                BEM-VINDO AO
                <br />
                PEDEJÁ!
              </>
            )}
          </h1>
        </div>

        <div id="subtitle" className="col-12">
          <h2 style={{ fontSize: "1rem", marginTop: "0" }}>
            Desde Restaurantes a Tabacaria, Sex Shop e muito mais...
          </h2>
        </div>

        <div id="bar" className="col-12" style={{ marginTop: "20px" }}>
          <img
            onClick={() => navigate("/categorias/barcelos")}
            src={BarceloImg}
            alt="Barcelos"
            style={{ maxWidth: "100%", height: "auto" }}
          />
        </div>
      </div>
    </div>
  );
}

export default Cidades;

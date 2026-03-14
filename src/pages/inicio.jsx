import Bike from "../components/Bike";
import Login from "../components/LoginButton";
import Cidades from "../components/Cidades";
import Logo from "../components/Logo";
import "../css/index.css";
import MenuGlobal from "../components/MenuGlobal";

function Inicio() {
  return (
    <>
      <div className="home-container">
        <Logo />
        <Login />
        <div id="wave-top"></div>
        <div id="content" className="row justify-content-lg-center">
          <Bike />
          <Cidades />
        </div>
        <MenuGlobal />
      </div>
    </>
  );
}
export default Inicio;

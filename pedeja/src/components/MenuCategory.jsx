import "/src/css/index.css";
import MenuCard from "./MenuCard";

function MenuCategory({ nomeCategoria, pratos }) {
  return (
    <div className="categoria-wrapper" style={{ marginBottom: "40px" }}>
      <h2 className="menu-seccao-titulo">{nomeCategoria}</h2>
      <div className="row gy-4">
        {pratos.map((prato) => (
          <MenuCard key={prato.idmenu || prato.id} prato={prato} />
        ))}
      </div>
    </div>
  );
}
export default MenuCategory;

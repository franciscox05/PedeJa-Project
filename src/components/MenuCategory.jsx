import "/src/css/index.css";
import MenuCard from "./MenuCard";

function MenuCategory({ nomeCategoria, pratos, anchorId }) {
  return (
    <div id={anchorId} className="categoria-wrapper" style={{ marginBottom: "36px" }}>
      <h2 className="menu-seccao-titulo">{nomeCategoria}</h2>
      <div className="row g-3 menu-items-grid">
        {pratos.map((prato) => (
          <MenuCard key={prato.idmenu || prato.id} prato={prato} />
        ))}
      </div>
    </div>
  );
}

export default MenuCategory;

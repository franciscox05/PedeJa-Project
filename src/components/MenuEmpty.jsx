export const MenuEmpty = ({ idloja }) => (
  <div className="text-center" style={{ padding: "50px", color: "#333" }}>
    <h3>Nenhum menu encontrado.</h3>
    <p>O estabelecimento ID {idloja} ainda não tem pratos associados.</p>
  </div>
);

export default MenuEmpty;

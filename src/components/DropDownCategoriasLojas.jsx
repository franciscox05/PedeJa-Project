import { useState, useEffect, useRef } from "react";
import "../css/components/DropDownCategoriasLojas.css";
import filtroIcon from "../assets/img/filterIcon.png";
import arrowDown from "../assets/img/arrow_down.png"; 

function DropDownCategoriasLojas({ categorias, valor, onChange }) {
  const [aberto, setAberto] = useState(false);
  const dropdownRef = useRef(null);

  // --- LÓGICA DO TEXTO NA PÍLULA ---
  let textoParaMostrar = "Todas as Categorias";
  
  if (valor && valor.length === 1) {
    // Se tiver apenas 1 selecionada, mostra o nome dela
    const cat = categorias?.find(c => c.idcategoria.toString() === valor[0]);
    if (cat) textoParaMostrar = cat.categoria;
  } else if (valor && valor.length > 1) {
    // Se tiver várias, mostra a contagem
    textoParaMostrar = `${valor.length} Selecionadas`;
  }

  // Fechar o menu se clicar fora dele
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- LÓGICA DE SELEÇÃO (TOGGLE) ---
  const handleSelect = (id) => {
    if (id === "") {
      // Clicou em "Todas as Categorias" -> Limpa o array
      onChange([]); 
      setAberto(false); // Fecha o menu pois é um reset total
    } else {
      // Clicou numa categoria específica
      if (valor.includes(id)) {
        // Se já estava, REMOVE do array
        onChange(valor.filter(item => item !== id));
      } else {
        // Se não estava, ADICIONA ao array
        onChange([...valor, id]);
      }
      // Não fechamos o menu (setAberto) para deixar escolher mais
    }
  };

  return (
    <div className="dropdown-container" ref={dropdownRef}>
      
      {/* A PÍLULA (BOTÃO PRINCIPAL) */}
      <div 
        className={`filter-pill ${aberto ? "ativo" : ""}`} 
        onClick={() => setAberto(!aberto)}
      >
        <img src={filtroIcon} className="filter-icon-svg" alt="Filtro" />
        
        <span className="filter-text">
          {textoParaMostrar}
        </span>

        <img 
          src={arrowDown} 
          className={`filter-arrow-img ${aberto ? "rodar" : ""}`} 
          alt="V" 
        />
      </div>

      {/* O MENU MODERNO COM CHECKBOXES */}
      {aberto && (
        <ul className="dropdown-menu-custom">
          
          {/* Opção Padrão (Limpar) */}
          <li 
            className={`dropdown-item ${valor.length === 0 ? "selected" : ""}`}
            onClick={() => handleSelect("")}
          >
            Todas as Categorias
          </li>

          {/* Lista de Categorias */}
          {categorias?.map((cat) => {
            const isSelected = valor.includes(cat.idcategoria.toString());

            return (
              <li 
                key={cat.idcategoria} 
                className={`dropdown-item ${isSelected ? "selected-multi" : ""}`}
                onClick={() => handleSelect(cat.idcategoria.toString())}
              >
                {/* Checkbox Visual */}
                <input 
                  type="checkbox" 
                  checked={isSelected} 
                  readOnly 
                  className="cat-checkbox"
                />
                
                {cat.categoria}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default DropDownCategoriasLojas;
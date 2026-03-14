import "../css/components/SearchInputLojas.css";
import lupaIcon from "../assets/img/pesquisaIcon.svg";

function SearchInputLojas({ onSearch, value = "" }) {
  return (
    <div className="search-container">
      <div className="search-box">
        <img src={lupaIcon} className="search-icon-svg" alt="Pesquisar" />
        <input
          type="text"
          placeholder="Pesquisar restaurante..."
          value={value}
          onChange={(e) => onSearch(e.target.value)}
          className="search-input"
        />
      </div>
    </div>
  );
}

export default SearchInputLojas;

import { useEffect, useMemo, useState } from "react";
import {
  associateRestaurantToUser,
  searchUsersForRestaurantAssociation,
} from "../../services/rbacAdminService";

export default function AdminRestaurantAssociation({ stores = [], onLinked }) {
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!selectedStoreId && stores.length > 0) {
      setSelectedStoreId(String(stores[0].idloja));
    }
  }, [selectedStoreId, stores]);

  const selectedUser = useMemo(
    () => users.find((user) => String(user.idutilizador) === String(selectedUserId)) || null,
    [users, selectedUserId],
  );

  const handleSearch = async (e) => {
    e.preventDefault();
    setSearching(true);
    setError("");
    setSuccess("");

    try {
      const result = await searchUsersForRestaurantAssociation(search, 20);
      setUsers(result);

      if (!selectedUserId && result.length > 0) {
        setSelectedUserId(String(result[0].idutilizador));
      }
    } catch (err) {
      setError(err.message || "Falha ao pesquisar utilizadores.");
      setUsers([]);
    } finally {
      setSearching(false);
    }
  };

  const handleAssociate = async () => {
    if (!selectedUserId) {
      setError("Seleciona um utilizador.");
      return;
    }

    if (!selectedStoreId) {
      setError("Seleciona uma loja.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const result = await associateRestaurantToUser({
        userId: selectedUserId,
        lojaId: selectedStoreId,
      });

      setSuccess(`Utilizador ${result.user.username} associado a ${result.store.nome}.`);

      const refreshed = await searchUsersForRestaurantAssociation(search, 20);
      setUsers(refreshed);

      if (onLinked) {
        await onLinked();
      }
    } catch (err) {
      setError(err.message || "Falha ao associar utilizador ao restaurante.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="panel">
      <h3>Associar utilizador a restaurante</h3>
      <p className="muted">
        Fluxo seguro: utilizador cria conta normal e o admin promove para restaurante associando a uma loja.
      </p>

      <form onSubmit={handleSearch} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", marginBottom: "10px" }}>
        <input
          type="text"
          placeholder="Pesquisar por email, username ou telemovel"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn-dashboard" type="submit" disabled={searching}>
          {searching ? "A pesquisar..." : "Pesquisar"}
        </button>
      </form>

      <div style={{ display: "grid", gap: "8px", marginBottom: "12px" }}>
        <label className="muted" htmlFor="associate-store">Loja destino</label>
        <select
          id="associate-store"
          value={selectedStoreId}
          onChange={(e) => setSelectedStoreId(e.target.value)}
        >
          <option value="">Selecionar loja</option>
          {stores.map((store) => (
            <option key={store.idloja} value={String(store.idloja)}>
              {store.nome} (#{store.idloja})
            </option>
          ))}
        </select>
      </div>

      {users.length === 0 ? (
        <p className="muted" style={{ marginBottom: "10px" }}>Sem resultados. Pesquisa para listar utilizadores.</p>
      ) : (
        <div className="table-wrap" style={{ marginBottom: "12px", maxHeight: "280px", overflowY: "auto" }}>
          <table className="ops-table compact">
            <thead>
              <tr>
                <th>Selecionar</th>
                <th>Utilizador</th>
                <th>Email</th>
                <th>Role atual</th>
                <th>Loja atual</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.idutilizador}>
                  <td>
                    <input
                      type="radio"
                      name="rbac-user"
                      checked={String(selectedUserId) === String(user.idutilizador)}
                      onChange={() => setSelectedUserId(String(user.idutilizador))}
                    />
                  </td>
                  <td>{user.username} (#{user.idutilizador})</td>
                  <td>{user.email || "-"}</td>
                  <td><span className="tag">{user.role}</span></td>
                  <td>{user.loja_id || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedUser && (
        <p className="muted" style={{ marginTop: 0 }}>
          Selecionado: <strong>{selectedUser.username}</strong> ({selectedUser.email || "sem email"})
        </p>
      )}

      {error && <p style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</p>}
      {success && <p style={{ color: "#166534", fontWeight: 700 }}>{success}</p>}

      <button className="btn-dashboard" type="button" disabled={saving || !selectedUserId || !selectedStoreId} onClick={handleAssociate}>
        {saving ? "A associar..." : "Associar utilizador a restaurante"}
      </button>
    </article>
  );
}
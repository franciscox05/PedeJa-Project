import { useEffect, useMemo, useState } from "react";
import {
  associateRestaurantToUser,
  searchUsersForRestaurantAssociation,
} from "../../services/rbacAdminService";
import { useAuth } from "../../context/AuthContext";
import { extractUserId } from "../../utils/roles";

export default function AdminRestaurantAssociation({ stores = [], onLinked }) {
  const { user } = useAuth();
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
    () => users.find((candidate) => String(candidate.idutilizador) === String(selectedUserId)) || null,
    [users, selectedUserId],
  );

  const handleSearch = async (event) => {
    event.preventDefault();
    setSearching(true);
    setError("");
    setSuccess("");

    try {
      const result = await searchUsersForRestaurantAssociation(search, 20, extractUserId(user));
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
        callerUserId: extractUserId(user),
        userId: selectedUserId,
        lojaId: selectedStoreId,
      });

      setSuccess(`Utilizador ${result.user.username} associado a ${result.store.nome}.`);

      const refreshed = await searchUsersForRestaurantAssociation(search, 20, extractUserId(user));
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
    <article className="panel restaurant-settings-panel">
      <div className="restaurant-settings-header">
        <div>
          <h3>Associar utilizador a restaurante</h3>
          <p className="muted">
            Fluxo seguro: o utilizador cria uma conta normal e o admin promove-a a restaurante, associando-a a uma loja.
          </p>
        </div>
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}
      {success ? <p className="admin-inline-success">{success}</p> : null}

      <section className="restaurant-settings-card">
        <div className="restaurant-settings-card-top">
          <div>
            <h4>1. Escolhe a loja destino</h4>
            <p className="muted">A conta associada passa a gerir esta loja.</p>
          </div>
        </div>

        <div className="restaurant-settings-controls">
          <label className="restaurant-setting-field">
            <span className="restaurant-setting-label">Loja destino</span>
            <select
              value={selectedStoreId}
              onChange={(event) => setSelectedStoreId(event.target.value)}
            >
              <option value="">Selecionar loja</option>
              {stores.map((store) => (
                <option key={store.idloja} value={String(store.idloja)}>
                  {store.nome} (#{store.idloja})
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="restaurant-settings-card">
        <div className="restaurant-settings-card-top">
          <div>
            <h4>2. Encontra o utilizador</h4>
            <p className="muted">Pesquisa por email, nome de utilizador ou telemóvel.</p>
          </div>
        </div>

        <form className="association-search-row" onSubmit={handleSearch}>
          <input
            type="text"
            placeholder="Ex: joao@email.com"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button className="btn-dashboard small" type="submit" disabled={searching}>
            {searching ? "A pesquisar..." : "Pesquisar"}
          </button>
        </form>

        {users.length === 0 ? (
          <p className="muted association-empty-hint">Sem resultados. Pesquisa para listar utilizadores.</p>
        ) : (
          <div className="table-wrap association-results-wrap">
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
                {users.map((candidate) => (
                  <tr key={candidate.idutilizador}>
                    <td>
                      <input
                        type="radio"
                        name="rbac-user"
                        checked={String(selectedUserId) === String(candidate.idutilizador)}
                        onChange={() => setSelectedUserId(String(candidate.idutilizador))}
                      />
                    </td>
                    <td>{candidate.username} (#{candidate.idutilizador})</td>
                    <td>{candidate.email || "-"}</td>
                    <td><span className="tag">{candidate.role}</span></td>
                    <td>{candidate.loja_id || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="restaurant-settings-card">
        <div className="restaurant-settings-card-top">
          <div>
            <h4>3. Confirma a associação</h4>
            {selectedUser ? (
              <p className="muted">
                Selecionado: <strong>{selectedUser.username}</strong> ({selectedUser.email || "sem email"})
              </p>
            ) : (
              <p className="muted">Escolhe um utilizador na tabela acima.</p>
            )}
          </div>
        </div>

        <div className="restaurant-settings-actions">
          <button
            className="btn-dashboard"
            type="button"
            disabled={saving || !selectedUserId || !selectedStoreId}
            onClick={handleAssociate}
          >
            {saving ? "A associar..." : "Associar utilizador a restaurante"}
          </button>
        </div>
      </section>
    </article>
  );
}

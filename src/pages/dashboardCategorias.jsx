import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import "../css/pages/dashboard.css";
import DashboardSidebarLayout from "../components/dashboard/DashboardSidebarLayout";
import { ADMIN_DASHBOARD_TABS, resolveAdminTabRoute } from "../constants/adminDashboardTabs";
import { fetchCategories, createCategory, updateCategory, deleteCategory } from "../services/adminCategoriesService";
import { extractUserId } from "../utils/roles";

function parseSessionUser(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function DashboardCategorias() {
  const navigate = useNavigate();
  const userRaw = localStorage.getItem("pedeja_user");
  const user = useMemo(() => parseSessionUser(userRaw), [userRaw]);
  const callerUserId = extractUserId(user);

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await fetchCategories(callerUserId);
      setCategories(rows);
    } catch (err) {
      setError(err?.message || "Nao foi possivel carregar as categorias.");
    } finally {
      setLoading(false);
    }
  }, [callerUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await createCategory(callerUserId, trimmed);
      setNewName("");
      toast.success("Categoria criada.");
      await load();
    } catch (err) {
      toast.error(err?.message || "Nao foi possivel criar a categoria.");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (category) => {
    setEditId(category.idcategoria);
    setEditName(category.categoria);
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditName("");
  };

  const handleSaveEdit = async (idcategoria) => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    setBusyId(idcategoria);
    try {
      await updateCategory(callerUserId, idcategoria, trimmed);
      toast.success("Categoria atualizada.");
      cancelEdit();
      await load();
    } catch (err) {
      toast.error(err?.message || "Nao foi possivel atualizar a categoria.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (category) => {
    setBusyId(category.idcategoria);
    try {
      await deleteCategory(callerUserId, category.idcategoria);
      toast.success("Categoria eliminada.");
      await load();
    } catch (err) {
      toast.error(err?.message || "Nao foi possivel eliminar a categoria.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardSidebarLayout
      tabs={ADMIN_DASHBOARD_TABS}
      activeTab="categorias"
      onTabChange={(tabId) => navigate(resolveAdminTabRoute(tabId))}
      kicker="Catalogo"
      title="Gestao de Categorias"
      subtitle="Taxonomia de categorias usada nos filtros de lojas."
      storageKey="dashboard-admin-sidebar-collapsed"
    >
      <div className="dashboard-tab-section">
        <header className="dashboard-header enterprise-header">
          <div>
            <p className="kicker">Catalogo</p>
            <h1 className="dashboard-title">Categorias</h1>
            <p className="dashboard-subtitle">
              Cria, edita e remove categorias de lojas. A atribuicao de categorias a lojas especificas continua a
              ser feita na gestao de cada loja.
            </p>
          </div>
        </header>

        {error ? <p className="shipday-inline-error">{error}</p> : null}

        <article className="panel">
          <h3>Nova categoria</h3>
          <div className="dashboard-actions">
            <input
              type="text"
              placeholder="Ex: Vegetariano"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              disabled={creating}
            />
            <button
              type="button"
              className="btn-dashboard"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
            >
              {creating ? "A criar..." : "Criar categoria"}
            </button>
          </div>
        </article>

        <article className="panel">
          <h3>Categorias existentes</h3>
          {loading ? (
            <p className="muted">A carregar...</p>
          ) : categories.length === 0 ? (
            <p className="muted">Sem categorias registadas.</p>
          ) : (
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => {
                    const isEditing = editId === category.idcategoria;
                    const isBusy = busyId === category.idcategoria;
                    return (
                      <tr key={category.idcategoria}>
                        <td>
                          {isEditing ? (
                            <input
                              type="text"
                              value={editName}
                              onChange={(event) => setEditName(event.target.value)}
                              disabled={isBusy}
                            />
                          ) : (
                            category.categoria
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="btn-dashboard small"
                                disabled={isBusy}
                                onClick={() => handleSaveEdit(category.idcategoria)}
                              >
                                {isBusy ? "A guardar..." : "Guardar"}
                              </button>
                              <button type="button" className="btn-dashboard small secondary" disabled={isBusy} onClick={cancelEdit}>
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="btn-dashboard small" disabled={isBusy} onClick={() => startEdit(category)}>
                                Editar
                              </button>
                              <button
                                type="button"
                                className="btn-dashboard small secondary"
                                disabled={isBusy}
                                onClick={() => handleDelete(category)}
                              >
                                {isBusy ? "A apagar..." : "Eliminar"}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </div>
    </DashboardSidebarLayout>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import "../css/pages/dashboard.css";
import DashboardSidebarLayout from "../components/dashboard/DashboardSidebarLayout";
import DashboardPageHeader from "../components/dashboard/DashboardPageHeader";
import DashboardPanel from "../components/dashboard/DashboardPanel";
import DashboardEmptyState from "../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../components/dashboard/DashboardLoadingState";
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
    const confirmed = window.confirm(`Eliminar a categoria "${category.categoria}"? Esta acao nao pode ser desfeita.`);
    if (!confirmed) return;

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
        <DashboardPageHeader
          kicker="Catalogo"
          title="Categorias"
          subtitle="Cria, edita e remove categorias de lojas. A atribuicao de categorias a lojas especificas continua a ser feita na gestao de cada loja."
        />

        {error ? <p className="shipday-inline-error">{error}</p> : null}

        <section className="dashboard-grid premium-grid stat-hero-grid">
          <article className="metric-card premium stat-hero" style={{ "--stat-accent": "#e62429" }}>
            <div className="stat-hero-icon stat-hero-icon--red">
              <span className="material-icons" aria-hidden="true">category</span>
            </div>
            <div className="stat-hero-body">
              <div className="metric-label">Categorias criadas</div>
              <div className="metric-value">{categories.length}</div>
              <div className="metric-foot">Disponiveis para atribuir a lojas</div>
            </div>
          </article>
        </section>

        <DashboardPanel
          title={(
            <>
              <span className="material-icons panel-title-icon" aria-hidden="true">add_circle</span>
              Nova categoria
            </>
          )}
        >
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
        </DashboardPanel>

        <DashboardPanel
          title={(
            <>
              <span className="material-icons panel-title-icon" aria-hidden="true">list_alt</span>
              Categorias existentes
            </>
          )}
        >
          {loading ? (
            <DashboardLoadingState />
          ) : categories.length === 0 ? (
            <DashboardEmptyState label="Sem categorias para mostrar." />
          ) : (
            <div className="category-chip-grid">
              {categories.map((category) => {
                const isEditing = editId === category.idcategoria;
                const isBusy = busyId === category.idcategoria;
                return (
                  <div key={category.idcategoria} className={`category-chip${isEditing ? " is-editing" : ""}`}>
                    <span className="category-chip-icon">
                      <span className="material-icons" aria-hidden="true">sell</span>
                    </span>
                    {isEditing ? (
                      <input
                        type="text"
                        className="category-chip-input"
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        disabled={isBusy}
                        autoFocus
                      />
                    ) : (
                      <span className="category-chip-name" title={category.categoria}>{category.categoria}</span>
                    )}
                    <span className="category-chip-actions">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="category-chip-icon-btn"
                            disabled={isBusy}
                            title="Guardar"
                            onClick={() => handleSaveEdit(category.idcategoria)}
                          >
                            <span className="material-icons" aria-hidden="true">check</span>
                          </button>
                          <button
                            type="button"
                            className="category-chip-icon-btn"
                            disabled={isBusy}
                            title="Cancelar"
                            onClick={cancelEdit}
                          >
                            <span className="material-icons" aria-hidden="true">close</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="category-chip-icon-btn"
                            disabled={isBusy}
                            title="Editar"
                            onClick={() => startEdit(category)}
                          >
                            <span className="material-icons" aria-hidden="true">edit</span>
                          </button>
                          <button
                            type="button"
                            className="category-chip-icon-btn danger"
                            disabled={isBusy}
                            title="Eliminar"
                            onClick={() => handleDelete(category)}
                          >
                            <span className="material-icons" aria-hidden="true">
                              {isBusy ? "hourglass_empty" : "delete"}
                            </span>
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </DashboardPanel>
      </div>
    </DashboardSidebarLayout>
  );
}

import { useCallback, useEffect, useState } from "react";
import { fetchAllCategories, fetchStoreCategoryIds, setStoreCategories } from "../../services/storeCategoriesService";
import { useAlert } from "../../context/AlertContext";

export default function StoreCategoriesPicker({ lojaId, callerUserId, onSaved = null }) {
  const { showError } = useAlert();
  const [allCategories, setAllCategories] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [initialIds, setInitialIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setErrorState] = useState("");
  const setError = useCallback((message) => {
    setErrorState(message);
    if (message) showError(message);
  }, [showError]);
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    if (!lojaId) return;
    setLoading(true);
    setError("");
    try {
      const [categories, storeCategoryIds] = await Promise.all([
        fetchAllCategories(),
        fetchStoreCategoryIds(lojaId),
      ]);
      setAllCategories(categories);
      const idsSet = new Set(storeCategoryIds);
      setSelectedIds(idsSet);
      setInitialIds(idsSet);
    } catch (err) {
      setError(err?.message || "Nao foi possivel carregar as categorias.");
    } finally {
      setLoading(false);
    }
  }, [lojaId, setError]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (idcategoria) => {
    setSuccess("");
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(idcategoria)) next.delete(idcategoria);
      else next.add(idcategoria);
      return next;
    });
  };

  const isDirty = selectedIds.size !== initialIds.size
    || [...selectedIds].some((id) => !initialIds.has(id));

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await setStoreCategories({ callerUserId, lojaId, categoryIds: [...selectedIds] });
      setInitialIds(new Set(selectedIds));
      setSuccess("Categorias atualizadas.");
      if (onSaved) await onSaved();
    } catch (err) {
      setError(err?.message || "Nao foi possivel guardar as categorias.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="muted">A carregar categorias...</p>;
  }

  return (
    <div className="store-categories-picker">
      {error ? <p className="shipday-inline-error">{error}</p> : null}
      {success ? <p className="shipday-inline-success">{success}</p> : null}

      {allCategories.length === 0 ? (
        <p className="muted">
          Ainda nao existem categorias criadas. Um administrador pode criar categorias em
          "Gestao de Categorias".
        </p>
      ) : (
        <div className="category-chip-grid store-categories-picker-grid">
          {allCategories.map((category) => {
            const checked = selectedIds.has(Number(category.idcategoria));
            return (
              <label
                key={category.idcategoria}
                className={`category-chip store-categories-picker-chip${checked ? " is-selected" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(Number(category.idcategoria))}
                />
                <span className="category-chip-name">{category.categoria}</span>
              </label>
            );
          })}
        </div>
      )}

      <div className="dashboard-form-actions store-categories-picker-actions">
        <button
          type="button"
          className="btn-dashboard small"
          disabled={saving || !isDirty}
          onClick={handleSave}
        >
          {saving ? "A guardar..." : "Guardar categorias"}
        </button>
      </div>
    </div>
  );
}

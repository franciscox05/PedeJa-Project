import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import "../css/pages/dashboard.css";
import DashboardSidebarLayout from "../components/dashboard/DashboardSidebarLayout";
import { ADMIN_DASHBOARD_TABS, resolveAdminTabRoute } from "../constants/adminDashboardTabs";
import {
  fetchPromotionsAdmin,
  createPromotion,
  updatePromotion,
  deletePromotion,
  fetchStoreOptionsForPromotions,
} from "../services/adminPromotionsService";
import { extractUserId } from "../utils/roles";

function parseSessionUser(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const EMPTY_FORM = {
  title: "",
  description: "",
  image_url: "",
  loja_id: "",
  discount_label: "",
  active: true,
  starts_at: "",
  ends_at: "",
  sort_order: 0,
};

function toDatetimeLocalValue(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function DashboardPromocoes() {
  const navigate = useNavigate();
  const userRaw = localStorage.getItem("pedeja_user");
  const user = useMemo(() => parseSessionUser(userRaw), [userRaw]);
  const callerUserId = extractUserId(user);

  const [promotions, setPromotions] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [promoRows, storeRows] = await Promise.all([
        fetchPromotionsAdmin(callerUserId),
        fetchStoreOptionsForPromotions(),
      ]);
      setPromotions(promoRows);
      setStores(storeRows);
    } catch (err) {
      setError(err?.message || "Nao foi possivel carregar as promocoes.");
    } finally {
      setLoading(false);
    }
  }, [callerUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const storeLookup = useMemo(() => new Map(stores.map((s) => [String(s.idloja), s.nome])), [stores]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const startEdit = (promotion) => {
    setEditingId(promotion.id);
    setForm({
      title: promotion.title || "",
      description: promotion.description || "",
      image_url: promotion.image_url || "",
      loja_id: promotion.loja_id === null ? "" : String(promotion.loja_id),
      discount_label: promotion.discount_label || "",
      active: promotion.active !== false,
      starts_at: toDatetimeLocalValue(promotion.starts_at),
      ends_at: toDatetimeLocalValue(promotion.ends_at),
      sort_order: promotion.sort_order || 0,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) {
      toast.error("Titulo da promocao e obrigatorio.");
      return;
    }

    setSaving(true);
    const payload = {
      title: form.title,
      description: form.description,
      image_url: form.image_url,
      loja_id: form.loja_id === "" ? null : Number(form.loja_id),
      discount_label: form.discount_label,
      active: form.active,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      sort_order: Number(form.sort_order) || 0,
    };

    try {
      if (editingId) {
        await updatePromotion(callerUserId, editingId, payload);
        toast.success("Promocao atualizada.");
      } else {
        await createPromotion(callerUserId, payload);
        toast.success("Promocao criada.");
      }
      resetForm();
      await load();
    } catch (err) {
      toast.error(err?.message || "Nao foi possivel guardar a promocao.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (promotion) => {
    setBusyId(promotion.id);
    try {
      await deletePromotion(callerUserId, promotion.id);
      toast.success("Promocao eliminada.");
      await load();
    } catch (err) {
      toast.error(err?.message || "Nao foi possivel eliminar a promocao.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardSidebarLayout
      tabs={ADMIN_DASHBOARD_TABS}
      activeTab="promotions"
      onTabChange={(tabId) => navigate(resolveAdminTabRoute(tabId))}
      kicker="Marketing"
      title="Gestao de Promocoes"
      subtitle="Campanhas e destaques, globais ou por loja."
      storageKey="dashboard-admin-sidebar-collapsed"
    >
      <div className="dashboard-tab-section">
        <header className="dashboard-header enterprise-header">
          <div>
            <p className="kicker">Marketing</p>
            <h1 className="dashboard-title">Promocoes</h1>
            <p className="dashboard-subtitle">
              Conteudo de destaque mostrado na home e nas lojas. Nao aplica descontos automaticos aos pedidos —
              para descontos com codigo, usa a pagina de Cupoes.
            </p>
          </div>
        </header>

        {error ? <p className="shipday-inline-error">{error}</p> : null}

        <article className="panel">
          <h3>{editingId ? "Editar promocao" : "Nova promocao"}</h3>
          <form onSubmit={handleSubmit} className="profile-form-grid">
            <label className="profile-field">
              <span>Titulo *</span>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label className="profile-field">
              <span>Descricao</span>
              <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className="profile-field">
              <span>URL da imagem</span>
              <input type="text" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
            </label>
            <label className="profile-field">
              <span>Loja (vazio = global)</span>
              <select value={form.loja_id} onChange={(e) => setForm({ ...form, loja_id: e.target.value })}>
                <option value="">Todas as lojas</option>
                {stores.map((store) => (
                  <option key={store.idloja} value={store.idloja}>{store.nome}</option>
                ))}
              </select>
            </label>
            <label className="profile-field">
              <span>Texto de destaque (ex: -20%)</span>
              <input type="text" value={form.discount_label} onChange={(e) => setForm({ ...form, discount_label: e.target.value })} />
            </label>
            <label className="profile-field">
              <span>Ordem</span>
              <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
            </label>
            <label className="profile-field">
              <span>Inicio</span>
              <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
            </label>
            <label className="profile-field">
              <span>Fim</span>
              <input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
            </label>
            <label className="profile-field">
              <span>
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Ativo
              </span>
            </label>

            <div className="profile-actions-row">
              <button className="btn-dashboard" type="submit" disabled={saving}>
                {saving ? "A gravar..." : editingId ? "Guardar alteracoes" : "Criar promocao"}
              </button>
              {editingId && <button className="btn-dashboard secondary" type="button" onClick={resetForm}>Cancelar edicao</button>}
            </div>
          </form>
        </article>

        <article className="panel">
          <h3>Promocoes existentes</h3>
          {loading ? (
            <p className="muted">A carregar...</p>
          ) : promotions.length === 0 ? (
            <p className="muted">Sem promocoes registadas.</p>
          ) : (
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Titulo</th>
                    <th>Loja</th>
                    <th>Estado</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {promotions.map((promotion) => (
                    <tr key={promotion.id}>
                      <td>{promotion.title}</td>
                      <td>{promotion.loja_id ? (storeLookup.get(String(promotion.loja_id)) || `#${promotion.loja_id}`) : "Todas as lojas"}</td>
                      <td><span className={promotion.active ? "tag ok" : "tag warn"}>{promotion.active ? "Ativo" : "Inativo"}</span></td>
                      <td>
                        <button type="button" className="btn-dashboard small" onClick={() => startEdit(promotion)}>Editar</button>
                        <button
                          type="button"
                          className="btn-dashboard small secondary"
                          disabled={busyId === promotion.id}
                          onClick={() => handleDelete(promotion)}
                        >
                          {busyId === promotion.id ? "A apagar..." : "Eliminar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </div>
    </DashboardSidebarLayout>
  );
}

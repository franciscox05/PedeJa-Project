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
import {
  fetchPromotionsAdmin,
  createPromotion,
  updatePromotion,
  deletePromotion,
  fetchStoreOptionsForPromotions,
} from "../services/adminPromotionsService";
import { extractUserId } from "../utils/roles";
import { useAlert } from "../context/AlertContext";

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

  const { showError } = useAlert();
  const [promotions, setPromotions] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setErrorState] = useState("");
  const setError = useCallback((message) => {
    setErrorState(message);
    if (message) showError(message);
  }, [showError]);
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
      setError(err?.message || "Não foi possível carregar as promoções.");
    } finally {
      setLoading(false);
    }
  }, [callerUserId, setError]);

  useEffect(() => {
    load();
  }, [load]);

  const storeLookup = useMemo(() => new Map(stores.map((s) => [String(s.idloja), s.nome])), [stores]);
  const activeCount = useMemo(() => promotions.filter((p) => p.active !== false).length, [promotions]);
  const globalCount = useMemo(() => promotions.filter((p) => !p.loja_id).length, [promotions]);

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
      showError("Título da promoção é obrigatório.");
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
        toast.success("Promoção atualizada.");
      } else {
        await createPromotion(callerUserId, payload);
        toast.success("Promoção criada.");
      }
      resetForm();
      await load();
    } catch (err) {
      showError(err?.message || "Não foi possível guardar a promoção.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (promotion) => {
    const confirmed = window.confirm(`Eliminar a promoção "${promotion.title || "(sem título)"}"? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;

    setBusyId(promotion.id);
    try {
      await deletePromotion(callerUserId, promotion.id);
      toast.success("Promoção eliminada.");
      await load();
    } catch (err) {
      showError(err?.message || "Não foi possível eliminar a promoção.");
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
      title="Gestão de Promoções"
      subtitle="Campanhas e destaques, globais ou por loja."
      storageKey="dashboard-admin-sidebar-collapsed"
    >
      <div className="dashboard-tab-section">
        <DashboardPageHeader
          kicker="Marketing"
          title="Promoções"
          subtitle="Conteúdo de destaque mostrado na home e nas lojas. Não aplica descontos automáticos aos pedidos — para descontos com código, usa a página de Cupões."
        />

        {error ? <p className="shipday-inline-error">{error}</p> : null}

        <section className="dashboard-grid premium-grid stat-hero-grid">
          <article className="metric-card premium stat-hero" style={{ "--stat-accent": "#e62429" }}>
            <div className="stat-hero-icon stat-hero-icon--red">
              <span className="material-icons" aria-hidden="true">campaign</span>
            </div>
            <div className="stat-hero-body">
              <div className="metric-label">Promoções criadas</div>
              <div className="metric-value">{promotions.length}</div>
              <div className="metric-foot">No total</div>
            </div>
          </article>
          <article className="metric-card premium stat-hero" style={{ "--stat-accent": "#15803d" }}>
            <div className="stat-hero-icon stat-hero-icon--green">
              <span className="material-icons" aria-hidden="true">visibility</span>
            </div>
            <div className="stat-hero-body">
              <div className="metric-label">Ativas</div>
              <div className="metric-value">{activeCount}</div>
              <div className="metric-foot">Visíveis agora</div>
            </div>
          </article>
          <article className="metric-card premium stat-hero" style={{ "--stat-accent": "#1d4ed8" }}>
            <div className="stat-hero-icon stat-hero-icon--blue">
              <span className="material-icons" aria-hidden="true">public</span>
            </div>
            <div className="stat-hero-body">
              <div className="metric-label">Globais</div>
              <div className="metric-value">{globalCount}</div>
              <div className="metric-foot">Sem loja específica associada</div>
            </div>
          </article>
        </section>

        <DashboardPanel
          title={(
            <>
              <span className="material-icons panel-title-icon" aria-hidden="true">
                {editingId ? "edit" : "add_circle"}
              </span>
              {editingId ? "Editar promoção" : "Nova promoção"}
            </>
          )}
        >
          <form onSubmit={handleSubmit} className="dashboard-form-grid">
            <label className="dashboard-form-field">
              <span>Título *</span>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label className="dashboard-form-field">
              <span>Descrição</span>
              <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className="dashboard-form-field">
              <span>URL da imagem</span>
              <input type="text" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
            </label>
            <label className="dashboard-form-field">
              <span>Loja (vazio = global)</span>
              <select value={form.loja_id} onChange={(e) => setForm({ ...form, loja_id: e.target.value })}>
                <option value="">Todas as lojas</option>
                {stores.map((store) => (
                  <option key={store.idloja} value={store.idloja}>{store.nome}</option>
                ))}
              </select>
            </label>
            <label className="dashboard-form-field">
              <span>Texto de destaque (ex: -20%)</span>
              <input type="text" value={form.discount_label} onChange={(e) => setForm({ ...form, discount_label: e.target.value })} />
            </label>
            <label className="dashboard-form-field">
              <span>Ordem</span>
              <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
            </label>
            <label className="dashboard-form-field">
              <span>Inicio</span>
              <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
            </label>
            <label className="dashboard-form-field">
              <span>Fim</span>
              <input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
            </label>
            <label className="dashboard-form-field dashboard-form-field--checkbox">
              <span>
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Ativo
              </span>
            </label>

            {form.image_url ? (
              <div className="dashboard-form-field dashboard-form-field--full">
                <span>Pré-visualização</span>
                <div className="menu-card-media" style={{ height: 160, borderRadius: 12 }}>
                  <img src={form.image_url} alt="Pré-visualização da promoção" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                </div>
              </div>
            ) : null}

            <div className="dashboard-form-actions">
              <button className="btn-dashboard" type="submit" disabled={saving}>
                {saving ? "A gravar..." : editingId ? "Guardar alterações" : "Criar promoção"}
              </button>
              {editingId && <button className="btn-dashboard secondary" type="button" onClick={resetForm}>Cancelar edição</button>}
            </div>
          </form>
        </DashboardPanel>

        <DashboardPanel
          title={(
            <>
              <span className="material-icons panel-title-icon" aria-hidden="true">grid_view</span>
              Promoções existentes
            </>
          )}
        >
          {loading ? (
            <DashboardLoadingState />
          ) : promotions.length === 0 ? (
            <DashboardEmptyState label="Sem promoções para mostrar." />
          ) : (
            <div className="menu-card-grid">
              {promotions.map((promotion) => (
                <article key={promotion.id} className="menu-card">
                  <div className="menu-card-media">
                    {promotion.image_url ? (
                      <img src={promotion.image_url} alt={promotion.title || "Promoção"} />
                    ) : (
                      <div className="menu-card-placeholder">
                        <span className="material-icons" aria-hidden="true">campaign</span>
                      </div>
                    )}
                    <span className={`tag ${promotion.active !== false ? "ok" : "neutral"}`}>
                      {promotion.active !== false ? "Ativo" : "Inativo"}
                    </span>
                    {promotion.discount_label ? (
                      <span className="tag bad menu-card-visibility-tag">{promotion.discount_label}</span>
                    ) : null}
                  </div>
                  <div className="menu-card-body">
                    <h4>{promotion.title}</h4>
                    {promotion.description ? <p className="menu-card-desc muted">{promotion.description}</p> : null}
                    <div className="menu-card-meta">
                      <span>{promotion.loja_id ? (storeLookup.get(String(promotion.loja_id)) || `#${promotion.loja_id}`) : "Todas as lojas"}</span>
                      <span>Ordem: {promotion.sort_order}</span>
                    </div>
                    <div className="menu-card-actions">
                      <button type="button" className="btn-dashboard small" onClick={() => startEdit(promotion)}>Editar</button>
                      <button
                        type="button"
                        className="btn-dashboard small danger"
                        disabled={busyId === promotion.id}
                        onClick={() => handleDelete(promotion)}
                      >
                        {busyId === promotion.id ? "A apagar..." : "Eliminar"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </DashboardPanel>
      </div>
    </DashboardSidebarLayout>
  );
}

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
import { fetchBanners, createBanner, updateBanner, deleteBanner } from "../services/adminBannersService";
import { extractUserId } from "../utils/roles";
import { useAlert } from "../context/AlertContext";

function parseSessionUser(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const EMPTY_FORM = { title: "", image_url: "", link_url: "", active: true, starts_at: "", ends_at: "", sort_order: 0 };

function toDatetimeLocalValue(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isBannerScheduled(banner) {
  if (!banner.starts_at) return false;
  return new Date(banner.starts_at).getTime() > Date.now();
}

function isBannerExpired(banner) {
  if (!banner.ends_at) return false;
  return new Date(banner.ends_at).getTime() < Date.now();
}

export default function DashboardBanners() {
  const navigate = useNavigate();
  const userRaw = localStorage.getItem("pedeja_user");
  const user = useMemo(() => parseSessionUser(userRaw), [userRaw]);
  const callerUserId = extractUserId(user);

  const { showError } = useAlert();
  const [banners, setBanners] = useState([]);
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
      const rows = await fetchBanners(callerUserId);
      setBanners(rows);
    } catch (err) {
      setError(err?.message || "Nao foi possivel carregar os banners.");
    } finally {
      setLoading(false);
    }
  }, [callerUserId, setError]);

  useEffect(() => {
    load();
  }, [load]);

  const activeCount = useMemo(() => banners.filter((b) => b.active !== false).length, [banners]);
  const scheduledCount = useMemo(() => banners.filter(isBannerScheduled).length, [banners]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const startEdit = (banner) => {
    setEditingId(banner.id);
    setForm({
      title: banner.title || "",
      image_url: banner.image_url || "",
      link_url: banner.link_url || "",
      active: banner.active !== false,
      starts_at: toDatetimeLocalValue(banner.starts_at),
      ends_at: toDatetimeLocalValue(banner.ends_at),
      sort_order: banner.sort_order || 0,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.image_url.trim()) {
      showError("Imagem do banner e obrigatoria.");
      return;
    }

    setSaving(true);
    const payload = {
      title: form.title,
      image_url: form.image_url,
      link_url: form.link_url,
      active: form.active,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      sort_order: Number(form.sort_order) || 0,
    };

    try {
      if (editingId) {
        await updateBanner(callerUserId, editingId, payload);
        toast.success("Banner atualizado.");
      } else {
        await createBanner(callerUserId, payload);
        toast.success("Banner criado.");
      }
      resetForm();
      await load();
    } catch (err) {
      showError(err?.message || "Nao foi possivel guardar o banner.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (banner) => {
    const confirmed = window.confirm(`Eliminar o banner "${banner.title || "(sem titulo)"}"? Esta acao nao pode ser desfeita.`);
    if (!confirmed) return;

    setBusyId(banner.id);
    try {
      await deleteBanner(callerUserId, banner.id);
      toast.success("Banner eliminado.");
      await load();
    } catch (err) {
      showError(err?.message || "Nao foi possivel eliminar o banner.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardSidebarLayout
      tabs={ADMIN_DASHBOARD_TABS}
      activeTab="banners"
      onTabChange={(tabId) => navigate(resolveAdminTabRoute(tabId))}
      kicker="Marketing"
      title="Gestao de Banners"
      subtitle="Banners promocionais mostrados na pagina inicial."
      storageKey="dashboard-admin-sidebar-collapsed"
    >
      <div className="dashboard-tab-section">
        <DashboardPageHeader
          kicker="Marketing"
          title="Banners"
          subtitle="Cria e agenda banners promocionais para a home."
        />

        {error ? <p className="shipday-inline-error">{error}</p> : null}

        <section className="dashboard-grid premium-grid stat-hero-grid">
          <article className="metric-card premium stat-hero" style={{ "--stat-accent": "#e62429" }}>
            <div className="stat-hero-icon stat-hero-icon--red">
              <span className="material-icons" aria-hidden="true">view_carousel</span>
            </div>
            <div className="stat-hero-body">
              <div className="metric-label">Banners criados</div>
              <div className="metric-value">{banners.length}</div>
              <div className="metric-foot">No total</div>
            </div>
          </article>
          <article className="metric-card premium stat-hero" style={{ "--stat-accent": "#15803d" }}>
            <div className="stat-hero-icon stat-hero-icon--green">
              <span className="material-icons" aria-hidden="true">visibility</span>
            </div>
            <div className="stat-hero-body">
              <div className="metric-label">Ativos</div>
              <div className="metric-value">{activeCount}</div>
              <div className="metric-foot">Visiveis na home agora</div>
            </div>
          </article>
          <article className="metric-card premium stat-hero" style={{ "--stat-accent": "#c2410c" }}>
            <div className="stat-hero-icon stat-hero-icon--orange">
              <span className="material-icons" aria-hidden="true">schedule</span>
            </div>
            <div className="stat-hero-body">
              <div className="metric-label">Agendados</div>
              <div className="metric-value">{scheduledCount}</div>
              <div className="metric-foot">Com inicio ainda por chegar</div>
            </div>
          </article>
        </section>

        <DashboardPanel
          title={(
            <>
              <span className="material-icons panel-title-icon" aria-hidden="true">
                {editingId ? "edit" : "add_circle"}
              </span>
              {editingId ? "Editar banner" : "Novo banner"}
            </>
          )}
        >
          <form onSubmit={handleSubmit} className="dashboard-form-grid">
            <label className="dashboard-form-field">
              <span>Titulo</span>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="dashboard-form-field">
              <span>URL da imagem *</span>
              <input type="text" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} required />
            </label>
            <label className="dashboard-form-field">
              <span>Link (opcional)</span>
              <input type="text" value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} />
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
                <span>Pre-visualizacao</span>
                <div className="menu-card-media" style={{ height: 160, borderRadius: 12 }}>
                  <img src={form.image_url} alt="Pre-visualizacao do banner" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                </div>
              </div>
            ) : null}

            <div className="dashboard-form-actions">
              <button className="btn-dashboard" type="submit" disabled={saving}>
                {saving ? "A gravar..." : editingId ? "Guardar alteracoes" : "Criar banner"}
              </button>
              {editingId && <button className="btn-dashboard secondary" type="button" onClick={resetForm}>Cancelar edicao</button>}
            </div>
          </form>
        </DashboardPanel>

        <DashboardPanel
          title={(
            <>
              <span className="material-icons panel-title-icon" aria-hidden="true">grid_view</span>
              Banners existentes
            </>
          )}
        >
          {loading ? (
            <DashboardLoadingState />
          ) : banners.length === 0 ? (
            <DashboardEmptyState label="Sem banners para mostrar." />
          ) : (
            <div className="menu-card-grid">
              {banners.map((banner) => {
                const expired = isBannerExpired(banner);
                const scheduled = isBannerScheduled(banner);
                return (
                  <article key={banner.id} className="menu-card">
                    <div className="menu-card-media">
                      {banner.image_url ? (
                        <img src={banner.image_url} alt={banner.title || "Banner"} />
                      ) : (
                        <div className="menu-card-placeholder">
                          <span className="material-icons" aria-hidden="true">image</span>
                        </div>
                      )}
                      <span className={`tag ${banner.active !== false ? "ok" : "neutral"}`}>
                        {banner.active !== false ? "Ativo" : "Inativo"}
                      </span>
                      {expired ? <span className="tag bad menu-card-visibility-tag">Expirado</span> : null}
                      {!expired && scheduled ? <span className="tag warn menu-card-visibility-tag">Agendado</span> : null}
                    </div>
                    <div className="menu-card-body">
                      <h4>{banner.title || "(sem titulo)"}</h4>
                      <div className="menu-card-meta">
                        <span>Ordem: {banner.sort_order}</span>
                        {banner.link_url ? <span className="muted">Com link</span> : null}
                      </div>
                      <div className="menu-card-actions">
                        <button type="button" className="btn-dashboard small" onClick={() => startEdit(banner)}>Editar</button>
                        <button
                          type="button"
                          className="btn-dashboard small danger"
                          disabled={busyId === banner.id}
                          onClick={() => handleDelete(banner)}
                        >
                          {busyId === banner.id ? "A apagar..." : "Eliminar"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </DashboardPanel>
      </div>
    </DashboardSidebarLayout>
  );
}

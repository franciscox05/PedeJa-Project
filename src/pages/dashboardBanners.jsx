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

export default function DashboardBanners() {
  const navigate = useNavigate();
  const userRaw = localStorage.getItem("pedeja_user");
  const user = useMemo(() => parseSessionUser(userRaw), [userRaw]);
  const callerUserId = extractUserId(user);

  const [banners, setBanners] = useState([]);
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
      const rows = await fetchBanners(callerUserId);
      setBanners(rows);
    } catch (err) {
      setError(err?.message || "Nao foi possivel carregar os banners.");
    } finally {
      setLoading(false);
    }
  }, [callerUserId]);

  useEffect(() => {
    load();
  }, [load]);

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
      toast.error("Imagem do banner e obrigatoria.");
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
      toast.error(err?.message || "Nao foi possivel guardar o banner.");
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
      toast.error(err?.message || "Nao foi possivel eliminar o banner.");
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

        <DashboardPanel title={editingId ? "Editar banner" : "Novo banner"}>
          <form onSubmit={handleSubmit} className="profile-form-grid">
            <label className="profile-field">
              <span>Titulo</span>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="profile-field">
              <span>URL da imagem *</span>
              <input type="text" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} required />
            </label>
            <label className="profile-field">
              <span>Link (opcional)</span>
              <input type="text" value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} />
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
                {saving ? "A gravar..." : editingId ? "Guardar alteracoes" : "Criar banner"}
              </button>
              {editingId && <button className="btn-dashboard secondary" type="button" onClick={resetForm}>Cancelar edicao</button>}
            </div>
          </form>
        </DashboardPanel>

        <DashboardPanel title="Banners existentes">
          {loading ? (
            <DashboardLoadingState />
          ) : banners.length === 0 ? (
            <DashboardEmptyState label="Sem banners para mostrar." />
          ) : (
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Titulo</th>
                    <th>Estado</th>
                    <th>Ordem</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {banners.map((banner) => (
                    <tr key={banner.id}>
                      <td>{banner.title || "(sem titulo)"}</td>
                      <td><span className={banner.active ? "tag ok" : "tag warn"}>{banner.active ? "Ativo" : "Inativo"}</span></td>
                      <td>{banner.sort_order}</td>
                      <td>
                        <button type="button" className="btn-dashboard small" onClick={() => startEdit(banner)}>Editar</button>
                        <button
                          type="button"
                          className="btn-dashboard small danger"
                          disabled={busyId === banner.id}
                          onClick={() => handleDelete(banner)}
                        >
                          {busyId === banner.id ? "A apagar..." : "Eliminar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DashboardPanel>
      </div>
    </DashboardSidebarLayout>
  );
}

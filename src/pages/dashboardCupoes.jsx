import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Ticket, CheckCircle2, Gift, Pencil, PlusCircle, ListChecks } from "lucide-react";
import "../css/pages/dashboard.css";
import DashboardSidebarLayout from "../components/dashboard/DashboardSidebarLayout";
import DashboardPageHeader from "../components/dashboard/DashboardPageHeader";
import DashboardPanel from "../components/dashboard/DashboardPanel";
import DashboardEmptyState from "../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../components/dashboard/DashboardLoadingState";
import { ADMIN_DASHBOARD_TABS, resolveAdminTabRoute } from "../constants/adminDashboardTabs";
import { fetchCouponsAdmin, createCoupon, updateCoupon, deleteCoupon } from "../services/couponsService";
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
  code: "",
  discount_type: "percent",
  discount_value: "",
  min_order_value: "0",
  max_uses_total: "",
  max_uses_per_customer: "1",
  active: true,
  starts_at: "",
  ends_at: "",
};

function toDatetimeLocalValue(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDiscount(coupon) {
  return coupon.discount_type === "percent" ? `${coupon.discount_value}%` : `${Number(coupon.discount_value).toFixed(2)}EUR`;
}

function isCouponExpired(coupon) {
  if (!coupon.ends_at) return false;
  return new Date(coupon.ends_at).getTime() < Date.now();
}

export default function DashboardCupoes() {
  const navigate = useNavigate();
  const userRaw = localStorage.getItem("pedeja_user");
  const user = useMemo(() => parseSessionUser(userRaw), [userRaw]);
  const callerUserId = extractUserId(user);

  const { showError } = useAlert();
  const [coupons, setCoupons] = useState([]);
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
      const rows = await fetchCouponsAdmin(callerUserId);
      setCoupons(rows);
    } catch (err) {
      setError(err?.message || "Não foi possível carregar os cupões.");
    } finally {
      setLoading(false);
    }
  }, [callerUserId, setError]);

  useEffect(() => {
    load();
  }, [load]);

  const activeCount = useMemo(
    () => coupons.filter((c) => c.active !== false && !isCouponExpired(c)).length,
    [coupons],
  );
  const totalUses = useMemo(
    () => coupons.reduce((sum, c) => sum + Number(c.uses_count || 0), 0),
    [coupons],
  );

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const startEdit = (coupon) => {
    setEditingId(coupon.id);
    setForm({
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: String(coupon.discount_value),
      min_order_value: String(coupon.min_order_value),
      max_uses_total: coupon.max_uses_total === null ? "" : String(coupon.max_uses_total),
      max_uses_per_customer: coupon.max_uses_per_customer === null ? "" : String(coupon.max_uses_per_customer),
      active: coupon.active !== false,
      starts_at: toDatetimeLocalValue(coupon.starts_at),
      ends_at: toDatetimeLocalValue(coupon.ends_at),
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.code.trim() || !form.discount_value) {
      showError("Código e valor de desconto são obrigatórios.");
      return;
    }

    setSaving(true);
    const payload = {
      code: form.code,
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      min_order_value: Number(form.min_order_value) || 0,
      max_uses_total: form.max_uses_total === "" ? null : Number(form.max_uses_total),
      max_uses_per_customer: form.max_uses_per_customer === "" ? null : Number(form.max_uses_per_customer),
      active: form.active,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
    };

    try {
      if (editingId) {
        await updateCoupon(callerUserId, editingId, payload);
        toast.success("Cupão atualizado.");
      } else {
        await createCoupon(callerUserId, payload);
        toast.success("Cupão criado.");
      }
      resetForm();
      await load();
    } catch (err) {
      showError(err?.message || "Não foi possível guardar o cupão.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (coupon) => {
    const confirmed = window.confirm(`Eliminar o cupão "${coupon.code}"? Esta ação não pode ser desfeita e o código deixa de funcionar de imediato.`);
    if (!confirmed) return;

    setBusyId(coupon.id);
    try {
      await deleteCoupon(callerUserId, coupon.id);
      toast.success("Cupão eliminado.");
      await load();
    } catch (err) {
      showError(err?.message || "Não foi possível eliminar o cupão.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardSidebarLayout
      tabs={ADMIN_DASHBOARD_TABS}
      activeTab="cupoes"
      onTabChange={(tabId) => navigate(resolveAdminTabRoute(tabId))}
      kicker="Marketing"
      title="Gestão de Cupões"
      subtitle="Códigos de desconto aplicáveis no checkout."
      storageKey="dashboard-admin-sidebar-collapsed"
    >
      <div className="dashboard-tab-section">
        <DashboardPageHeader
          kicker="Marketing"
          title="Cupões"
          subtitle="Cria códigos de desconto com limites de uso e validade."
        />

        {error ? <p className="shipday-inline-error">{error}</p> : null}

        <section className="dashboard-grid premium-grid stat-hero-grid">
          <article className="metric-card premium stat-hero" style={{ "--stat-accent": "#e62429" }}>
            <div className="stat-hero-icon stat-hero-icon--red">
              <Ticket aria-hidden="true" />
            </div>
            <div className="stat-hero-body">
              <div className="metric-label">Cupões criados</div>
              <div className="metric-value">{coupons.length}</div>
              <div className="metric-foot">No total</div>
            </div>
          </article>
          <article className="metric-card premium stat-hero" style={{ "--stat-accent": "#15803d" }}>
            <div className="stat-hero-icon stat-hero-icon--green">
              <CheckCircle2 aria-hidden="true" />
            </div>
            <div className="stat-hero-body">
              <div className="metric-label">Ativos agora</div>
              <div className="metric-value">{activeCount}</div>
              <div className="metric-foot">Ativos e dentro da validade</div>
            </div>
          </article>
          <article className="metric-card premium stat-hero" style={{ "--stat-accent": "#1d4ed8" }}>
            <div className="stat-hero-icon stat-hero-icon--blue">
              <Gift aria-hidden="true" />
            </div>
            <div className="stat-hero-body">
              <div className="metric-label">Utilizações totais</div>
              <div className="metric-value">{totalUses}</div>
              <div className="metric-foot">Somatório de todos os cupões</div>
            </div>
          </article>
        </section>

        <DashboardPanel
          title={(
            <>
              {editingId ? (
                <Pencil className="panel-title-icon" aria-hidden="true" />
              ) : (
                <PlusCircle className="panel-title-icon" aria-hidden="true" />
              )}
              {editingId ? "Editar cupão" : "Novo cupão"}
            </>
          )}
        >
          <form onSubmit={handleSubmit} className="dashboard-form-grid">
            <label className="dashboard-form-field">
              <span>Código *</span>
              <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!editingId} required />
            </label>
            <label className="dashboard-form-field">
              <span>Tipo de desconto</span>
              <select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}>
                <option value="percent">Percentagem</option>
                <option value="fixed">Valor fixo</option>
              </select>
            </label>
            <label className="dashboard-form-field">
              <span>Valor do desconto *</span>
              <input type="number" step="0.01" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} required />
            </label>
            <label className="dashboard-form-field">
              <span>Valor mínimo de encomenda</span>
              <input type="number" step="0.01" value={form.min_order_value} onChange={(e) => setForm({ ...form, min_order_value: e.target.value })} />
            </label>
            <label className="dashboard-form-field">
              <span>Limite total de utilizações (vazio = ilimitado)</span>
              <input type="number" value={form.max_uses_total} onChange={(e) => setForm({ ...form, max_uses_total: e.target.value })} />
            </label>
            <label className="dashboard-form-field">
              <span>Limite por cliente (vazio = ilimitado)</span>
              <input type="number" value={form.max_uses_per_customer} onChange={(e) => setForm({ ...form, max_uses_per_customer: e.target.value })} />
            </label>
            <label className="dashboard-form-field">
              <span>Início</span>
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

            <div className="dashboard-form-actions">
              <button className="btn-dashboard" type="submit" disabled={saving}>
                {saving ? "A gravar..." : editingId ? "Guardar alterações" : "Criar cupão"}
              </button>
              {editingId && <button className="btn-dashboard secondary" type="button" onClick={resetForm}>Cancelar edição</button>}
            </div>
          </form>
        </DashboardPanel>

        <DashboardPanel
          title={(
            <>
              <ListChecks className="panel-title-icon" aria-hidden="true" />
              Cupões existentes
            </>
          )}
        >
          {loading ? (
            <DashboardLoadingState />
          ) : coupons.length === 0 ? (
            <DashboardEmptyState label="Sem cupões para mostrar." />
          ) : (
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Desconto</th>
                    <th>Utilizações</th>
                    <th>Estado</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((coupon) => {
                    const expired = isCouponExpired(coupon);
                    const usageMax = coupon.max_uses_total;
                    const usagePercent = usageMax ? Math.min(100, (Number(coupon.uses_count || 0) / Number(usageMax)) * 100) : null;
                    const statusLabel = expired ? "Expirado" : (coupon.active ? "Ativo" : "Inativo");
                    const statusClass = expired ? "bad" : (coupon.active ? "ok" : "warn");

                    return (
                      <tr key={coupon.id}>
                        <td><strong>{coupon.code}</strong></td>
                        <td>{formatDiscount(coupon)}</td>
                        <td>
                          {usageMax ? (
                            <div className="value-bar-cell">
                              <span className="value-bar-amount">{coupon.uses_count} / {usageMax}</span>
                              <span className="value-bar-track">
                                <span className="value-bar-fill" style={{ width: `${usagePercent}%` }} />
                              </span>
                            </div>
                          ) : (
                            <span>{coupon.uses_count} (ilimitado)</span>
                          )}
                        </td>
                        <td><span className={`tag ${statusClass}`}>{statusLabel}</span></td>
                        <td>
                          <button type="button" className="btn-dashboard small" onClick={() => startEdit(coupon)}>Editar</button>
                          <button
                            type="button"
                            className="btn-dashboard small danger"
                            disabled={busyId === coupon.id}
                            onClick={() => handleDelete(coupon)}
                          >
                            {busyId === coupon.id ? "A apagar..." : "Eliminar"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DashboardPanel>
      </div>
    </DashboardSidebarLayout>
  );
}

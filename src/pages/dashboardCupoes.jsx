import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import "../css/pages/dashboard.css";
import DashboardSidebarLayout from "../components/dashboard/DashboardSidebarLayout";
import { ADMIN_DASHBOARD_TABS, resolveAdminTabRoute } from "../constants/adminDashboardTabs";
import { fetchCouponsAdmin, createCoupon, updateCoupon, deleteCoupon } from "../services/couponsService";
import { extractUserId } from "../utils/roles";

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

export default function DashboardCupoes() {
  const navigate = useNavigate();
  const userRaw = localStorage.getItem("pedeja_user");
  const user = useMemo(() => parseSessionUser(userRaw), [userRaw]);
  const callerUserId = extractUserId(user);

  const [coupons, setCoupons] = useState([]);
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
      const rows = await fetchCouponsAdmin(callerUserId);
      setCoupons(rows);
    } catch (err) {
      setError(err?.message || "Nao foi possivel carregar os cupoes.");
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
      toast.error("Codigo e valor de desconto sao obrigatorios.");
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
        toast.success("Cupao atualizado.");
      } else {
        await createCoupon(callerUserId, payload);
        toast.success("Cupao criado.");
      }
      resetForm();
      await load();
    } catch (err) {
      toast.error(err?.message || "Nao foi possivel guardar o cupao.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (coupon) => {
    const confirmed = window.confirm(`Eliminar o cupao "${coupon.code}"? Esta acao nao pode ser desfeita e o codigo deixa de funcionar de imediato.`);
    if (!confirmed) return;

    setBusyId(coupon.id);
    try {
      await deleteCoupon(callerUserId, coupon.id);
      toast.success("Cupao eliminado.");
      await load();
    } catch (err) {
      toast.error(err?.message || "Nao foi possivel eliminar o cupao.");
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
      title="Gestao de Cupoes"
      subtitle="Codigos de desconto aplicaveis no checkout."
      storageKey="dashboard-admin-sidebar-collapsed"
    >
      <div className="dashboard-tab-section">
        <header className="dashboard-header enterprise-header">
          <div>
            <p className="kicker">Marketing</p>
            <h1 className="dashboard-title">Cupoes</h1>
            <p className="dashboard-subtitle">Cria codigos de desconto com limites de uso e validade.</p>
          </div>
        </header>

        {error ? <p className="shipday-inline-error">{error}</p> : null}

        <article className="panel">
          <h3>{editingId ? "Editar cupao" : "Novo cupao"}</h3>
          <form onSubmit={handleSubmit} className="profile-form-grid">
            <label className="profile-field">
              <span>Codigo *</span>
              <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!editingId} required />
            </label>
            <label className="profile-field">
              <span>Tipo de desconto</span>
              <select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}>
                <option value="percent">Percentagem</option>
                <option value="fixed">Valor fixo</option>
              </select>
            </label>
            <label className="profile-field">
              <span>Valor do desconto *</span>
              <input type="number" step="0.01" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} required />
            </label>
            <label className="profile-field">
              <span>Valor minimo de encomenda</span>
              <input type="number" step="0.01" value={form.min_order_value} onChange={(e) => setForm({ ...form, min_order_value: e.target.value })} />
            </label>
            <label className="profile-field">
              <span>Limite total de utilizacoes (vazio = ilimitado)</span>
              <input type="number" value={form.max_uses_total} onChange={(e) => setForm({ ...form, max_uses_total: e.target.value })} />
            </label>
            <label className="profile-field">
              <span>Limite por cliente (vazio = ilimitado)</span>
              <input type="number" value={form.max_uses_per_customer} onChange={(e) => setForm({ ...form, max_uses_per_customer: e.target.value })} />
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
                {saving ? "A gravar..." : editingId ? "Guardar alteracoes" : "Criar cupao"}
              </button>
              {editingId && <button className="btn-dashboard secondary" type="button" onClick={resetForm}>Cancelar edicao</button>}
            </div>
          </form>
        </article>

        <article className="panel">
          <h3>Cupoes existentes</h3>
          {loading ? (
            <p className="muted">A carregar...</p>
          ) : coupons.length === 0 ? (
            <p className="muted">Sem cupoes registados.</p>
          ) : (
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Codigo</th>
                    <th>Desconto</th>
                    <th>Utilizacoes</th>
                    <th>Estado</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((coupon) => (
                    <tr key={coupon.id}>
                      <td>{coupon.code}</td>
                      <td>{formatDiscount(coupon)}</td>
                      <td>{coupon.uses_count}{coupon.max_uses_total !== null ? ` / ${coupon.max_uses_total}` : ""}</td>
                      <td><span className={coupon.active ? "tag ok" : "tag warn"}>{coupon.active ? "Ativo" : "Inativo"}</span></td>
                      <td>
                        <button type="button" className="btn-dashboard small" onClick={() => startEdit(coupon)}>Editar</button>
                        <button
                          type="button"
                          className="btn-dashboard small secondary"
                          disabled={busyId === coupon.id}
                          onClick={() => handleDelete(coupon)}
                        >
                          {busyId === coupon.id ? "A apagar..." : "Eliminar"}
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

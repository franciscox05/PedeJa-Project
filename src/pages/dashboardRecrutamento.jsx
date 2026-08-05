import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ClipboardList, Hourglass, CheckCircle2, Pencil, PlusCircle, ListChecks } from "lucide-react";
import "../css/pages/dashboard.css";
import DashboardSidebarLayout from "../components/dashboard/DashboardSidebarLayout";
import DashboardPageHeader from "../components/dashboard/DashboardPageHeader";
import DashboardPanel from "../components/dashboard/DashboardPanel";
import DashboardEmptyState from "../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../components/dashboard/DashboardLoadingState";
import Modal from "../components/ui/modal";
import { ADMIN_DASHBOARD_TABS, resolveAdminTabRoute } from "../constants/adminDashboardTabs";
import { fetchRecruitmentTasks, upsertRecruitmentTask, deleteRecruitmentTask } from "../services/recruitmentService";
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
  restaurant_name: "",
  contact_person: "",
  phone: "",
  status: "todo",
  priority: "medium",
  due_date: "",
  notes: "",
  assigned_to: "",
};

const STATUS_LABELS = {
  todo: "Por fazer",
  in_progress: "Em curso",
  done: "Concluída",
  cancelled: "Cancelada",
};

const STATUS_CLASS = {
  todo: "warn",
  in_progress: "ok",
  done: "ok",
  cancelled: "bad",
};

const PRIORITY_LABELS = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

export default function DashboardRecrutamento() {
  const navigate = useNavigate();
  const userRaw = localStorage.getItem("pedeja_user");
  const user = useMemo(() => parseSessionUser(userRaw), [userRaw]);
  const callerUserId = extractUserId(user);

  const { showError } = useAlert();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchRecruitmentTasks(callerUserId);
      setTasks(rows);
    } catch (err) {
      showError(err?.message || "Não foi possível carregar as tarefas de recrutamento.");
    } finally {
      setLoading(false);
    }
  }, [callerUserId, showError]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredTasks = useMemo(() => {
    if (!statusFilter) return tasks;
    return tasks.filter((task) => task.status === statusFilter);
  }, [tasks, statusFilter]);

  const openCount = useMemo(
    () => tasks.filter((task) => task.status === "todo" || task.status === "in_progress").length,
    [tasks],
  );
  const doneCount = useMemo(() => tasks.filter((task) => task.status === "done").length, [tasks]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const startEdit = (task) => {
    setEditingId(task.id);
    setForm({
      title: task.title || "",
      restaurant_name: task.restaurant_name || "",
      contact_person: task.contact_person || "",
      phone: task.phone || "",
      status: task.status || "todo",
      priority: task.priority || "medium",
      due_date: task.due_date || "",
      notes: task.notes || "",
      assigned_to: task.assigned_to || "",
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) {
      showError("O título da tarefa é obrigatório.");
      return;
    }

    setSaving(true);
    try {
      await upsertRecruitmentTask(callerUserId, editingId, form);
      toast.success(editingId ? "Tarefa atualizada." : "Tarefa criada.");
      resetForm();
      await load();
    } catch (err) {
      showError(err?.message || "Não foi possível guardar a tarefa.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    const task = deleteTarget;
    if (!task) return;

    setDeleteTarget(null);
    setBusyId(task.id);
    try {
      await deleteRecruitmentTask(callerUserId, task.id);
      toast.success("Tarefa eliminada.");
      await load();
    } catch (err) {
      showError(err?.message || "Não foi possível eliminar a tarefa.");
    } finally {
      setBusyId(null);
    }
  };

  const handleQuickStatus = async (task, nextStatus) => {
    setBusyId(task.id);
    try {
      await upsertRecruitmentTask(callerUserId, task.id, { ...task, status: nextStatus });
      await load();
    } catch (err) {
      showError(err?.message || "Não foi possível atualizar o estado.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardSidebarLayout
      tabs={ADMIN_DASHBOARD_TABS}
      activeTab="recrutamento"
      onTabChange={(tabId) => navigate(resolveAdminTabRoute(tabId))}
      kicker="Crescimento"
      title="Recrutamento de Restaurantes"
      subtitle="Quadro de tarefas para angariar novas lojas para a plataforma."
      storageKey="dashboard-admin-sidebar-collapsed"
    >
      <div className="dashboard-tab-section">
        <DashboardPageHeader
          kicker="Crescimento"
          title="Recrutamento"
          subtitle="Acompanha contactos e negociações com restaurantes a angariar."
        />

        <section className="dashboard-grid premium-grid stat-hero-grid">
          <article className="metric-card premium stat-hero" style={{ "--stat-accent": "#e62429" }}>
            <div className="stat-hero-icon stat-hero-icon--red">
              <ClipboardList aria-hidden="true" />
            </div>
            <div className="stat-hero-body">
              <div className="metric-label">Tarefas totais</div>
              <div className="metric-value">{tasks.length}</div>
              <div className="metric-foot">No total</div>
            </div>
          </article>
          <article className="metric-card premium stat-hero" style={{ "--stat-accent": "#b45309" }}>
            <div className="stat-hero-icon stat-hero-icon--blue">
              <Hourglass aria-hidden="true" />
            </div>
            <div className="stat-hero-body">
              <div className="metric-label">Em aberto</div>
              <div className="metric-value">{openCount}</div>
              <div className="metric-foot">Por fazer + em curso</div>
            </div>
          </article>
          <article className="metric-card premium stat-hero" style={{ "--stat-accent": "#15803d" }}>
            <div className="stat-hero-icon stat-hero-icon--green">
              <CheckCircle2 aria-hidden="true" />
            </div>
            <div className="stat-hero-body">
              <div className="metric-label">Concluídas</div>
              <div className="metric-value">{doneCount}</div>
              <div className="metric-foot">Restaurantes angariados</div>
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
              {editingId ? "Editar tarefa" : "Nova tarefa"}
            </>
          )}
        >
          <form onSubmit={handleSubmit} className="dashboard-form-grid">
            <label className="dashboard-form-field">
              <span>Título *</span>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label className="dashboard-form-field">
              <span>Nome do restaurante</span>
              <input type="text" value={form.restaurant_name} onChange={(e) => setForm({ ...form, restaurant_name: e.target.value })} />
            </label>
            <label className="dashboard-form-field">
              <span>Pessoa de contacto</span>
              <input type="text" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
            </label>
            <label className="dashboard-form-field">
              <span>Telefone</span>
              <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="dashboard-form-field">
              <span>Estado</span>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="todo">Por fazer</option>
                <option value="in_progress">Em curso</option>
                <option value="done">Concluída</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </label>
            <label className="dashboard-form-field">
              <span>Prioridade</span>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
              </select>
            </label>
            <label className="dashboard-form-field">
              <span>Data limite</span>
              <input type="date" value={form.due_date || ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </label>
            <label className="dashboard-form-field">
              <span>Responsável</span>
              <input type="text" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} />
            </label>
            <label className="dashboard-form-field dashboard-form-field--full">
              <span>Notas</span>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
            </label>

            <div className="dashboard-form-actions">
              <button className="btn-dashboard" type="submit" disabled={saving}>
                {saving ? "A gravar..." : editingId ? "Guardar alterações" : "Criar tarefa"}
              </button>
              {editingId && <button className="btn-dashboard secondary" type="button" onClick={resetForm}>Cancelar edição</button>}
            </div>
          </form>
        </DashboardPanel>

        <DashboardPanel
          title={(
            <>
              <ListChecks className="panel-title-icon" aria-hidden="true" />
              Tarefas existentes
            </>
          )}
          actions={(
            <label className="dashboard-form-field">
              <span>Filtrar por estado</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Todos os estados</option>
                <option value="todo">Por fazer</option>
                <option value="in_progress">Em curso</option>
                <option value="done">Concluída</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </label>
          )}
        >
          {loading ? (
            <DashboardLoadingState />
          ) : filteredTasks.length === 0 ? (
            <DashboardEmptyState label="Sem tarefas para mostrar." />
          ) : (
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Restaurante</th>
                    <th>Contacto</th>
                    <th>Prioridade</th>
                    <th>Estado</th>
                    <th>Prazo</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((task) => (
                    <tr key={task.id}>
                      <td><strong>{task.title}</strong></td>
                      <td>{task.restaurant_name || "-"}</td>
                      <td>
                        {task.contact_person || "-"}
                        {task.phone ? <div className="muted">{task.phone}</div> : null}
                      </td>
                      <td>{PRIORITY_LABELS[task.priority] || task.priority}</td>
                      <td>
                        <span className={`tag ${STATUS_CLASS[task.status] || "warn"}`}>
                          {STATUS_LABELS[task.status] || task.status}
                        </span>
                      </td>
                      <td>{task.due_date || "-"}</td>
                      <td>
                        {task.status !== "done" ? (
                          <button
                            type="button"
                            className="btn-dashboard small"
                            disabled={busyId === task.id}
                            onClick={() => handleQuickStatus(task, "done")}
                          >
                            Marcar concluída
                          </button>
                        ) : null}
                        <button type="button" className="btn-dashboard small" onClick={() => startEdit(task)}>Editar</button>
                        <button
                          type="button"
                          className="btn-dashboard small danger"
                          disabled={busyId === task.id}
                          onClick={() => setDeleteTarget(task)}
                        >
                          {busyId === task.id ? "A apagar..." : "Eliminar"}
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

      <Modal
        open={Boolean(deleteTarget)}
        title="Eliminar tarefa"
        onClose={() => setDeleteTarget(null)}
        actions={(
          <>
            <button type="button" className="btn-dashboard secondary" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </button>
            <button type="button" className="btn-dashboard danger" onClick={confirmDelete}>
              Eliminar
            </button>
          </>
        )}
      >
        <p>
          Eliminar a tarefa <strong>{deleteTarget?.title}</strong>? Esta ação não pode ser desfeita.
        </p>
      </Modal>
    </DashboardSidebarLayout>
  );
}

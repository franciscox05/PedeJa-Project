import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ClipboardList, Clock, CheckCircle2, Pencil, Trash2, PlusCircle } from "lucide-react";
import "../css/pages/dashboard.css";
import DashboardSidebarLayout from "../components/dashboard/DashboardSidebarLayout";
import DashboardPageHeader from "../components/dashboard/DashboardPageHeader";
import DashboardPanel from "../components/dashboard/DashboardPanel";
import DashboardEmptyState from "../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../components/dashboard/DashboardLoadingState";
import Modal from "../components/ui/modal";
import { Button } from "../components/ui/button";
import { ADMIN_DASHBOARD_TABS, resolveAdminTabRoute } from "../constants/adminDashboardTabs";
import {
  fetchRecruitmentTasks,
  saveRecruitmentTask,
  deleteRecruitmentTask,
} from "../services/adminRecruitmentTasksService";
import { extractUserId } from "../utils/roles";
import { useAlert } from "../context/AlertContext";

function parseSessionUser(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const STATUS_LABELS = {
  todo: "Por fazer",
  in_progress: "Em curso",
  done: "Concluida",
  cancelled: "Cancelada",
};

const STATUS_TAG_CLASS = {
  todo: "tag neutral",
  in_progress: "tag warn",
  done: "tag ok",
  cancelled: "tag bad",
};

const PRIORITY_LABELS = { low: "Baixa", medium: "Media", high: "Alta" };

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

export default function DashboardRecrutamento() {
  const navigate = useNavigate();
  const userRaw = localStorage.getItem("pedeja_user");
  const user = useMemo(() => parseSessionUser(userRaw), [userRaw]);
  const callerUserId = extractUserId(user);

  const { showError } = useAlert();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchRecruitmentTasks(callerUserId);
      setTasks(rows);
    } catch (err) {
      showError(err?.message || "Nao foi possivel carregar as tarefas.");
    } finally {
      setLoading(false);
    }
  }, [callerUserId, showError]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => ({
    todo: tasks.filter((t) => t.status === "todo").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    done: tasks.filter((t) => t.status === "done").length,
  }), [tasks]);

  const visibleTasks = useMemo(
    () => tasks.filter((t) => showDone || t.status !== "done"),
    [tasks, showDone],
  );

  const openNew = () => {
    setEditingTask(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (task) => {
    setEditingTask(task);
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
    setModalOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await saveRecruitmentTask(callerUserId, editingTask?.id ?? null, form);
      toast.success(editingTask ? "Tarefa atualizada." : "Tarefa criada.");
      setModalOpen(false);
      await load();
    } catch (err) {
      showError(err?.message || "Nao foi possivel guardar a tarefa.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDone = async (task) => {
    setBusyId(task.id);
    try {
      await saveRecruitmentTask(callerUserId, task.id, {
        ...task,
        status: task.status === "done" ? "todo" : "done",
      });
      await load();
    } catch (err) {
      showError(err?.message || "Nao foi possivel atualizar a tarefa.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (task) => {
    const confirmed = window.confirm(`Eliminar a tarefa "${task.title}"? Esta acao nao pode ser desfeita.`);
    if (!confirmed) return;
    setBusyId(task.id);
    try {
      await deleteRecruitmentTask(callerUserId, task.id);
      toast.success("Tarefa eliminada.");
      await load();
    } catch (err) {
      showError(err?.message || "Nao foi possivel eliminar a tarefa.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardSidebarLayout
      tabs={ADMIN_DASHBOARD_TABS}
      activeTab="recrutamento"
      onTabChange={(tabId) => navigate(resolveAdminTabRoute(tabId))}
      kicker="Equipa"
      title="Recrutamento"
      subtitle="Tarefas de seguimento de candidaturas e parcerias."
      storageKey="dashboard-admin-sidebar-collapsed"
    >
      <div className="dashboard-tab-section">
        <DashboardPageHeader
          kicker="Equipa"
          title="Tarefas de Recrutamento"
          subtitle={`${counts.todo} por fazer - ${counts.in_progress} em curso - ${counts.done} concluidas`}
          actions={(
            <button className="btn-dashboard" onClick={openNew}>
              <PlusCircle className="w-4 h-4" style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden="true" />
              Nova tarefa
            </button>
          )}
        />

        <section className="dashboard-grid premium-grid">
          <article className="metric-card premium">
            <div className="metric-card-icon metric-icon-slate"><ClipboardList aria-hidden="true" /></div>
            <div className="metric-label">Por fazer</div>
            <div className="metric-value">{counts.todo}</div>
          </article>
          <article className="metric-card premium">
            <div className="metric-card-icon metric-icon-amber"><Clock aria-hidden="true" /></div>
            <div className="metric-label">Em curso</div>
            <div className="metric-value">{counts.in_progress}</div>
          </article>
          <article className="metric-card premium">
            <div className="metric-card-icon metric-icon-green"><CheckCircle2 aria-hidden="true" /></div>
            <div className="metric-label">Concluidas</div>
            <div className="metric-value">{counts.done}</div>
          </article>
        </section>

        <DashboardPanel
          title="Tarefas"
          description="Segue candidaturas e contactos pendentes com a equipa."
          actions={(
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem" }}>
              <input type="checkbox" checked={showDone} onChange={(event) => setShowDone(event.target.checked)} />
              Mostrar concluidas
            </label>
          )}
        >
          {loading ? (
            <DashboardLoadingState label="A carregar tarefas..." />
          ) : visibleTasks.length === 0 ? (
            <DashboardEmptyState label="Sem tarefas para mostrar." />
          ) : (
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Tarefa</th>
                    <th>Restaurante</th>
                    <th>Contacto</th>
                    <th>Prioridade</th>
                    <th>Estado</th>
                    <th>Data limite</th>
                    <th>Responsavel</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTasks.map((task) => (
                    <tr key={task.id}>
                      <td>
                        <strong>{task.title}</strong>
                        {task.notes ? <div className="muted" style={{ fontSize: "0.78rem" }}>{task.notes}</div> : null}
                      </td>
                      <td>{task.restaurant_name || "-"}</td>
                      <td>
                        {task.contact_person || "-"}
                        {task.phone ? <div className="muted" style={{ fontSize: "0.78rem" }}>{task.phone}</div> : null}
                      </td>
                      <td>{PRIORITY_LABELS[task.priority] || task.priority}</td>
                      <td><span className={STATUS_TAG_CLASS[task.status] || "tag neutral"}>{STATUS_LABELS[task.status] || task.status}</span></td>
                      <td>{task.due_date ? new Date(task.due_date).toLocaleDateString("pt-PT") : "-"}</td>
                      <td>{task.assigned_to || "-"}</td>
                      <td>
                        <div className="table-action-row">
                          <button
                            className="btn-dashboard small secondary"
                            disabled={busyId === task.id}
                            onClick={() => handleToggleDone(task)}
                          >
                            {task.status === "done" ? "Reabrir" : "Concluir"}
                          </button>
                          <button className="btn-dashboard small secondary" onClick={() => openEdit(task)}>
                            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            className="btn-dashboard small danger"
                            disabled={busyId === task.id}
                            onClick={() => handleDelete(task)}
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
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
        open={modalOpen}
        title={editingTask ? "Editar tarefa" : "Nova tarefa"}
        onClose={() => setModalOpen(false)}
        actions={(
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={saving || !form.title.trim()}>
              {saving ? "A guardar..." : editingTask ? "Guardar" : "Criar"}
            </Button>
          </>
        )}
      >
        <form onSubmit={handleSubmit} className="dashboard-form-grid">
          <label className="dashboard-form-field dashboard-form-field--full">
            <span>O que fazer *</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ex: Ligar ao restaurante X para seguir candidatura"
              required
              autoFocus
            />
          </label>
          <label className="dashboard-form-field">
            <span>Restaurante</span>
            <input
              type="text"
              value={form.restaurant_name}
              onChange={(e) => setForm({ ...form, restaurant_name: e.target.value })}
            />
          </label>
          <label className="dashboard-form-field">
            <span>Contacto</span>
            <input
              type="text"
              value={form.contact_person}
              onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
            />
          </label>
          <label className="dashboard-form-field">
            <span>Telefone</span>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label className="dashboard-form-field">
            <span>Prioridade</span>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="low">Baixa</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
            </select>
          </label>
          <label className="dashboard-form-field">
            <span>Estado</span>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="todo">Por fazer</option>
              <option value="in_progress">Em curso</option>
              <option value="done">Concluida</option>
              <option value="cancelled">Cancelada</option>
            </select>
          </label>
          <label className="dashboard-form-field">
            <span>Data limite</span>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
          </label>
          <label className="dashboard-form-field">
            <span>Responsavel</span>
            <input
              type="text"
              value={form.assigned_to}
              onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
              placeholder="Quem vai tratar disto"
            />
          </label>
          <label className="dashboard-form-field dashboard-form-field--full">
            <span>Notas</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Detalhes, contexto, ultima conversa..."
            />
          </label>
        </form>
      </Modal>
    </DashboardSidebarLayout>
  );
}

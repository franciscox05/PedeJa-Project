import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import "../css/pages/dashboard.css";
import "../css/pages/estafeta.css";
import { useAuth } from "../context/AuthContext";
import DashboardSidebarLayout from "../components/dashboard/DashboardSidebarLayout";
import Modal from "../components/ui/modal";
import { Button } from "../components/ui/button";
import EstafetaHomeTab from "../components/estafeta/EstafetaHomeTab";
import EstafetaHistoryTab from "../components/estafeta/EstafetaHistoryTab";
import EstafetaProfileTab from "../components/estafeta/EstafetaProfileTab";
import {
  acceptOrRejectAssignment,
  advanceDeliveryStatus,
  cancelDeliveryAssignment,
  changeEstafetaPassword,
  fetchMyEstafetaHistory,
  fetchMyEstafetaState,
  toggleEstafetaOnline,
} from "../services/estafetaService";
import { useEstafetaLocationPing } from "../hooks/useEstafetaLocationPing";
import { useEstafetaOrderAlert } from "../hooks/useEstafetaOrderAlert";
import { useEstafetaPushSubscription } from "../hooks/useEstafetaPushSubscription";

const TABS = [
  { id: "inicio", label: "Início", icon: "home" },
  { id: "historico", label: "Histórico", icon: "history" },
  { id: "perfil", label: "Perfil", icon: "profile" },
];

const STATE_POLL_INTERVAL_MS = 8000;

export default function EstafetaDashboard() {
  const { user } = useAuth();
  const callerUserId = user?.idutilizador || null;

  const [activeTab, setActiveTab] = useState("inicio");
  const [state, setState] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingState, setLoadingState] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");

  const estafeta = state?.estafeta || null;

  useEstafetaLocationPing(callerUserId, Boolean(estafeta?.online));
  useEstafetaOrderAlert(state?.pending_assignment?.id || null, true);
  const pushSubscription = useEstafetaPushSubscription(callerUserId);

  const loadState = useCallback(async () => {
    if (!callerUserId) return;
    try {
      const data = await fetchMyEstafetaState(callerUserId);
      setState(data);
    } catch (error) {
      console.error("Estafeta dashboard: falha ao carregar estado", { error: error?.message });
    } finally {
      setLoadingState(false);
    }
  }, [callerUserId]);

  const loadHistory = useCallback(async () => {
    if (!callerUserId) return;
    setLoadingHistory(true);
    try {
      const data = await fetchMyEstafetaHistory(callerUserId, 50);
      setHistory(data);
    } catch (error) {
      console.error("Estafeta dashboard: falha ao carregar histórico", { error: error?.message });
    } finally {
      setLoadingHistory(false);
    }
  }, [callerUserId]);

  useEffect(() => {
    loadState();
    const intervalId = setInterval(loadState, STATE_POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [loadState]);

  useEffect(() => {
    if (activeTab === "historico") {
      loadHistory();
    }
  }, [activeTab, loadHistory]);

  const handleToggleOnline = async (nextOnline) => {
    setBusy(true);
    try {
      await toggleEstafetaOnline(callerUserId, nextOnline);
      toast.success(nextOnline ? "Ficaste online." : "Ficaste offline.");
      await loadState();
    } catch (error) {
      toast.error(error?.message || "Não foi possível atualizar o estado.");
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async (assignmentId) => {
    setBusy(true);
    try {
      await acceptOrRejectAssignment(callerUserId, assignmentId, true);
      toast.success("Pedido aceite!");
      await loadState();
    } catch (error) {
      toast.error(error?.message || "Não foi possível aceitar o pedido.");
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (assignmentId) => {
    setBusy(true);
    try {
      await acceptOrRejectAssignment(callerUserId, assignmentId, false, "Rejeitado pelo estafeta");
      toast("Pedido rejeitado. Volta a ficar disponível para novos pedidos.");
      await loadState();
    } catch (error) {
      toast.error(error?.message || "Não foi possível rejeitar o pedido.");
    } finally {
      setBusy(false);
    }
  };

  const handleAdvance = async (assignmentId, newEstado) => {
    setBusy(true);
    try {
      await advanceDeliveryStatus(callerUserId, assignmentId, newEstado);
      toast.success("Estado atualizado.");
      await loadState();
    } catch (error) {
      toast.error(error?.message || "Não foi possível atualizar o estado do pedido.");
    } finally {
      setBusy(false);
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    setBusy(true);
    try {
      await cancelDeliveryAssignment(callerUserId, cancelTarget, cancelReason.trim() || null);
      toast("Entrega cancelada.");
      setCancelTarget(null);
      setCancelReason("");
      await loadState();
    } catch (error) {
      toast.error(error?.message || "Não foi possível cancelar a entrega.");
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async (currentPassword, newPassword) => {
    setBusy(true);
    try {
      await changeEstafetaPassword(callerUserId, currentPassword, newPassword);
      toast.success("Password alterada com sucesso.");
      await loadState();
      return true;
    } catch (error) {
      toast.error(error?.message || "Não foi possível alterar a password.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (loadingState) {
    return (
      <DashboardSidebarLayout kicker="Estafeta" title="A carregar..." tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
        <div className="dashboard-tab-section"><p className="muted">A carregar o teu perfil de estafeta...</p></div>
      </DashboardSidebarLayout>
    );
  }

  if (!estafeta) {
    return (
      <DashboardSidebarLayout kicker="Estafeta" title="Sem perfil" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
        <div className="dashboard-tab-section">
          <div className="estafeta-empty-state">
            <p>Esta conta não tem um perfil de estafeta associado.</p>
          </div>
        </div>
      </DashboardSidebarLayout>
    );
  }

  return (
    <DashboardSidebarLayout
      kicker="Estafeta"
      title={estafeta.nome}
      subtitle={estafeta.online ? "Online" : "Offline"}
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === "inicio" ? (
        <EstafetaHomeTab
          estafeta={estafeta}
          pendingAssignment={state?.pending_assignment || null}
          activeAssignment={state?.active_assignment || null}
          onToggleOnline={handleToggleOnline}
          onAccept={handleAccept}
          onReject={handleReject}
          onAdvance={handleAdvance}
          onCancel={(assignmentId) => setCancelTarget(assignmentId)}
          busy={busy}
        />
      ) : null}
      {activeTab === "historico" ? (
        <EstafetaHistoryTab history={history} loading={loadingHistory} />
      ) : null}
      {activeTab === "perfil" ? (
        <EstafetaProfileTab
          estafeta={estafeta}
          onChangePassword={handleChangePassword}
          busy={busy}
          pushSubscription={pushSubscription}
        />
      ) : null}

      <Modal
        open={Boolean(cancelTarget)}
        title="Reportar problema / cancelar entrega"
        onClose={() => setCancelTarget(null)}
        actions={(
          <>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={busy}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={handleCancelConfirm} disabled={busy}>
              Confirmar cancelamento
            </Button>
          </>
        )}
      >
        <p className="estafeta-order-card-meta" style={{ marginTop: 0 }}>
          Descreve rapidamente o que aconteceu (opcional). O pedido é cancelado e a loja/admin são avisados.
        </p>
        <textarea
          rows={3}
          placeholder="Ex: cliente não atende, morada errada..."
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
        />
      </Modal>
    </DashboardSidebarLayout>
  );
}

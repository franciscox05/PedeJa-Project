import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import "../css/pages/dashboard.css";
import "../css/pages/estafeta.css";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import EstafetaAppShell from "../components/estafeta/EstafetaAppShell";
import Modal from "../components/ui/modal";
import EstafetaHomeTab from "../components/estafeta/EstafetaHomeTab";
import EstafetaHistoryTab from "../components/estafeta/EstafetaHistoryTab";
import EstafetaProfileTab from "../components/estafeta/EstafetaProfileTab";
import {
  acceptOrRejectAssignment,
  advanceDeliveryStatus,
  cancelDeliveryAssignment,
  changeEstafetaPassword,
  fetchMyEstafetaEarningsByDay,
  fetchMyEstafetaHistory,
  fetchMyEstafetaLiquidacoes,
  fetchMyEstafetaState,
  revertDeliveryStatus,
  toggleEstafetaOnline,
  uploadDeliveryProofPhoto,
} from "../services/estafetaService";
import { useEstafetaLocationPing } from "../hooks/useEstafetaLocationPing";
import { useEstafetaOrderAlert } from "../hooks/useEstafetaOrderAlert";
import { useEstafetaPushSubscription } from "../hooks/useEstafetaPushSubscription";
import { useAlert } from "../context/AlertContext";

const STATE_POLL_INTERVAL_MS = 8000;

export default function EstafetaDashboard() {
  const { user, logout } = useAuth();
  const { clearCart } = useCart();
  const { showError } = useAlert();
  const callerUserId = user?.idutilizador || null;

  const handleLogout = () => {
    logout();
    clearCart();
    // Navegacao "dura" (nao client-side): mesmo padrao de DashboardSidebarLayout,
    // evita o ProtectedRoute reagir a user=null antes do router assentar.
    window.location.href = "/";
  };

  const [activeTab, setActiveTab] = useState("inicio");
  const [state, setState] = useState(null);
  const [history, setHistory] = useState([]);
  const [earningsByDay, setEarningsByDay] = useState([]);
  const [liquidacoes, setLiquidacoes] = useState([]);
  const [loadingState, setLoadingState] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingEarnings, setLoadingEarnings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [deliveryProofTarget, setDeliveryProofTarget] = useState(null);
  const [proofPhotoFile, setProofPhotoFile] = useState(null);
  const [proofPhotoPreviewUrl, setProofPhotoPreviewUrl] = useState("");

  const estafeta = state?.estafeta || null;

  const locationPing = useEstafetaLocationPing(callerUserId, Boolean(estafeta?.online));
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

  const loadEarnings = useCallback(async () => {
    if (!callerUserId) return;
    setLoadingEarnings(true);
    try {
      const data = await fetchMyEstafetaEarningsByDay(callerUserId, 30);
      setEarningsByDay(data);
    } catch (error) {
      console.error("Estafeta dashboard: falha ao carregar ganhos", { error: error?.message });
    } finally {
      setLoadingEarnings(false);
    }
  }, [callerUserId]);

  const loadLiquidacoes = useCallback(async () => {
    if (!callerUserId) return;
    try {
      const data = await fetchMyEstafetaLiquidacoes(callerUserId);
      setLiquidacoes(data);
    } catch (error) {
      console.error("Estafeta dashboard: falha ao carregar pagamentos", { error: error?.message });
    }
  }, [callerUserId]);

  useEffect(() => {
    if (activeTab === "historico") {
      loadHistory();
      loadEarnings();
      loadLiquidacoes();
    }
  }, [activeTab, loadHistory, loadEarnings, loadLiquidacoes]);

  const handleToggleOnline = async (nextOnline) => {
    setBusy(true);
    try {
      await toggleEstafetaOnline(callerUserId, nextOnline);
      toast.success(nextOnline ? "Ficaste online." : "Ficaste offline.");
      await loadState();
    } catch (error) {
      showError(error?.message || "Não foi possível atualizar o estado.");
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
      showError(error?.message || "Não foi possível aceitar o pedido.");
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
      showError(error?.message || "Não foi possível rejeitar o pedido.");
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
      showError(error?.message || "Não foi possível atualizar o estado do pedido.");
    } finally {
      setBusy(false);
    }
  };

  const handleRevert = async (assignmentId) => {
    setBusy(true);
    try {
      await revertDeliveryStatus(callerUserId, assignmentId);
      toast.success("Estado revertido.");
      await loadState();
    } catch (error) {
      showError(error?.message || "Não foi possível voltar atrás no estado do pedido.");
    } finally {
      setBusy(false);
    }
  };

  const handleRequestDeliveryProof = (assignmentId) => {
    setDeliveryProofTarget(assignmentId);
    setProofPhotoFile(null);
    setProofPhotoPreviewUrl("");
  };

  const handleProofPhotoSelected = (event) => {
    const file = event.target.files?.[0] || null;
    setProofPhotoFile(file);
    setProofPhotoPreviewUrl(file ? URL.createObjectURL(file) : "");
  };

  const handleCloseProofModal = () => {
    setDeliveryProofTarget(null);
    setProofPhotoFile(null);
    setProofPhotoPreviewUrl("");
  };

  const handleConfirmDelivery = async () => {
    if (!deliveryProofTarget) return;

    setBusy(true);
    try {
      const photoUrl = proofPhotoFile
        ? await uploadDeliveryProofPhoto(callerUserId, deliveryProofTarget, proofPhotoFile)
        : null;
      await advanceDeliveryStatus(callerUserId, deliveryProofTarget, "entregue", photoUrl);
      toast.success("Entrega confirmada!");
      handleCloseProofModal();
      await loadState();
    } catch (error) {
      showError(error?.message || "Não foi possível confirmar a entrega.");
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
      showError(error?.message || "Não foi possível cancelar a entrega.");
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
      showError(error?.message || "Não foi possível alterar a password.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (loadingState) {
    return (
      <div className="estafeta-app-loading-screen">
        <div className="estafeta-app-loading-spinner" />
        <p>A carregar o teu perfil de estafeta...</p>
      </div>
    );
  }

  if (!estafeta) {
    return (
      <div className="estafeta-app-loading-screen">
        <div className="estafeta-empty-state">
          <span className="material-icons estafeta-empty-state-icon" aria-hidden="true">person_off</span>
          <p>Esta conta não tem um perfil de estafeta associado.</p>
        </div>
      </div>
    );
  }

  return (
    <EstafetaAppShell
      nome={estafeta.nome}
      online={Boolean(estafeta.online)}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onLogout={handleLogout}
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
          onRevert={handleRevert}
          onRequestDeliveryProof={handleRequestDeliveryProof}
          onCancel={(assignmentId) => setCancelTarget(assignmentId)}
          busy={busy}
          locationStatus={locationPing.status}
          locationErrorMessage={locationPing.errorMessage}
        />
      ) : null}
      {activeTab === "historico" ? (
        <EstafetaHistoryTab
          history={history}
          loading={loadingHistory}
          earningsByDay={earningsByDay}
          loadingEarnings={loadingEarnings}
          liquidacoes={liquidacoes}
        />
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
            <button type="button" className="estafeta-btn estafeta-btn--outline" onClick={() => setCancelTarget(null)} disabled={busy}>
              Voltar
            </button>
            <button type="button" className="estafeta-btn estafeta-btn--danger" onClick={handleCancelConfirm} disabled={busy}>
              Confirmar cancelamento
            </button>
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

      <Modal
        open={Boolean(deliveryProofTarget)}
        title="Confirmar entrega"
        onClose={handleCloseProofModal}
        actions={(
          <>
            <button type="button" className="estafeta-btn estafeta-btn--outline" onClick={handleCloseProofModal} disabled={busy}>
              Voltar
            </button>
            <button type="button" className="estafeta-btn estafeta-btn--primary" onClick={handleConfirmDelivery} disabled={busy}>
              {busy ? "A confirmar..." : "Confirmar entrega"}
            </button>
          </>
        )}
      >
        <p className="estafeta-order-card-meta" style={{ marginTop: 0 }}>
          Podes tirar uma foto da entrega (porta, receção, etc.) como prova. É opcional.
        </p>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleProofPhotoSelected}
        />
        {proofPhotoPreviewUrl ? (
          <img
            src={proofPhotoPreviewUrl}
            alt="Pré-visualização da prova de entrega"
            className="estafeta-proof-photo-preview"
          />
        ) : null}
      </Modal>
    </EstafetaAppShell>
  );
}

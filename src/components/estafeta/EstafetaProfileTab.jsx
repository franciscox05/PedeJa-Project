import { useState } from "react";
import { Button } from "../ui/button";

const VEHICLE_LABELS = {
  bicicleta: "Bicicleta",
  mota: "Mota",
  carro: "Carro",
  a_pe: "A pé",
};

export default function EstafetaProfileTab({ estafeta, onChangePassword, busy, pushSubscription }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");

    if (newPassword.length < 6) {
      setFormError("A nova password deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError("As passwords não coincidem.");
      return;
    }

    const ok = await onChangePassword(currentPassword, newPassword);
    if (ok) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  return (
    <div className="dashboard-tab-section">
      {estafeta?.password_temporaria ? (
        <div className="estafeta-password-banner">
          Estás a usar uma password temporária. Define uma nova password abaixo antes de continuar.
        </div>
      ) : null}

      <div className="estafeta-profile-grid">
        <div>
          <p className="estafeta-profile-field-label">Nome</p>
          <p className="estafeta-profile-field-value">{estafeta?.nome}</p>
        </div>
        <div>
          <p className="estafeta-profile-field-label">Telemóvel</p>
          <p className="estafeta-profile-field-value">{estafeta?.telefone || "-"}</p>
        </div>
        <div>
          <p className="estafeta-profile-field-label">Email</p>
          <p className="estafeta-profile-field-value">{estafeta?.email || "-"}</p>
        </div>
        <div>
          <p className="estafeta-profile-field-label">Veículo</p>
          <p className="estafeta-profile-field-value">{VEHICLE_LABELS[estafeta?.veiculo] || estafeta?.veiculo || "-"}</p>
        </div>
      </div>

      {pushSubscription?.supported ? (
        <div className="estafeta-order-card" style={{ marginBottom: 24 }}>
          <div className="estafeta-order-card-head">
            <h3 className="estafeta-order-card-title">Notificações</h3>
          </div>
          <p className="estafeta-order-card-meta">
            {pushSubscription.subscribed
              ? "As notificações push estão ativas neste dispositivo — recebes um alerta mesmo com a app fechada."
              : "Ativa as notificações para saberes logo quando chega um pedido novo, mesmo com a app fechada."}
          </p>
          <div className="estafeta-order-card-actions">
            <Button
              variant={pushSubscription.subscribed ? "outline" : "default"}
              disabled={pushSubscription.busy}
              onClick={() => (pushSubscription.subscribed ? pushSubscription.unsubscribe() : pushSubscription.subscribe())}
            >
              {pushSubscription.subscribed ? "Desativar notificações" : "Ativar notificações"}
            </Button>
          </div>
        </div>
      ) : null}

      <h3 style={{ marginBottom: 12 }}>Alterar password</h3>
      <form className="estafeta-password-form" onSubmit={handleSubmit}>
        {formError ? <div className="auth-page-feedback error">{formError}</div> : null}
        <input
          type="password"
          placeholder="Password atual"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Nova password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Confirmar nova password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
        <Button type="submit" disabled={busy}>
          Guardar nova password
        </Button>
      </form>
    </div>
  );
}

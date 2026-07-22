import { useState } from "react";

const VEHICLE_LABELS = {
  bicicleta: "Bicicleta",
  mota: "Mota",
  carro: "Carro",
  a_pe: "A pé",
};

const VEHICLE_ICONS = {
  bicicleta: "pedal_bike",
  mota: "two_wheeler",
  carro: "directions_car",
  a_pe: "directions_walk",
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

  const initial = (estafeta?.nome || "E").trim().charAt(0).toUpperCase();

  return (
    <div className="estafeta-app-section">
      {estafeta?.password_temporaria ? (
        <div className="estafeta-password-banner">
          <span className="material-icons" aria-hidden="true">lock_clock</span>
          <span>Estás a usar uma password temporária. Define uma nova password abaixo antes de continuar.</span>
        </div>
      ) : null}

      <div className="estafeta-profile-card">
        <div className="estafeta-profile-header">
          <span className="estafeta-profile-avatar">{initial}</span>
          <div>
            <p className="estafeta-profile-header-name">{estafeta?.nome}</p>
            <p className="estafeta-profile-header-sub">
              <span className="material-icons" aria-hidden="true" style={{ fontSize: 16 }}>
                {VEHICLE_ICONS[estafeta?.veiculo] || "two_wheeler"}
              </span>
              {VEHICLE_LABELS[estafeta?.veiculo] || estafeta?.veiculo || "-"}
            </p>
          </div>
        </div>

        <div className="estafeta-profile-grid">
          <div className="estafeta-profile-field">
            <span className="material-icons" aria-hidden="true">call</span>
            <div>
              <p className="estafeta-profile-field-label">Telemóvel</p>
              <p className="estafeta-profile-field-value">{estafeta?.telefone || "-"}</p>
            </div>
          </div>
          <div className="estafeta-profile-field">
            <span className="material-icons" aria-hidden="true">mail</span>
            <div>
              <p className="estafeta-profile-field-label">Email</p>
              <p className="estafeta-profile-field-value">{estafeta?.email || "-"}</p>
            </div>
          </div>
        </div>
      </div>

      {pushSubscription?.supported ? (
        <div className="estafeta-order-card estafeta-order-card--active">
          <div className="estafeta-order-card-head">
            <h3 className="estafeta-order-card-title">
              <span className="material-icons" aria-hidden="true">notifications</span>
              Notificações
            </h3>
          </div>
          <p className="estafeta-order-card-meta">
            {pushSubscription.subscribed
              ? "As notificações push estão ativas neste dispositivo — recebes um alerta mesmo com a app fechada."
              : "Ativa as notificações para saberes logo quando chega um pedido novo, mesmo com a app fechada."}
          </p>
          <div className="estafeta-order-card-actions">
            <button
              type="button"
              className={`estafeta-btn ${pushSubscription.subscribed ? "estafeta-btn--outline" : "estafeta-btn--primary"}`}
              disabled={pushSubscription.busy}
              onClick={() => (pushSubscription.subscribed ? pushSubscription.unsubscribe() : pushSubscription.subscribe())}
            >
              {pushSubscription.subscribed ? "Desativar notificações" : "Ativar notificações"}
            </button>
          </div>
        </div>
      ) : null}

      <p className="estafeta-section-title">Alterar password</p>
      <div className="estafeta-profile-card">
        <form className="estafeta-password-form" onSubmit={handleSubmit}>
          {formError ? <div className="estafeta-location-warning" style={{ marginBottom: 0 }}>{formError}</div> : null}
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
          <button type="submit" className="estafeta-btn estafeta-btn--primary" disabled={busy}>
            Guardar nova password
          </button>
        </form>
      </div>
    </div>
  );
}

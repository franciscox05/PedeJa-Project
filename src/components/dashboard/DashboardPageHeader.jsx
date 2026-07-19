import { useNavigate } from "react-router-dom";

export default function DashboardPageHeader({
  kicker,
  title,
  subtitle = "",
  backTo = null,
  actions = null,
}) {
  const navigate = useNavigate();

  return (
    <header className="dashboard-header enterprise-header">
      <div>
        {backTo ? (
          <button
            type="button"
            className="dashboard-link-button dashboard-back-link"
            onClick={() => navigate(backTo.to)}
          >
            {backTo.label || "Voltar ao dashboard"}
          </button>
        ) : null}
        <p className="kicker">{kicker}</p>
        <h1 className="dashboard-title">{title}</h1>
        {subtitle ? <p className="dashboard-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="dashboard-actions">{actions}</div> : null}
    </header>
  );
}

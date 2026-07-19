export default function DashboardPanel({
  title,
  description = "",
  actions = null,
  className = "",
  children,
}) {
  return (
    <article className={`panel${className ? ` ${className}` : ""}`}>
      <div className="panel-header-inline">
        <div>
          <h3>{title}</h3>
          {description ? <p className="muted">{description}</p> : null}
        </div>
        {actions ? actions : null}
      </div>
      {children}
    </article>
  );
}

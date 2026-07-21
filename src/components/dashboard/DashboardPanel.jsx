export default function DashboardPanel({
  id,
  title,
  description = "",
  actions = null,
  className = "",
  children,
}) {
  return (
    <article id={id} className={`panel${className ? ` ${className}` : ""}`}>
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

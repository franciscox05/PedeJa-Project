export default function DashboardLoadingState({ label = "A carregar...", as = "text", colSpan }) {
  const content = (
    <span className="dashboard-loading-state">
      <span className="dashboard-loading-spinner" aria-hidden="true" />
      <span className="muted">{label}</span>
    </span>
  );

  if (as === "tableRow") {
    return (
      <tr>
        <td colSpan={colSpan}>{content}</td>
      </tr>
    );
  }

  return content;
}

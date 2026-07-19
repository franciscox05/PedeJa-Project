export default function DashboardEmptyState({ label, as = "text", colSpan, action = null }) {
  if (as === "tableRow") {
    return (
      <tr>
        <td colSpan={colSpan} className="dashboard-empty-row">
          <span className="muted">{label}</span>
          {action}
        </td>
      </tr>
    );
  }

  return (
    <p className="muted dashboard-empty-state">
      {label}
      {action}
    </p>
  );
}

export default function TrendBars({ title, data = [], valueKey = "value", labelKey = "label", suffix = "" }) {
  const maxValue = Math.max(...data.map((item) => Number(item[valueKey] || 0)), 1);

  return (
    <div className="panel">
      <h3>{title}</h3>
      <div className="trend-bars">
        {data.map((item) => {
          const value = Number(item[valueKey] || 0);
          const width = Math.max((value / maxValue) * 100, 2);
          return (
            <div key={String(item[labelKey])} className="trend-row">
              <div className="trend-label">{item[labelKey]}</div>
              <div className="trend-track">
                <div className="trend-fill" style={{ width: `${width}%` }} />
              </div>
              <div className="trend-value">{value.toFixed(0)}{suffix}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const PERIODS = [
  { id: 7, label: "7 dias" },
  { id: 30, label: "30 dias" },
];

function formatCurrency(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0,00 €";
  return parsed.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

function formatDayLabel(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

function buildContinuousSeries(earningsByDay, days) {
  const totalsByDay = new Map((earningsByDay || []).map((row) => [row.dia, row]));
  const series = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const isoDate = date.toISOString().slice(0, 10);
    const row = totalsByDay.get(isoDate);

    series.push({
      dia: isoDate,
      label: formatDayLabel(isoDate),
      total: Number(row?.total || 0),
      entregas: Number(row?.entregas || 0),
    });
  }

  return series;
}

function EarningsTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="estafeta-chart-tooltip">
      <strong>{point.label}</strong>
      <div>{formatCurrency(point.total)}</div>
      <div className="estafeta-chart-tooltip-meta">{point.entregas} entrega{point.entregas === 1 ? "" : "s"}</div>
    </div>
  );
}

export default function EstafetaEarningsChart({ earningsByDay, loading }) {
  const [period, setPeriod] = useState(7);

  const series = useMemo(() => buildContinuousSeries(earningsByDay, period), [earningsByDay, period]);

  const periodTotal = useMemo(
    () => series.reduce((sum, point) => sum + point.total, 0),
    [series],
  );
  const periodDeliveries = useMemo(
    () => series.reduce((sum, point) => sum + point.entregas, 0),
    [series],
  );

  return (
    <div className="estafeta-earnings-chart">
      <div className="estafeta-earnings-chart-header">
        <div>
          <p className="estafeta-stat-label">Ganhos no período</p>
          <p className="estafeta-earnings-chart-total">{formatCurrency(periodTotal)}</p>
          <p className="estafeta-order-card-meta" style={{ margin: 0 }}>{periodDeliveries} entrega{periodDeliveries === 1 ? "" : "s"}</p>
        </div>
        <div className="estafeta-period-toggle">
          {PERIODS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`estafeta-period-toggle-btn${period === option.id ? " is-active" : ""}`}
              onClick={() => setPeriod(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="muted">A carregar ganhos...</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#94a3b8"
              tick={{ fontSize: 11 }}
              interval={period > 7 ? 3 : 0}
              axisLine={false}
              tickLine={false}
            />
            <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} width={40} axisLine={false} tickLine={false} />
            <Tooltip content={<EarningsTooltip />} cursor={{ fill: "rgba(230, 36, 41, 0.06)" }} />
            <Bar dataKey="total" name="Ganhos" fill="#e62429" radius={[4, 4, 0, 0]} maxBarSize={period > 7 ? 10 : 28} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

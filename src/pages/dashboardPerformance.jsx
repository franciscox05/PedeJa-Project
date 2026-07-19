import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DashboardSidebarLayout from "../components/dashboard/DashboardSidebarLayout";
import DashboardPageHeader from "../components/dashboard/DashboardPageHeader";
import DashboardPanel from "../components/dashboard/DashboardPanel";
import DashboardLoadingState from "../components/dashboard/DashboardLoadingState";
import DatePickerCustom from "../components/ui/DatePickerCustom";
import "../css/pages/dashboard.css";
import { fetchAdminPerformanceData } from "../services/adminPerformanceService";
import { extractUserId } from "../utils/roles";
import { ADMIN_DASHBOARD_TABS, resolveAdminTabRoute } from "../constants/adminDashboardTabs";

function parseSessionUser(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function formatMoney(value) {
  return `${Number(value || 0).toFixed(2)}EUR`;
}

function sortSeriesByDateAsc(series = []) {
  return [...series].sort((a, b) => new Date(a?.date || 0).getTime() - new Date(b?.date || 0).getTime());
}

function normalizePerformanceFilters(searchParams) {
  const queryDays = Number(searchParams.get("days") || 7);
  const queryGranularity = String(searchParams.get("granularity") || "day");
  const queryMode = String(searchParams.get("mode") || "preset");
  const periodDays = [7, 30, 90].includes(queryDays) ? queryDays : 7;
  const granularity = ["day", "week"].includes(queryGranularity) ? queryGranularity : "day";
  const rangeMode = queryMode === "custom" ? "custom" : "preset";

  return {
    periodDays,
    granularity,
    rangeMode,
    customRange: {
      from: searchParams.get("from") || "",
      to: searchParams.get("to") || "",
    },
  };
}

export default function DashboardPerformance() {
  const navigate = useNavigate();
  const userRaw = localStorage.getItem("pedeja_user");
  const user = useMemo(() => parseSessionUser(userRaw), [userRaw]);
  const [searchParams, setSearchParams] = useSearchParams();
  const { periodDays, granularity, rangeMode, customRange } = useMemo(
    () => normalizePerformanceFilters(searchParams),
    [searchParams],
  );
  const [state, setState] = useState({ loading: true, error: "", data: null });

  const updateSearchFilters = useCallback((next) => {
    const params = new URLSearchParams();
    const nextPeriodDays = [7, 30, 90].includes(Number(next?.periodDays)) ? Number(next.periodDays) : periodDays;
    const nextGranularity = ["day", "week"].includes(String(next?.granularity)) ? String(next.granularity) : granularity;
    const nextRangeMode = next?.rangeMode === "custom" ? "custom" : "preset";
    const nextCustomRange = {
      from: next?.customRange?.from ?? customRange.from,
      to: next?.customRange?.to ?? customRange.to,
    };

    params.set("days", String(nextPeriodDays));
    params.set("granularity", nextGranularity);

    if (nextRangeMode === "custom") {
      params.set("mode", "custom");
      if (nextCustomRange.from) params.set("from", nextCustomRange.from);
      if (nextCustomRange.to) params.set("to", nextCustomRange.to);
    }

    setSearchParams(params);
  }, [customRange.from, customRange.to, granularity, periodDays, setSearchParams]);

  const load = useCallback(async (filters = {}) => {
    const effectivePeriodDays = [7, 30, 90].includes(Number(filters?.periodDays)) ? Number(filters.periodDays) : periodDays;
    const effectiveGranularity = ["day", "week"].includes(String(filters?.granularity)) ? String(filters.granularity) : granularity;
    const effectiveRangeMode = filters?.rangeMode === "custom" ? "custom" : rangeMode;
    const effectiveCustomRange = filters?.customRange || customRange;

    setState((prev) => ({ ...prev, loading: true, error: "" }));

    try {
      const data = await fetchAdminPerformanceData({
        periodDays: effectivePeriodDays,
        granularity: effectiveGranularity,
        dateFrom: effectiveRangeMode === "custom" ? effectiveCustomRange?.from || null : null,
        dateTo: effectiveRangeMode === "custom" ? effectiveCustomRange?.to || null : null,
        callerUserId: extractUserId(user),
      });
      setState({ loading: false, error: "", data });
    } catch (error) {
      setState({
        loading: false,
        error: error?.message || "Nao foi possivel carregar o dashboard de performance.",
        data: null,
      });
    }
  }, [customRange, granularity, periodDays, rangeMode, user]);

  useEffect(() => {
    let active = true;

    Promise.resolve()
      .then(() => fetchAdminPerformanceData({
        periodDays,
        granularity,
        dateFrom: rangeMode === "custom" ? customRange.from || null : null,
        dateTo: rangeMode === "custom" ? customRange.to || null : null,
        callerUserId: extractUserId(user),
      }))
      .then((data) => {
        if (!active) return;
        setState({ loading: false, error: "", data });
      })
      .catch((error) => {
        if (!active) return;
        setState({
          loading: false,
          error: error?.message || "Nao foi possivel carregar o dashboard de performance.",
          data: null,
        });
      });

    return () => {
      active = false;
    };
  }, [customRange.from, customRange.to, granularity, periodDays, rangeMode, user]);

  const overview = state.data?.overview;
  const revenueSeries = useMemo(
    () => sortSeriesByDateAsc(state.data?.revenueSeries || []),
    [state.data?.revenueSeries],
  );
  const topProducts = useMemo(() => state.data?.topProducts || [], [state.data?.topProducts]);
  const deliveryPerformanceSeries = useMemo(
    () => sortSeriesByDateAsc(state.data?.deliveryPerformanceSeries || []),
    [state.data?.deliveryPerformanceSeries],
  );

  const bestProductLabel = useMemo(
    () => topProducts[0]?.name || "Sem dados",
    [topProducts],
  );

  return (
    <DashboardSidebarLayout
      tabs={ADMIN_DASHBOARD_TABS}
      activeTab="dashboard"
      onTabChange={(tabId) => navigate(resolveAdminTabRoute(tabId))}
      kicker="Performance"
      title="Admin Performance Center"
      subtitle="Leitura operacional da faturacao, produtos mais vendidos e tempos medios de entrega."
      footer={(
        <div>
          <p className="muted dashboard-sidebar-footer-label">Analise</p>
          <strong>Performance</strong>
          <p className="muted dashboard-sidebar-footer-meta">
            {rangeMode === "custom" ? "Intervalo personalizado" : `${periodDays} dias`}
          </p>
        </div>
      )}
      storageKey="dashboard-admin-sidebar-collapsed"
    >
      <DashboardPageHeader
        kicker="Performance"
        title="Dashboard de Performance"
        subtitle="Faturacao, taxas de entrega, top produtos e tempo medio entre atribuicao e entrega final."
        actions={(
          <>
          <select
            value={rangeMode === "custom" ? "custom" : String(periodDays)}
            onChange={(event) => {
              if (event.target.value === "custom") {
                updateSearchFilters({ rangeMode: "custom" });
                return;
              }

              updateSearchFilters({
                rangeMode: "preset",
                periodDays: Number(event.target.value),
              });
            }}
          >
            <option value={7}>Ultimos 7 dias</option>
            <option value={30}>Ultimos 30 dias</option>
            <option value={90}>Ultimos 90 dias</option>
            <option value="custom">Intervalo personalizado</option>
          </select>
          {rangeMode === "custom" ? (
            <div className="dashboard-range-fields">
              <label className="dashboard-range-field">
                <span className="muted">De</span>
                <DatePickerCustom
                  mode="datetime"
                  placeholder="Selecionar inicio"
                  value={customRange.from}
                  onChange={(value) => updateSearchFilters({
                    rangeMode: "custom",
                    customRange: {
                      ...customRange,
                      from: value,
                    },
                  })}
                />
              </label>
              <label className="dashboard-range-field">
                <span className="muted">Ate</span>
                <DatePickerCustom
                  mode="datetime"
                  placeholder="Selecionar fim"
                  value={customRange.to}
                  min={customRange.from || null}
                  onChange={(value) => updateSearchFilters({
                    rangeMode: "custom",
                    customRange: {
                      ...customRange,
                      to: value,
                    },
                  })}
                />
              </label>
            </div>
          ) : null}
          <select
            value={granularity}
            onChange={(event) => updateSearchFilters({ granularity: event.target.value })}
          >
            <option value="day">Diario</option>
            <option value="week">Semanal</option>
          </select>
          <button className="btn-dashboard" onClick={() => load({ periodDays, granularity, rangeMode, customRange })}>Atualizar</button>
          <button className="btn-dashboard secondary" onClick={() => navigate("/dashboard/admin")}>Voltar ao dashboard</button>
          </>
        )}
      />

      {state.error ? <p className="shipday-inline-error">{state.error}</p> : null}

      {state.loading ? (
        <DashboardPanel title="Performance">
          <DashboardLoadingState label="A carregar metricas de performance..." />
        </DashboardPanel>
      ) : state.data ? (
        <div className="dashboard-stack">
          <section className="dashboard-grid premium-grid">
            <article className="metric-card premium">
              <div className="metric-label">Faturacao total</div>
              <div className="metric-value">{formatMoney(overview?.totalRevenue)}</div>
              <div className="metric-foot">Periodo selecionado</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-label">Taxas de entrega</div>
              <div className="metric-value">{formatMoney(overview?.totalDeliveryFees)}</div>
              <div className="metric-foot">Somatorio de taxas cobradas</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-label">Entregas concluidas</div>
              <div className="metric-value">{overview?.deliveredOrders || 0}</div>
              <div className="metric-foot">Pedidos entregues</div>
            </article>
            <article className="metric-card premium">
              <div className="metric-label">Tempo medio</div>
              <div className="metric-value">{Number(overview?.averageAssignToDeliveredMinutes || 0).toFixed(1)} min</div>
              <div className="metric-foot">Da atribuicao ate entrega</div>
            </article>
          </section>

          <section className="panel-grid analytics-grid">
            <DashboardPanel
              className="chart-panel"
              title="Faturacao vs. taxas de entrega"
              description={`Comparacao por ${granularity === "week" ? "semana" : "dia"}.`}
            >
              <div className="chart-shell">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={revenueSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip formatter={(value) => `${Number(value || 0).toFixed(2)} EUR`} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" name="Faturacao" stroke="#e62429" strokeWidth={3} />
                    <Line type="monotone" dataKey="deliveryFees" name="Taxas entrega" stroke="#2563eb" strokeWidth={3} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </DashboardPanel>

            <DashboardPanel
              className="chart-panel"
              title="Top 5 produtos"
              description={`Mais vendidos por quantidade. Lider atual: ${bestProductLabel}.`}
            >
              <div className="chart-shell">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={topProducts} layout="vertical" margin={{ left: 20, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" stroke="#64748b" />
                    <YAxis type="category" dataKey="name" width={120} stroke="#64748b" />
                    <Tooltip formatter={(value, name) => name === "quantity" ? `${value} un.` : `${Number(value || 0).toFixed(2)} EUR`} />
                    <Legend />
                    <Bar dataKey="quantity" name="Quantidade" fill="#22c55e" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </DashboardPanel>
          </section>

          <DashboardPanel
            className="chart-panel"
            title="Tempo medio entre atribuicao e entrega"
            description={`Serie media por ${granularity === "week" ? "semana" : "dia"} com base nas entregas concluidas.`}
          >
            <div className="chart-shell">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={deliveryPerformanceSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip formatter={(value) => `${Number(value || 0).toFixed(1)} min`} />
                  <Legend />
                  <Bar dataKey="avgMinutes" name="Tempo medio" fill="#0f172a" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </DashboardPanel>
        </div>
      ) : null}
    </DashboardSidebarLayout>
  );
}

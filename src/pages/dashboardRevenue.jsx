import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "../css/pages/dashboard.css";
import DashboardSidebarLayout from "../components/dashboard/DashboardSidebarLayout";
import DashboardPageHeader from "../components/dashboard/DashboardPageHeader";
import DashboardPanel from "../components/dashboard/DashboardPanel";
import DashboardEmptyState from "../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../components/dashboard/DashboardLoadingState";
import { fetchAdminRevenueBreakdown } from "../services/adminRevenueService";
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

export default function DashboardRevenue() {
  const navigate = useNavigate();
  const userRaw = localStorage.getItem("pedeja_user");
  const user = useMemo(() => parseSessionUser(userRaw), [userRaw]);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryDays = Number(searchParams.get("days") || 7);
  const periodDays = [7, 30, 90].includes(queryDays) ? queryDays : 7;
  const [state, setState] = useState({ loading: true, error: "", data: null });

  const revenueData = state.data;
  const collectiveRestaurants = useMemo(
    () => (revenueData?.collectiveByType || []).find((entry) => /restaur/i.test(String(entry.label || ""))) || null,
    [revenueData],
  );

  const load = useCallback(async (days = periodDays) => {
    setState((prev) => ({ ...prev, loading: true, error: "" }));

    try {
      const data = await fetchAdminRevenueBreakdown(days, extractUserId(user));
      setState({ loading: false, error: "", data });
    } catch (error) {
      setState({
        loading: false,
        error: error?.message || "Nao foi possivel carregar o detalhe da receita.",
        data: null,
      });
    }
  }, [periodDays, user]);

  useEffect(() => {
    let active = true;

    Promise.resolve()
      .then(() => {
        if (active) {
          setState((prev) => ({ ...prev, loading: true, error: "" }));
        }

        return fetchAdminRevenueBreakdown(periodDays, extractUserId(user));
      })
      .then((data) => {
        if (active) {
          setState({ loading: false, error: "", data });
        }
      })
      .catch((error) => {
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Nao foi possivel carregar o detalhe da receita.",
            data: null,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [periodDays, user]);

  return (
    <DashboardSidebarLayout
      tabs={ADMIN_DASHBOARD_TABS}
      activeTab="dashboard"
      onTabChange={(tabId) => navigate(resolveAdminTabRoute(tabId))}
      kicker="Receita"
      title="PedeJa Control Center"
      subtitle="Origem da receita faturada, comissao e performance por loja/estafeta."
      footer={(
        <div>
          <p className="muted dashboard-sidebar-footer-label">Analise</p>
          <strong>Receita detalhada</strong>
          <p className="muted dashboard-sidebar-footer-meta">{periodDays} dias</p>
        </div>
      )}
      storageKey="dashboard-admin-sidebar-collapsed"
    >
      <div className="dashboard-tab-section">
        <DashboardPageHeader
          kicker="Receita"
          title="Origem da receita"
          subtitle="Visao geral por tipo de loja, loja individual, comissao estimada e dados recebidos do Shipday."
          actions={(
            <>
              <select value={periodDays} onChange={(event) => setSearchParams({ days: String(Number(event.target.value)) })}>
                <option value={7}>Ultimos 7 dias</option>
                <option value={30}>Ultimos 30 dias</option>
                <option value={90}>Ultimos 90 dias</option>
              </select>
              <button className="btn-dashboard" onClick={() => load(periodDays)}>Atualizar</button>
              <button className="btn-dashboard secondary" onClick={() => navigate(`/dashboard/admin/performance?days=${periodDays}`)}>
                Performance
              </button>
              <button className="btn-dashboard secondary" onClick={() => navigate("/dashboard/admin")}>Voltar ao dashboard</button>
            </>
          )}
        />

        {state.error ? <p className="shipday-inline-error">{state.error}</p> : null}

        {state.loading ? (
          <DashboardPanel title="Receita">
            <DashboardLoadingState label="A carregar detalhe de receita..." />
          </DashboardPanel>
        ) : revenueData ? (
          <>
            <section className="dashboard-grid premium-grid">
              <article className="metric-card premium">
                <div className="metric-label">Faturado ao cliente</div>
                <div className="metric-value">{formatMoney(revenueData.overview.totalGrossRevenue)}</div>
                <div className="metric-foot">Valor bruto cobrado no periodo</div>
              </article>
              <article className="metric-card premium">
                <div className="metric-label">Base das lojas</div>
                <div className="metric-value">{formatMoney(revenueData.overview.totalBaseValue)}</div>
                <div className="metric-foot">Preco base estimado dos artigos</div>
              </article>
              <article className="metric-card premium">
                <div className="metric-label">Comissao PedeJa</div>
                <div className="metric-value">{formatMoney(revenueData.overview.totalCommissionProfit)}</div>
                <div className="metric-foot">Lucro estimado em markup/comissao</div>
              </article>
              <article className="metric-card premium">
                <div className="metric-label">Taxas de entrega</div>
                <div className="metric-value">{formatMoney(revenueData.overview.totalDeliveryFees)}</div>
                <div className="metric-foot">Taxa cobrada ao cliente para entrega</div>
              </article>
            </section>

            <section className="insight-grid">
              <DashboardPanel className="insight-card" title="Leitura geral">
                <p className="muted">
                  O valor de <strong>{formatMoney(revenueData.overview.totalGrossRevenue)}</strong> inclui o preco final dos artigos
                  com markup e a taxa de entrega. A base das lojas representa o preco original estimado do menu, e a diferenca fica
                  na comissao PedeJa.
                </p>
                <div className="insight-pills">
                  <span className="tag ok">Restaurantes: {formatMoney(revenueData.overview.restaurantGrossRevenue)}</span>
                  <span className="tag warn">Outras lojas: {formatMoney(revenueData.overview.otherGrossRevenue)}</span>
                  <span className="tag neutral">Shipday reportado: {formatMoney(revenueData.overview.driverReportedEarnings)}</span>
                </div>
              </DashboardPanel>

              <DashboardPanel className="insight-card" title="Qualidade da leitura da comissao">
                <p className="muted">
                  Quando o prato ainda existe no catalogo, a leitura usa o preco base atual. Caso contrario, a comissao e inferida
                  pela configuracao ativa da loja, para te dar uma explicacao util de onde vem o valor faturado.
                </p>
                <div className="coverage-grid">
                  <div>
                    <strong>{revenueData.commissionCoverage.exactItems}</strong>
                    <span>Itens lidos diretamente do catalogo</span>
                  </div>
                  <div>
                    <strong>{revenueData.commissionCoverage.estimatedItems}</strong>
                    <span>Itens inferidos pela comissao atual</span>
                  </div>
                  <div>
                    <strong>{revenueData.commissionCoverage.unresolvedItems}</strong>
                    <span>Itens sem detalhe suficiente</span>
                  </div>
                </div>
              </DashboardPanel>

              <DashboardPanel className="insight-card" title="Restaurantes em conjunto">
                <p className="muted">
                  {collectiveRestaurants
                    ? `As lojas do tipo restaurante faturaram ${formatMoney(collectiveRestaurants.grossRevenue)} no total, com ${formatMoney(collectiveRestaurants.commissionProfit)} de comissao estimada e ticket medio de ${formatMoney(collectiveRestaurants.avgOrderValue)}.`
                    : "Sem movimento de restaurantes nesta janela."}
                </p>
              </DashboardPanel>
            </section>

            <DashboardPanel
              title="Receita por tipo de loja"
              description="Coletivo por categoria de negocio: restaurantes e restantes tipos de loja."
            >
              <div className="table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Pedidos</th>
                      <th>Faturado</th>
                      <th>Base lojas</th>
                      <th>Comissao</th>
                      <th>Entrega</th>
                      <th>Ticket medio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueData.collectiveByType.map((entry) => (
                      <tr key={entry.label}>
                        <td>{entry.label}</td>
                        <td>{entry.orders}</td>
                        <td>{formatMoney(entry.grossRevenue)}</td>
                        <td>{formatMoney(entry.baseValue)}</td>
                        <td>{formatMoney(entry.commissionProfit)}</td>
                        <td>{formatMoney(entry.deliveryFees)}</td>
                        <td>{formatMoney(entry.avgOrderValue)}</td>
                      </tr>
                    ))}
                    {revenueData.collectiveByType.length === 0 ? (
                      <DashboardEmptyState as="tableRow" colSpan={7} label="Sem dados de receita para mostrar." />
                    ) : null}
                  </tbody>
                </table>
              </div>
            </DashboardPanel>

            <DashboardPanel
              title="Receita por loja"
              description="Vista individual por loja, para comparar faturacao, base e lucro real de comissao."
            >
              <div className="table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Loja</th>
                      <th>Tipo</th>
                      <th>Pedidos</th>
                      <th>Faturado</th>
                      <th>Base lojas</th>
                      <th>Comissao</th>
                      <th>Entrega</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueData.byStore.map((entry) => (
                      <tr key={entry.lojaId}>
                        <td>{entry.label}</td>
                        <td>{entry.storeTypeLabel}</td>
                        <td>{entry.orders}</td>
                        <td>{formatMoney(entry.grossRevenue)}</td>
                        <td>{formatMoney(entry.baseValue)}</td>
                        <td>{formatMoney(entry.commissionProfit)}</td>
                        <td>{formatMoney(entry.deliveryFees)}</td>
                      </tr>
                    ))}
                    {revenueData.byStore.length === 0 ? (
                      <DashboardEmptyState as="tableRow" colSpan={7} label="Sem lojas com receita para mostrar." />
                    ) : null}
                  </tbody>
                </table>
              </div>
            </DashboardPanel>

            <DashboardPanel
              title="Estafetas e Shipday"
              description="O quadro abaixo mostra o valor de pedidos e taxas de entrega movimentadas por estafeta. Quando o Shipday devolve um valor de ganho/payout no payload, ele aparece na coluna de ganho reportado."
            >
              <div className="table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Estafeta</th>
                      <th>Telefone</th>
                      <th>Entregas</th>
                      <th>Pedidos movimentados</th>
                      <th>Taxas entrega</th>
                      <th>Ganho reportado Shipday</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueData.byDriver.map((entry) => (
                      <tr key={entry.key}>
                        <td>{entry.name}</td>
                        <td>{entry.phone || "-"}</td>
                        <td>{entry.deliveries}</td>
                        <td>{formatMoney(entry.ordersValue)}</td>
                        <td>{formatMoney(entry.deliveryFees)}</td>
                        <td>{entry.reportedEarningsCount > 0 ? formatMoney(entry.shipdayReportedEarnings) : "-"}</td>
                      </tr>
                    ))}
                    {revenueData.byDriver.length === 0 ? (
                      <DashboardEmptyState as="tableRow" colSpan={6} label="Sem dados de estafetas para mostrar." />
                    ) : null}
                  </tbody>
                </table>
              </div>
            </DashboardPanel>
          </>
        ) : null}
      </div>
    </DashboardSidebarLayout>
  );
}

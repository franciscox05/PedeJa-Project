import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "../css/pages/dashboard.css";
import DashboardSidebarLayout from "../components/dashboard/DashboardSidebarLayout";
import { fetchAdminRevenueBreakdown } from "../services/adminRevenueService";

const ADMIN_DASHBOARD_TABS = [
  { id: "dashboard", label: "Dashboard", description: "Ultimos pedidos e entregas recentes", icon: "dashboard" },
  { id: "restaurants", label: "Gestao de Restaurantes", description: "Auto-accept e comissao por loja", icon: "restaurants" },
  { id: "promotions", label: "Promocoes", description: "Campanhas e futuras ativacoes", icon: "promotions" },
];

function formatMoney(value) {
  return `${Number(value || 0).toFixed(2)}EUR`;
}

export default function DashboardRevenue() {
  const navigate = useNavigate();
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
      const data = await fetchAdminRevenueBreakdown(days);
      setState({ loading: false, error: "", data });
    } catch (error) {
      setState({
        loading: false,
        error: error?.message || "Nao foi possivel carregar o detalhe da receita.",
        data: null,
      });
    }
  }, [periodDays]);

  useEffect(() => {
    let active = true;

    Promise.resolve()
      .then(() => {
        if (active) {
          setState((prev) => ({ ...prev, loading: true, error: "" }));
        }

        return fetchAdminRevenueBreakdown(periodDays);
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
  }, [periodDays]);

  return (
    <DashboardSidebarLayout
      tabs={ADMIN_DASHBOARD_TABS}
      activeTab="dashboard"
      onTabChange={(tabId) => navigate(`/dashboard/admin?tab=${tabId}`)}
      title="PedeJa Control Center"
      subtitle="Origem da receita faturada, comissao e performance por loja/estafeta."
      footerLabel="Analise"
      footerValue="Receita detalhada"
      footerMeta={`${periodDays} dias`}
    >
      <div className="dashboard-tab-section">
        <header className="dashboard-header enterprise-header">
          <div>
            <p className="kicker">Receita</p>
            <h1 className="dashboard-title">Origem da receita</h1>
            <p className="dashboard-subtitle">
              Visao geral por tipo de loja, loja individual, comissao estimada e dados recebidos do Shipday.
            </p>
          </div>

          <div className="dashboard-actions">
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
          </div>
        </header>

        {state.error ? <p className="shipday-inline-error">{state.error}</p> : null}

        {state.loading ? (
          <article className="panel">
            <p className="muted">A carregar detalhe de receita...</p>
          </article>
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
              <article className="panel insight-card">
                <h3>Leitura geral</h3>
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
              </article>

              <article className="panel insight-card">
                <h3>Qualidade da leitura da comissao</h3>
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
              </article>

              <article className="panel insight-card">
                <h3>Restaurantes em conjunto</h3>
                <p className="muted">
                  {collectiveRestaurants
                    ? `As lojas do tipo restaurante faturaram ${formatMoney(collectiveRestaurants.grossRevenue)} no total, com ${formatMoney(collectiveRestaurants.commissionProfit)} de comissao estimada e ticket medio de ${formatMoney(collectiveRestaurants.avgOrderValue)}.`
                    : "Sem movimento de restaurantes nesta janela."}
                </p>
              </article>
            </section>

            <article className="panel">
              <div className="panel-header-inline">
                <div>
                  <h3>Receita por tipo de loja</h3>
                  <p className="muted">Coletivo por categoria de negocio: restaurantes e restantes tipos de loja.</p>
                </div>
              </div>
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
                      <tr><td colSpan={7}>Sem dados de receita para este periodo.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="panel">
              <div className="panel-header-inline">
                <div>
                  <h3>Receita por loja</h3>
                  <p className="muted">Vista individual por loja, para comparar faturacao, base e lucro real de comissao.</p>
                </div>
              </div>
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
                      <tr><td colSpan={7}>Sem lojas com receita nesta janela.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="panel">
              <div className="panel-header-inline">
                <div>
                  <h3>Estafetas e Shipday</h3>
                  <p className="muted">
                    O quadro abaixo mostra o valor de pedidos e taxas de entrega movimentadas por estafeta. Quando o Shipday devolve
                    um valor de ganho/payout no payload, ele aparece na coluna de ganho reportado.
                  </p>
                </div>
              </div>
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
                      <tr><td colSpan={6}>Sem dados de estafetas nesta janela.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>
          </>
        ) : null}
      </div>
    </DashboardSidebarLayout>
  );
}

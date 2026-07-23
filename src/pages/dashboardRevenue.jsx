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

  const maxTypeRevenue = useMemo(
    () => Math.max(1, ...(revenueData?.collectiveByType || []).map((entry) => Number(entry.grossRevenue || 0))),
    [revenueData],
  );
  const maxStoreRevenue = useMemo(
    () => Math.max(1, ...(revenueData?.byStore || []).map((entry) => Number(entry.grossRevenue || 0))),
    [revenueData],
  );
  const maxDriverValue = useMemo(
    () => Math.max(1, ...(revenueData?.byDriver || []).map((entry) => Number(entry.ordersValue || 0))),
    [revenueData],
  );

  const coverage = revenueData?.commissionCoverage;
  const coverageTotal = Math.max(
    1,
    Number(coverage?.exactItems || 0) + Number(coverage?.estimatedItems || 0) + Number(coverage?.unresolvedItems || 0),
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
      activeTab="receita"
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
          subtitle="Visao geral por tipo de loja, loja individual e comissao estimada."
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
            <section className="dashboard-grid premium-grid stat-hero-grid">
              <article className="metric-card premium stat-hero">
                <div className="stat-hero-icon stat-hero-icon--green">
                  <span className="material-icons" aria-hidden="true">payments</span>
                </div>
                <div className="stat-hero-body">
                  <div className="metric-label">Faturado ao cliente</div>
                  <div className="metric-value">{formatMoney(revenueData.overview.totalGrossRevenue)}</div>
                  <div className="metric-foot">Valor bruto cobrado no periodo</div>
                </div>
              </article>
              <article className="metric-card premium stat-hero">
                <div className="stat-hero-icon stat-hero-icon--blue">
                  <span className="material-icons" aria-hidden="true">storefront</span>
                </div>
                <div className="stat-hero-body">
                  <div className="metric-label">Base das lojas</div>
                  <div className="metric-value">{formatMoney(revenueData.overview.totalBaseValue)}</div>
                  <div className="metric-foot">Preco base estimado dos artigos</div>
                </div>
              </article>
              <article className="metric-card premium stat-hero">
                <div className="stat-hero-icon stat-hero-icon--purple">
                  <span className="material-icons" aria-hidden="true">percent</span>
                </div>
                <div className="stat-hero-body">
                  <div className="metric-label">Comissao PedeJa</div>
                  <div className="metric-value">{formatMoney(revenueData.overview.totalCommissionProfit)}</div>
                  <div className="metric-foot">Lucro estimado em markup/comissao</div>
                </div>
              </article>
              <article className="metric-card premium stat-hero">
                <div className="stat-hero-icon stat-hero-icon--orange">
                  <span className="material-icons" aria-hidden="true">local_shipping</span>
                </div>
                <div className="stat-hero-body">
                  <div className="metric-label">Taxas de entrega</div>
                  <div className="metric-value">{formatMoney(revenueData.overview.totalDeliveryFees)}</div>
                  <div className="metric-foot">Taxa cobrada ao cliente para entrega</div>
                </div>
              </article>
            </section>

            <section className="insight-grid">
              <DashboardPanel
                className="insight-card"
                title={(
                  <span className="insight-card-header">
                    <span className="insight-card-icon">
                      <span className="material-icons" aria-hidden="true">insights</span>
                    </span>
                    Leitura geral
                  </span>
                )}
              >
                <p className="muted">
                  O valor de <strong>{formatMoney(revenueData.overview.totalGrossRevenue)}</strong> inclui o preco final dos artigos
                  com markup e a taxa de entrega. A base das lojas representa o preco original estimado do menu, e a diferenca fica
                  na comissao PedeJa.
                </p>
                <div className="insight-pills">
                  <span className="tag ok">Restaurantes: {formatMoney(revenueData.overview.restaurantGrossRevenue)}</span>
                  <span className="tag warn">Outras lojas: {formatMoney(revenueData.overview.otherGrossRevenue)}</span>
                </div>
              </DashboardPanel>

              <DashboardPanel
                className="insight-card"
                title={(
                  <span className="insight-card-header">
                    <span className="insight-card-icon insight-card-icon--amber">
                      <span className="material-icons" aria-hidden="true">verified</span>
                    </span>
                    Qualidade da leitura da comissao
                  </span>
                )}
              >
                <p className="muted">
                  Quando o prato ainda existe no catalogo, a leitura usa o preco base atual. Caso contrario, a comissao e inferida
                  pela configuracao ativa da loja, para te dar uma explicacao util de onde vem o valor faturado.
                </p>
                <div className="coverage-bar">
                  <span
                    className="coverage-bar-segment exact"
                    style={{ width: `${(Number(coverage?.exactItems || 0) / coverageTotal) * 100}%` }}
                  />
                  <span
                    className="coverage-bar-segment estimated"
                    style={{ width: `${(Number(coverage?.estimatedItems || 0) / coverageTotal) * 100}%` }}
                  />
                  <span
                    className="coverage-bar-segment unresolved"
                    style={{ width: `${(Number(coverage?.unresolvedItems || 0) / coverageTotal) * 100}%` }}
                  />
                </div>
                <div className="coverage-legend">
                  <span className="coverage-legend-item"><span className="coverage-legend-dot exact" />Exatos</span>
                  <span className="coverage-legend-item"><span className="coverage-legend-dot estimated" />Estimados</span>
                  <span className="coverage-legend-item"><span className="coverage-legend-dot unresolved" />Sem detalhe</span>
                </div>
                <div className="coverage-grid">
                  <div>
                    <strong>{coverage?.exactItems || 0}</strong>
                    <span>Itens lidos diretamente do catalogo</span>
                  </div>
                  <div>
                    <strong>{coverage?.estimatedItems || 0}</strong>
                    <span>Itens inferidos pela comissao atual</span>
                  </div>
                  <div>
                    <strong>{coverage?.unresolvedItems || 0}</strong>
                    <span>Itens sem detalhe suficiente</span>
                  </div>
                </div>
              </DashboardPanel>

              <DashboardPanel
                className="insight-card"
                title={(
                  <span className="insight-card-header">
                    <span className="insight-card-icon insight-card-icon--purple">
                      <span className="material-icons" aria-hidden="true">restaurant</span>
                    </span>
                    Restaurantes em conjunto
                  </span>
                )}
              >
                <p className="muted">
                  {collectiveRestaurants
                    ? `As lojas do tipo restaurante faturaram ${formatMoney(collectiveRestaurants.grossRevenue)} no total, com ${formatMoney(collectiveRestaurants.commissionProfit)} de comissao estimada e ticket medio de ${formatMoney(collectiveRestaurants.avgOrderValue)}.`
                    : "Sem movimento de restaurantes nesta janela."}
                </p>
              </DashboardPanel>
            </section>

            <DashboardPanel
              title={(
                <>
                  <span className="material-icons panel-title-icon" aria-hidden="true">category</span>
                  Receita por tipo de loja
                </>
              )}
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
                        <td>
                          <span className={`tag ${/restaur/i.test(String(entry.label || "")) ? "ok" : "neutral"}`}>
                            {entry.label}
                          </span>
                        </td>
                        <td>{entry.orders}</td>
                        <td>
                          <div className="value-bar-cell">
                            <span className="value-bar-amount">{formatMoney(entry.grossRevenue)}</span>
                            <span className="value-bar-track">
                              <span
                                className="value-bar-fill"
                                style={{ width: `${(Number(entry.grossRevenue || 0) / maxTypeRevenue) * 100}%` }}
                              />
                            </span>
                          </div>
                        </td>
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
              title={(
                <>
                  <span className="material-icons panel-title-icon" aria-hidden="true">store</span>
                  Receita por loja
                </>
              )}
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
                    {revenueData.byStore.map((entry, index) => (
                      <tr key={entry.lojaId}>
                        <td>
                          <span className="entity-cell">
                            <span className={`rank-badge${index < 3 ? ` rank-${index + 1}` : ""}`}>{index + 1}</span>
                            {entry.label}
                          </span>
                        </td>
                        <td><span className="tag neutral">{entry.storeTypeLabel}</span></td>
                        <td>{entry.orders}</td>
                        <td>
                          <div className="value-bar-cell">
                            <span className="value-bar-amount">{formatMoney(entry.grossRevenue)}</span>
                            <span className="value-bar-track">
                              <span
                                className="value-bar-fill"
                                style={{ width: `${(Number(entry.grossRevenue || 0) / maxStoreRevenue) * 100}%` }}
                              />
                            </span>
                          </div>
                        </td>
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
              title={(
                <>
                  <span className="material-icons panel-title-icon" aria-hidden="true">two_wheeler</span>
                  Estafetas
                </>
              )}
              description="Valor de pedidos e taxas de entrega movimentadas por estafeta nesta janela."
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
                    </tr>
                  </thead>
                  <tbody>
                    {revenueData.byDriver.map((entry, index) => (
                      <tr key={entry.key}>
                        <td>
                          <span className="entity-cell">
                            <span className={`rank-badge${index < 3 ? ` rank-${index + 1}` : ""}`}>{index + 1}</span>
                            {entry.name}
                          </span>
                        </td>
                        <td>{entry.phone || "-"}</td>
                        <td>{entry.deliveries}</td>
                        <td>
                          <div className="value-bar-cell">
                            <span className="value-bar-amount">{formatMoney(entry.ordersValue)}</span>
                            <span className="value-bar-track">
                              <span
                                className="value-bar-fill"
                                style={{ width: `${(Number(entry.ordersValue || 0) / maxDriverValue) * 100}%` }}
                              />
                            </span>
                          </div>
                        </td>
                        <td>{formatMoney(entry.deliveryFees)}</td>
                      </tr>
                    ))}
                    {revenueData.byDriver.length === 0 ? (
                      <DashboardEmptyState as="tableRow" colSpan={5} label="Sem dados de estafetas para mostrar." />
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

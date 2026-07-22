import TrendBars from "../../components/dashboard/TrendBars";
import DashboardPanel from "../../components/dashboard/DashboardPanel";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import {
  getEstadoInternoLabelPt,
  getEstadoInternoTagClass,
  resolveOrderEstadoInterno,
} from "../../services/orderStatusMapper";
import {
  safeFixed,
  handleRowKeyDown,
  formatOrderDeliverySlot,
  getScheduledOperationalStateView,
  hasAssignedDriver,
  isDriverAssignmentSlaBreached,
  getDeliveryStatusView,
} from "./helpers";

export default function OverviewTab({
  state,
  periodDays,
  commissionEarned,
  safeSlaAlerts,
  safeRequests,
  driverAlertOrders,
  failedDeliveries,
  safeScheduledOrders,
  safeImmediateOrders,
  safeDeliveries,
  dailyRevenue,
  hourlyDemand,
  storeNameById,
  slaBreachedOrderIds,
  latestDeliveryByOrderId,
  highlightedOrderId,
  updatingOrderId,
  navigate,
  scrollToSection,
  scrollToImmediateOrder,
  onGoToRestaurantApprovals,
  openOrderDetailModal,
  openInHouseTrackingModal,
  openCarrierModal,
  handleAdminOrderAction,
}) {
  return (
    <div className="dashboard-stack">
      <section className="dashboard-grid premium-grid">
        <article
          className="metric-card premium is-clickable"
          role="button"
          tabIndex={0}
          onClick={() => navigate(`/dashboard/admin/receita?days=${periodDays}`)}
          onKeyDown={(event) => handleRowKeyDown(event, () => navigate(`/dashboard/admin/receita?days=${periodDays}`))}
        >
          <div className="metric-label">Receita</div>
          <div className="metric-value">{safeFixed(state?.metrics?.totalRevenue, 2)}EUR</div>
          <div className="metric-foot">Faturado pelos clientes -- abrir detalhe</div>
        </article>
        <article
          className="metric-card premium is-clickable"
          role="button"
          tabIndex={0}
          onClick={() => navigate(`/dashboard/admin/receita?days=${periodDays}`)}
          onKeyDown={(event) => handleRowKeyDown(event, () => navigate(`/dashboard/admin/receita?days=${periodDays}`))}
        >
          <div className="metric-label">Comissao ganha</div>
          <div className="metric-value">
            {commissionEarned?.loading ? "..." : `${safeFixed(commissionEarned?.value, 2)}EUR`}
          </div>
          <div className="metric-foot">
            {commissionEarned?.error
              ? "Nao foi possivel calcular"
              : `O que a PedeJa realmente ganhou nos ultimos ${periodDays} dias`}
          </div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Pedidos</div>
          <div className="metric-value">{state.metrics.totalOrders}</div>
          <div className="metric-foot">Volume total</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Agendados</div>
          <div className="metric-value">{state.metrics.scheduledOrders}</div>
          <div className="metric-foot">Ainda fora da fila imediata</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Ticket medio</div>
          <div className="metric-value">{safeFixed(state?.metrics?.avgTicket, 2)}EUR</div>
          <div className="metric-foot">Valor por pedido</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Entrega concluida</div>
          <div className="metric-value">{safeFixed(state?.metrics?.deliveredRate, 1)}%</div>
          <div className="metric-foot">Qualidade operacional</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Cancelamento</div>
          <div className="metric-value">{safeFixed(state?.metrics?.cancelRate, 1)}%</div>
          <div className="metric-foot">Risco de churn</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Entregas ativas</div>
          <div className="metric-value">{state.metrics.activeDeliveries}</div>
          <div className="metric-foot">Agora</div>
        </article>
      </section>

      {safeSlaAlerts.length > 0 || safeRequests.length > 0 || driverAlertOrders.length > 0 || failedDeliveries.length > 0 ? (
        <DashboardPanel
          title="Precisa de atencao"
          description="Resumo rapido do que esta a bloquear a operacao agora."
          className="attention-panel"
        >
          <div className="attention-chip-row">
            <button
              type="button"
              className={`attention-chip attention-chip--alert${safeSlaAlerts.length === 0 ? " is-disabled" : ""}`}
              disabled={safeSlaAlerts.length === 0}
              onClick={() => scrollToSection("dashboard-tab-sla-panel")}
            >
              <span className="attention-chip-value">{safeSlaAlerts.length}</span>
              <span className="attention-chip-label">
                {safeSlaAlerts.length === 1 ? "pedido com SLA excedido" : "pedidos com SLA excedido"}
              </span>
            </button>
            <button
              type="button"
              className={`attention-chip attention-chip--action${safeRequests.length === 0 ? " is-disabled" : ""}`}
              disabled={safeRequests.length === 0}
              onClick={onGoToRestaurantApprovals}
            >
              <span className="attention-chip-value">{safeRequests.length}</span>
              <span className="attention-chip-label">
                {safeRequests.length === 1 ? "pedido de restaurante pendente" : "pedidos de restaurante pendentes"}
              </span>
            </button>
            <button
              type="button"
              className={`attention-chip attention-chip--alert${driverAlertOrders.length === 0 ? " is-disabled" : ""}`}
              disabled={driverAlertOrders.length === 0}
              onClick={() => (driverAlertOrders[0]?.id
                ? scrollToImmediateOrder(driverAlertOrders[0].id)
                : scrollToSection("immediate-orders-panel"))}
            >
              <span className="attention-chip-value">{driverAlertOrders.length}</span>
              <span className="attention-chip-label">
                {driverAlertOrders.length === 1 ? "pedido sem estafeta" : "pedidos sem estafeta"}
              </span>
            </button>
            <button
              type="button"
              className={`attention-chip attention-chip--alert${failedDeliveries.length === 0 ? " is-disabled" : ""}`}
              disabled={failedDeliveries.length === 0}
              onClick={() => scrollToSection("recent-deliveries-panel")}
            >
              <span className="attention-chip-value">{failedDeliveries.length}</span>
              <span className="attention-chip-label">
                {failedDeliveries.length === 1 ? "entrega falhada" : "entregas falhadas"}
              </span>
            </button>
          </div>
        </DashboardPanel>
      ) : (
        <DashboardEmptyState label="Tudo em ordem. Sem alertas de SLA, pedidos de restaurante, estafetas ou entregas por rever." />
      )}

      <DashboardPanel
        id="immediate-orders-panel"
        title="Pedidos imediatos"
        description="Pedidos ativos agora, incluindo os agendados que ja entraram na janela operacional."
      >
        <div className="table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Loja</th>
                <th>Cliente</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Estafeta</th>
                <th>Tracking</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {state.loading && safeImmediateOrders.length === 0 ? (
                <DashboardLoadingState as="tableRow" colSpan={8} />
              ) : null}
              {safeImmediateOrders.slice(0, 14).map((order) => {
                const estadoInterno = resolveOrderEstadoInterno(order);
                const latestDelivery = latestDeliveryByOrderId.get(String(order.id));
                const rowHasAssignedDriver = hasAssignedDriver(order);
                const canAssign = estadoInterno === "aceite" && !rowHasAssignedDriver;
                const canCancelOrder = !["entregue", "cancelado"].includes(estadoInterno);
                const hasAnyAction = Boolean(canAssign || canCancelOrder);
                const resolvedDriverName = order.driver_name || "";
                const resolvedDriverPhone = order.driver_phone || "";
                const hasDriverAlert = slaBreachedOrderIds.has(String(order.id)) || isDriverAssignmentSlaBreached(order);
                const driverText = estadoInterno === "cancelado"
                  ? "-"
                  : (resolvedDriverName
                  ? `${resolvedDriverName}${resolvedDriverPhone ? ` (${resolvedDriverPhone})` : ""}`
                  : (resolvedDriverPhone || "-"));
                const canOpenTracking = estadoInterno !== "cancelado" && Boolean(latestDelivery || rowHasAssignedDriver);

                const isHighlighted = highlightedOrderId === String(order.id);

                return (
                  <tr
                    key={order.id}
                    id={`immediate-order-${order.id}`}
                    className={`is-clickable-row${hasDriverAlert ? " order-row-sla-alert" : ""}${isHighlighted ? " order-row-highlighted" : ""}`}
                    tabIndex={0}
                    onClick={() => openOrderDetailModal(order.id)}
                    onKeyDown={(event) => handleRowKeyDown(event, () => openOrderDetailModal(order.id))}
                  >
                    <td>{String(order.id).slice(0, 8)}</td>
                    <td>{storeNameById.get(String(order.loja_id)) || `Loja ${order.loja_id || "-"}`}</td>
                    <td>{order.customer_nome || "-"}</td>
                    <td>{Number(order.total || 0).toFixed(2)}EUR</td>
                    <td>
                      <span className={getEstadoInternoTagClass(estadoInterno)}>
                        {getEstadoInternoLabelPt(estadoInterno)}
                      </span>
                      {hasDriverAlert ? <span className="table-alert-indicator" title="Pedido aceite sem estafeta ha mais de 10 minutos.">!</span> : null}
                    </td>
                    <td>{driverText}</td>
                    <td>
                      {canOpenTracking ? (
                        <button
                          type="button"
                          className="dashboard-link-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openInHouseTrackingModal({
                              orderId: order.id,
                              title: `Tracking pedido #${order.id}`,
                              isLive: !["entregue", "cancelado"].includes(estadoInterno),
                            });
                          }}
                        >
                          Abrir
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      {hasAnyAction ? (
                        <div className="table-action-stack">
                          {canAssign ? (
                            <button
                              className="btn-dashboard small"
                              onClick={(event) => {
                                event.stopPropagation();
                                openCarrierModal(order);
                              }}
                            >
                              Atribuir Estafeta
                            </button>
                          ) : null}

                          {canCancelOrder ? (
                            <button
                              className="btn-dashboard small danger"
                              disabled={updatingOrderId === String(order.id)}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleAdminOrderAction(order, "cancelado");
                              }}
                            >
                              {updatingOrderId === String(order.id) ? "..." : "Cancelar Pedido"}
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}

              {!state.loading && safeImmediateOrders.length === 0 ? (
                <DashboardEmptyState as="tableRow" colSpan={8} label="Sem pedidos para mostrar nesta janela." />
              ) : null}
            </tbody>
          </table>
        </div>
      </DashboardPanel>

      <DashboardPanel
        title="Pedidos agendados"
        description="Entram automaticamente na fila imediata 30 minutos antes da entrega prevista."
      >
        <div className="table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Loja</th>
                <th>Cliente</th>
                <th>Entrega prevista</th>
                <th>Operacao</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {state.loading && safeScheduledOrders.length === 0 ? (
                <DashboardLoadingState as="tableRow" colSpan={8} />
              ) : null}
              {safeScheduledOrders.slice(0, 14).map((order) => {
                const estadoInterno = resolveOrderEstadoInterno(order);
                const canCancelOrder = !["entregue", "cancelado"].includes(estadoInterno);
                const scheduledStateView = getScheduledOperationalStateView(order);

                return (
                  <tr
                    key={`scheduled-${order.id}`}
                    className="is-clickable-row"
                    tabIndex={0}
                    onClick={() => openOrderDetailModal(order.id)}
                    onKeyDown={(event) => handleRowKeyDown(event, () => openOrderDetailModal(order.id))}
                  >
                    <td>{String(order.id).slice(0, 8)}</td>
                    <td>{storeNameById.get(String(order.loja_id)) || `Loja ${order.loja_id || "-"}`}</td>
                    <td>{order.customer_nome || "-"}</td>
                    <td>{formatOrderDeliverySlot(order.scheduled_for || order.created_at)}</td>
                    <td>
                      {scheduledStateView ? <span className={scheduledStateView.className}>{scheduledStateView.label}</span> : "-"}
                    </td>
                    <td>{Number(order.total || 0).toFixed(2)}EUR</td>
                    <td><span className={getEstadoInternoTagClass(estadoInterno)}>{getEstadoInternoLabelPt(estadoInterno)}</span></td>
                    <td>
                      {canCancelOrder ? (
                        <button
                          className="btn-dashboard small danger"
                          disabled={updatingOrderId === String(order.id)}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleAdminOrderAction(order, "cancelado");
                          }}
                        >
                          {updatingOrderId === String(order.id) ? "..." : "Cancelar Pedido"}
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}

              {!state.loading && safeScheduledOrders.length === 0 ? (
                <DashboardEmptyState as="tableRow" colSpan={8} label="Sem pedidos agendados nesta janela para mostrar." />
              ) : null}
            </tbody>
          </table>
        </div>
      </DashboardPanel>

      <DashboardPanel
        id="recent-deliveries-panel"
        title="Entregas Recentes"
        description="Estados traduzidos para facilitar o acompanhamento operacional."
      >
        <div className="table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Pedido</th>
                <th>Estado</th>
                <th>Erro</th>
                <th>Tracking</th>
              </tr>
            </thead>
            <tbody>
              {state.loading && safeDeliveries.length === 0 ? (
                <DashboardLoadingState as="tableRow" colSpan={5} />
              ) : null}
              {safeDeliveries.slice(0, 14).map((delivery) => {
                const deliveryStatusView = getDeliveryStatusView(delivery.status);
                const rawDeliveryStatus = String(delivery.status || "").toUpperCase();

                return (
                  <tr key={delivery.id}>
                    <td>{String(delivery.id).slice(0, 8)}</td>
                    <td>{delivery.order_id || "-"}</td>
                    <td><span className={deliveryStatusView.className}>{deliveryStatusView.label}</span></td>
                    <td>
                      {rawDeliveryStatus === "FAILED"
                        ? (delivery.provider_payload?.message
                          || delivery.provider_payload?.error
                          || "Erro na entrega")
                        : "-"}
                    </td>
                    <td>
                      {delivery.order_id ? (
                        <button
                          type="button"
                          className="dashboard-link-button"
                          onClick={() => openInHouseTrackingModal({
                            orderId: delivery.order_id,
                            title: `Tracking entrega #${delivery.id}`,
                            isLive: !["DELIVERED", "CANCELLED", "FAILED"].includes(rawDeliveryStatus),
                          })}
                        >
                          Abrir
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}
              {!state.loading && safeDeliveries.length === 0 ? (
                <DashboardEmptyState as="tableRow" colSpan={5} label="Sem entregas para mostrar nesta janela." />
              ) : null}
            </tbody>
          </table>
        </div>
      </DashboardPanel>

      <DashboardPanel
        id="dashboard-tab-sla-panel"
        title="Alertas SLA"
        description="Lista filtrada so com os pedidos acima do tempo limite por estado -- util para ires direto ao que esta atrasado sem teres de percorrer a tabela de Pedidos imediatos toda."
        className="sla-panel"
      >
        <div className="table-wrap">
          <table className="ops-table compact">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Loja</th>
                <th>Estado</th>
                <th>Tempo</th>
                <th>Limite</th>
              </tr>
            </thead>
            <tbody>
              {state.loading && safeSlaAlerts.length === 0 ? (
                <DashboardLoadingState as="tableRow" colSpan={5} />
              ) : (
                <>
                  {safeSlaAlerts.map((alert) => (
                    <tr
                      key={alert.id}
                      className="is-clickable-row"
                      tabIndex={0}
                      title="Ver este pedido em Pedidos imediatos"
                      onClick={() => scrollToImmediateOrder(alert.id)}
                      onKeyDown={(event) => handleRowKeyDown(event, () => scrollToImmediateOrder(alert.id))}
                    >
                      <td>{String(alert.id).slice(0, 8)}</td>
                      <td>{storeNameById.get(String(alert.loja_id)) || `Loja ${alert.loja_id}`}</td>
                      <td>
                        <span className={getEstadoInternoTagClass(alert.status)}>
                          {getEstadoInternoLabelPt(alert.status)}
                        </span>
                      </td>
                      <td>{alert.elapsedMinutes} min</td>
                      <td>{alert.threshold} min</td>
                    </tr>
                  ))}
                  {!state.loading && safeSlaAlerts.length === 0 ? (
                    <DashboardEmptyState as="tableRow" colSpan={5} label="Sem alertas de SLA para mostrar." />
                  ) : null}
                </>
              )}
            </tbody>
          </table>
        </div>
      </DashboardPanel>

      <section className="panel-grid analytics-grid">
        <TrendBars title="Receita por dia" data={dailyRevenue} valueKey="value" labelKey="label" suffix=" EUR" />
        <TrendBars title="Procura por hora" data={hourlyDemand} valueKey="value" labelKey="label" />
      </section>
    </div>
  );
}

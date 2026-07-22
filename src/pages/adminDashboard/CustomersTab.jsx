import DashboardPanel from "../../components/dashboard/DashboardPanel";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import { safeFixed } from "./helpers";

export default function CustomersTab({
  customerInsights,
  filteredCustomers,
  customerSearch,
  setCustomerSearch,
}) {
  return (
    <div className="dashboard-stack">
      <section className="dashboard-grid premium-grid">
        <article className="metric-card premium">
          <div className="metric-label">Clientes registados</div>
          <div className="metric-value">{customerInsights.metrics.totalCustomers}</div>
          <div className="metric-foot">Base de clientes sem contas staff/admin</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Clientes com pedidos</div>
          <div className="metric-value">{customerInsights.metrics.customersWithOrders}</div>
          <div className="metric-foot">Pelo menos uma compra na janela selecionada</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Ativos 30 dias</div>
          <div className="metric-value">{customerInsights.metrics.activeCustomers30d}</div>
          <div className="metric-foot">Clientes com pedido recente</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Pedidos</div>
          <div className="metric-value">{customerInsights.metrics.totalOrders}</div>
          <div className="metric-foot">Total da janela selecionada</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Receita clientes</div>
          <div className="metric-value">{safeFixed(customerInsights?.metrics?.totalSpent, 2)}EUR</div>
          <div className="metric-foot">Gasto acumulado dos clientes</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Ticket medio</div>
          <div className="metric-value">{safeFixed(customerInsights?.metrics?.avgTicket, 2)}EUR</div>
          <div className="metric-foot">Media por pedido cliente</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">LTV medio cliente</div>
          <div className="metric-value">{safeFixed(customerInsights?.metrics?.avgSpentPerCustomer, 2)}EUR</div>
          <div className="metric-foot">Media de gasto por cliente comprador</div>
        </article>
      </section>

      {customerInsights.error ? <p className="admin-inline-error">{customerInsights.error}</p> : null}

      <DashboardPanel
        title="Clientes da plataforma"
        description="Vista sem dados privados sensiveis. Inclui comportamento de compra, ticket medio e restaurante favorito."
        actions={(
          <label className="dashboard-toolbar-field customer-search-field">
            <span className="muted">Pesquisar cliente</span>
            <input
              type="text"
              placeholder="Nome, email mascarado ou loja favorita"
              value={customerSearch}
              onChange={(event) => setCustomerSearch(event.target.value)}
            />
          </label>
        )}
      >
        <div className="table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Email</th>
                <th>Membro desde</th>
                <th>Pedidos</th>
                <th>Gasto</th>
                <th>Ticket medio</th>
                <th>Restaurante favorito</th>
                <th>Pico semanal</th>
                <th>Pico horario</th>
                <th>Ultimo pedido</th>
              </tr>
            </thead>
            <tbody>
              {customerInsights.loading && filteredCustomers.length === 0 ? (
                <DashboardLoadingState as="tableRow" colSpan={10} />
              ) : null}
              {filteredCustomers.map((customer) => (
                <tr key={customer.customer_id}>
                  <td>{customer.name}</td>
                  <td>{customer.email_masked || "-"}</td>
                  <td>{customer.member_since ? new Date(customer.member_since).toLocaleDateString("pt-PT") : "-"}</td>
                  <td>{customer.orders_count}</td>
                  <td>{Number(customer.total_spent || 0).toFixed(2)}EUR</td>
                  <td>{Number(customer.avg_ticket || 0).toFixed(2)}EUR</td>
                  <td>{customer.favorite_store_name || "-"}</td>
                  <td>{customer.peak_weekday !== "-" ? `${customer.peak_weekday} (${customer.peak_weekday_orders})` : "-"}</td>
                  <td>{customer.peak_hour !== "-" ? `${customer.peak_hour} (${customer.peak_hour_orders})` : "-"}</td>
                  <td>{customer.last_order_at ? new Date(customer.last_order_at).toLocaleString("pt-PT") : "-"}</td>
                </tr>
              ))}

              {!customerInsights.loading && filteredCustomers.length === 0 ? (
                <DashboardEmptyState as="tableRow" colSpan={10} label="Sem clientes para mostrar com os filtros atuais." />
              ) : null}
            </tbody>
          </table>
        </div>
      </DashboardPanel>
    </div>
  );
}

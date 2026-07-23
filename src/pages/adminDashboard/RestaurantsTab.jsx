import { Fragment, useEffect, useState } from "react";
import AdminRestaurantAssociation from "../../components/admin/AdminRestaurantAssociation";
import DashboardPanel from "../../components/dashboard/DashboardPanel";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import RestaurantManagementPanel from "../../components/dashboard/RestaurantManagementPanel";
import StoreDeliveryPricingPanel from "../../components/dashboard/StoreDeliveryPricingPanel";
import StoreSpecialHoursPanel from "../../components/dashboard/StoreSpecialHoursPanel";
import StoreProfileEditor from "../../components/dashboard/StoreProfileEditor";
import { formatScheduleLabel } from "../../utils/storeHours";
import { safeImage, safeFixed } from "./helpers";

const SUB_TABS = [
  { id: "profile", label: "Dados da Loja" },
  { id: "commission", label: "Comissao" },
  { id: "delivery", label: "Entrega" },
  { id: "hours", label: "Horarios Especiais" },
  { id: "performance", label: "Performance" },
  { id: "approvals", label: "Aprovacoes" },
  { id: "association", label: "Associar Utilizador" },
];

// Antes eram 7 paineis empilhados navegados so por scroll-jump a ancoras --
// passam a sub-separadores reais (so um painel visivel de cada vez), com o
// seletor de loja sempre visivel por cima porque quase todos os paineis
// dependem de qual loja esta em foco.
export default function RestaurantsTab({
  requestedSection,
  onRequestedSectionHandled,
  storeSearch,
  setStoreSearch,
  storesOrderedById,
  storePickerOptions,
  selectedStoreId,
  setSelectedStoreId,
  managementStores,
  openRestaurantDashboard,
  loading,
  globalAutoAssign,
  globalDeliveryPricing,
  globalCommission,
  commissionCatalogByStore,
  catalogLoadingByStore,
  catalogErrorByStore,
  onToggleGlobalAutoAssign,
  onSaveGlobalAutoAssignSettings,
  onSaveGlobalCommissionSettings,
  onToggleAutoAccept,
  onToggleAutoAssign,
  onSaveAutoAssignConfig,
  onSaveCommissionSettings,
  onSaveGlobalDeliveryPricingSettings,
  onSaveDeliveryPricingSettings,
  onSaveScheduleSettings,
  safeStorePerformance,
  safeRequests,
  reviewingId,
  reviewRequest,
  expandedRequestId,
  setExpandedRequestId,
  storeTypeMap,
  stores,
  onLinkedAssociation,
  callerUserId,
  onProfileSaved,
}) {
  const [manualSection, setManualSection] = useState("profile");

  useEffect(() => {
    if (!requestedSection) return;
    onRequestedSectionHandled();
  }, [requestedSection, onRequestedSectionHandled]);

  // Um pedido externo (ex. o chip "Aprovacoes pendentes" no separador
  // Dashboard) ganha prioridade sobre a ultima escolha manual ate o pai
  // confirmar que o consumiu (limpando requestedSection).
  const section = requestedSection || manualSection;
  const setSection = setManualSection;

  return (
    <div className="dashboard-stack">
      <section className="panel store-access-panel">
        <div className="store-access-header">
          <div>
            <h3>Loja em foco</h3>
            <p className="muted">Pesquisa por nome e gere a configuracao granular de uma loja de cada vez.</p>
          </div>
          <button className="btn-dashboard secondary" disabled={!selectedStoreId} onClick={() => openRestaurantDashboard()}>
            Abrir dashboard da loja
          </button>
        </div>

        <div className="store-access-grid">
          <label>
            <span className="muted">Pesquisar restaurante</span>
            <input
              type="text"
              placeholder="Ex: Munchies"
              value={storeSearch}
              onChange={(event) => setStoreSearch(event.target.value)}
            />
          </label>

          <label>
            <span className="muted">Restaurante</span>
            <select
              value={selectedStoreId}
              onChange={(event) => setSelectedStoreId(event.target.value)}
              disabled={storesOrderedById.length === 0}
              title="Selecionar restaurante"
            >
              {storePickerOptions.length === 0 ? (
                <option value="">Sem resultados</option>
              ) : (
                storePickerOptions.map((store) => (
                  <option key={store.idloja} value={String(store.idloja)}>
                    {store.nome}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>
      </section>

      <nav className="restaurants-subtabs" aria-label="Seccoes de gestao de restaurantes">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`restaurants-subtab${section === tab.id ? " is-active" : ""}`}
            onClick={() => setSection(tab.id)}
          >
            {tab.label}
            {tab.id === "approvals" && safeRequests.length > 0 ? (
              <span className="restaurants-subtab-badge">{safeRequests.length}</span>
            ) : null}
          </button>
        ))}
      </nav>

      {section === "profile" ? (
        <section className="panel restaurant-settings-panel">
          <div className="restaurant-settings-header">
            <div>
              <h3>Dados da loja</h3>
              <p className="muted">
                Nome, NIF, contacto, tipo, morada, imagens e horario semanal -- tudo o que antes
                so dava para editar saltando para outra pagina.
              </p>
            </div>
          </div>
          <StoreProfileEditor
            lojaId={selectedStoreId}
            callerUserId={callerUserId}
            onSaved={onProfileSaved}
          />
        </section>
      ) : null}

      {section === "commission" ? (
        <RestaurantManagementPanel
          title="Gestao de Restaurantes"
          subtitle="Escolhe o modo de comissao e define overrides globais, por categoria ou por prato."
          stores={managementStores}
          loading={loading}
          canEdit
          globalAutoAssignEnabled={globalAutoAssign.enabled}
          globalAutoAssignConfig={globalAutoAssign}
          globalAutoAssignLoading={globalAutoAssign.loading}
          platformCommissionPercent={globalCommission.percent}
          platformCommissionLoading={globalCommission.loading}
          commissionCatalogByStore={commissionCatalogByStore}
          catalogLoadingByStore={catalogLoadingByStore}
          catalogErrorByStore={catalogErrorByStore}
          onToggleGlobalAutoAssign={onToggleGlobalAutoAssign}
          onSaveGlobalAutoAssignSettings={onSaveGlobalAutoAssignSettings}
          onSaveGlobalCommissionSettings={onSaveGlobalCommissionSettings}
          onToggleAutoAccept={onToggleAutoAccept}
          onToggleAutoAssign={onToggleAutoAssign}
          onSaveAutoAssignConfig={onSaveAutoAssignConfig}
          onSaveCommissionSettings={onSaveCommissionSettings}
        />
      ) : null}

      {section === "delivery" ? (
        <>
          <StoreDeliveryPricingPanel
            stores={managementStores}
            globalConfig={globalDeliveryPricing.config}
            loading={loading || globalDeliveryPricing.loading}
            canEdit
            onSaveGlobalDeliveryPricingSettings={onSaveGlobalDeliveryPricingSettings}
            onSaveDeliveryPricingSettings={onSaveDeliveryPricingSettings}
          />

          {globalDeliveryPricing.error ? (
            <p className="admin-inline-error">{globalDeliveryPricing.error}</p>
          ) : null}

          {globalAutoAssign.error ? (
            <p className="admin-inline-error">{globalAutoAssign.error}</p>
          ) : null}
        </>
      ) : null}

      {section === "hours" ? (
        <StoreSpecialHoursPanel
          stores={managementStores}
          loading={loading}
          canEdit
          onSaveScheduleSettings={onSaveScheduleSettings}
          onEditWeeklySchedule={() => setSection("profile")}
        />
      ) : null}

      {section === "performance" ? (
        <DashboardPanel title="Top lojas (performance)" description="Ranking de lojas por volume e receita nesta janela.">
          <div className="table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Loja</th>
                  <th>Pedidos</th>
                  <th>Receita</th>
                  <th>Ticket medio</th>
                  <th>Concluido</th>
                  <th>Acesso</th>
                </tr>
              </thead>
              <tbody>
                {loading && safeStorePerformance.length === 0 ? (
                  <DashboardLoadingState as="tableRow" colSpan={6} />
                ) : null}
                {safeStorePerformance.map((store) => (
                  <tr key={store.lojaId}>
                    <td>{store.lojaNome}</td>
                    <td>{store.orders}</td>
                    <td>{safeFixed(store?.revenue, 2)}EUR</td>
                    <td>{safeFixed(store?.avgTicket, 2)}EUR</td>
                    <td><span className="tag ok">{safeFixed(store?.deliveredRate, 1)}%</span></td>
                    <td>
                      <button className="btn-dashboard small" onClick={() => openRestaurantDashboard(store.lojaId)}>
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && safeStorePerformance.length === 0 ? (
                  <DashboardEmptyState as="tableRow" colSpan={6} label="Sem dados de lojas para mostrar." />
                ) : null}
              </tbody>
            </table>
          </div>
        </DashboardPanel>
      ) : null}

      {section === "association" ? (
        <AdminRestaurantAssociation stores={stores} onLinked={onLinkedAssociation} />
      ) : null}

      {section === "approvals" ? (
        <DashboardPanel
          title="Aprovacoes de restaurantes"
          description="Candidaturas novas de parceiros a espera de revisao."
        >
          <div className="table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Restaurante</th>
                  <th>NIF</th>
                  <th>Horario</th>
                  <th>Acao</th>
                </tr>
              </thead>
              <tbody>
                {loading && safeRequests.length === 0 ? (
                  <DashboardLoadingState as="tableRow" colSpan={6} />
                ) : null}
                {safeRequests.map((request) => {
                  const isExpanded = expandedRequestId === request.id;
                  const backgroundPreview = safeImage(request.imagemfundo);
                  const iconPreview = safeImage(request.icon);

                  return (
                    <Fragment key={request.id}>
                      <tr>
                        <td>{request.nome}</td>
                        <td>{request.email}</td>
                        <td>{request.restaurante_nome}</td>
                        <td>{request.nif || "-"}</td>
                        <td>{request.horario_funcionamento ? formatScheduleLabel(request.horario_funcionamento) : "-"}</td>
                        <td>
                          <div className="table-action-row">
                            <button
                              className="btn-dashboard small secondary"
                              onClick={() => setExpandedRequestId(isExpanded ? "" : request.id)}
                            >
                              {isExpanded ? "Fechar" : "Ver detalhes"}
                            </button>
                            <button className="btn-dashboard small" disabled={reviewingId === request.id} onClick={() => reviewRequest(request.id, "APPROVED")}>
                              Aprovar
                            </button>
                            <button className="btn-dashboard small secondary" disabled={reviewingId === request.id} onClick={() => reviewRequest(request.id, "REJECTED")}>
                              Rejeitar
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded ? (
                        <tr key={`${request.id}-details`}>
                          <td colSpan={6}>
                            <div className="request-detail-card">
                              <div className="request-detail-grid">
                                <div><span className="request-detail-label">Estabelecimento</span><p>{request.restaurante_nome || "-"}</p></div>
                                <div><span className="request-detail-label">Candidato</span><p>{request.nome || "-"}</p></div>
                                <div><span className="request-detail-label">Email</span><p>{request.email || "-"}</p></div>
                                <div><span className="request-detail-label">Telemovel</span><p>{request.telefone || "-"}</p></div>
                                <div><span className="request-detail-label">NIF</span><p>{request.nif || "-"}</p></div>
                                <div><span className="request-detail-label">Tipo de loja</span><p>{storeTypeMap.get(String(request.idtipoloja || "")) || "-"}</p></div>
                                <div><span className="request-detail-label">Morada</span><p>{request.morada_completa || "-"}</p></div>
                                <div><span className="request-detail-label">Coordenadas</span><p>{request.latitude ?? "-"}, {request.longitude ?? "-"}</p></div>
                                <div><span className="request-detail-label">Place ID</span><p>{request.place_id || "-"}</p></div>
                                <div><span className="request-detail-label">Horario</span><p>{request.horario_funcionamento ? formatScheduleLabel(request.horario_funcionamento) : "-"}</p></div>
                              </div>

                              <div className="request-detail-images">
                                <div>
                                  <span className="request-detail-label">Imagem de fundo</span>
                                  {backgroundPreview ? <img src={backgroundPreview} alt="Imagem de fundo" className="request-preview-bg" /> : <p>-</p>}
                                </div>
                                <div>
                                  <span className="request-detail-label">Icon</span>
                                  {iconPreview ? <img src={iconPreview} alt="Icon" className="request-preview-icon" /> : <p>-</p>}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
                {!loading && safeRequests.length === 0 ? (
                  <DashboardEmptyState as="tableRow" colSpan={6} label="Sem pedidos pendentes para mostrar." />
                ) : null}
              </tbody>
            </table>
          </div>
        </DashboardPanel>
      ) : null}
    </div>
  );
}

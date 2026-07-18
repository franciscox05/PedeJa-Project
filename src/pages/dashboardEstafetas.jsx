import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import "../css/pages/dashboard.css";
import "../css/pages/estafeta.css";
import DashboardSidebarLayout from "../components/dashboard/DashboardSidebarLayout";
import LiveOperationsBoard from "../components/dashboard/LiveOperationsBoard";
import { ADMIN_DASHBOARD_TABS, resolveAdminTabRoute } from "../constants/adminDashboardTabs";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../services/supabaseClient";
import { extractUserId } from "../utils/roles";
import { getEstadoInternoLabelPt, getEstadoInternoTagClass, resolveOrderEstadoInterno } from "../services/orderStatusMapper";
import {
  adminCreateEstafeta,
  adminSetEstafetaAtivo,
  assignDeliveryToEstafeta,
  listActiveAtribuicoes,
  listEstafetasForDispatch,
} from "../services/estafetaService";
import { fetchAdminDashboard, updateRestaurantAdminSettings } from "../services/opsDashboardService";

const POLL_INTERVAL_MS = 20000;

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildEstafetaBoardEntries(estafetas, activeAtribuicoes, stores) {
  const storesById = new Map(ensureArray(stores).map((store) => [String(store?.idloja || ""), store]));
  const assignmentByEstafetaId = new Map(
    ensureArray(activeAtribuicoes).map((assignment) => [String(assignment.estafeta_id), assignment]),
  );

  return ensureArray(estafetas)
    .filter((estafeta) => Number.isFinite(Number(estafeta.ultima_localizacao_lat)) && Number.isFinite(Number(estafeta.ultima_localizacao_lng)))
    .map((estafeta) => {
      const assignment = assignmentByEstafetaId.get(String(estafeta.id));
      const orderEstado = assignment?.estado_interno || null;
      const status = orderEstado
        ? (["recolhido", "a_caminho", "entregue"].includes(orderEstado) ? "delivery" : "pickup")
        : "available";

      return {
        id: String(estafeta.id),
        name: estafeta.nome,
        phone: estafeta.telefone,
        lat: Number(estafeta.ultima_localizacao_lat),
        lng: Number(estafeta.ultima_localizacao_lng),
        status,
        coordsSource: "carrier",
        orderId: assignment?.order_id || null,
        orderEstado,
        lojaId: assignment?.loja_id || null,
        lojaNome: assignment?.loja_id
          ? (storesById.get(String(assignment.loja_id))?.nome || `Loja ${assignment.loja_id}`)
          : null,
        raw: estafeta,
      };
    });
}

export default function DashboardEstafetas() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const callerUserId = Number(extractUserId(user));

  const [estafetas, setEstafetas] = useState([]);
  const [activeAtribuicoes, setActiveAtribuicoes] = useState([]);
  const [unassignedOrders, setUnassignedOrders] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ nome: "", email: "", telemovel: "", veiculo: "mota" });
  const [assignSelection, setAssignSelection] = useState({});

  const load = useCallback(async () => {
    if (!Number.isFinite(callerUserId)) return;
    setError("");
    try {
      const [estafetasData, activeData, storesRes] = await Promise.all([
        listEstafetasForDispatch(callerUserId),
        listActiveAtribuicoes(callerUserId),
        supabase
          .from("lojas")
          .select("idloja, nome, dispatch_interno_ativo")
          .order("idloja", { ascending: true }),
      ]);

      const storesData = storesRes?.data || [];
      setEstafetas(ensureArray(estafetasData));
      setActiveAtribuicoes(ensureArray(activeData));
      setStores(storesData);

      const dispatchLojaIds = new Set(
        storesData.filter((store) => store.dispatch_interno_ativo).map((store) => String(store.idloja)),
      );
      const activeOrderIds = new Set(ensureArray(activeData).map((assignment) => String(assignment.order_id)));

      if (dispatchLojaIds.size > 0) {
        // orders nao tem policy de leitura direta (RLS fechada, tal como
        // deliveries) -- reaproveita a mesma RPC-backed fetch que o resto
        // do dashboard admin ja usa em vez de um select direto.
        const dashboardData = await fetchAdminDashboard(30, { user });
        const immediateOrders = ensureArray(dashboardData?.immediateOrders);

        setUnassignedOrders(
          immediateOrders.filter((order) => (
            dispatchLojaIds.has(String(order.loja_id))
            && ["pendente", "aceite"].includes(resolveOrderEstadoInterno(order))
            && !activeOrderIds.has(String(order.id))
          )),
        );
      } else {
        setUnassignedOrders([]);
      }
    } catch (loadError) {
      setError(loadError?.message || "Nao foi possivel carregar o painel de estafetas.");
    } finally {
      setLoading(false);
    }
  }, [callerUserId, user]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const storeNameById = useMemo(
    () => new Map(stores.map((store) => [String(store?.idloja || ""), store?.nome || `Loja ${store?.idloja}`])),
    [stores],
  );

  const availableEstafetas = useMemo(
    () => estafetas.filter((estafeta) => estafeta.ativo && estafeta.disponivel),
    [estafetas],
  );

  const liveBoardEntries = useMemo(
    () => buildEstafetaBoardEntries(estafetas, activeAtribuicoes, stores),
    [estafetas, activeAtribuicoes, stores],
  );

  const handleToggleDispatch = async (loja) => {
    const key = `dispatch-${loja.idloja}`;
    setBusyKey(key);
    try {
      await updateRestaurantAdminSettings(loja.idloja, { dispatch_interno_ativo: !loja.dispatch_interno_ativo }, callerUserId);
      toast.success(!loja.dispatch_interno_ativo
        ? `Dispatch interno ligado para ${loja.nome}.`
        : `Dispatch interno desligado para ${loja.nome}.`);
      await load();
    } catch (toggleError) {
      toast.error(toggleError?.message || "Nao foi possivel atualizar a loja.");
    } finally {
      setBusyKey("");
    }
  };

  const handleAssign = async (orderId) => {
    const estafetaId = assignSelection[orderId];
    if (!estafetaId) {
      toast.error("Escolhe um estafeta primeiro.");
      return;
    }
    const key = `assign-${orderId}`;
    setBusyKey(key);
    try {
      await assignDeliveryToEstafeta(callerUserId, orderId, estafetaId);
      toast.success("Estafeta atribuido.");
      await load();
    } catch (assignError) {
      toast.error(assignError?.message || "Nao foi possivel atribuir o estafeta.");
    } finally {
      setBusyKey("");
    }
  };

  const handleToggleAtivo = async (estafeta) => {
    const key = `ativo-${estafeta.id}`;
    setBusyKey(key);
    try {
      await adminSetEstafetaAtivo(callerUserId, estafeta.id, !estafeta.ativo);
      toast.success(!estafeta.ativo ? "Estafeta ativado." : "Estafeta desativado.");
      await load();
    } catch (toggleError) {
      toast.error(toggleError?.message || "Nao foi possivel atualizar o estafeta.");
    } finally {
      setBusyKey("");
    }
  };

  const handleCreateEstafeta = async (event) => {
    event.preventDefault();
    setBusyKey("create");
    try {
      const result = await adminCreateEstafeta(callerUserId, createForm);
      toast.success(
        `Estafeta criado! Password temporaria: ${result?.password_temporaria}`,
        { duration: 12000 },
      );
      setCreateForm({ nome: "", email: "", telemovel: "", veiculo: "mota" });
      setShowCreateForm(false);
      await load();
    } catch (createError) {
      toast.error(createError?.message || "Nao foi possivel criar o estafeta.");
    } finally {
      setBusyKey("");
    }
  };

  return (
    <DashboardSidebarLayout
      tabs={ADMIN_DASHBOARD_TABS}
      activeTab="dashboard"
      onTabChange={(tabId) => navigate(resolveAdminTabRoute(tabId))}
      kicker="Dispatch"
      title="Estafetas"
      subtitle="Gestao do dispatch interno de entregas (substituto do Shipday)."
      storageKey="dashboard-admin-sidebar-collapsed"
    >
      <header className="dashboard-header enterprise-header">
        <div>
          <p className="kicker">Dispatch interno</p>
          <h1 className="dashboard-title">Estafetas &amp; Entregas</h1>
          <p className="dashboard-subtitle">Ativa o dispatch interno por loja, gere estafetas e atribui pedidos manualmente.</p>
        </div>
        <div className="dashboard-actions">
          <button className="btn-dashboard" onClick={load}>Atualizar</button>
          <button className="btn-dashboard secondary" onClick={() => setShowCreateForm((prev) => !prev)}>
            {showCreateForm ? "Cancelar" : "Novo estafeta"}
          </button>
          <button className="btn-dashboard secondary" onClick={() => navigate("/dashboard/admin")}>Voltar dashboard</button>
        </div>
      </header>

      {error ? <p className="shipday-inline-error">{error}</p> : null}

      {showCreateForm ? (
        <form className="panel" onSubmit={handleCreateEstafeta} style={{ marginBottom: 20, display: "grid", gap: 10, maxWidth: 480 }}>
          <h3>Criar novo estafeta</h3>
          <input
            placeholder="Nome"
            required
            value={createForm.nome}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, nome: event.target.value }))}
          />
          <input
            type="email"
            placeholder="Email"
            required
            value={createForm.email}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
          />
          <input
            placeholder="Telemóvel"
            required
            value={createForm.telemovel}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, telemovel: event.target.value }))}
          />
          <select
            value={createForm.veiculo}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, veiculo: event.target.value }))}
          >
            <option value="mota">Mota</option>
            <option value="bicicleta">Bicicleta</option>
            <option value="carro">Carro</option>
            <option value="a_pe">A pé</option>
          </select>
          <button className="btn-dashboard" type="submit" disabled={busyKey === "create"}>Criar</button>
        </form>
      ) : null}

      <section className="dashboard-grid premium-grid">
        <article className="metric-card premium">
          <div className="metric-label">Estafetas ativos</div>
          <div className="metric-value">{estafetas.filter((item) => item.ativo).length}</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Online agora</div>
          <div className="metric-value">{estafetas.filter((item) => item.online).length}</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Entregas em curso</div>
          <div className="metric-value">{activeAtribuicoes.length}</div>
        </article>
        <article className="metric-card premium">
          <div className="metric-label">Por atribuir</div>
          <div className="metric-value">{unassignedOrders.length}</div>
        </article>
      </section>

      <LiveOperationsBoard mode="admin" orders={[]} carriers={liveBoardEntries} stores={stores} />

      <section className="panel-grid analytics-grid">
        <article className="panel">
          <h3>Lojas — dispatch interno</h3>
          <div className="table-wrap">
            <table className="ops-table">
              <thead>
                <tr><th>Loja</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {stores.map((loja) => (
                  <tr key={`loja-${loja.idloja}`}>
                    <td>{loja.nome}</td>
                    <td>
                      <span className={loja.dispatch_interno_ativo ? "tag ok" : "tag warn"}>
                        {loja.dispatch_interno_ativo ? "Interno" : "Shipday"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn-dashboard secondary"
                        disabled={busyKey === `dispatch-${loja.idloja}`}
                        onClick={() => handleToggleDispatch(loja)}
                      >
                        {loja.dispatch_interno_ativo ? "Desligar" : "Ligar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <h3>Pedidos por atribuir</h3>
          <div className="table-wrap">
            <table className="ops-table">
              <thead>
                <tr><th>Pedido</th><th>Loja</th><th>Cliente</th><th>Estafeta</th><th></th></tr>
              </thead>
              <tbody>
                {unassignedOrders.map((order) => (
                  <tr key={`unassigned-${order.id}`}>
                    <td>#{order.id}</td>
                    <td>{storeNameById.get(String(order.loja_id)) || order.loja_id}</td>
                    <td>{order.customer_nome}</td>
                    <td>
                      <select
                        value={assignSelection[order.id] || ""}
                        onChange={(event) => setAssignSelection((prev) => ({ ...prev, [order.id]: event.target.value }))}
                      >
                        <option value="">Escolher...</option>
                        {availableEstafetas.map((estafeta) => (
                          <option key={estafeta.id} value={estafeta.id}>{estafeta.nome}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        className="btn-dashboard"
                        disabled={busyKey === `assign-${order.id}`}
                        onClick={() => handleAssign(order.id)}
                      >
                        Atribuir
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && unassignedOrders.length === 0 ? (
                  <tr><td colSpan={5}>Sem pedidos por atribuir.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="panel-grid analytics-grid">
        <article className="panel">
          <h3>Entregas em curso</h3>
          <div className="table-wrap">
            <table className="ops-table">
              <thead>
                <tr><th>Pedido</th><th>Cliente</th><th>Estado</th><th>Estafeta</th></tr>
              </thead>
              <tbody>
                {activeAtribuicoes.map((assignment) => {
                  const estafetaNome = estafetas.find((item) => String(item.id) === String(assignment.estafeta_id))?.nome || "-";
                  const estado = resolveOrderEstadoInterno({ estado_interno: assignment.estado_interno });
                  return (
                    <tr key={`active-${assignment.id}`}>
                      <td>#{assignment.order_id}</td>
                      <td>{assignment.customer_nome}</td>
                      <td><span className={getEstadoInternoTagClass(estado)}>{getEstadoInternoLabelPt(estado)}</span></td>
                      <td>{estafetaNome}</td>
                    </tr>
                  );
                })}
                {!loading && activeAtribuicoes.length === 0 ? (
                  <tr><td colSpan={4}>Sem entregas em curso.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <h3>Estafetas</h3>
          <div className="table-wrap">
            <table className="ops-table">
              <thead>
                <tr><th>Nome</th><th>Telemóvel</th><th>Estado</th><th>Entregas</th><th></th></tr>
              </thead>
              <tbody>
                {estafetas.map((estafeta) => (
                  <tr key={`estafeta-${estafeta.id}`}>
                    <td>{estafeta.nome}</td>
                    <td>{estafeta.telefone}</td>
                    <td>
                      <span className={estafeta.online ? "tag ok" : "tag warn"}>
                        {estafeta.online ? "Online" : "Offline"}
                      </span>
                    </td>
                    <td>{estafeta.total_entregas}</td>
                    <td>
                      <button
                        className="btn-dashboard secondary"
                        disabled={busyKey === `ativo-${estafeta.id}`}
                        onClick={() => handleToggleAtivo(estafeta)}
                      >
                        {estafeta.ativo ? "Desativar" : "Ativar"}
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && estafetas.length === 0 ? (
                  <tr><td colSpan={5}>Sem estafetas registados.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </DashboardSidebarLayout>
  );
}

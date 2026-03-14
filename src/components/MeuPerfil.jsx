import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabaseClient.js";
import { fetchProfileOrders } from "../services/profileOrdersService";
import userGif from "../assets/img/perfil.gif";
import AddressManager from "./AddressManager";
import { extractUserId } from "../utils/roles";

function normalizeRpcPayload(payload) {
  if (Array.isArray(payload)) return payload[0] || null;
  return payload || null;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value) {
  return `${Number(value || 0).toFixed(2)}EUR`;
}

function statusClassName(tone) {
  if (tone === "success") return "is-success";
  if (tone === "danger") return "is-danger";
  return "is-warning";
}

function EmptyOrders() {
  return <p className="profile-note">Ainda nao tens pedidos registados.</p>;
}

function MeuPerfil({ user, aoAtualizarUser }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("pedidos");
  const [editarDados, setEditarDados] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersData, setOrdersData] = useState({
    summary: {
      totalOrders: 0,
      openOrders: 0,
      completedOrders: 0,
      canceledOrders: 0,
      totalSpent: 0,
      averageTicket: 0,
    },
    orders: [],
  });

  const userId = useMemo(() => extractUserId(user), [user]);
  const orderedOrders = useMemo(
    () => [...(ordersData.orders || [])].sort(
      (a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime(),
    ),
    [ordersData.orders],
  );

  const [formData, setFormData] = useState({
    username: user?.username || "",
    email: user?.email || "",
    telemovel: user?.telemovel || "",
    novaSenha: "",
    confirmarSenha: "",
  });

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      username: user?.username || "",
      email: user?.email || "",
      telemovel: user?.telemovel || "",
    }));
  }, [user?.username, user?.email, user?.telemovel]);

  useEffect(() => {
    let active = true;

    const loadOrders = async () => {
      setOrdersLoading(true);
      try {
        const data = await fetchProfileOrders(user);
        if (!active) return;
        setOrdersData(data);
      } catch (error) {
        console.error("Erro ao carregar pedidos do perfil:", error);
        if (!active) return;
        setOrdersData((prev) => ({ ...prev, orders: [] }));
      } finally {
        if (active) setOrdersLoading(false);
      }
    };

    loadOrders();

    return () => {
      active = false;
    };
  }, [userId, user?.email]);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const callUpdateRpc = async ({ profileOnly = false } = {}) => {
    const { data, error } = await supabase.rpc("atualizar_utilizador", {
      id_user: userId,
      novo_nome: formData.username,
      novo_email: formData.email,
      novo_telemovel: formData.telemovel,
      nova_senha: profileOnly ? null : formData.novaSenha,
    });

    if (error) throw error;

    const normalized = normalizeRpcPayload(data);
    aoAtualizarUser(
      normalized || {
        username: formData.username,
        email: formData.email,
        telemovel: formData.telemovel,
      },
    );
  };

  const handleSaveDados = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await callUpdateRpc({ profileOnly: true });
      alert("Dados atualizados com sucesso!");
      setEditarDados(false);
    } catch (error) {
      console.error("Erro ao atualizar dados:", error);
      alert(`Erro ao atualizar perfil: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePassword = async (e) => {
    e.preventDefault();

    if (!formData.novaSenha || !formData.confirmarSenha) {
      alert("Preenche os dois campos de password.");
      return;
    }

    if (formData.novaSenha !== formData.confirmarSenha) {
      alert("As novas passwords nao coincidem!");
      return;
    }

    setLoading(true);

    try {
      await callUpdateRpc({ profileOnly: false });
      alert("Password atualizada com sucesso!");
      setFormData((prev) => ({ ...prev, novaSenha: "", confirmarSenha: "" }));
    } catch (error) {
      console.error("Erro ao atualizar password:", error);
      alert(`Erro ao atualizar password: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const renderOrderItem = (order) => (
    <article
      key={order.id}
      className="profile-order-item is-clickable"
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/pedido/${order.id}`)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigate(`/pedido/${order.id}`);
        }
      }}
    >
      <div className="profile-order-main">
        <div>
          <p className="profile-order-id">Pedido #{order.id}</p>
          <h4>{order.loja_nome}</h4>
          <p className="profile-order-date">{formatDateTime(order.created_at)}</p>
        </div>

        <div className="profile-order-right">
          <strong>{formatMoney(order.total)}</strong>
          <span className={`profile-status-pill ${statusClassName(order.status_tone)}`}>
            {order.status_label}
          </span>
        </div>
      </div>

      <div className="profile-order-meta">
        <button
          type="button"
          className="profile-order-link"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/pedido/${order.id}`);
          }}
        >
          Ver detalhes
        </button>
        {order.delivery_status_label ? (
          <span className={`profile-status-pill thin ${statusClassName(order.delivery_status_tone)}`}>
            Entrega: {order.delivery_status_label}
          </span>
        ) : null}

        {order.tracking_url ? (
          <a
            href={order.tracking_url}
            target="_blank"
            rel="noreferrer"
            className="profile-order-link"
            onClick={(e) => e.stopPropagation()}
          >
            Ver tracking
          </a>
        ) : null}
      </div>

      {order.shipday_error ? (
        <p className="profile-order-error">Erro entrega: {order.shipday_error}</p>
      ) : null}
    </article>
  );

  return (
    <section className="profile-workspace">
      <header className="profile-header">
        <div className="profile-avatar-wrap">
          <img src={userGif} alt="Perfil" className="profile-avatar" />
        </div>

        <div className="profile-header-text">
          <p className="profile-kicker">Area pessoal</p>
          <h1>O Meu Perfil</h1>
          <p className="profile-member-since">
            Membro desde: {user?.dataregisto ? new Date(user.dataregisto).toLocaleDateString("pt-PT") : "-"}
          </p>
        </div>
      </header>

      <nav className="profile-tabs" aria-label="Secoes do perfil">
        <button
          type="button"
          className={`profile-tab-btn ${tab === "pedidos" ? "active" : ""}`}
          onClick={() => setTab("pedidos")}
        >
          Pedidos
        </button>
        <button
          type="button"
          className={`profile-tab-btn ${tab === "dados" ? "active" : ""}`}
          onClick={() => setTab("dados")}
        >
          Dados pessoais
        </button>
        <button
          type="button"
          className={`profile-tab-btn ${tab === "seguranca" ? "active" : ""}`}
          onClick={() => setTab("seguranca")}
        >
          Seguranca
        </button>
        <button
          type="button"
          className={`profile-tab-btn ${tab === "moradas" ? "active" : ""}`}
          onClick={() => setTab("moradas")}
        >
          Moradas
        </button>
      </nav>

      <div className="profile-tab-panel">
        {tab === "pedidos" && (
          <section className="profile-orders-area">
            {ordersLoading ? (
              <p className="profile-note">A carregar resumo e historico de pedidos...</p>
            ) : (
              <>
                <div className="profile-order-summary-grid">
                  <article className="profile-summary-card">
                    <span>Total de pedidos</span>
                    <strong>{ordersData.summary.totalOrders}</strong>
                  </article>
                  <article className="profile-summary-card">
                    <span>Em curso</span>
                    <strong>{ordersData.summary.openOrders}</strong>
                  </article>
                  <article className="profile-summary-card">
                    <span>Concluidos</span>
                    <strong>{ordersData.summary.completedOrders}</strong>
                  </article>
                  <article className="profile-summary-card">
                    <span>Cancelados</span>
                    <strong>{ordersData.summary.canceledOrders}</strong>
                  </article>
                  <article className="profile-summary-card highlight">
                    <span>Total gasto</span>
                    <strong>{formatMoney(ordersData.summary.totalSpent)}</strong>
                  </article>
                  <article className="profile-summary-card">
                    <span>Ticket medio</span>
                    <strong>{formatMoney(ordersData.summary.averageTicket)}</strong>
                  </article>
                </div>

                {ordersData.orders.length === 0 ? (
                  <EmptyOrders />
                ) : (
                  <div className="profile-orders-section">
                    <p className="profile-note">Todos os pedidos ({orderedOrders.length})</p>
                    <div className="profile-orders-list">
                      {orderedOrders.map(renderOrderItem)}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {tab === "dados" && (
          <form onSubmit={handleSaveDados} className="profile-form-grid">
            <div className="profile-field">
              <label htmlFor="username">Nome</label>
              <input
                type="text"
                id="username"
                value={formData.username}
                onChange={handleChange}
                disabled={!editarDados}
                className={!editarDados ? "input-disabled" : ""}
              />
            </div>

            <div className="profile-field">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={formData.email}
                onChange={handleChange}
                disabled={!editarDados}
                className={!editarDados ? "input-disabled" : ""}
              />
            </div>

            <div className="profile-field">
              <label htmlFor="telemovel">Telemovel</label>
              <input
                type="tel"
                id="telemovel"
                value={formData.telemovel}
                onChange={handleChange}
                disabled={!editarDados}
                className={!editarDados ? "input-disabled" : ""}
              />
            </div>

            <div className="profile-actions-row">
              {!editarDados ? (
                <button type="button" className="profile-btn secondary" onClick={() => setEditarDados(true)}>
                  Editar dados
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="profile-btn ghost"
                    onClick={() => {
                      setEditarDados(false);
                      setFormData((prev) => ({
                        ...prev,
                        username: user?.username || "",
                        email: user?.email || "",
                        telemovel: user?.telemovel || "",
                      }));
                    }}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="profile-btn primary" disabled={loading}>
                    {loading ? "A guardar..." : "Guardar alteracoes"}
                  </button>
                </>
              )}
            </div>
          </form>
        )}

        {tab === "seguranca" && (
          <form onSubmit={handleSavePassword} className="profile-form-grid profile-security-form">
            <p className="profile-note">
              Atualiza a password da conta. Os restantes dados do perfil mantem-se inalterados.
            </p>

            <div className="profile-field">
              <label htmlFor="novaSenha">Nova password</label>
              <input
                type="password"
                id="novaSenha"
                placeholder="Introduz nova password"
                value={formData.novaSenha}
                onChange={handleChange}
              />
            </div>

            <div className="profile-field">
              <label htmlFor="confirmarSenha">Confirmar password</label>
              <input
                type="password"
                id="confirmarSenha"
                placeholder="Repete a nova password"
                value={formData.confirmarSenha}
                onChange={handleChange}
              />
            </div>

            <div className="profile-actions-row">
              <button type="submit" className="profile-btn primary" disabled={loading}>
                {loading ? "A atualizar..." : "Atualizar password"}
              </button>
            </div>
          </form>
        )}

        {tab === "moradas" && (
          <AddressManager userId={userId} />
        )}
      </div>
    </section>
  );
}

export default MeuPerfil;




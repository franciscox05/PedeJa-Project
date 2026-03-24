import { useMemo, useState } from "react";
import { getEstadoInternoLabelPt, getEstadoInternoTagClass, resolveOrderEstadoInterno } from "../../services/orderStatusMapper";

function normalize(value, min, max) {
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 100;
}

function getCarrierMeta(status) {
  if (status === "delivery") {
    return {
      label: "Estafeta em entrega",
      pointClass: "delivery",
      dotClass: "delivery",
    };
  }

  if (status === "pickup") {
    return {
      label: "Estafeta em recolha",
      pointClass: "pickup",
      dotClass: "pickup",
    };
  }

  return {
    label: "Estafeta disponivel",
    pointClass: "available",
    dotClass: "available",
  };
}

function formatOrderId(orderId) {
  return orderId ? `#${String(orderId).slice(0, 8)}` : "-";
}

export default function LiveOperationsBoard({ orders = [], carriers = [], stores = [] }) {
  const [selectedCarrierId, setSelectedCarrierId] = useState("");
  const storesById = useMemo(
    () => new Map((stores || []).map((store) => [String(store?.idloja || store?.id || ""), store])),
    [stores],
  );

  const ordersTable = useMemo(
    () => (orders || []).slice(0, 8).map((order) => {
      const store = storesById.get(String(order?.loja_id || ""));
      return {
        ...order,
        lojaNome: order?.loja_nome || store?.nome || `Loja ${order?.loja_id || "-"}`,
      };
    }),
    [orders, storesById],
  );

  const mapPoints = useMemo(
    () => (carriers || []).filter((carrier) => Number.isFinite(Number(carrier?.lat)) && Number.isFinite(Number(carrier?.lng))),
    [carriers],
  );

  const selectedCarrier = useMemo(
    () => mapPoints.find((carrier) => String(carrier.id) === String(selectedCarrierId)) || mapPoints[0] || null,
    [mapPoints, selectedCarrierId],
  );

  if (!mapPoints.length) {
    return (
      <div className="panel live-board">
        <h3>Live Geo Board</h3>
        <p className="muted">Sem coordenadas de estafetas para desenhar o mapa em tempo real.</p>
        <div className="table-wrap" style={{ marginTop: "10px" }}>
          <table className="ops-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Loja</th>
                <th>Cliente</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {ordersTable.map((order) => {
                const estado = resolveOrderEstadoInterno(order);
                return (
                  <tr key={`r-${order.id}`}>
                    <td>{String(order.id).slice(0, 8)}</td>
                    <td>{order.lojaNome}</td>
                    <td>{order.customer_nome}</td>
                    <td><span className={getEstadoInternoTagClass(estado)}>{getEstadoInternoLabelPt(estado)}</span></td>
                  </tr>
                );
              })}
              {ordersTable.length === 0 ? (
                <tr><td colSpan={4}>Sem pedidos ativos para monitorizar.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const lats = mapPoints.map((item) => Number(item.lat));
  const lngs = mapPoints.map((item) => Number(item.lng));
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const selectedMeta = selectedCarrier ? getCarrierMeta(selectedCarrier.status) : null;

  return (
    <div className="panel live-board">
      <div className="live-board-header">
        <div>
          <h3>Live Geo Board</h3>
          <p className="muted">Monitorizacao em tempo real dos estafetas online, recolhas e entregas.</p>
        </div>
        {selectedCarrier ? (
          <div className="live-board-mini-card">
            <strong>{selectedCarrier.name || `Estafeta ${selectedCarrier.id}`}</strong>
            <p>{selectedMeta?.label || "Estafeta"}</p>
            <p>{selectedCarrier.phone || "Sem telemovel"}</p>
            <p>Pedido em curso: {formatOrderId(selectedCarrier.orderId)}</p>
          </div>
        ) : null}
      </div>

      <div className="geo-canvas">
        {mapPoints.map((carrier) => {
          const left = normalize(Number(carrier.lng), minLng, maxLng);
          const top = 100 - normalize(Number(carrier.lat), minLat, maxLat);
          const meta = getCarrierMeta(carrier.status);

          return (
            <button
              key={carrier.id}
              type="button"
              className={`geo-point carrier ${meta.pointClass}${String(selectedCarrier?.id || "") === String(carrier.id) ? " is-selected" : ""}`}
              style={{ left: `${left}%`, top: `${top}%` }}
              title={`${carrier.name || `Estafeta ${carrier.id}`} | ${meta.label} | Pedido ${formatOrderId(carrier.orderId)}`}
              onClick={() => setSelectedCarrierId(String(carrier.id))}
            >
              <span className="geo-point-pulse" />
            </button>
          );
        })}
      </div>

      <div className="geo-legend">
        <span><i className="dot available" /> Estafeta disponivel</span>
        <span><i className="dot pickup" /> Em recolha</span>
        <span><i className="dot delivery" /> Em entrega</span>
      </div>

      <div className="table-wrap" style={{ marginTop: "10px" }}>
        <table className="ops-table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Loja</th>
              <th>Cliente</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {ordersTable.map((order) => {
              const estado = resolveOrderEstadoInterno(order);
              return (
                <tr key={`r-${order.id}`}>
                  <td>{String(order.id).slice(0, 8)}</td>
                  <td>{order.lojaNome}</td>
                  <td>{order.customer_nome}</td>
                  <td><span className={getEstadoInternoTagClass(estado)}>{getEstadoInternoLabelPt(estado)}</span></td>
                </tr>
              );
            })}
            {ordersTable.length === 0 ? (
              <tr><td colSpan={4}>Sem pedidos ativos para monitorizar.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

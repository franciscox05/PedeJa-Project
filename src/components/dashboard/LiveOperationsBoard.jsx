import { getEstadoInternoLabelPt, getEstadoInternoTone, resolveOrderEstadoInterno } from "../../services/orderStatusMapper";

function normalize(value, min, max) {
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 100;
}

function pointToneClass(order) {
  const estado = resolveOrderEstadoInterno(order);
  return getEstadoInternoTone(estado);
}

export default function LiveOperationsBoard({ orders = [] }) {
  if (!orders.length) {
    return (
      <div className="panel live-board">
        <h3>Live Geo Board</h3>
        <p className="muted">Sem coordenadas de entrega para desenhar o mapa. Guarda moradas com geolocalizacao para ativar.</p>
      </div>
    );
  }

  const lats = orders.map((item) => Number(item.lat));
  const lngs = orders.map((item) => Number(item.lng));
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return (
    <div className="panel live-board">
      <h3>Live Geo Board</h3>
      <div className="geo-canvas">
        {orders.map((order) => {
          const left = normalize(Number(order.lng), minLng, maxLng);
          const top = 100 - normalize(Number(order.lat), minLat, maxLat);
          const estado = resolveOrderEstadoInterno(order);
          const tone = pointToneClass(order);

          return (
            <button
              key={order.id}
              className={`geo-point ${tone}`}
              style={{ left: `${left}%`, top: `${top}%` }}
              title={`${order.loja_nome} | ${order.customer_nome} | ${getEstadoInternoLabelPt(estado)}`}
            />
          );
        })}
      </div>
      <div className="geo-legend">
        <span><i className="dot ok" /> Estavel</span>
        <span><i className="dot warn" /> Em curso</span>
        <span><i className="dot bad" /> Critico</span>
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
            {orders.slice(0, 8).map((order) => {
              const estado = resolveOrderEstadoInterno(order);
              const tone = pointToneClass(order);
              return (
                <tr key={`r-${order.id}`}>
                  <td>{String(order.id).slice(0, 8)}</td>
                  <td>{order.loja_nome}</td>
                  <td>{order.customer_nome}</td>
                  <td><span className={`tag ${tone}`}>{getEstadoInternoLabelPt(estado)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

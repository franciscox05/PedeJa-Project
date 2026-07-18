import { useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMapsApi } from "../../services/googleMapsService";
import { fetchOrderTrackingInfo } from "../../services/estafetaService";

const POLL_INTERVAL_MS = 12000;

const MARKER_COLORS = {
  store: "#0f172a",
  customer: "#2563eb",
  estafeta: "#22c55e",
};

function hasPoint(point) {
  return Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng));
}

function buildMarkerIcon(type) {
  return {
    path: window.google.maps.SymbolPath.CIRCLE,
    fillColor: MARKER_COLORS[type] || "#64748b",
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2,
    scale: type === "estafeta" ? 9 : 7,
  };
}

export default function InHouseTrackingMap({ orderId, callerUserId, isLive, fallback = null }) {
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapError, setMapError] = useState("");
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});

  const canFetch = Boolean(orderId && callerUserId);

  useEffect(() => {
    if (!canFetch) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    async function load() {
      try {
        const data = await fetchOrderTrackingInfo(callerUserId, orderId);
        if (!cancelled) setTracking(data);
      } catch (error) {
        console.error("InHouseTrackingMap: falha ao carregar tracking", { error: error?.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const intervalId = isLive ? setInterval(load, POLL_INTERVAL_MS) : null;

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [canFetch, callerUserId, orderId, isLive]);

  const points = useMemo(() => {
    if (!tracking) return [];
    const list = [];
    if (hasPoint(tracking.store)) list.push({ key: "store", type: "store", title: tracking.store.nome || "Restaurante", ...tracking.store });
    if (hasPoint(tracking.customer)) list.push({ key: "customer", type: "customer", title: "A tua morada", ...tracking.customer });
    if (tracking.estafeta && hasPoint(tracking.estafeta)) {
      list.push({ key: "estafeta", type: "estafeta", title: tracking.estafeta.nome || "Estafeta", ...tracking.estafeta });
    }
    return list;
  }, [tracking]);

  useEffect(() => {
    if (!points.length || !mapElementRef.current) return undefined;

    let cancelled = false;

    loadGoogleMapsApi()
      .then(() => {
        if (cancelled) return;

        if (!mapRef.current) {
          mapRef.current = new window.google.maps.Map(mapElementRef.current, {
            zoom: 13,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          });
        }

        const map = mapRef.current;
        Object.values(markersRef.current).forEach((marker) => marker.setMap(null));
        markersRef.current = {};

        const bounds = new window.google.maps.LatLngBounds();

        points.forEach((point) => {
          const marker = new window.google.maps.Marker({
            map,
            position: { lat: Number(point.lat), lng: Number(point.lng) },
            title: point.title,
            icon: buildMarkerIcon(point.type),
            zIndex: point.type === "estafeta" ? 300 : 100,
          });
          markersRef.current[point.key] = marker;
          bounds.extend(marker.getPosition());
        });

        if (points.length === 1) {
          map.setCenter({ lat: Number(points[0].lat), lng: Number(points[0].lng) });
          map.setZoom(14);
        } else {
          map.fitBounds(bounds, 56);
        }
      })
      .catch((error) => {
        if (!cancelled) setMapError(error?.message || "Falha ao carregar o mapa.");
      });

    return () => {
      cancelled = true;
    };
  }, [points]);

  if (loading) {
    return <p className="pedido-muted">A carregar tracking...</p>;
  }

  if (!tracking?.in_house_enabled) {
    return fallback;
  }

  return (
    <div className="pedido-tracking-embed-card">
      <div className="pedido-tracking-embed-header">
        <div>
          <strong>Mapa em tempo real</strong>
          <p className="pedido-muted">
            {tracking.estafeta
              ? `${tracking.estafeta.nome || "O teu estafeta"} está a caminho.`
              : "Ainda sem estafeta atribuido para acompanhar."}
          </p>
        </div>
      </div>

      {mapError ? (
        <p className="pedido-error-inline">{mapError}</p>
      ) : points.length ? (
        <div className="pedido-tracking-frame-wrap pedido-tracking-map-wrap">
          <div ref={mapElementRef} className="pedido-tracking-map-target" />
        </div>
      ) : (
        <p className="pedido-muted">Sem coordenadas disponiveis para mostrar o mapa agora.</p>
      )}
    </div>
  );
}

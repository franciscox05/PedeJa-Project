import { useEffect, useMemo, useRef, useState } from "react";
import {
  BARCELOS_CENTER,
  buildDeliveryPricingDistanceRings,
  computeDeliveryQuoteByDistance,
  formatDistanceKm,
  PORTUGAL_MAINLAND_BOUNDS,
  resolveDeliveryPricingMaxKm,
} from "../services/deliveryZoneService";
import {
  geocodeCoordsWithGoogle,
  getDrivingDistanceKm,
  loadGoogleMapsApi,
} from "../services/googleMapsService";
import "../css/components/LocationPickerModal.css";

const RING_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#06b6d4", "#6366f1", "#8b5cf6", "#10b981"];
const FIXED_BARCELOS_CENTER = BARCELOS_CENTER;

function isFiniteCoordinate(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed);
}

function createCircleColor(index) {
  return RING_COLORS[index % RING_COLORS.length];
}

export default function LocationPickerModal({
  isOpen,
  title = "Selecionar localizacao no mapa",
  subtitle = "Arrasta o marcador ou clica no mapa para escolher o ponto exato.",
  initialLat = null,
  initialLng = null,
  deliveryPricingConfig = null,
  deliveryFeeFallback = null,
  onCancel,
  onConfirm,
}) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circlesRef = useRef([]);

  const initialPoint = useMemo(
    () => ({
      lat: isFiniteCoordinate(initialLat) ? Number(initialLat) : FIXED_BARCELOS_CENTER.lat,
      lng: isFiniteCoordinate(initialLng) ? Number(initialLng) : FIXED_BARCELOS_CENTER.lng,
    }),
    [initialLat, initialLng],
  );

  const [selectedPoint, setSelectedPoint] = useState(initialPoint);
  const [mapLoading, setMapLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [distanceKm, setDistanceKm] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const pricingRings = useMemo(
    () => buildDeliveryPricingDistanceRings(deliveryPricingConfig),
    [deliveryPricingConfig],
  );
  const maxDeliveryKm = useMemo(
    () => resolveDeliveryPricingMaxKm(deliveryPricingConfig),
    [deliveryPricingConfig],
  );

  const deliveryQuote = useMemo(
    () => computeDeliveryQuoteByDistance(distanceKm, deliveryPricingConfig, deliveryFeeFallback),
    [deliveryFeeFallback, deliveryPricingConfig, distanceKm],
  );

  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage("");
    setDistanceKm(null);
    setSelectedPoint(initialPoint);
  }, [isOpen, initialPoint]);

  useEffect(() => {
    if (!isOpen || !mapElementRef.current) return;

    let cancelled = false;
    setMapLoading(true);

    loadGoogleMapsApi()
      .then(() => {
        if (cancelled) return;

        if (mapRef.current) {
          mapRef.current = null;
        }

        const map = new window.google.maps.Map(mapElementRef.current, {
          center: FIXED_BARCELOS_CENTER,
          zoom: 13,
          minZoom: 6,
          maxZoom: 19,
          streetViewControl: true,
          fullscreenControl: false,
          mapTypeControl: true,
          restriction: {
            latLngBounds: PORTUGAL_MAINLAND_BOUNDS,
            strictBounds: true,
          },
        });
        mapRef.current = map;

        const marker = new window.google.maps.Marker({
          position: { lat: initialPoint.lat, lng: initialPoint.lng },
          map,
          draggable: true,
          title: "Ponto de entrega",
        });
        markerRef.current = marker;

        circlesRef.current.forEach((circle) => circle.setMap(null));
        circlesRef.current = pricingRings.map((ring, index) => {
          const color = createCircleColor(index);
          return new window.google.maps.Circle({
            map,
            center: FIXED_BARCELOS_CENTER,
            radius: ring.distanceKm * 1000,
            clickable: false,
            strokeColor: color,
            strokeOpacity: 0.45,
            strokeWeight: 1.4,
            fillColor: color,
            fillOpacity: 0.05,
          });
        });

        const updateSelection = (lat, lng) => {
          marker.setPosition({ lat, lng });
          setSelectedPoint({ lat, lng });
        };

        marker.addListener("dragend", () => {
          const point = marker.getPosition();
          if (!point) return;
          updateSelection(point.lat(), point.lng());
        });

        map.addListener("click", (event) => {
          const lat = event?.latLng?.lat?.();
          const lng = event?.latLng?.lng?.();
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          updateSelection(lat, lng);
        });

        setTimeout(() => {
          window.google.maps.event.trigger(map, "resize");
          map.setCenter(FIXED_BARCELOS_CENTER);
          map.setZoom(13);
        }, 120);
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error?.message || "Falha ao abrir o mapa.");
      })
      .finally(() => {
        if (!cancelled) setMapLoading(false);
      });

    return () => {
      cancelled = true;
      circlesRef.current.forEach((circle) => circle.setMap(null));
      circlesRef.current = [];
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [isOpen, initialPoint.lat, initialPoint.lng, pricingRings]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setDistanceLoading(true);
    setErrorMessage("");

    getDrivingDistanceKm(FIXED_BARCELOS_CENTER, selectedPoint)
      .then((value) => {
        if (cancelled) return;
        setDistanceKm(value);
      })
      .catch((error) => {
        if (cancelled) return;
        setDistanceKm(null);
        setErrorMessage(error?.message || "Nao foi possivel calcular a distancia real.");
      })
      .finally(() => {
        if (!cancelled) setDistanceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedPoint.lat, selectedPoint.lng]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setErrorMessage("");
    if (!deliveryQuote.deliverable) {
      setErrorMessage(deliveryQuote.reason || "Fora da zona de entrega.");
      return;
    }

    setSubmitLoading(true);
    try {
      const reverse = await geocodeCoordsWithGoogle(selectedPoint.lat, selectedPoint.lng);
      await onConfirm({
        ...reverse,
        lat: selectedPoint.lat,
        lng: selectedPoint.lng,
      });
    } catch (error) {
      setErrorMessage(error?.message || "Nao foi possivel confirmar o ponto no mapa.");
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="location-picker-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="location-picker-modal">
        <header className="location-picker-header">
          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="location-picker-close" onClick={onCancel}>x</button>
        </header>

        <div className="location-picker-map-wrap">
          {mapLoading ? <p className="location-picker-map-loading">A carregar Google Maps...</p> : null}
          <div ref={mapElementRef} className="location-picker-map" />
        </div>

        <div className="location-picker-meta">
          <div>
            <strong>Coordenadas</strong>
            <p>{selectedPoint.lat.toFixed(6)}, {selectedPoint.lng.toFixed(6)}</p>
          </div>
          <div>
            <strong>Distancia real (carro)</strong>
            <p>{distanceLoading ? "A calcular..." : formatDistanceKm(deliveryQuote.distanceKm)}</p>
          </div>
          <div>
            <strong>Taxa estimada</strong>
            <p>{deliveryQuote.deliverable ? `${Number(deliveryQuote.fee).toFixed(2)}EUR` : "-"}</p>
          </div>
        </div>

        {!deliveryQuote.deliverable ? (
          <p className="location-picker-error">
            {deliveryQuote.reason || `Fora da zona de entrega (maximo ${maxDeliveryKm} km).`}
          </p>
        ) : (
          <p className="location-picker-ok">Ponto dentro da zona de entrega.</p>
        )}

        {errorMessage ? <p className="location-picker-error">{errorMessage}</p> : null}

        <footer className="location-picker-actions">
          <button type="button" className="location-picker-btn ghost" onClick={onCancel}>Cancelar</button>
          <button
            type="button"
            className="location-picker-btn primary"
            onClick={handleConfirm}
            disabled={submitLoading || mapLoading || distanceLoading || !deliveryQuote.deliverable}
          >
            {submitLoading ? "A confirmar..." : "Usar este ponto"}
          </button>
        </footer>
      </div>
    </div>
  );
}

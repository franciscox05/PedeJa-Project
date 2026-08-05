import { useEffect, useMemo, useRef, useState } from "react";
import { Minimize2, Maximize2 } from "lucide-react";
import { getEstadoInternoLabelPt, getEstadoInternoTagClass, resolveOrderEstadoInterno } from "../../services/orderStatusMapper";
import {
  BARCELOS_CENTER,
  haversineDistanceKm,
  isInPortugalMainlandBounds,
  PORTUGAL_MAINLAND_BOUNDS,
} from "../../services/deliveryZoneService";
import { loadGoogleMapsApi } from "../../services/googleMapsService";

const GEO_BOARD_MAX_KM_FROM_BARCELOS = 80;
const GEO_BOARD_MIN_ZOOM = 11;
const GEO_BOARD_MAX_ZOOM = 16;

function getCarrierMeta(status) {
  if (status === "delivery") {
    return { label: "Estafeta em entrega", pointClass: "delivery" };
  }
  if (status === "pickup") {
    return { label: "Estafeta em recolha", pointClass: "pickup" };
  }
  return { label: "Estafeta disponível", pointClass: "available" };
}

function resolveCarrierStatus(status, orderEstado = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (["delivery", "entrega", "on_the_way", "out_for_delivery", "a_caminho", "recolhido"].includes(normalized)) {
    return "delivery";
  }
  if (["pickup", "recolha", "assigned", "started", "ready_for_pickup", "ready_to_deliver"].includes(normalized)) {
    return "pickup";
  }

  const normalizedOrderEstado = String(orderEstado || "").trim().toLowerCase();
  if (["recolhido", "a_caminho", "entregue"].includes(normalizedOrderEstado)) return "delivery";
  if (["atribuindo_estafeta", "estafeta_aceitou", "iniciado", "em_preparacao", "pronto_recolha"].includes(normalizedOrderEstado)) {
    return "pickup";
  }
  return "available";
}

function formatOrderId(orderId) {
  return orderId ? `#${String(orderId).slice(0, 8)}` : "-";
}

function formatDistanceLabel(distanceKm) {
  if (!Number.isFinite(distanceKm)) return "Distância não disponível";
  if (distanceKm <= 2) return `Muito perto (${distanceKm.toFixed(1)} km)`;
  if (distanceKm <= 5) return `Perto (${distanceKm.toFixed(1)} km)`;
  if (distanceKm <= 10) return `A caminho (${distanceKm.toFixed(1)} km)`;
  return `Longe (${distanceKm.toFixed(1)} km)`;
}

function hasAssignedDriver(order) {
  return Boolean(String(order?.driver_name || order?.driver_phone || "").trim());
}

function shouldExposeFallbackCarrier(order) {
  const estado = resolveOrderEstadoInterno(order);
  const hasAssignmentState = [
    "atribuindo_estafeta",
    "estafeta_aceitou",
    "iniciado",
    "em_preparacao",
    "pronto_recolha",
    "recolhido",
    "a_caminho",
  ].includes(estado);

  return hasAssignedDriver(order) || hasAssignmentState;
}

function resolveBoardOrderEstado(order) {
  const baseEstado = resolveOrderEstadoInterno(order);
  if (!hasAssignedDriver(order)) return baseEstado;
  if (baseEstado === "pendente") return "atribuindo_estafeta";
  if (baseEstado === "aceite") return "estafeta_aceitou";
  return baseEstado;
}

function resolveCarrierBoardStatusFromOrder(order) {
  const estado = resolveBoardOrderEstado(order);
  if (["recolhido", "a_caminho", "entregue"].includes(estado)) return "delivery";
  return "pickup";
}

function hasPoint(point) {
  return Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng));
}

function parseCoordinate(value) {
  const parsed = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOrderReference(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.split("-")[0].split("_")[0].trim();
}

function isOperationalPoint(lat, lng) {
  const parsedLat = parseCoordinate(lat);
  const parsedLng = parseCoordinate(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return false;
  if (!isInPortugalMainlandBounds(parsedLat, parsedLng)) return false;
  const distanceFromBarcelos = haversineDistanceKm(BARCELOS_CENTER, { lat: parsedLat, lng: parsedLng });
  return Number.isFinite(distanceFromBarcelos) && distanceFromBarcelos <= GEO_BOARD_MAX_KM_FROM_BARCELOS;
}

function resolveOperationalCoords(lat, lng) {
  const parsedLat = parseCoordinate(lat);
  const parsedLng = parseCoordinate(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return null;
  if (isOperationalPoint(parsedLat, parsedLng)) return { lat: parsedLat, lng: parsedLng };
  if (isOperationalPoint(parsedLng, parsedLat)) return { lat: parsedLng, lng: parsedLat };
  return null;
}

function buildDriverSignature(source = {}) {
  const name = String(source?.driver_name || source?.name || "").trim().toLowerCase();
  const phone = String(source?.driver_phone || source?.phone || "").replace(/\D+/g, "");
  if (!name && !phone) return "";
  return `${name}|${phone}`;
}

function collectCarrierOrderRefs(source = {}) {
  const refs = new Set();
  const pushRef = (value) => {
    const normalized = normalizeOrderReference(value);
    if (normalized) refs.add(normalized);
  };

  pushRef(source?.orderId);
  pushRef(source?.order_id);
  pushRef(source?.raw?.orderId);
  pushRef(source?.raw?.order_id);

  return Array.from(refs);
}

function resolveCarrierStoreId(carrier = {}) {
  return String(
    carrier?.lojaId
    || carrier?.loja_id
    || carrier?.storeId
    || carrier?.store_id
    || carrier?.restaurantId
    || carrier?.restaurant_id
    || carrier?.raw?.lojaId
    || carrier?.raw?.loja_id
    || carrier?.raw?.storeId
    || carrier?.raw?.store_id
    || carrier?.raw?.restaurantId
    || carrier?.raw?.restaurant_id
    || "",
  ).trim();
}

function resolveCarrierOperationalCoords(carrier = {}) {
  const coordinatePairs = [
    [carrier?.lat, carrier?.lng],
    [carrier?.latitude, carrier?.longitude],
    [carrier?.raw?.lat, carrier?.raw?.lng],
    [carrier?.raw?.latitude, carrier?.raw?.longitude],
    [carrier?.raw?.location?.lat, carrier?.raw?.location?.lng],
    [carrier?.raw?.location?.latitude, carrier?.raw?.location?.longitude],
    [carrier?.raw?.currentLocation?.lat, carrier?.raw?.currentLocation?.lng],
    [carrier?.raw?.currentLocation?.latitude, carrier?.raw?.currentLocation?.longitude],
    [carrier?.raw?.last_location?.lat, carrier?.raw?.last_location?.lng],
    [carrier?.raw?.last_location?.latitude, carrier?.raw?.last_location?.longitude],
  ];

  for (const [lat, lng] of coordinatePairs) {
    const coords = resolveOperationalCoords(lat, lng);
    if (coords) return coords;
  }

  return null;
}

function offsetCoordsFromStore(lat, lng, seedValue) {
  const baseLat = Number(lat);
  const baseLng = Number(lng);
  if (!Number.isFinite(baseLat) || !Number.isFinite(baseLng)) return null;

  const numericSeed = Number(String(seedValue || "").replace(/\D+/g, "")) || 1;
  const angle = (numericSeed % 360) * (Math.PI / 180);
  const radiusKm = 0.42;
  const latOffset = (radiusKm / 111) * Math.cos(angle);
  const lngOffset = (radiusKm / (111 * Math.max(Math.cos((baseLat * Math.PI) / 180), 0.35))) * Math.sin(angle);

  return {
    lat: baseLat + latOffset,
    lng: baseLng + lngOffset,
  };
}

function getOrderPointMeta(order) {
  const estado = resolveBoardOrderEstado(order);

  if (estado === "pendente") {
    return { pointClass: "warn", label: "Pedido pendente" };
  }
  if (estado === "aceite") {
    return { pointClass: "warn", label: "Pedido aceite" };
  }
  if (["atribuindo_estafeta", "estafeta_aceitou", "iniciado"].includes(estado)) {
    return { pointClass: "warn", label: "Estafeta atribuído" };
  }
  if (["em_preparacao", "pronto_recolha"].includes(estado)) {
    return { pointClass: "warn", label: "Pedido em preparação" };
  }
  if (["a_caminho", "recolhido"].includes(estado)) {
    return { pointClass: "ok", label: "Pedido em rota" };
  }
  if (estado === "entregue") {
    return { pointClass: "ok", label: "Pedido entregue" };
  }
  if (["cancelado"].includes(estado)) {
    return { pointClass: "bad", label: "Pedido cancelado" };
  }
  return { pointClass: "warn", label: "Pedido ativo" };
}

function getPointVisual(point) {
  if (point.type === "store") {
    return { color: "#0f172a", borderColor: "#ffffff", scale: 7 };
  }

  if (point.type === "carrier") {
    const carrierMeta = getCarrierMeta(
      resolveCarrierStatus(point?.payload?.status, point?.payload?.orderEstado),
    );
    if (carrierMeta.pointClass === "pickup") return { color: "#7c3aed", borderColor: "#ffffff", scale: 7 };
    if (carrierMeta.pointClass === "delivery") return { color: "#22c55e", borderColor: "#ffffff", scale: 7 };
    return { color: "#2563eb", borderColor: "#ffffff", scale: 7 };
  }

  const orderMeta = getOrderPointMeta(point?.payload);
  if (orderMeta.pointClass === "ok") return { color: "#22c55e", borderColor: "#ffffff", scale: 6.5 };
  if (orderMeta.pointClass === "bad") return { color: "#ef4444", borderColor: "#ffffff", scale: 6.5 };
  return { color: "#f59e0b", borderColor: "#ffffff", scale: 6.5 };
}

function buildPointTitle(point) {
  if (point.type === "carrier") {
    const meta = getCarrierMeta(
      resolveCarrierStatus(point.payload?.status, point.payload?.orderEstado),
    );
    const orderRefs = collectCarrierOrderRefs(point?.payload || {});
    const orderRef = orderRefs[0] || point.payload?.orderId;
    return `${point.payload?.name || `Estafeta ${point.id}`} | ${meta.label} | Pedido ${formatOrderId(orderRef)}`;
  }
  if (point.type === "store") {
    return `Loja ${point.payload?.nome || point.id}`;
  }
  return `${formatOrderId(point.payload?.id)} | ${point.payload?.customer_nome || "Cliente"} | ${getEstadoInternoLabelPt(resolveOrderEstadoInterno(point.payload))}`;
}

function buildMarkerIcon(point, isSelected) {
  const visual = getPointVisual(point);
  return {
    path: window.google.maps.SymbolPath.CIRCLE,
    fillColor: visual.color,
    fillOpacity: 1,
    strokeColor: visual.borderColor,
    strokeWeight: isSelected ? 3 : 2,
    scale: isSelected ? visual.scale + 3 : visual.scale,
  };
}

export default function LiveOperationsBoard({
  orders = [],
  carriers = [],
  stores = [],
  mode = "admin",
  storeId = null,
  onOpenDetails = null,
  openDetailsLabel = "Abrir detalhe",
  hideOrdersTable = false,
}) {
  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeCarriers = Array.isArray(carriers) ? carriers : [];
  const safeStores = Array.isArray(stores) ? stores : [];
  const normalizedStoreId = String(storeId || "").trim();
  const normalizedMode = String(mode || "").trim().toLowerCase();
  const isAdminMode = normalizedMode === "admin";
  const isRestaurantMode = !isAdminMode
    && (
      Boolean(normalizedStoreId)
      || ["restaurant", "restaurante", "store", "loja"].includes(normalizedMode)
    );
  const effectiveRestaurantStoreId = useMemo(() => {
    if (!isRestaurantMode) return normalizedStoreId;
    if (normalizedStoreId) return normalizedStoreId;

    const fromOrders = safeOrders
      .map((order) => String(order?.loja_id || "").trim())
      .find(Boolean);
    if (fromOrders) return fromOrders;

    const fromCarriers = safeCarriers
      .map((carrier) => String(carrier?.lojaId || carrier?.raw?.lojaId || "").trim())
      .find(Boolean);
    if (fromCarriers) return fromCarriers;

    if (safeStores.length === 1) {
      return String(safeStores?.[0]?.idloja || safeStores?.[0]?.id || "").trim();
    }

    return "";
  }, [isRestaurantMode, normalizedStoreId, safeCarriers, safeOrders, safeStores]);
  const [selectedPointKey, setSelectedPointKey] = useState("");
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState("");
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  const storesById = useMemo(
    () => new Map(safeStores.map((store) => [String(store?.idloja || store?.id || ""), store])),
    [safeStores],
  );

  const scopedOrders = useMemo(() => {
    const baseOrders = [...safeOrders];
    if (!isRestaurantMode || !effectiveRestaurantStoreId) return baseOrders;
    return baseOrders.filter((order) => String(order?.loja_id || "") === effectiveRestaurantStoreId);
  }, [effectiveRestaurantStoreId, isRestaurantMode, safeOrders]);

  const ordersTable = useMemo(
    () => scopedOrders.slice(0, 8).map((order) => {
      const store = storesById.get(String(order?.loja_id || ""));
      return {
        ...order,
        lojaNome: order?.loja_nome || store?.nome || `Loja ${order?.loja_id || "-"}`,
        estadoBoard: resolveBoardOrderEstado(order),
      };
    }),
    [scopedOrders, storesById],
  );

  const orderPoints = useMemo(
    () => {
      if (isRestaurantMode) return [];

      return scopedOrders
      .filter((order) => !["entregue", "cancelado"].includes(resolveOrderEstadoInterno(order)))
      .map((order) => ({
        ...order,
        coords: resolveOperationalCoords(order?.lat ?? order?.customer_lat, order?.lng ?? order?.customer_lng),
      }))
      .filter((order) => Boolean(order.coords) && hasPoint(order.coords))
      .map((order) => ({
        key: `order-${order.id}`,
        type: "order",
        id: order.id,
        lat: Number(order.coords.lat),
        lng: Number(order.coords.lng),
        payload: order,
      }));
    },
    [isRestaurantMode, scopedOrders],
  );

  const scopedActiveOrderIds = useMemo(
    () => new Set(
      (scopedOrders || [])
        .filter((order) => !["entregue", "cancelado"].includes(resolveOrderEstadoInterno(order)))
        .map((order) => normalizeOrderReference(order?.id))
        .filter(Boolean),
    ),
    [scopedOrders],
  );
  const ordersByReference = useMemo(() => {
    const map = new Map();
    (scopedOrders || []).forEach((order) => {
      const ref = normalizeOrderReference(order?.id);
      if (ref) map.set(ref, order);
    });
    return map;
  }, [scopedOrders]);
  const scopedDriverSignatures = useMemo(
    () => new Set(
      (scopedOrders || [])
        .map((order) => buildDriverSignature(order))
        .filter(Boolean),
    ),
    [scopedOrders],
  );

  const carrierPoints = useMemo(
    () => safeCarriers
      .map((carrier) => ({
        ...carrier,
        coords: resolveCarrierOperationalCoords(carrier),
        orderRefs: collectCarrierOrderRefs(carrier),
        resolvedStoreId: resolveCarrierStoreId(carrier),
      }))
      .filter((carrier) => Boolean(carrier.coords))
      .filter((carrier) => {
        if (!isRestaurantMode) return true;
        const matchesStore = Boolean(
          effectiveRestaurantStoreId
          && carrier.resolvedStoreId
          && carrier.resolvedStoreId === effectiveRestaurantStoreId,
        );
        const matchesOrder = (carrier.orderRefs || []).some((ref) => scopedActiveOrderIds.has(ref));
        const matchesDriver = scopedDriverSignatures.has(buildDriverSignature(carrier));
        return Boolean(matchesOrder || matchesStore || matchesDriver);
      })
      .map((carrier) => ({
        key: `carrier-${carrier.id}`,
        type: "carrier",
        id: carrier.id,
        lat: Number(carrier.coords.lat),
        lng: Number(carrier.coords.lng),
        payload: carrier,
      })),
    [effectiveRestaurantStoreId, isRestaurantMode, safeCarriers, scopedActiveOrderIds, scopedDriverSignatures],
  );
  const orderFallbackCarrierPoints = useMemo(() => {
    if (!isRestaurantMode) return [];

    const linkedOrderRefs = new Set(
      (carrierPoints || [])
        .map((carrierPoint) => normalizeOrderReference(carrierPoint?.payload?.orderId))
        .filter(Boolean),
    );
    const linkedCarrierSignatures = new Set(
      (carrierPoints || [])
        .map((carrierPoint) => buildDriverSignature(carrierPoint?.payload || {}))
        .filter(Boolean),
    );

    const fallbackStore = effectiveRestaurantStoreId ? storesById.get(effectiveRestaurantStoreId) : null;

    return (scopedOrders || [])
      .filter((order) => !["entregue", "cancelado"].includes(resolveBoardOrderEstado(order)))
      .filter((order) => shouldExposeFallbackCarrier(order))
      .filter((order) => {
        const ref = normalizeOrderReference(order?.id);
        const alreadyLinkedByRef = ref && linkedOrderRefs.has(ref);
        const orderSignature = buildDriverSignature(order);
        const alreadyLinkedByDriver = orderSignature && linkedCarrierSignatures.has(orderSignature);
        return !alreadyLinkedByRef && !alreadyLinkedByDriver;
      })
      .map((order) => {
        const orderStore = storesById.get(String(order?.loja_id || "")) || fallbackStore;
        const storeCoords = resolveOperationalCoords(orderStore?.latitude ?? orderStore?.lat, orderStore?.longitude ?? orderStore?.lng);
        if (!storeCoords) return null;

        const shifted = offsetCoordsFromStore(storeCoords.lat, storeCoords.lng, order?.id);
        if (!shifted) return null;

        return {
          key: `carrier-fallback-${order.id}`,
          type: "carrier",
            id: `fallback-${order.id}`,
            lat: Number(shifted.lat),
            lng: Number(shifted.lng),
            payload: {
              id: `fallback-${order.id}`,
            name: String(order?.driver_name || "Estafeta atribuido"),
            phone: String(order?.driver_phone || ""),
            status: resolveCarrierBoardStatusFromOrder(order),
            coordsSource: "store_fallback",
            orderId: order?.id || null,
            orderEstado: resolveBoardOrderEstado(order),
            lojaId: order?.loja_id || effectiveRestaurantStoreId || null,
            },
          };
      })
      .filter(Boolean);
  }, [carrierPoints, effectiveRestaurantStoreId, isRestaurantMode, scopedOrders, storesById]);

  const storePoints = useMemo(
    () => safeStores
      .filter((store) => !isRestaurantMode || !effectiveRestaurantStoreId || String(store?.idloja || store?.id || "") === effectiveRestaurantStoreId)
      .map((store) => ({
        ...store,
        coords: resolveOperationalCoords(store?.latitude ?? store?.lat, store?.longitude ?? store?.lng),
      }))
      .filter((store) => Boolean(store.coords) && hasPoint(store.coords))
      .map((store) => ({
        key: `store-${store.idloja || store.id}`,
        type: "store",
        id: store.idloja || store.id,
        lat: Number(store.coords.lat),
        lng: Number(store.coords.lng),
        payload: store,
      })),
    [effectiveRestaurantStoreId, isRestaurantMode, safeStores],
  );

  const mapPoints = useMemo(() => {
    if (isRestaurantMode) {
      return [...storePoints, ...carrierPoints, ...orderFallbackCarrierPoints]
        .filter((point) => point.type !== "order");
    }
    return [...storePoints, ...orderPoints, ...carrierPoints];
  }, [carrierPoints, isRestaurantMode, orderFallbackCarrierPoints, orderPoints, storePoints]);

  const selectedPoint = useMemo(
    () => mapPoints.find((point) => point.key === selectedPointKey) || mapPoints[0] || null,
    [mapPoints, selectedPointKey],
  );

  // mapPoints ganha uma identidade de array nova a cada poll de fundo (15-30s) mesmo
  // quando nenhum ponto mudou de posicao -- usar uma assinatura estavel como dependencia
  // do efeito de marcadores evita destruir/reconstruir todos os marcadores do mapa
  // sempre que o conteudo e identico.
  const mapPointsRef = useRef(mapPoints);
  useEffect(() => {
    mapPointsRef.current = mapPoints;
  }, [mapPoints]);
  const mapPointsSignature = useMemo(
    () => mapPoints
      .map((point) => `${point.key}:${point.type}:${Number(point.lat).toFixed(6)}:${Number(point.lng).toFixed(6)}`)
      .join("|"),
    [mapPoints],
  );

  useEffect(() => {
    if (!mapPoints.length) {
      setSelectedPointKey("");
      return;
    }
    if (!mapPoints.some((point) => point.key === selectedPointKey)) {
      const preferredPoint = mapPoints.find((point) => point.type === "carrier")
        || mapPoints.find((point) => point.type === "store")
        || mapPoints[0];
      setSelectedPointKey(preferredPoint.key);
    }
  }, [mapPoints, selectedPointKey]);

  useEffect(() => {
    const currentMapPoints = mapPointsRef.current;
    if (!currentMapPoints.length || !mapElementRef.current) return;

    let cancelled = false;
    setMapLoading(true);
    setMapError("");

    loadGoogleMapsApi()
      .then(() => {
        if (cancelled) return;

        if (!mapRef.current) {
          mapRef.current = new window.google.maps.Map(mapElementRef.current, {
            center: BARCELOS_CENTER,
            zoom: 12,
            minZoom: 10,
            maxZoom: 18,
            mapTypeControl: true,
            streetViewControl: true,
            fullscreenControl: false,
            restriction: {
              latLngBounds: PORTUGAL_MAINLAND_BOUNDS,
              strictBounds: false,
            },
          });
        }

        const map = mapRef.current;
        markersRef.current.forEach((entry) => {
          entry.listeners?.forEach((listener) => window.google.maps.event.removeListener(listener));
          entry.marker.setMap(null);
        });
        markersRef.current = [];

        const bounds = new window.google.maps.LatLngBounds();
        const activeKey = selectedPointKey || currentMapPoints[0]?.key || "";

        currentMapPoints.forEach((point) => {
          const baseZIndex = point.type === "carrier" ? 220 : point.type === "order" ? 160 : 120;
          const isSelected = point.key === activeKey;
          const marker = new window.google.maps.Marker({
            map,
            position: { lat: Number(point.lat), lng: Number(point.lng) },
            title: buildPointTitle(point),
            icon: buildMarkerIcon(point, isSelected),
            zIndex: isSelected ? baseZIndex + 200 : baseZIndex,
          });

          const clickListener = marker.addListener("click", () => {
            setSelectedPointKey(point.key);
          });

          markersRef.current.push({
            key: point.key,
            marker,
            point,
            listeners: [clickListener],
          });

          bounds.extend(marker.getPosition());
        });

        if (currentMapPoints.length === 1) {
          map.setCenter({ lat: Number(currentMapPoints[0].lat), lng: Number(currentMapPoints[0].lng) });
          map.setZoom(14);
        } else {
          map.fitBounds(bounds, 48);
          window.google.maps.event.addListenerOnce(map, "idle", () => {
            const zoom = Number(map.getZoom() || 12);
            if (zoom < GEO_BOARD_MIN_ZOOM) map.setZoom(GEO_BOARD_MIN_ZOOM);
            if (zoom > GEO_BOARD_MAX_ZOOM) map.setZoom(GEO_BOARD_MAX_ZOOM);
          });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setMapError(error?.message || "Falha ao carregar Google Maps no Live Geo Board.");
      })
      .finally(() => {
        if (!cancelled) setMapLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mapPointsSignature, selectedPointKey]);

  useEffect(() => {
    if (!markersRef.current.length || !mapRef.current || !selectedPointKey) return;

    markersRef.current.forEach((entry) => {
      const isSelected = entry.key === selectedPointKey;
      const baseZIndex = entry.point.type === "carrier" ? 220 : entry.point.type === "order" ? 160 : 120;
      entry.marker.setIcon(buildMarkerIcon(entry.point, isSelected));
      entry.marker.setZIndex(isSelected ? baseZIndex + 200 : baseZIndex);
    });

    const selectedMarkerEntry = markersRef.current.find((entry) => entry.key === selectedPointKey);
    if (selectedMarkerEntry?.marker?.getPosition) {
      mapRef.current.panTo(selectedMarkerEntry.marker.getPosition());
    }
  }, [selectedPointKey]);

  // O Google Maps nao deteta sozinho quando o contentor muda de tamanho (o
  // toggle de fullscreen so muda CSS, nao remonta o mapa) -- tem de se pedir
  // explicitamente um "resize" e reajustar o enquadramento depois do CSS
  // aplicar o novo tamanho.
  useEffect(() => {
    if (!mapRef.current || typeof window === "undefined" || !window.google?.maps) return undefined;

    const map = mapRef.current;
    const timer = setTimeout(() => {
      window.google.maps.event.trigger(map, "resize");
      if (markersRef.current.length > 1) {
        const bounds = new window.google.maps.LatLngBounds();
        markersRef.current.forEach((entry) => bounds.extend(entry.marker.getPosition()));
        map.fitBounds(bounds, 48);
      } else if (markersRef.current.length === 1) {
        map.setCenter(markersRef.current[0].marker.getPosition());
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [isMapFullscreen]);

  useEffect(() => {
    if (!isMapFullscreen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsMapFullscreen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMapFullscreen]);

  const selectedMeta = selectedPoint?.type === "carrier"
    ? getCarrierMeta(
      resolveCarrierStatus(selectedPoint?.payload?.status, selectedPoint?.payload?.orderEstado),
    )
    : selectedPoint?.type === "order"
      ? getOrderPointMeta(selectedPoint.payload)
      : null;
  const selectedCarrierOrder = useMemo(() => {
    if (selectedPoint?.type !== "carrier") return null;

    const refs = collectCarrierOrderRefs(selectedPoint?.payload || {});
    for (const ref of refs) {
      const linkedOrder = ordersByReference.get(ref);
      if (linkedOrder) return linkedOrder;
    }

    const signature = buildDriverSignature(selectedPoint?.payload || {});
    if (!signature) return null;
    return (scopedOrders || []).find((order) => buildDriverSignature(order) === signature) || null;
  }, [ordersByReference, scopedOrders, selectedPoint]);

  const restaurantCarrierDistance = useMemo(() => {
    if (!isRestaurantMode || selectedPoint?.type !== "carrier") return null;
    const fallbackStore = effectiveRestaurantStoreId ? storesById.get(effectiveRestaurantStoreId) : null;
    const carrierStoreId = resolveCarrierStoreId(selectedPoint?.payload || {});
    const carrierStore = storesById.get(carrierStoreId) || fallbackStore;
    const storeLat = Number(carrierStore?.latitude ?? carrierStore?.lat);
    const storeLng = Number(carrierStore?.longitude ?? carrierStore?.lng);
    const carrierLat = Number(selectedPoint?.lat);
    const carrierLng = Number(selectedPoint?.lng);
    if (!Number.isFinite(storeLat) || !Number.isFinite(storeLng) || !Number.isFinite(carrierLat) || !Number.isFinite(carrierLng)) {
      return null;
    }
    return haversineDistanceKm({ lat: storeLat, lng: storeLng }, { lat: carrierLat, lng: carrierLng });
  }, [effectiveRestaurantStoreId, isRestaurantMode, selectedPoint, storesById]);

  const selectedCarrierEstado = useMemo(() => {
    if (selectedPoint?.type !== "carrier") return null;
    if (selectedCarrierOrder) return resolveBoardOrderEstado(selectedCarrierOrder);

    const payloadEstado = String(selectedPoint?.payload?.orderEstado || "").trim();
    if (!payloadEstado) return null;
    return resolveOrderEstadoInterno({ estado_interno: payloadEstado });
  }, [selectedCarrierOrder, selectedPoint]);

  if (!mapPoints.length && ordersTable.length === 0) {
    return (
      <div className="panel live-board">
        <h3>Live Geo Board</h3>
        <p className="muted">Sem coordenadas operacionais válidas (Portugal/Barcelos) para lojas, pedidos ou estafetas.</p>
      </div>
    );
  }

  if (!mapPoints.length) {
    return (
      <div className="panel live-board">
        <h3>Live Geo Board</h3>
        <p className="muted">Sem pontos válidos no mapa. Mantemos a tabela operacional ativa.</p>
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
                const estado = order?.estadoBoard || resolveBoardOrderEstado(order);
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

  return (
    <div className="panel live-board">
      <div className="live-board-header">
        <div>
          <h3>Live Geo Board</h3>
          <p className="muted">
            {isRestaurantMode
              ? "Mapa da loja com estafetas atribuídos em tempo real."
              : "Mapa operacional em tempo real com lojas, pedidos ativos e estafetas online."}
          </p>
          {typeof onOpenDetails === "function" ? (
            <button
              type="button"
              className="btn-dashboard small secondary"
              style={{ marginTop: "10px" }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenDetails();
              }}
            >
              {openDetailsLabel}
            </button>
          ) : null}
        </div>
        {selectedPoint ? (
          <div className="live-board-mini-card">
            {selectedPoint.type === "carrier" ? (
              <>
                <strong>{selectedPoint.payload?.name || `Estafeta ${selectedPoint.id}`}</strong>
                <p>{selectedMeta?.label || "Estafeta"}</p>
                <p>{selectedPoint.payload?.phone || "Sem telemóvel"}</p>
                <p>
                  Pedido em curso: {formatOrderId(
                    selectedCarrierOrder?.id
                    || selectedPoint.payload?.orderId,
                  )}
                </p>
                <p>
                  Estado do pedido: {selectedCarrierEstado ? getEstadoInternoLabelPt(selectedCarrierEstado) : "Sem sincronização"}
                </p>
                <p>Fonte localização: {selectedPoint.payload?.coordsSource === "carrier" ? "GPS live" : "Fallback operacional"}</p>
                {isRestaurantMode ? <p>Distancia loja: {formatDistanceLabel(restaurantCarrierDistance)}</p> : null}
              </>
            ) : null}
            {selectedPoint.type === "order" ? (
              <>
                <strong>{formatOrderId(selectedPoint.payload?.id)} - {selectedPoint.payload?.customer_nome || "Cliente"}</strong>
                <p>Pedido ativo</p>
                <p>{selectedPoint.payload?.address || selectedPoint.payload?.customer_address || "-"}</p>
                <p>Estado: {getEstadoInternoLabelPt(resolveBoardOrderEstado(selectedPoint.payload))}</p>
              </>
            ) : null}
            {selectedPoint.type === "store" ? (
              <>
                <strong>{selectedPoint.payload?.nome || `Loja ${selectedPoint.id}`}</strong>
                <p>Ponto de origem da loja</p>
                <p>ID loja: #{selectedPoint.id}</p>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {isMapFullscreen ? (
        <div className="geo-map-fullscreen-backdrop" onClick={() => setIsMapFullscreen(false)} />
      ) : null}
      <div className={`geo-canvas geo-canvas-live-map${isMapFullscreen ? " is-map-fullscreen" : ""}`}>
        {(mapLoading || mapError) ? (
          <div className="geo-map-overlay">
            <span>{mapLoading ? "A carregar mapa em tempo real..." : mapError}</span>
          </div>
        ) : null}
        <button
          type="button"
          className="geo-map-fullscreen-btn"
          onClick={() => setIsMapFullscreen((prev) => !prev)}
          title={isMapFullscreen ? "Fechar mapa em ecrã completo" : "Expandir mapa em ecrã completo"}
        >
          {isMapFullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
        </button>
        <div ref={mapElementRef} className="geo-map-target" />
      </div>

      <div className="geo-legend">
        <span><i className="dot store" /> Loja</span>
        <span><i className="dot warn" /> Pedido em preparação</span>
        <span><i className="dot ok" /> Pedido em rota</span>
        <span><i className="dot available" /> Estafeta disponível</span>
        <span><i className="dot pickup" /> Estafeta em recolha</span>
        <span><i className="dot delivery" /> Estafeta em entrega</span>
      </div>

      {!hideOrdersTable ? (
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
                const estado = order?.estadoBoard || resolveBoardOrderEstado(order);
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
      ) : null}
    </div>
  );
}

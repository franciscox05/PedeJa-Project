const BARCELOS_CENTER = Object.freeze({
  lat: 41.5388,
  lng: -8.6151,
});

// Escaloes de taxa no raio de entrega de Barcelos.
const BARCELOS_DELIVERY_TIERS = Object.freeze([
  { maxKm: 2, fee: 2.8 },
  { maxKm: 3, fee: 3.0 },
  { maxKm: 5, fee: 4.0 },
  { maxKm: 7, fee: 5.2 },
  { maxKm: 9, fee: 5.9 },
  { maxKm: 13, fee: 8.0 },
  { maxKm: 17, fee: 9.6 },
]);

const MAX_BARCELOS_RADIUS_KM = BARCELOS_DELIVERY_TIERS[BARCELOS_DELIVERY_TIERS.length - 1].maxKm;
const PORTUGAL_MAINLAND_BOUNDS = Object.freeze({
  north: 42.2,
  south: 36.8,
  east: -6.0,
  west: -9.6,
});

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function haversineDistanceKm(origin, destination) {
  const originLat = toFiniteNumber(origin?.lat);
  const originLng = toFiniteNumber(origin?.lng);
  const destinationLat = toFiniteNumber(destination?.lat);
  const destinationLng = toFiniteNumber(destination?.lng);

  if (originLat === null || originLng === null || destinationLat === null || destinationLng === null) {
    return null;
  }

  const earthRadiusKm = 6371;
  const deltaLat = toRadians(destinationLat - originLat);
  const deltaLng = toRadians(destinationLng - originLng);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2)
    + Math.cos(toRadians(originLat)) * Math.cos(toRadians(destinationLat))
    * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function resolveTier(distanceKm) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return null;
  return BARCELOS_DELIVERY_TIERS.find((tier) => distanceKm <= tier.maxKm) || null;
}

export function computeDeliveryQuoteByDistance(distanceKm) {
  if (!Number.isFinite(distanceKm)) {
    return {
      deliverable: false,
      fee: 0,
      distanceKm: null,
      tier: null,
      reason: "Nao foi possivel validar a distancia de entrega.",
    };
  }

  const tier = resolveTier(distanceKm);
  if (!tier) {
    return {
      deliverable: false,
      fee: 0,
      distanceKm,
      tier: null,
      reason: `Fora da zona de entrega. O limite atual e ${MAX_BARCELOS_RADIUS_KM} km.`,
    };
  }

  return {
    deliverable: true,
    fee: tier.fee,
    distanceKm,
    tier,
    reason: "",
  };
}

export function computeBarcelosDeliveryQuote({ lat, lng }) {
  const distanceKm = haversineDistanceKm(BARCELOS_CENTER, { lat, lng });
  return computeDeliveryQuoteByDistance(distanceKm);
}

export function formatDistanceKm(distanceKm) {
  if (!Number.isFinite(distanceKm)) return "-";
  return `${distanceKm.toFixed(2)} km`;
}

export function isInPortugalMainlandBounds(lat, lng) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return false;

  return (
    parsedLat <= PORTUGAL_MAINLAND_BOUNDS.north
    && parsedLat >= PORTUGAL_MAINLAND_BOUNDS.south
    && parsedLng <= PORTUGAL_MAINLAND_BOUNDS.east
    && parsedLng >= PORTUGAL_MAINLAND_BOUNDS.west
  );
}

export {
  BARCELOS_CENTER,
  BARCELOS_DELIVERY_TIERS,
  MAX_BARCELOS_RADIUS_KM,
  PORTUGAL_MAINLAND_BOUNDS,
};

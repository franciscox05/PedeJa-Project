export const BARCELOS_CENTER = Object.freeze({
  lat: 41.5388,
  lng: -8.6151,
});

export const BARCELOS_DELIVERY_TIERS = Object.freeze([
  { maxKm: 2, fee: 2.8 },
  { maxKm: 3, fee: 3.0 },
  { maxKm: 5, fee: 4.0 },
  { maxKm: 7, fee: 5.2 },
  { maxKm: 9, fee: 5.9 },
  { maxKm: 13, fee: 8.0 },
  { maxKm: 17, fee: 9.6 },
]);

export const MAX_BARCELOS_RADIUS_KM = BARCELOS_DELIVERY_TIERS[BARCELOS_DELIVERY_TIERS.length - 1].maxKm;

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineDistanceKm(
  origin: { lat: number; lng: number },
  destination: { lat: unknown; lng: unknown },
) {
  const destinationLat = toFiniteNumber(destination.lat);
  const destinationLng = toFiniteNumber(destination.lng);

  if (destinationLat === null || destinationLng === null) return null;

  const earthRadiusKm = 6371;
  const deltaLat = toRadians(destinationLat - origin.lat);
  const deltaLng = toRadians(destinationLng - origin.lng);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2)
    + Math.cos(toRadians(origin.lat)) * Math.cos(toRadians(destinationLat))
    * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function resolveTier(distanceKm: number | null) {
  if (!Number.isFinite(distanceKm) || (distanceKm as number) < 0) return null;
  return BARCELOS_DELIVERY_TIERS.find((tier) => (distanceKm as number) <= tier.maxKm) || null;
}

export function computeBarcelosDeliveryQuote(lat: unknown, lng: unknown) {
  const distanceKm = haversineDistanceKm(BARCELOS_CENTER, { lat, lng });
  return computeDeliveryQuoteByDistance(distanceKm);
}

export function computeDeliveryQuoteByDistance(distanceKm: number | null) {
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
      reason: `Fora da zona de entrega. Limite maximo: ${MAX_BARCELOS_RADIUS_KM} km.`,
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

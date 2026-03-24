export const BARCELOS_CENTER = Object.freeze({
  lat: 41.537678,
  lng: -8.616016,
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

export const DEFAULT_PER_KM_DELIVERY_CONFIG = Object.freeze({
  mode: "per_km",
  base_fee: 2.8,
  included_km: 2,
  extra_per_km: 0.5,
  max_km: 17,
});

export const MAX_BARCELOS_RADIUS_KM = BARCELOS_DELIVERY_TIERS[BARCELOS_DELIVERY_TIERS.length - 1].maxKm;

type DeliveryPricingConfig = {
  mode: "per_km";
  base_fee: number;
  included_km: number;
  extra_per_km: number;
  max_km: number;
};

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPositiveNumber(value: unknown, fallback: number, min = 0) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Number(parsed.toFixed(2));
}

function parseJsonObject(value: unknown) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function resolveTier(distanceKm: number | null) {
  if (!Number.isFinite(distanceKm) || (distanceKm as number) < 0) return null;
  return BARCELOS_DELIVERY_TIERS.find((tier) => (distanceKm as number) <= tier.maxKm) || null;
}

export function sanitizeDeliveryPricingConfig(rawConfig: unknown, fallbackBaseFee: unknown = null): DeliveryPricingConfig | null {
  const parsed = parseJsonObject(rawConfig);
  if (!parsed) return null;

  const baseFeeFallback = toPositiveNumber(
    fallbackBaseFee,
    DEFAULT_PER_KM_DELIVERY_CONFIG.base_fee,
    0,
  );
  const baseFee = toPositiveNumber(
    parsed.base_fee ?? parsed.min_fee ?? parsed.minimum_fee,
    baseFeeFallback,
    0,
  );
  const includedKm = toPositiveNumber(
    parsed.included_km ?? parsed.base_km ?? parsed.min_km,
    DEFAULT_PER_KM_DELIVERY_CONFIG.included_km,
    0,
  );
  const extraPerKm = toPositiveNumber(
    parsed.extra_per_km ?? parsed.extra_km_price ?? parsed.price_per_km,
    DEFAULT_PER_KM_DELIVERY_CONFIG.extra_per_km,
    0,
  );
  const maxKmRaw = toPositiveNumber(
    parsed.max_km ?? parsed.maximum_km ?? parsed.delivery_radius_km,
    DEFAULT_PER_KM_DELIVERY_CONFIG.max_km,
    0.1,
  );
  const maxKm = Number(Math.max(maxKmRaw, includedKm || 0).toFixed(2));

  return {
    mode: "per_km",
    base_fee: baseFee,
    included_km: includedKm,
    extra_per_km: extraPerKm,
    max_km: maxKm,
  };
}

export function resolveEffectiveDeliveryPricingConfig(
  storePricingConfig: unknown = null,
  globalPricingConfig: unknown = null,
  fallbackBaseFee: unknown = null,
): DeliveryPricingConfig | null {
  const storeConfig = sanitizeDeliveryPricingConfig(storePricingConfig, fallbackBaseFee);
  if (storeConfig) return storeConfig;

  const globalConfig = sanitizeDeliveryPricingConfig(globalPricingConfig, fallbackBaseFee);
  if (globalConfig) return globalConfig;

  return null;
}

export function resolveDeliveryPricingMaxKm(pricingConfig: unknown) {
  const config = sanitizeDeliveryPricingConfig(pricingConfig);
  return config?.max_km ?? MAX_BARCELOS_RADIUS_KM;
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

export function computeBarcelosDeliveryQuote(lat: unknown, lng: unknown, pricingConfig: unknown = null, fallbackBaseFee: unknown = null) {
  const distanceKm = haversineDistanceKm(BARCELOS_CENTER, { lat, lng });
  return computeDeliveryQuoteByDistance(distanceKm, pricingConfig, fallbackBaseFee);
}

export function computeDeliveryQuoteByDistance(distanceKm: number | null, pricingConfig: unknown = null, fallbackBaseFee: unknown = null) {
  if (!Number.isFinite(distanceKm)) {
    return {
      deliverable: false,
      fee: 0,
      distanceKm: null,
      tier: null,
      pricingModel: null,
      reason: "Nao foi possivel validar a distancia de entrega.",
    };
  }

  const config = sanitizeDeliveryPricingConfig(pricingConfig, fallbackBaseFee);
  if (!config) {
    const tier = resolveTier(distanceKm);
    if (!tier) {
      return {
        deliverable: false,
        fee: 0,
        distanceKm,
        tier: null,
        pricingModel: "legacy_tiers",
        reason: `Fora da zona de entrega. Limite maximo: ${MAX_BARCELOS_RADIUS_KM} km.`,
      };
    }

    return {
      deliverable: true,
      fee: tier.fee,
      distanceKm,
      tier,
      pricingModel: "legacy_tiers",
      reason: "",
    };
  }

  if ((distanceKm as number) > config.max_km) {
    return {
      deliverable: false,
      fee: 0,
      distanceKm,
      tier: null,
      pricingModel: "per_km",
      pricingConfig: config,
      reason: `Fora da zona de entrega. Limite maximo: ${config.max_km.toFixed(0)} km.`,
    };
  }

  const extraDistance = Math.max(0, (distanceKm as number) - config.included_km);
  const fee = Number((config.base_fee + (extraDistance * config.extra_per_km)).toFixed(2));

  return {
    deliverable: true,
    fee,
    distanceKm,
    tier: null,
    pricingModel: "per_km",
    pricingConfig: config,
    extraDistanceKm: Number(extraDistance.toFixed(2)),
    reason: "",
  };
}

const BARCELOS_CENTER = Object.freeze({
  lat: 41.537678,
  lng: -8.616016,
});

const BARCELOS_DELIVERY_TIERS = Object.freeze([
  { maxKm: 2, fee: 2.8 },
  { maxKm: 3, fee: 3.0 },
  { maxKm: 5, fee: 4.0 },
  { maxKm: 7, fee: 5.2 },
  { maxKm: 9, fee: 5.9 },
  { maxKm: 13, fee: 8.0 },
  { maxKm: 17, fee: 9.6 },
]);

const DEFAULT_PER_KM_DELIVERY_CONFIG = Object.freeze({
  mode: "per_km",
  base_fee: 2.8,
  included_km: 2,
  extra_per_km: 0.5,
  max_km: 17,
});

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

function toPositiveNumber(value, fallback, { min = 0 } = {}) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Number(parsed.toFixed(2));
}

function parseJsonObject(value) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function resolveLegacyTier(distanceKm) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return null;
  return BARCELOS_DELIVERY_TIERS.find((tier) => distanceKm <= tier.maxKm) || null;
}

export function sanitizeDeliveryPricingConfig(rawConfig, fallbackBaseFee = null) {
  const parsed = parseJsonObject(rawConfig);
  if (!parsed) return null;

  const baseFeeFallback = toPositiveNumber(
    fallbackBaseFee,
    DEFAULT_PER_KM_DELIVERY_CONFIG.base_fee,
    { min: 0 },
  );
  const baseFee = toPositiveNumber(
    parsed.base_fee ?? parsed.min_fee ?? parsed.minimum_fee,
    baseFeeFallback,
    { min: 0 },
  );
  const includedKm = toPositiveNumber(
    parsed.included_km ?? parsed.base_km ?? parsed.min_km,
    DEFAULT_PER_KM_DELIVERY_CONFIG.included_km,
    { min: 0 },
  );
  const extraPerKm = toPositiveNumber(
    parsed.extra_per_km ?? parsed.extra_km_price ?? parsed.price_per_km,
    DEFAULT_PER_KM_DELIVERY_CONFIG.extra_per_km,
    { min: 0 },
  );
  const maxKmRaw = toPositiveNumber(
    parsed.max_km ?? parsed.maximum_km ?? parsed.delivery_radius_km,
    DEFAULT_PER_KM_DELIVERY_CONFIG.max_km,
    { min: 0.1 },
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
  storePricingConfig = null,
  globalPricingConfig = null,
  fallbackBaseFee = null,
) {
  const storeConfig = sanitizeDeliveryPricingConfig(storePricingConfig, fallbackBaseFee);
  if (storeConfig) return storeConfig;

  const globalConfig = sanitizeDeliveryPricingConfig(globalPricingConfig, fallbackBaseFee);
  if (globalConfig) return globalConfig;

  return null;
}

export function resolveMinimumDeliveryFee(pricingConfig = null, fallbackBaseFee = null) {
  const config = sanitizeDeliveryPricingConfig(pricingConfig, fallbackBaseFee);
  if (config) return config.base_fee;

  const parsedFallback = toFiniteNumber(fallbackBaseFee);
  if (parsedFallback !== null && parsedFallback >= 0) {
    return Number(parsedFallback.toFixed(2));
  }

  return BARCELOS_DELIVERY_TIERS[0].fee;
}

export function resolveDeliveryPricingMaxKm(pricingConfig = null) {
  const config = sanitizeDeliveryPricingConfig(pricingConfig);
  return config?.max_km ?? MAX_BARCELOS_RADIUS_KM;
}

export function buildDeliveryPricingDistanceRings(pricingConfig = null) {
  const config = sanitizeDeliveryPricingConfig(pricingConfig);
  if (!config) {
    return BARCELOS_DELIVERY_TIERS.map((tier) => ({
      distanceKm: tier.maxKm,
      fee: tier.fee,
    }));
  }

  const distances = new Set([
    Number(config.included_km.toFixed(2)),
    Number(config.max_km.toFixed(2)),
  ]);

  const step = config.max_km <= 6 ? 1 : 2;
  let currentKm = Math.max(1, Math.ceil(config.included_km));
  while (currentKm < config.max_km) {
    distances.add(Number(currentKm.toFixed(2)));
    currentKm += step;
  }

  return Array.from(distances)
    .filter((distanceKm) => Number.isFinite(distanceKm) && distanceKm > 0 && distanceKm <= config.max_km)
    .sort((a, b) => a - b)
    .map((distanceKm) => ({
      distanceKm,
      fee: computeDeliveryQuoteByDistance(distanceKm, config).fee,
    }));
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

export function computeDeliveryQuoteByDistance(distanceKm, pricingConfig = null, fallbackBaseFee = null) {
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
    const tier = resolveLegacyTier(distanceKm);
    if (!tier) {
      return {
        deliverable: false,
        fee: 0,
        distanceKm,
        tier: null,
        pricingModel: "legacy_tiers",
        reason: `Fora da zona de entrega. O limite atual e ${MAX_BARCELOS_RADIUS_KM} km.`,
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

  if (distanceKm > config.max_km) {
    return {
      deliverable: false,
      fee: 0,
      distanceKm,
      tier: null,
      pricingModel: "per_km",
      pricingConfig: config,
      reason: `Fora da zona de entrega. O limite atual e ${config.max_km.toFixed(0)} km.`,
    };
  }

  const extraDistance = Math.max(0, distanceKm - config.included_km);
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

export function computeBarcelosDeliveryQuote({ lat, lng }, pricingConfig = null, fallbackBaseFee = null) {
  const distanceKm = haversineDistanceKm(BARCELOS_CENTER, { lat, lng });
  return computeDeliveryQuoteByDistance(distanceKm, pricingConfig, fallbackBaseFee);
}

export function formatDistanceKm(distanceKm) {
  if (!Number.isFinite(distanceKm)) return "-";
  return `${distanceKm.toFixed(2)} km`;
}

export function formatDeliveryFee(value) {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return "-";
  return `${parsed.toFixed(2)}EUR`;
}

export function describeDeliveryPricing(pricingConfig = null, fallbackBaseFee = null) {
  const config = sanitizeDeliveryPricingConfig(pricingConfig, fallbackBaseFee);
  if (!config) {
    return `Tabela base de Barcelos ate ${MAX_BARCELOS_RADIUS_KM} km.`;
  }

  return `Minimo ${config.base_fee.toFixed(2)}EUR ate ${config.included_km.toFixed(2)} km, +${config.extra_per_km.toFixed(2)}EUR/km ate ${config.max_km.toFixed(2)} km.`;
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
  DEFAULT_PER_KM_DELIVERY_CONFIG,
  MAX_BARCELOS_RADIUS_KM,
  PORTUGAL_MAINLAND_BOUNDS,
};

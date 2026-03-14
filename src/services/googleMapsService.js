import { isInPortugalMainlandBounds } from "./deliveryZoneService";

let googleMapsLoaderPromise = null;
const GOOGLE_MAPS_SCRIPT_ID = "google-maps-js-runtime";

function resolveApiKey() {
  return String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
}

function isGoogleReady() {
  return typeof window !== "undefined" && Boolean(window.google?.maps);
}

export function loadGoogleMapsApi() {
  if (isGoogleReady()) return Promise.resolve(window.google.maps);
  if (googleMapsLoaderPromise) return googleMapsLoaderPromise;

  googleMapsLoaderPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      reject(new Error("Google Maps so pode ser carregado no browser."));
      return;
    }

    const apiKey = resolveApiKey();
    if (!apiKey) {
      reject(new Error("Falta configurar VITE_GOOGLE_MAPS_API_KEY no frontend."));
      return;
    }

    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.google.maps));
      existingScript.addEventListener("error", () => reject(new Error("Falha ao carregar Google Maps.")));
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&language=pt-PT&region=PT`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!isGoogleReady()) {
        reject(new Error("Google Maps foi carregado, mas a API nao ficou disponivel."));
        return;
      }
      resolve(window.google.maps);
    };
    script.onerror = () => reject(new Error("Falha ao carregar Google Maps."));
    document.body.appendChild(script);
  }).catch((error) => {
    googleMapsLoaderPromise = null;
    throw error;
  });

  return googleMapsLoaderPromise;
}

function parseAddressComponents(components = []) {
  const byType = (type) => components.find((component) => component.types?.includes(type));
  const rua = byType("route")?.long_name || byType("sublocality")?.long_name || byType("neighborhood")?.long_name || "";
  const porta = byType("street_number")?.long_name || "";
  const codigoPostal = byType("postal_code")?.long_name || "";
  const cidade =
    byType("locality")?.long_name
    || byType("administrative_area_level_2")?.long_name
    || byType("administrative_area_level_1")?.long_name
    || "";

  return {
    rua: String(rua).trim(),
    porta: String(porta).trim(),
    codigo_postal: String(codigoPostal).trim(),
    cidade: String(cidade).trim(),
  };
}

export function geocodeCoordsWithGoogle(lat, lng) {
  return new Promise((resolve, reject) => {
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      reject(new Error("Coordenadas invalidas."));
      return;
    }

    if (!isInPortugalMainlandBounds(parsedLat, parsedLng)) {
      reject(new Error("Seleciona um ponto em Portugal Continental."));
      return;
    }

    loadGoogleMapsApi()
      .then(() => {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode(
          {
            location: { lat: parsedLat, lng: parsedLng },
            region: "PT",
          },
          (results, status) => {
            if (status !== "OK" || !Array.isArray(results) || !results.length) {
              reject(new Error("Nao foi possivel resolver a morada desse ponto."));
              return;
            }

            const first = results[0];
            const country = first.address_components?.find((component) => component.types?.includes("country"))?.short_name;
            if (country && country.toUpperCase() !== "PT") {
              reject(new Error("Seleciona um ponto em Portugal."));
              return;
            }

            resolve({
              address_line: first.formatted_address,
              place_id: first.place_id || null,
              lat: parsedLat,
              lng: parsedLng,
              ...parseAddressComponents(first.address_components),
            });
          },
        );
      })
      .catch(reject);
  });
}

export function geocodeAddressWithGoogle(addressLine) {
  return new Promise((resolve, reject) => {
    const normalized = String(addressLine || "").trim();
    if (!normalized) {
      reject(new Error("Morada invalida."));
      return;
    }

    loadGoogleMapsApi()
      .then(() => {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode(
          {
            address: normalized,
            region: "PT",
          },
          (results, status) => {
            if (status !== "OK" || !Array.isArray(results) || !results.length) {
              reject(new Error("Nao foi possivel geocodificar a morada."));
              return;
            }

            const first = results[0];
            const location = first.geometry?.location;
            const lat = location?.lat?.();
            const lng = location?.lng?.();
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              reject(new Error("Google Maps devolveu coordenadas invalidas."));
              return;
            }

            if (!isInPortugalMainlandBounds(lat, lng)) {
              reject(new Error("A morada tem de estar em Portugal Continental."));
              return;
            }

            resolve({
              address_line: first.formatted_address,
              place_id: first.place_id || null,
              lat,
              lng,
              ...parseAddressComponents(first.address_components),
            });
          },
        );
      })
      .catch(reject);
  });
}

export function getDrivingDistanceKm(origin, destination) {
  return new Promise((resolve, reject) => {
    const originLat = Number(origin?.lat);
    const originLng = Number(origin?.lng);
    const destinationLat = Number(destination?.lat);
    const destinationLng = Number(destination?.lng);

    if (
      !Number.isFinite(originLat)
      || !Number.isFinite(originLng)
      || !Number.isFinite(destinationLat)
      || !Number.isFinite(destinationLng)
    ) {
      reject(new Error("Coordenadas invalidas para calcular a distancia."));
      return;
    }

    loadGoogleMapsApi()
      .then(() => {
        const service = new window.google.maps.DistanceMatrixService();
        service.getDistanceMatrix(
          {
            origins: [{ lat: originLat, lng: originLng }],
            destinations: [{ lat: destinationLat, lng: destinationLng }],
            travelMode: window.google.maps.TravelMode.DRIVING,
            unitSystem: window.google.maps.UnitSystem.METRIC,
          },
          (response, status) => {
            if (status !== "OK") {
              reject(new Error(`Distance Matrix falhou (${status}).`));
              return;
            }

            const element = response?.rows?.[0]?.elements?.[0];
            if (!element || element.status !== "OK") {
              reject(new Error("Nao foi possivel calcular distancia de conducao para esta morada."));
              return;
            }

            const meters = Number(element.distance?.value);
            if (!Number.isFinite(meters)) {
              reject(new Error("Distancia de conducao invalida."));
              return;
            }

            resolve(meters / 1000);
          },
        );
      })
      .catch(reject);
  });
}

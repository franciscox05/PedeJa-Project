import { useEffect, useRef } from "react";
import { updateEstafetaLocation } from "../services/estafetaService";

const PING_INTERVAL_MS = 30000;

// Ping de localizacao periodico enquanto o estafeta estiver online, tal como
// o driver app do Base44 (30s, enableHighAccuracy:false para poupar bateria).
export function useEstafetaLocationPing(callerUserId, online) {
  const geoWatchOptions = useRef({ enableHighAccuracy: false, timeout: 5000, maximumAge: 20000 });

  useEffect(() => {
    if (!callerUserId || !online) return undefined;
    if (typeof navigator === "undefined" || !navigator.geolocation) return undefined;

    const pingLocation = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          updateEstafetaLocation(callerUserId, position.coords.latitude, position.coords.longitude).catch((error) => {
            console.error("useEstafetaLocationPing: falha ao atualizar localizacao", { error: error?.message });
          });
        },
        () => {
          // Geolocalizacao indisponivel/negada: nao bloqueia o resto da app.
        },
        geoWatchOptions.current,
      );
    };

    pingLocation();
    const intervalId = setInterval(pingLocation, PING_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [callerUserId, online]);
}

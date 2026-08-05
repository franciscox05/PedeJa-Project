import { useEffect, useRef, useState } from "react";
import { updateEstafetaLocation } from "../services/estafetaService";

const PING_INTERVAL_MS = 30000;

function resolveGeoErrorMessage(geoError) {
  if (geoError?.code === 1) {
    return "Permissão de localização negada. Ativa-a nas definições do navegador para o admin te conseguir acompanhar no mapa.";
  }
  if (geoError?.code === 2) {
    return "Localização indisponível neste momento (sinal fraco ou GPS desligado).";
  }
  if (geoError?.code === 3) {
    return "Pedido de localização demorou demasiado tempo. Vamos tentar novamente.";
  }
  return "Não foi possível obter a tua localização.";
}

const SUPPORTS_GEOLOCATION = typeof navigator !== "undefined" && Boolean(navigator.geolocation);

// Ping de localizacao periodico enquanto o estafeta estiver online, tal como
// o driver app do Base44 (30s, enableHighAccuracy:false para poupar bateria).
// Expoe o estado do ultimo pedido para a UI poder avisar o estafeta quando a
// localizacao falha -- antes falhava em silencio e o admin via uma posicao
// desatualizada sem ninguem perceber porque.
export function useEstafetaLocationPing(callerUserId, online) {
  const geoWatchOptions = useRef({ enableHighAccuracy: false, timeout: 5000, maximumAge: 20000 });
  const [pingState, setPingState] = useState({ status: "idle", errorMessage: "" });

  useEffect(() => {
    if (!callerUserId || !online || !SUPPORTS_GEOLOCATION) return undefined;

    const pingLocation = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          updateEstafetaLocation(callerUserId, position.coords.latitude, position.coords.longitude)
            .then(() => setPingState({ status: "ok", errorMessage: "" }))
            .catch((error) => {
              console.error("useEstafetaLocationPing: falha ao atualizar localizacao", { error: error?.message });
              setPingState({ status: "error", errorMessage: "Não foi possível enviar a tua localização ao servidor." });
            });
        },
        (geoError) => {
          setPingState({ status: "error", errorMessage: resolveGeoErrorMessage(geoError) });
        },
        geoWatchOptions.current,
      );
    };

    pingLocation();
    const intervalId = setInterval(pingLocation, PING_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [callerUserId, online]);

  const isActive = Boolean(callerUserId && online);
  if (!isActive) {
    return { status: "idle", errorMessage: "" };
  }
  if (!SUPPORTS_GEOLOCATION) {
    return { status: "error", errorMessage: "Este navegador não suporta partilha de localização." };
  }
  return pingState;
}

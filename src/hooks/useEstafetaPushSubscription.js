import { useCallback, useEffect, useState } from "react";
import { removeEstafetaPushSubscription, saveEstafetaPushSubscription } from "../services/estafetaService";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function isPushNotificationSupported() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && Boolean(VAPID_PUBLIC_KEY);
}

// Auto-servico de subscricao a notificacoes push para o estafeta. Pedir
// permissao exige um gesto do utilizador (botao), por isso nao subscreve
// sozinho ao carregar a pagina.
export function useEstafetaPushSubscription(callerUserId) {
  const [permission, setPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPushNotificationSupported()) return;

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("useEstafetaPushSubscription: falha ao registar service worker", { error: error?.message });
    });
  }, []);

  useEffect(() => {
    if (!isPushNotificationSupported()) return undefined;
    let cancelled = false;

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((existingSubscription) => {
        if (!cancelled) setSubscribed(Boolean(existingSubscription));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [callerUserId]);

  const subscribe = useCallback(async () => {
    if (!isPushNotificationSupported() || !callerUserId) return false;

    setBusy(true);
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") return false;

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      await saveEstafetaPushSubscription(callerUserId, subscription.toJSON());
      setSubscribed(true);
      return true;
    } catch (error) {
      console.error("useEstafetaPushSubscription: falha ao subscrever", { error: error?.message });
      return false;
    } finally {
      setBusy(false);
    }
  }, [callerUserId]);

  const unsubscribe = useCallback(async () => {
    if (!isPushNotificationSupported() || !callerUserId) return false;

    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await removeEstafetaPushSubscription(callerUserId, existing.endpoint);
        await existing.unsubscribe();
      }
      setSubscribed(false);
      return true;
    } catch (error) {
      console.error("useEstafetaPushSubscription: falha ao cancelar subscricao", { error: error?.message });
      return false;
    } finally {
      setBusy(false);
    }
  }, [callerUserId]);

  return { supported: isPushNotificationSupported(), permission, subscribed, busy, subscribe, unsubscribe };
}

import { useEffect, useRef } from "react";

// Toca um "beep" curto via Web Audio API (sem depender de nenhum ficheiro de
// audio) sempre que aparece um novo pedido pendente para o estafeta aceitar.
export function useEstafetaOrderAlert(pendingAssignmentId, soundEnabled) {
  const audioContextRef = useRef(null);
  const lastAlertedIdRef = useRef(null);

  useEffect(() => {
    if (!pendingAssignmentId || !soundEnabled) return;
    if (lastAlertedIdRef.current === pendingAssignmentId) return;
    lastAlertedIdRef.current = pendingAssignmentId;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") ctx.resume();

      [0, 0.28].forEach((delay) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.001, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.22);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(ctx.currentTime + delay);
        oscillator.stop(ctx.currentTime + delay + 0.24);
      });
    } catch (error) {
      console.error("useEstafetaOrderAlert: falha ao tocar alerta sonoro", { error: error?.message });
    }

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }
  }, [pendingAssignmentId, soundEnabled]);

  useEffect(() => {
    if (!pendingAssignmentId) {
      lastAlertedIdRef.current = null;
    }
  }, [pendingAssignmentId]);
}

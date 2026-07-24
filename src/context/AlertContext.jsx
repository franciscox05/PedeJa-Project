/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, X } from "lucide-react";

const AlertContext = createContext(null);

let alertIdCounter = 0;

// Alertas globais (erro/aviso) que aparecem sempre por cima de toda a app,
// centrados e com fundo esbatido -- ao contrario de um <p> de erro inline
// dentro de uma pagina/formulario, isto nunca fica escondido por scroll.
// Reservado a erros/avisos que precisam mesmo de interromper o utilizador;
// confirmacoes de sucesso continuam a usar o toast discreto (react-hot-toast).
export function AlertProvider({ children }) {
  const [alerts, setAlerts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback((type, message, options = {}) => {
    const cleanMessage = String(message || "").trim();
    if (!cleanMessage) return null;

    const id = ++alertIdCounter;
    const duration = options.duration ?? (type === "error" ? 9000 : 7000);

    setAlerts((prev) => [...prev, { id, type, message: cleanMessage }]);

    if (duration > 0) {
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    }

    return id;
  }, [dismiss]);

  const value = useMemo(() => ({
    showError: (message, options) => show("error", message, options),
    showWarning: (message, options) => show("warning", message, options),
    dismissAlert: dismiss,
  }), [show, dismiss]);

  return (
    <AlertContext.Provider value={value}>
      {children}
      {alerts.length > 0 ? (
        <div
          className="global-alert-backdrop"
          onClick={() => dismiss(alerts[alerts.length - 1].id)}
        >
          <div className="global-alert-stack">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                role="alert"
                className={`global-alert-card global-alert-card--${alert.type}`}
                onClick={(event) => event.stopPropagation()}
              >
                {alert.type === "error" ? (
                  <AlertCircle className="global-alert-icon" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="global-alert-icon" aria-hidden="true" />
                )}
                <p className="global-alert-message">{alert.message}</p>
                <button
                  type="button"
                  className="global-alert-close"
                  aria-label="Fechar aviso"
                  onClick={() => dismiss(alert.id)}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    throw new Error("useAlert deve ser usado dentro de um AlertProvider.");
  }
  return ctx;
}

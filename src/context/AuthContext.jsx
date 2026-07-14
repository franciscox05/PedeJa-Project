/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { loginAndBuildSession, refreshSessionFromStoredUser } from "../services/authSessionService";
import { resolveUserRole } from "../utils/roles";

const AuthContext = createContext();
const STORAGE_KEY = "pedeja_user";
const UPDATE_EVENT = "pedeja-user-updated";

function readStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistUser(user) {
  if (user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  window.dispatchEvent(new Event(UPDATE_EVENT));
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);

  useEffect(() => {
    // Mantém-se sincronizado com código legado que ainda lê/escreve
    // "pedeja_user" diretamente (ex: outras abas via evento "storage").
    const syncFromStorage = () => setUser(readStoredUser());
    window.addEventListener("storage", syncFromStorage);
    window.addEventListener(UPDATE_EVENT, syncFromStorage);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener(UPDATE_EVENT, syncFromStorage);
    };
  }, []);

  const login = useCallback(async ({ identifier, password }) => {
    const sessionUser = await loginAndBuildSession({ identifier, password });
    if (sessionUser) {
      persistUser(sessionUser);
      setUser(sessionUser);
    }
    return sessionUser;
  }, []);

  const logout = useCallback(() => {
    persistUser(null);
    setUser(null);
  }, []);

  const updateUser = useCallback((partialOrFull) => {
    setUser((prev) => {
      const next = { ...(prev || {}), ...(partialOrFull || {}) };
      persistUser(next);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    const stored = readStoredUser();
    if (!stored) return null;

    const refreshed = await refreshSessionFromStoredUser(stored);
    if (refreshed) {
      persistUser(refreshed);
      setUser(refreshed);
    }
    return refreshed;
  }, []);

  const role = resolveUserRole(user);

  const value = {
    user,
    role,
    isAuthenticated: Boolean(user),
    login,
    logout,
    updateUser,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de um <AuthProvider>.");
  }
  return context;
}

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/api";
import type { AuthUser } from "@shared/types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ mfaRequired: false } | { mfaRequired: true; challengeToken: string }>;
  verifyMfa: (challengeToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (tab: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<AuthUser>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    const timeoutMs = 30 * 60 * 1000;
    let timer = window.setTimeout(expireSession, timeoutMs);
    const resetTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(expireSession, timeoutMs);
    };
    async function expireSession() {
      await api.post("/auth/logout").catch(() => undefined);
      setUser(null);
    }
    const events = ["mousemove", "keydown", "click", "touchstart"] as const;
    events.forEach((event) => window.addEventListener(event, resetTimer));
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [user]);

  async function login(email: string, password: string) {
    const result = await api.post<
      | { id: number; email: string; name: string; permissions: string[] | null }
      | { mfaRequired: true; challengeToken: string }
    >(
      "/auth/login",
      { email, password }
    );
    if ("mfaRequired" in result) return result;
    const loggedUser = result;
    setUser({
      userId: loggedUser.id,
      email: loggedUser.email,
      name: loggedUser.name,
      permissions: loggedUser.permissions,
    });
    return { mfaRequired: false as const };
  }

  async function verifyMfa(challengeToken: string, code: string) {
    const loggedUser = await api.post<{ id: number; email: string; name: string; permissions: string[] | null }>(
      "/auth/mfa/verify",
      { challengeToken, code }
    );
    setUser({
      userId: loggedUser.id,
      email: loggedUser.email,
      name: loggedUser.name,
      permissions: loggedUser.permissions,
    });
  }

  async function logout() {
    await api.post("/auth/logout");
    setUser(null);
  }

  function can(tab: string) {
    return !user?.permissions || user.permissions.includes(tab);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyMfa, logout, can }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };

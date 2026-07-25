import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/api";
import type { AuthUser } from "@shared/types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
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

  async function login(email: string, password: string) {
    const loggedUser = await api.post<{ id: number; email: string; name: string; permissions: string[] | null }>(
      "/auth/login",
      { email, password }
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
    <AuthContext.Provider value={{ user, loading, login, logout, can }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };

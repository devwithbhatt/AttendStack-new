import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { api, extractErrorMessage, setOnAuthFailure, tokenStorage } from "../api/client";
import type { AuthUser, LoginResponse } from "../types";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(async () => {
    await tokenStorage.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    setOnAuthFailure(() => {
      setUser(null);
    });
  }, []);

  useEffect(() => {
    (async () => {
      const access = await tokenStorage.getAccess();
      if (!access) {
        setIsLoading(false);
        return;
      }
      try {
        const response = await api.get("/accounts/profile/");
        setUser(response.data);
      } catch {
        await tokenStorage.clear();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const response = await api.post<LoginResponse>("/accounts/login/", { email, password });
      const { access, refresh, user: loggedInUser } = response.data;
      await tokenStorage.setTokens(access, refresh);
      setUser(loggedInUser);
    } catch (err) {
      throw new Error(extractErrorMessage(err, "Login failed. Please check your credentials."));
    }
  }, []);

  const value = useMemo(() => ({ user, isLoading, login, logout }), [user, isLoading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

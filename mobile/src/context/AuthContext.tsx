import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { api, extractErrorMessage, setOnAuthFailure, tokenStorage } from "../api/client";
import type { AuthUser, LoginResponse, TwoFactorChallengeResponse } from "../types";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  pendingTwoFactorEmail: string | null;
  login: (email: string, password: string) => Promise<void>;
  verifyTwoFactorOtp: (otp: string) => Promise<void>;
  resendTwoFactorOtp: () => Promise<void>;
  cancelTwoFactor: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingTwoFactorEmail, setPendingTwoFactorEmail] = useState<string | null>(null);

  const logout = useCallback(async () => {
    await tokenStorage.clear();
    setUser(null);
    setPendingTwoFactorEmail(null);
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
      const response = await api.post<LoginResponse | TwoFactorChallengeResponse>("/accounts/login/", {
        email,
        password,
      });
      if ("requires_2fa" in response.data && response.data.requires_2fa) {
        setPendingTwoFactorEmail(response.data.email || email);
        return;
      }
      const { access, refresh, user: loggedInUser } = response.data as LoginResponse;
      await tokenStorage.setTokens(access, refresh);
      setUser(loggedInUser);
    } catch (err) {
      throw new Error(extractErrorMessage(err, "Login failed. Please check your credentials."));
    }
  }, []);

  const verifyTwoFactorOtp = useCallback(
    async (otp: string) => {
      if (!pendingTwoFactorEmail) {
        throw new Error("Your sign-in session expired. Please sign in again.");
      }
      try {
        const response = await api.post<LoginResponse>("/accounts/login/verify-otp/", {
          email: pendingTwoFactorEmail,
          otp,
        });
        const { access, refresh, user: loggedInUser } = response.data;
        await tokenStorage.setTokens(access, refresh);
        setUser(loggedInUser);
        setPendingTwoFactorEmail(null);
      } catch (err) {
        throw new Error(extractErrorMessage(err, "Unable to verify the code. Please try again."));
      }
    },
    [pendingTwoFactorEmail]
  );

  const resendTwoFactorOtp = useCallback(async () => {
    if (!pendingTwoFactorEmail) return;
    try {
      await api.post("/accounts/login/resend-otp/", { email: pendingTwoFactorEmail });
    } catch {
      // Same generic outcome regardless — never leak whether the email exists.
    }
  }, [pendingTwoFactorEmail]);

  const cancelTwoFactor = useCallback(() => {
    setPendingTwoFactorEmail(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      pendingTwoFactorEmail,
      login,
      verifyTwoFactorOtp,
      resendTwoFactorOtp,
      cancelTwoFactor,
      logout,
    }),
    [user, isLoading, pendingTwoFactorEmail, login, verifyTwoFactorOtp, resendTwoFactorOtp, cancelTwoFactor, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

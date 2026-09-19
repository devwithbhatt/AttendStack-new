import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "./AuthContext";
import type { CompanyBranding } from "../types";

interface BrandingContextValue {
  companyName: string | null;
  logoUrl: string | null;
}

const BrandingContext = createContext<BrandingContextValue>({ companyName: null, logoUrl: null });

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [branding, setBranding] = useState<CompanyBranding | null>(null);

  useEffect(() => {
    if (!user) {
      setBranding(null);
      return;
    }
    let cancelled = false;
    api
      .get<CompanyBranding>("/settings/")
      .then((res) => {
        if (!cancelled) setBranding(res.data);
      })
      .catch(() => {
        if (!cancelled) setBranding(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const value = useMemo(
    () => ({ companyName: branding?.company_name ?? null, logoUrl: branding?.company_logo ?? null }),
    [branding]
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}

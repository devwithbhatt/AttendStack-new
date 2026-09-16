"use client";

import { createContext, useContext, useState, ReactNode, useEffect } from "react";

export interface CompanyInfo {
  companyLogo: string | null;
  companyName: string | null;
  companyAddress: string | null;
  companyEmail: string | null;
  companyPhone: string | null;
  companyWebsite: string | null;
  registrationNumber: string | null;
  taxId: string | null;
  companyBankName: string | null;
  companyBankAccountNo: string | null;
  companyBankIfsc: string | null;
  companyBankBranch: string | null;
  companyUpiId: string | null;
  industry: string | null;
  currency: string | null;
  timezone: string | null;
}

interface BrandingContextType extends CompanyInfo {
  setCompanyLogo: (logo: string | null) => void;
  setCompanyName: (name: string | null) => void;
  setCompanyAddress: (address: string | null) => void;
  setCompanyEmail: (email: string | null) => void;
  setCompanyPhone: (phone: string | null) => void;
  setCompanyWebsite: (website: string | null) => void;
  setRegistrationNumber: (regNo: string | null) => void;
  setTaxId: (taxId: string | null) => void;
  refreshBranding: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export const BrandingProvider = ({ children }: { children: ReactNode }) => {
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyAddress, setCompanyAddress] = useState<string | null>(null);
  const [companyEmail, setCompanyEmail] = useState<string | null>(null);
  const [companyPhone, setCompanyPhone] = useState<string | null>(null);
  const [companyWebsite, setCompanyWebsite] = useState<string | null>(null);
  const [registrationNumber, setRegistrationNumber] = useState<string | null>(null);
  const [taxId, setTaxId] = useState<string | null>(null);
  const [companyBankName, setCompanyBankName] = useState<string | null>(null);
  const [companyBankAccountNo, setCompanyBankAccountNo] = useState<string | null>(null);
  const [companyBankIfsc, setCompanyBankIfsc] = useState<string | null>(null);
  const [companyBankBranch, setCompanyBankBranch] = useState<string | null>(null);
  const [companyUpiId, setCompanyUpiId] = useState<string | null>(null);
  const [industry, setIndustry] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string | null>("INR");
  const [timezone, setTimezone] = useState<string | null>("Asia/Kolkata");

  const fetchBranding = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_ENDPOINT;
      const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
      const response = await fetch(`${API_URL}/api/v1/settings/`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.company_logo !== undefined) setCompanyLogo(data.company_logo);
        if (data.company_name !== undefined) setCompanyName(data.company_name);
        if (data.company_address !== undefined) setCompanyAddress(data.company_address);
        if (data.company_email !== undefined) setCompanyEmail(data.company_email);
        if (data.company_phone !== undefined) setCompanyPhone(data.company_phone);
        if (data.company_website !== undefined) setCompanyWebsite(data.company_website);
        if (data.registration_number !== undefined) setRegistrationNumber(data.registration_number);
        if (data.tax_id !== undefined) setTaxId(data.tax_id);
        if (data.company_bank_name !== undefined) setCompanyBankName(data.company_bank_name);
        if (data.company_bank_account_no !== undefined) setCompanyBankAccountNo(data.company_bank_account_no);
        if (data.company_bank_ifsc !== undefined) setCompanyBankIfsc(data.company_bank_ifsc);
        if (data.company_bank_branch !== undefined) setCompanyBankBranch(data.company_bank_branch);
        if (data.company_upi_id !== undefined) setCompanyUpiId(data.company_upi_id);
        if (data.industry !== undefined) setIndustry(data.industry);
        if (data.currency !== undefined) setCurrency(data.currency);
        if (data.timezone !== undefined) setTimezone(data.timezone);
      }
    } catch (error) {
      console.error("Failed to fetch branding:", error);
    }
  };

  useEffect(() => {
    fetchBranding();
  }, []);

  return (
    <BrandingContext.Provider
      value={{
        companyLogo,
        setCompanyLogo,
        companyName,
        setCompanyName,
        companyAddress,
        setCompanyAddress,
        companyEmail,
        setCompanyEmail,
        companyPhone,
        setCompanyPhone,
        companyWebsite,
        setCompanyWebsite,
        registrationNumber,
        setRegistrationNumber,
        taxId,
        setTaxId,
        companyBankName,
        companyBankAccountNo,
        companyBankIfsc,
        companyBankBranch,
        companyUpiId,
        industry,
        currency,
        timezone,
        refreshBranding: fetchBranding,
      }}
    >
      {children}
    </BrandingContext.Provider>
  );
};

export const useBranding = () => {
  const context = useContext(BrandingContext);
  if (context === undefined) {
    throw new Error("useBranding must be used within a BrandingProvider");
  }
  return context;
};
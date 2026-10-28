"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";

export interface PortalAddress {
  id: string;
  label: string;
  placeName?: string | null;
  address: string;
  roomNumber?: string | null;
  district?: string;
  postalCode?: string | null;
  leaveWithJuristic: boolean;
  deliveryNote?: string | null;
  isPrimary: boolean;
}

export interface PortalCustomer {
  id: string;
  name: string;
  nickName?: string | null;
  phone: string;
  secondaryPhone?: string | null;
  email?: string | null;
  lineId?: string | null;
  whatsappId?: string | null;
  tier: string;
  isMember: boolean;
  memberId?: string | null;
  memberExpiryDate?: string | null;
  isVIP: boolean;
  creditBalance: number;
  brand: string;
  defaultAddress?: string | null;
  roomNo?: string | null;
  addresses: PortalAddress[];
}

export type PortalLang = "en" | "th";

interface CustomerAuthContextType {
  customer: PortalCustomer | null;
  token: string | null;
  isLoading: boolean;
  lang: PortalLang;
  setLang: (lang: PortalLang) => void;
  setAuthSession: (customer: PortalCustomer, token: string) => void;
  refreshCustomer: () => Promise<void>;
  logout: () => Promise<void>;
  portalFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

const CustomerAuthContext = createContext<CustomerAuthContextType>({
  customer: null,
  token: null,
  isLoading: true,
  lang: "en",
  setLang: () => {},
  setAuthSession: () => {},
  refreshCustomer: async () => {},
  logout: async () => {},
  portalFetch: async (url, init) => fetch(url, init),
});

export const useCustomerAuth = () => useContext(CustomerAuthContext);

const TOKEN_STORAGE_KEY = "tls_portal_token";
const CUSTOMER_STORAGE_KEY = "tls_portal_customer";
const LANG_STORAGE_KEY = "tls_portal_lang";

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [customer, setCustomer] = useState<PortalCustomer | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lang, setLangState] = useState<PortalLang>("en");

  const setLang = useCallback((nextLang: PortalLang) => {
    setLangState(nextLang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, nextLang);
    } catch {}
  }, []);

  const setAuthSession = useCallback((nextCustomer: PortalCustomer, nextToken: string) => {
    setCustomer(nextCustomer);
    setToken(nextToken);
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
      localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(nextCustomer));
    } catch {}
  }, []);

  const portalFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const savedToken =
        token || (typeof window !== "undefined" ? localStorage.getItem(TOKEN_STORAGE_KEY) : null);
      const headers = new Headers(init?.headers || {});
      if (savedToken && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${savedToken}`);
      }
      if (init?.body && typeof init.body === "string" && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      return fetch(url, {
        ...init,
        headers,
        credentials: "same-origin",
      });
    },
    [token]
  );

  const logout = useCallback(async () => {
    setCustomer(null);
    setToken(null);
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(CUSTOMER_STORAGE_KEY);
    } catch {}
    await fetch("/api/portal/auth", { method: "DELETE", credentials: "same-origin" }).catch(() => {});
    router.replace("/portal/login");
  }, [router]);

  const refreshCustomer = useCallback(async () => {
    try {
      const res = await portalFetch("/api/portal/auth", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data?.authenticated && data?.customer) {
          setCustomer(data.customer);
          try {
            localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(data.customer));
          } catch {}
          return;
        }
      }
      if (res.status === 401) {
        setCustomer(null);
        setToken(null);
        try {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          localStorage.removeItem(CUSTOMER_STORAGE_KEY);
        } catch {}
      }
    } catch (e) {
      console.error("Failed to refresh customer session", e);
    }
  }, [portalFetch]);

  useEffect(() => {
    try {
      const savedLang = localStorage.getItem(LANG_STORAGE_KEY) as PortalLang | null;
      if (savedLang === "en" || savedLang === "th") {
        setLangState(savedLang);
      }
      const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      const savedCust = localStorage.getItem(CUSTOMER_STORAGE_KEY);
      if (savedToken) setToken(savedToken);
      if (savedCust) {
        setCustomer(JSON.parse(savedCust));
      }
    } catch {}

    refreshCustomer().finally(() => {
      setIsLoading(false);
    });
  }, [refreshCustomer]);

  useEffect(() => {
    if (isLoading) return;
    const isLoginPage = pathname?.startsWith("/portal/login");
    if (!customer && !isLoginPage) {
      router.replace("/portal/login");
    }
  }, [customer, isLoading, pathname, router]);

  return (
    <CustomerAuthContext.Provider
      value={{
        customer,
        token,
        isLoading,
        lang,
        setLang,
        setAuthSession,
        refreshCustomer,
        logout,
        portalFetch,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

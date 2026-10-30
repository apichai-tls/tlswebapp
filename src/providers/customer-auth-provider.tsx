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
  portalEnabled: boolean;
  portalAllowed: boolean;
  isStaffPreview: boolean;
  enableStaffPreview: () => void;
  disableStaffPreview: () => void;
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
  portalEnabled: false,
  portalAllowed: false,
  isStaffPreview: false,
  enableStaffPreview: () => {},
  disableStaffPreview: () => {},
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
const PREVIEW_STORAGE_KEY = "tls_portal_preview";

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [customer, setCustomer] = useState<PortalCustomer | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [portalEnabled, setPortalEnabled] = useState(false);
  const [portalAllowed, setPortalAllowed] = useState(false);
  const [isStaffPreview, setIsStaffPreview] = useState(false);
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
      if (typeof window !== "undefined") {
        const previewPref = sessionStorage.getItem(PREVIEW_STORAGE_KEY);
        if (previewPref === "1") {
          headers.set("x-portal-preview", "1");
        }
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
      const data = await res.json().catch(() => ({}));

      if (typeof data?.portalEnabled === "boolean") {
        setPortalEnabled(data.portalEnabled);
      }

      if (data?.allowed === false) {
        setPortalAllowed(false);
        setIsStaffPreview(false);
        if (typeof window !== "undefined") {
          window.top
            ? (window.top.location.href = "/login")
            : window.location.replace("/login");
        }
        return;
      }

      setPortalAllowed(true);
      setIsStaffPreview(Boolean(data?.isStaffPreview));

      if (res.ok && data?.authenticated && data?.customer) {
        setCustomer(data.customer);
        try {
          localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(data.customer));
        } catch {}
        return;
      }

      if (res.status === 401 || (data?.allowed && data?.authenticated === false)) {
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

  const enableStaffPreview = useCallback(() => {
    try {
      sessionStorage.setItem(PREVIEW_STORAGE_KEY, "1");
      document.cookie = "tls_portal_preview=1; path=/; max-age=86400; SameSite=Lax";
    } catch {}
    setPortalAllowed(true);
    setIsStaffPreview(!portalEnabled);
    refreshCustomer();
  }, [portalEnabled, refreshCustomer]);

  const disableStaffPreview = useCallback(() => {
    try {
      sessionStorage.removeItem(PREVIEW_STORAGE_KEY);
      localStorage.removeItem(PREVIEW_STORAGE_KEY);
      document.cookie = "tls_portal_preview=; path=/; max-age=0; SameSite=Lax";
    } catch {}
    if (!portalEnabled) {
      setPortalAllowed(false);
      setIsStaffPreview(false);
      if (typeof window !== "undefined") {
        window.top
          ? (window.top.location.href = "/login")
          : window.location.replace("/login");
      }
    }
  }, [portalEnabled]);

  useEffect(() => {
    try {
      const savedLang = localStorage.getItem(LANG_STORAGE_KEY) as PortalLang | null;
      if (savedLang === "en" || savedLang === "th") {
        setLangState(savedLang);
      }

      // Clean up legacy localStorage preview flag so regular /portal visits redirect to /login when disabled
      localStorage.removeItem(PREVIEW_STORAGE_KEY);

      const params = new URLSearchParams(window.location.search);
      const previewParam = params.get("preview");
      if (previewParam === "1" || previewParam === "tls" || previewParam === "true") {
        sessionStorage.setItem(PREVIEW_STORAGE_KEY, "1");
        document.cookie = "tls_portal_preview=1; path=/; max-age=86400; SameSite=Lax";
      } else if (previewParam === "0" || previewParam === "public") {
        sessionStorage.removeItem(PREVIEW_STORAGE_KEY);
        document.cookie = "tls_portal_preview=; path=/; max-age=0; SameSite=Lax";
      } else if (sessionStorage.getItem(PREVIEW_STORAGE_KEY) !== "1") {
        document.cookie = "tls_portal_preview=; path=/; max-age=0; SameSite=Lax";
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
    if (isLoading || !portalAllowed) return;
    const isLoginPage = pathname?.startsWith("/portal/login");
    if (!customer && !isLoginPage) {
      router.replace("/portal/login");
    }
  }, [customer, isLoading, portalAllowed, pathname, router]);

  return (
    <CustomerAuthContext.Provider
      value={{
        customer,
        token,
        isLoading,
        portalEnabled,
        portalAllowed,
        isStaffPreview,
        enableStaffPreview,
        disableStaffPreview,
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

"use client";

import React, { createContext, useState, useContext, useEffect, useRef, useCallback, ReactNode } from 'react';
import { loginUser } from '@/actions/auth';
import { settingsStore } from '@/lib/store';

export interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  department?: string;
  isDepartmentHead?: boolean;
  permissions: string[];
  area?: string;
  branchId?: string | null;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password?: string) => Promise<User>;
  logout: () => Promise<void> | void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => ({ id: '', email: '', role: 'admin', permissions: [] }),
  logout: () => {},
  isLoading: true,
});

const CURRENT_BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || "";
const DEFAULT_TIMEOUT_MINUTES = 20;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isLoggingOutRef = useRef(false);

  const clearAuthStorage = useCallback(() => {
    localStorage.removeItem('authUser');
    localStorage.removeItem('lastLoginDate');
    localStorage.removeItem('authBuildTime');
    localStorage.removeItem('lastActivityAt');
    if (typeof document !== 'undefined') {
      document.cookie = 'tls_user_id=; path=/; max-age=0; SameSite=Lax';
    }
    if (typeof window !== 'undefined' && 'caches' in window) {
      window.caches
        .keys()
        .then((keys) => {
          for (const key of keys) {
            if (key.startsWith('tls-')) {
              window.caches.delete(key).catch(() => {});
            }
          }
        })
        .catch(() => {});
    }
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    clearAuthStorage();
    await fetch('/api/auth/login', { method: 'DELETE', keepalive: true, credentials: 'same-origin' }).catch(() => {});
  }, [clearAuthStorage]);

  const forceLogoutWithReason = useCallback(async (reason: 'new_deploy' | 'timeout') => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;
    await logout();
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      if (!currentPath.startsWith('/login')) {
        window.location.replace(`/login?reason=${reason}`);
      }
    }
  }, [logout]);

  // 1. Initial hydration from localStorage + build version & timeout check
  useEffect(() => {
    const savedUser = localStorage.getItem('authUser');
    const lastLoginDate = localStorage.getItem('lastLoginDate');
    const savedBuildTime = localStorage.getItem('authBuildTime');
    const lastActivityStr = localStorage.getItem('lastActivityAt');
    const today = new Date().toDateString();

    if (savedUser) {
      // Check 1: New day -> clear session
      if (lastLoginDate !== today) {
        clearAuthStorage();
        fetch('/api/auth/login', { method: 'DELETE', keepalive: true, credentials: 'same-origin' }).catch(() => {});
        setUser(null);
        setIsLoading(false);
        return;
      }

      // Check 2: Build version mismatch on page load (New deployment detected)
      if (CURRENT_BUILD_TIME && savedBuildTime && savedBuildTime !== CURRENT_BUILD_TIME) {
        setIsLoading(false);
        forceLogoutWithReason('new_deploy');
        return;
      }
      // If user had a legacy session before authBuildTime was introduced, stamp current build time or force re-login if production
      if (CURRENT_BUILD_TIME && !savedBuildTime) {
        localStorage.setItem('authBuildTime', CURRENT_BUILD_TIME);
      }

      // Check 3: Idle timeout already exceeded while tab was closed/inactive
      const configuredMinsStr =
        settingsStore.getSnapshot()?.sessionTimeoutMinutes ??
        localStorage.getItem('tls_session_timeout_mins') ??
        String(DEFAULT_TIMEOUT_MINUTES);
      const timeoutMins = Number(configuredMinsStr);
      const effectiveTimeoutMs = (!isNaN(timeoutMins) ? timeoutMins : DEFAULT_TIMEOUT_MINUTES) * 60 * 1000;

      if (effectiveTimeoutMs > 0 && lastActivityStr) {
        const lastActivity = Number(lastActivityStr);
        if (!isNaN(lastActivity) && Date.now() - lastActivity >= effectiveTimeoutMs) {
          setIsLoading(false);
          forceLogoutWithReason('timeout');
          return;
        }
      }

      try {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
        localStorage.setItem('lastActivityAt', String(Date.now()));
        if (parsed.sessionToken) {
          import('@/actions/auth').then(({ syncSessionCookieAction }) => {
            syncSessionCookieAction(parsed.sessionToken).catch(() => {});
          }).catch(() => {});
        }
        if (typeof document !== 'undefined') {
          document.cookie = 'tls_user_id=; path=/; max-age=0; SameSite=Lax';
        }
        const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
        if (currentPath !== '/' && !currentPath.startsWith('/login')) {
          import('@/lib/api').then(({ ensureDbLoaded, startRealtimeConnection }) => {
            ensureDbLoaded();
            startRealtimeConnection(false);
          }).catch(() => {});
        }
      } catch (e) {
        console.error("Failed to parse auth user", e);
        clearAuthStorage();
      }
    }
    setIsLoading(false);
  }, [clearAuthStorage, forceLogoutWithReason]);

  // 2. Active session monitoring: Idle Timeout + New Deployment Check
  useEffect(() => {
    if (!user) return;
    isLoggingOutRef.current = false;

    let lastRecorded = Date.now();
    if (!localStorage.getItem('lastActivityAt')) {
      localStorage.setItem('lastActivityAt', String(lastRecorded));
    }

    const updateActivity = () => {
      const now = Date.now();
      // Throttle localStorage writes to once every 5 seconds
      if (now - lastRecorded >= 5000) {
        lastRecorded = now;
        localStorage.setItem('lastActivityAt', String(now));
      }
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    activityEvents.forEach((evt) => window.addEventListener(evt, updateActivity, { passive: true }));

    // Sync logout or activity across browser tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'authUser' && !e.newValue) {
        setUser(null);
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.replace('/login');
        }
      } else if (e.key === 'lastActivityAt' && e.newValue) {
        lastRecorded = Number(e.newValue) || Date.now();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    const getTimeoutMs = () => {
      const sysSettings = settingsStore.getSnapshot();
      const fromStore = sysSettings?.sessionTimeoutMinutes;
      if (fromStore !== undefined && fromStore !== "") {
        localStorage.setItem('tls_session_timeout_mins', fromStore);
      }
      const raw = fromStore ?? localStorage.getItem('tls_session_timeout_mins') ?? String(DEFAULT_TIMEOUT_MINUTES);
      const parsed = Number(raw);
      const mins = !isNaN(parsed) && parsed >= 0 ? parsed : DEFAULT_TIMEOUT_MINUTES;
      return mins * 60 * 1000;
    };

    const checkIdleTimeout = () => {
      const timeoutMs = getTimeoutMs();
      if (timeoutMs <= 0) return false; // 0 = disabled
      const lastAct = Number(localStorage.getItem('lastActivityAt') || lastRecorded);
      if (Date.now() - lastAct >= timeoutMs) {
        forceLogoutWithReason('timeout');
        return true;
      }
      return false;
    };

    const checkDeployVersion = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const serverBuildTime = data?.buildTime;
        if (!serverBuildTime) return;

        const savedBuildTime = localStorage.getItem('authBuildTime') || CURRENT_BUILD_TIME;
        if (savedBuildTime && serverBuildTime !== savedBuildTime) {
          await forceLogoutWithReason('new_deploy');
        } else if (!localStorage.getItem('authBuildTime')) {
          localStorage.setItem('authBuildTime', serverBuildTime);
        }
      } catch {
        // Ignore transient network errors
      }
    };

    // Run immediate version check on mount
    checkDeployVersion();

    let tick = 0;
    const interval = setInterval(() => {
      if (checkIdleTimeout()) return;
      tick++;
      // Check server deployment version every 30s (every 2 ticks of 15s)
      if (tick % 2 === 0 && document.visibilityState !== 'hidden') {
        checkDeployVersion();
      }
    }, 15000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (!checkIdleTimeout()) {
          checkDeployVersion();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      activityEvents.forEach((evt) => window.removeEventListener(evt, updateActivity));
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, [user, forceLogoutWithReason]);

  const login = async (email: string, password?: string) => {
    let response: { success: boolean; user?: any; error?: string } | null = null;
    try {
      const apiRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      response = await apiRes.json();
    } catch {
      response = await loginUser(email, password);
    }

    if (!response || !response.success || !response.user) {
      throw new Error(response?.error || "Invalid email or password");
    }
    const userData = response.user;

    // Fetch latest server buildTime on login so authBuildTime is always accurate
    let buildTimeToSave = CURRENT_BUILD_TIME;
    try {
      const verRes = await fetch('/api/version', { cache: 'no-store' });
      if (verRes.ok) {
        const verData = await verRes.json();
        if (verData?.buildTime) buildTimeToSave = verData.buildTime;
      }
    } catch {
      // Fallback to CURRENT_BUILD_TIME
    }

    isLoggingOutRef.current = false;
    setUser(userData);
    localStorage.setItem('authUser', JSON.stringify(userData));
    localStorage.setItem('lastLoginDate', new Date().toDateString());
    localStorage.setItem('lastActivityAt', String(Date.now()));
    if (buildTimeToSave) {
      localStorage.setItem('authBuildTime', buildTimeToSave);
    }
    if (typeof document !== 'undefined') {
      document.cookie = 'tls_user_id=; path=/; max-age=0; SameSite=Lax';
    }

    return userData;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

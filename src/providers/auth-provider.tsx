"use client";

import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';

import { loginUser } from '@/actions/auth';


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
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async (email, password) => ({ id: '', email: '', role: 'admin', permissions: [] }),
  logout: () => {},
  isLoading: true,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Hydrate from localStorage on client side
    const savedUser = localStorage.getItem('authUser');
    const lastLoginDate = localStorage.getItem('lastLoginDate');
    const today = new Date().toDateString();

    if (savedUser && lastLoginDate === today) {
      try {
        const parsed = JSON.parse(savedUser);
        // eslint-disable-next-line
        setUser(parsed);
        if (typeof document !== 'undefined') {
          document.cookie = 'tls_user_id=; path=/; max-age=0; SameSite=Lax';
        }
        import('@/lib/api').then(({ startRealtimeConnection }) => startRealtimeConnection()).catch(() => {});
      } catch (e) {
        console.error("Failed to parse auth user", e);
      }
    } else if (savedUser && lastLoginDate !== today) {
      // Clear session if it's a new day
      localStorage.removeItem('authUser');
      localStorage.removeItem('lastLoginDate');
      if (typeof document !== 'undefined') {
        document.cookie = 'tls_user_id=; path=/; max-age=0; SameSite=Lax';
      }
      setUser(null);
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password?: string) => {
    // Authenticate Admin/Manager/CSO/Rider against DB via API route first so a signed server session is established.
    // NOTE: Server Actions don't work reliably in Capacitor WebView (APK),
    // so we use a regular API route first.
    let response: { success: boolean; user?: any; error?: string } | null = null;
    try {
      const apiRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      response = await apiRes.json();
    } catch {
      // Fallback to Server Action if fetch fails (e.g., in web browser context)
      response = await loginUser(email, password);
    }

    if (!response || !response.success || !response.user) {
      throw new Error(response?.error || "Invalid email or password");
    }
    const userData = response.user;
    
    setUser(userData);
    localStorage.setItem('authUser', JSON.stringify(userData));
    localStorage.setItem('lastLoginDate', new Date().toDateString());
    if (typeof document !== 'undefined') {
      document.cookie = 'tls_user_id=; path=/; max-age=0; SameSite=Lax';
    }
    import('@/lib/api').then(({ startRealtimeConnection }) => startRealtimeConnection(true)).catch(() => {});
    return userData;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('authUser');
    localStorage.removeItem('lastLoginDate');
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
    fetch('/api/auth/login', { method: 'DELETE' }).catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

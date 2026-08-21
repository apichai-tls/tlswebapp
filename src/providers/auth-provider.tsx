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
        // eslint-disable-next-line
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("Failed to parse auth user", e);
      }
    } else if (savedUser && lastLoginDate !== today) {
      // Clear session if it's a new day
      localStorage.removeItem('authUser');
      localStorage.removeItem('lastLoginDate');
      setUser(null);
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password?: string) => {
    // Check rider hardcoded first since riders are not in AdminUser table
    if (email.startsWith('rider')) {
      const users: Record<string, { role: 'rider', id: string, pass: string }> = {
        'rider1@tls.com': { role: 'rider', id: 'RIDER-01', pass: 'rider1234' },
        'rider2@tls.com': { role: 'rider', id: 'RIDER-02', pass: 'rider1234' },
        'rider3@tls.com': { role: 'rider', id: 'RIDER-03', pass: 'rider1234' },
        'rider4@tls.com': { role: 'rider', id: 'RIDER-04', pass: 'rider1234' },
      };
      const validUser = users[email.toLowerCase().trim()];
      if (validUser && password === validUser.pass) {
        const userData: User = { 
          email: email.toLowerCase().trim(), 
          role: validUser.role, 
          id: validUser.id,
          permissions: [] 
        };
        setUser(userData);
        localStorage.setItem('authUser', JSON.stringify(userData));
        localStorage.setItem('lastLoginDate', new Date().toDateString());
        return userData;
      }
    }

    // Authenticate Admin/Manager/CSO against DB via API route
    // NOTE: Server Actions don't work reliably in Capacitor WebView (APK),
    // so we use a regular API route instead.
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
    return userData;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('authUser');
    localStorage.removeItem('lastLoginDate');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

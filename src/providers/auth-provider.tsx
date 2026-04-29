"use client";

import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  role: 'admin' | 'rider' | 'manager';
}

interface AuthContextType {
  user: User | null;
  login: (email: string) => User;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => ({ id: '', email: '', role: 'admin' }),
  logout: () => {},
  isLoading: true,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Hydrate from localStorage on client side
    const savedUser = localStorage.getItem('authUser');
    if (savedUser) {
      try {
        // eslint-disable-next-line
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("Failed to parse auth user", e);
      }
    }
    setIsLoading(false);
  }, []);

  const login = (email: string) => {
    let role: 'admin' | 'rider' | 'manager' = 'admin';
    let id = 'admin_1';
    
    if (email.toLowerCase().startsWith('rider')) {
      role = 'rider';
      const match = email.match(/rider(\d+)/);
      id = match ? `RIDER-${match[1].padStart(2, '0')}` : 'RIDER-01';
    } else if (email.toLowerCase().startsWith('manager')) {
      role = 'manager';
      id = 'manager_1';
    }

    const userData: User = { email, role, id };
    setUser(userData);
    localStorage.setItem('authUser', JSON.stringify(userData));
    return userData;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('authUser');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

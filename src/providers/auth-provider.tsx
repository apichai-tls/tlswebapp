"use client";

import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  role: 'admin' | 'rider' | 'manager';
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password?: string) => User;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: (email, password) => ({ id: '', email: '', role: 'admin' }),
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

  const login = (email: string, password?: string) => {
    // Valid Users Database
    const users: Record<string, { role: 'admin' | 'manager' | 'rider', id: string, pass: string }> = {
      'admin@tls.com': { role: 'admin', id: 'admin_1', pass: 'admin1234' },
      'manager@tls.com': { role: 'manager', id: 'manager_1', pass: 'manager1234' },
      'rider1@tls.com': { role: 'rider', id: 'RIDER-01', pass: 'rider1234' },
      'rider2@tls.com': { role: 'rider', id: 'RIDER-02', pass: 'rider1234' },
      'rider3@tls.com': { role: 'rider', id: 'RIDER-03', pass: 'rider1234' },
      'rider4@tls.com': { role: 'rider', id: 'RIDER-04', pass: 'rider1234' },
    };

    const targetEmail = email.toLowerCase().trim();
    const validUser = users[targetEmail];

    if (!validUser) {
      throw new Error("Invalid email or password");
    }

    if (password && password !== validUser.pass) {
      throw new Error("Invalid email or password");
    }

    const userData: User = { 
      email: targetEmail, 
      role: validUser.role, 
      id: validUser.id 
    };
    
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

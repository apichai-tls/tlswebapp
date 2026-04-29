"use client";

import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';

interface StoreConfig {
  storeName: string;
  storeLogo: string | null;
  storeLocation: [number, number]; // [lat, lng]
}

interface StoreContextType extends StoreConfig {
  updateStoreConfig: (name?: string, logo?: string | null, location?: [number, number]) => void;
  isLoading: boolean;
}

const StoreContext = createContext<StoreContextType>({
  storeName: 'That Laundry Shop',
  storeLogo: null,
  storeLocation: [13.7417, 100.5526], // Default branch 1 coords
  updateStoreConfig: () => {},
  isLoading: true,
});

export const useStoreConfig = () => useContext(StoreContext);

export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const [storeName, setStoreName] = useState('That Laundry Shop');
  const [storeLogo, setStoreLogo] = useState<string | null>(null);
  const [storeLocation, setStoreLocation] = useState<[number, number]>([13.7417, 100.5526]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedName = localStorage.getItem('storeName');
    const savedLogo = localStorage.getItem('storeLogo');
    const savedLocation = localStorage.getItem('storeLocation');

    // eslint-disable-next-line
    if (savedName) setStoreName(savedName);
    // eslint-disable-next-line
    if (savedLogo) setStoreLogo(savedLogo);
    if (savedLocation) {
      try {
        // eslint-disable-next-line
        setStoreLocation(JSON.parse(savedLocation));
      } catch(_) {}
    }
    setIsLoading(false);
  }, []);

  const updateStoreConfig = (name?: string, logo?: string | null, location?: [number, number]) => {
    if (name) {
      setStoreName(name);
      localStorage.setItem('storeName', name);
    }
    if (logo !== undefined) {
      setStoreLogo(logo);
      if (logo) localStorage.setItem('storeLogo', logo);
      else localStorage.removeItem('storeLogo');
    }
    if (location) {
      setStoreLocation(location);
      localStorage.setItem('storeLocation', JSON.stringify(location));
    }
  };

  return (
    <StoreContext.Provider value={{ storeName, storeLogo, storeLocation, updateStoreConfig, isLoading }}>
      {children}
    </StoreContext.Provider>
  );
};

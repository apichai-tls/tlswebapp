'use client';

import { useState, useEffect, useCallback } from 'react';

export type ScreenFitMode = 'fit' | 'standard';

export interface FitScreenState {
  screenFit: ScreenFitMode;
  zoomLevel: number;
  toggleScreenFit: () => void;
  setScreenFit: (mode: ScreenFitMode) => void;
  setZoomLevel: (zoom: number) => void;
  resetScreenFit: () => void;
}

const STORAGE_KEY_FIT = 'tls_global_screen_fit';
const STORAGE_KEY_ZOOM = 'tls_global_zoom';

export function useFitScreen(): FitScreenState {
  const [screenFit, setScreenFitState] = useState<ScreenFitMode>('fit');
  const [zoomLevel, setZoomLevelState] = useState<number>(100);

  // Sync state with DOM and localStorage
  const applyState = useCallback((fit: ScreenFitMode, zoom: number) => {
    if (typeof window === 'undefined') return;

    // Apply data attribute on documentElement
    document.documentElement.setAttribute('data-screen-fit', fit);
    if (fit === 'fit') {
      document.body.classList.add('tls-fit-screen');
    } else {
      document.body.classList.remove('tls-fit-screen');
    }

    // Set CSS variable
    document.documentElement.style.setProperty('--tls-zoom', `${zoom}%`);

    // Sync legacy keys so admin-all-jobs and admin-crm remain synchronized
    localStorage.setItem(STORAGE_KEY_FIT, fit);
    localStorage.setItem('tls_crm_screen_fit', fit);
    localStorage.setItem('tls_kanban_screen_fit', fit);
    localStorage.setItem(STORAGE_KEY_ZOOM, String(zoom));
    localStorage.setItem('tls_kanban_zoom', String(zoom));
  }, []);

  // Initialize from storage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedFit = (localStorage.getItem(STORAGE_KEY_FIT) ||
      localStorage.getItem('tls_crm_screen_fit') ||
      localStorage.getItem('tls_kanban_screen_fit')) as ScreenFitMode | null;

    const savedZoom = localStorage.getItem(STORAGE_KEY_ZOOM) || localStorage.getItem('tls_kanban_zoom');

    const initialFit: ScreenFitMode = savedFit === 'standard' ? 'standard' : 'fit';
    const initialZoom = savedZoom ? Math.min(125, Math.max(75, parseInt(savedZoom, 10) || 100)) : 100;

    setScreenFitState(initialFit);
    setZoomLevelState(initialZoom);
    applyState(initialFit, initialZoom);

    // Listen to custom event across components in the same window
    const handleSyncEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        if (detail.fit && (detail.fit === 'fit' || detail.fit === 'standard')) {
          setScreenFitState(detail.fit);
        }
        if (typeof detail.zoom === 'number') {
          setZoomLevelState(detail.zoom);
        }
      }
    };

    window.addEventListener('tls-screen-fit-changed', handleSyncEvent);
    return () => {
      window.removeEventListener('tls-screen-fit-changed', handleSyncEvent);
    };
  }, [applyState]);

  const setScreenFit = useCallback(
    (mode: ScreenFitMode) => {
      setScreenFitState(mode);
      applyState(mode, zoomLevel);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('tls-screen-fit-changed', {
            detail: { fit: mode, zoom: zoomLevel },
          })
        );
      }
    },
    [applyState, zoomLevel]
  );

  const toggleScreenFit = useCallback(() => {
    const nextMode: ScreenFitMode = screenFit === 'fit' ? 'standard' : 'fit';
    setScreenFit(nextMode);
  }, [screenFit, setScreenFit]);

  const setZoomLevel = useCallback(
    (zoom: number) => {
      const clamped = Math.min(125, Math.max(75, zoom));
      setZoomLevelState(clamped);
      applyState(screenFit, clamped);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('tls-screen-fit-changed', {
            detail: { fit: screenFit, zoom: clamped },
          })
        );
      }
    },
    [applyState, screenFit]
  );

  const resetScreenFit = useCallback(() => {
    setScreenFitState('fit');
    setZoomLevelState(100);
    applyState('fit', 100);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('tls-screen-fit-changed', {
          detail: { fit: 'fit', zoom: 100 },
        })
      );
    }
  }, [applyState]);

  return {
    screenFit,
    zoomLevel,
    toggleScreenFit,
    setScreenFit,
    setZoomLevel,
    resetScreenFit,
  };
}

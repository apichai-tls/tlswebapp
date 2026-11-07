'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Minimize2, Maximize2, SlidersHorizontal, Monitor, RotateCcw } from 'lucide-react';
import { useFitScreen } from '@/lib/use-fit-screen';
import { toast } from 'sonner';

interface FitScreenToggleProps {
  className?: string;
  variant?: 'pill' | 'header' | 'compact';
  showSettings?: boolean;
}

export function FitScreenToggle({
  className = '',
  variant = 'header',
  showSettings = true,
}: FitScreenToggleProps) {
  const { screenFit, zoomLevel, toggleScreenFit, setScreenFit, setZoomLevel, resetScreenFit } =
    useFitScreen();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    if (popoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [popoverOpen]);

  const handleToggle = () => {
    const next = screenFit === 'fit' ? 'standard' : 'fit';
    toggleScreenFit();
    toast.success(
      next === 'fit'
        ? 'Fit Screen active: All pages formatted to fit screen (พอดีหน้าจอ)'
        : 'Standard layout active: Spacious scrollable layout (ขนาดปกติ)'
    );
  };

  const isFit = screenFit === 'fit';

  return (
    <div className={`relative inline-flex items-center shrink-0 ${className}`} ref={popoverRef}>
      <div className="inline-flex items-center rounded-xl p-0.5 bg-slate-100/90 border border-slate-200/90 gap-0.5 shadow-2xs">
        {/* Main 1-Click Toggle Button */}
        <button
          type="button"
          onClick={handleToggle}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
            isFit
              ? 'bg-indigo-600 text-white shadow-xs hover:bg-indigo-700'
              : 'bg-white text-slate-700 hover:text-slate-900 shadow-2xs hover:bg-slate-50 border border-slate-200/60'
          }`}
          title={
            isFit
              ? 'Fit Screen is active across all pages (Click for standard scrollable)'
              : 'Click to fit all pages to screen without page scroll (ย่อให้พอดีหน้าจอ)'
          }
        >
          {isFit ? (
            <Minimize2 size={13} className="shrink-0 text-white" />
          ) : (
            <Maximize2 size={13} className="shrink-0 text-slate-500" />
          )}
          <span className="leading-none">{isFit ? 'Fit Screen' : 'Expand'}</span>

          {isFit && <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />}

          {zoomLevel !== 100 && (
            <span
              className={`text-[9px] px-1 py-0 rounded font-black ${
                isFit ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {zoomLevel}%
            </span>
          )}
        </button>

        {/* Optional Zoom Settings Dropdown Trigger */}
        {showSettings && (
          <button
            type="button"
            onClick={() => setPopoverOpen((prev) => !prev)}
            className={`p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white/80 transition-colors cursor-pointer ${
              popoverOpen ? 'bg-white text-indigo-700 shadow-2xs font-bold' : ''
            }`}
            title="Screen Fit & Zoom Settings"
          >
            <SlidersHorizontal size={13} />
          </button>
        )}
      </div>

      {/* Popover Settings Panel */}
      {popoverOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 z-50 space-y-3.5 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-indigo-50 text-indigo-600">
                <Monitor size={14} />
              </span>
              <div>
                <div className="text-xs font-black text-slate-900">Screen Layout & Fit</div>
                <div className="text-[10px] text-slate-400">Universal display preference</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                resetScreenFit();
                toast.success('Screen settings reset to default');
              }}
              className="text-[11px] font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-1 cursor-pointer transition-colors"
              title="Reset to 100% Fit Screen"
            >
              <RotateCcw size={11} />
              <span>Reset</span>
            </button>
          </div>

          {/* Mode Switcher */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Display Mode (โหมดการแสดงผล)
            </label>
            <div className="grid grid-cols-2 gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200/70">
              <button
                type="button"
                onClick={() => {
                  setScreenFit('fit');
                  toast.success('Fit Screen enabled');
                }}
                className={`flex flex-col items-center justify-center py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  screenFit === 'fit'
                    ? 'bg-white text-indigo-700 shadow-2xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Minimize2 size={13} className="mb-0.5 text-indigo-600" />
                <span>Fit Screen</span>
                <span className="text-[9px] font-medium text-slate-400">No page scroll</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setScreenFit('standard');
                  toast.success('Standard layout enabled');
                }}
                className={`flex flex-col items-center justify-center py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  screenFit === 'standard'
                    ? 'bg-white text-indigo-700 shadow-2xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Maximize2 size={13} className="mb-0.5 text-slate-600" />
                <span>Standard</span>
                <span className="text-[9px] font-medium text-slate-400">Natural scroll</span>
              </button>
            </div>
          </div>

          {/* Zoom Presets */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
              <span>Zoom Scale (ย่อ-ขยาย)</span>
              <span className="text-indigo-600 font-extrabold">{zoomLevel}%</span>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {[85, 90, 95, 100, 105].map((z) => {
                const isSelected = zoomLevel === z;
                return (
                  <button
                    key={z}
                    type="button"
                    onClick={() => {
                      setZoomLevel(z);
                    }}
                    className={`py-1 text-center rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200/80 hover:bg-slate-100'
                    }`}
                  >
                    {z}%
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-[10px] text-slate-400 italic leading-snug pt-1 border-t border-slate-100">
            Tip: Automatically remembered across all pages, CRM tables, Kanban boards, and reports.
          </p>
        </div>
      )}
    </div>
  );
}

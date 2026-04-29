"use client";

import dynamic from "next/dynamic";

// Dynamically import map components with SSR disabled (Leaflet requires window)
export const FullMap = dynamic(
  () => import("@/components/map-component").then((mod) => mod.FullMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full w-full bg-slate-100 rounded-xl animate-pulse">
        <span className="text-sm text-slate-400">Loading map…</span>
      </div>
    ),
  }
);

export const MiniMap = dynamic(
  () => import("@/components/map-component").then((mod) => mod.MiniMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center bg-slate-100 rounded-lg animate-pulse" style={{ height: 180 }}>
        <span className="text-xs text-slate-400">Loading map…</span>
      </div>
    ),
  }
);

export const CreateJobMap = dynamic(
  () => import("@/components/create-job-map").then((mod) => mod.CreateJobMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full w-full bg-slate-100 rounded-xl animate-pulse">
        <span className="text-sm text-slate-400">Loading interactive map…</span>
      </div>
    ),
  }
);

export const AdminLiveMap = dynamic(
  () => import("@/components/admin-live-map").then((mod) => mod.AdminLiveMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full w-full bg-slate-100 rounded-xl animate-pulse">
        <span className="text-sm text-slate-400">Loading map…</span>
      </div>
    ),
  }
);

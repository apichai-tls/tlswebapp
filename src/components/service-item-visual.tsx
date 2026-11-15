"use client";

import React from "react";

interface ServiceItemVisualProps {
  name: string;
  category?: string | null;
  imageUrl?: string | null;
  selected?: boolean;
  sizeClass?: string;
}

type VisualKind =
  | "fold"
  | "hanger"
  | "iron"
  | "shirt"
  | "pants"
  | "dress"
  | "suit"
  | "towel"
  | "bedding"
  | "tie"
  | "sock"
  | "single_sock"
  | "shoe"
  | "delivery"
  | "wash";

function detectVisualKind(name: string, category?: string | null): VisualKind {
  const n = `${name || ""} ${category || ""}`.toUpperCase();

  if (n.includes("HANGER")) return "hanger";
  if (n.includes("FOLD")) return "fold";
  if (n.includes("DELIVERY") || n.includes("PICKUP") || n.includes("PICK UP")) return "delivery";
  if (n.includes("1-SIDE SOCK") || n.includes("1 SIDE SOCK") || n.includes("SINGLE SOCK") || n.includes("ข้างเดียว")) {
    return "single_sock";
  }
  if (n.includes("SOCK") || n.includes("ถุงเท้า")) return "sock";
  if (n.includes("SHOE") || n.includes("SNEAKER") || n.includes("BOOT") || n.includes("BAG")) return "shoe";
  if (n.includes("TIE") || n.includes("SCARF")) return "tie";
  if (n.includes("TOWEL") || n.includes("MAT")) return "towel";
  if (
    n.includes("BED") ||
    n.includes("BLANKET") ||
    n.includes("DUVET") ||
    n.includes("PILLOW") ||
    n.includes("SHEET") ||
    n.includes("QUILT") ||
    n.includes("CURTAIN") ||
    n.includes("COMFORTER")
  ) {
    return "bedding";
  }
  if (
    n.includes("SUIT") ||
    n.includes("COAT") ||
    n.includes("JACKET") ||
    n.includes("OVERCOAT") ||
    n.includes("BLAZER") ||
    n.includes("SWEATER") ||
    n.includes("VEST")
  ) {
    return "suit";
  }
  if (n.includes("DRESS") || n.includes("SKIRT") || n.includes("JUMPSUIT")) return "dress";
  if (
    n.includes("TROUSER") ||
    n.includes("PANT") ||
    n.includes("JEANS") ||
    n.includes("SLACK") ||
    n.includes("SHORT")
  ) {
    return "pants";
  }
  if (n.includes("SHIRT") || n.includes("POLO") || n.includes("BLOUSE") || n.includes("TEE")) return "shirt";
  if (n.includes("IRON")) return "iron";
  return "wash";
}

const BADGE_BG: Record<VisualKind, string> = {
  fold: "bg-sky-50 border-sky-200/80 text-sky-700",
  hanger: "bg-indigo-50 border-indigo-200/80 text-indigo-700",
  iron: "bg-amber-50 border-amber-200/80 text-amber-700",
  shirt: "bg-blue-50 border-blue-200/80 text-blue-700",
  pants: "bg-slate-100 border-slate-300/80 text-slate-700",
  dress: "bg-rose-50 border-rose-200/80 text-rose-600",
  suit: "bg-violet-50 border-violet-200/80 text-violet-700",
  towel: "bg-teal-50 border-teal-200/80 text-teal-700",
  bedding: "bg-cyan-50 border-cyan-200/80 text-cyan-700",
  tie: "bg-purple-50 border-purple-200/80 text-purple-700",
  sock: "bg-orange-50 border-orange-200/80 text-orange-700",
  single_sock: "bg-amber-50 border-amber-300/90 text-amber-800",
  shoe: "bg-orange-50 border-orange-200/80 text-orange-700",
  delivery: "bg-emerald-50 border-emerald-200/80 text-emerald-700",
  wash: "bg-indigo-50 border-indigo-200/80 text-indigo-600",
};

function renderIconSvg(kind: VisualKind) {
  switch (kind) {
    case "fold":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="7" width="22" height="5" rx="1.5" fill="currentColor" fillOpacity="0.15" />
          <rect x="5" y="14" width="22" height="5" rx="1.5" fill="currentColor" fillOpacity="0.25" />
          <rect x="5" y="21" width="22" height="5" rx="1.5" fill="currentColor" fillOpacity="0.15" />
        </svg>
      );
    case "hanger":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 9a2.5 2.5 0 1 1 2.2-3.7c.4.8-.2 1.7-1 2.2L16 8.5V11" />
          <path d="M16 11 4.5 18.5a1.5 1.5 0 0 0 .8 2.8h21.4a1.5 1.5 0 0 0 .8-2.8L16 11Z" fill="currentColor" fillOpacity="0.14" />
          <path d="M9 21.3v4.2h14v-4.2" />
        </svg>
      );
    case "iron":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11h11l3 5H7.5A4.5 4.5 0 0 0 3 20.5V22h25l-2-6" fill="currentColor" fillOpacity="0.15" />
          <path d="M3 22h25" />
          <path d="M9 11V8h8" />
          <path d="M10 25v1M15 25v1M20 25v1" />
        </svg>
      );
    case "shirt":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5l5 3 5-3 6 4-2.5 5-3.5-1.5V27H11V12.5L7.5 14 5 9l6-4Z" fill="currentColor" fillOpacity="0.16" />
        </svg>
      );
    case "pants":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5h14l2 22h-6l-3-13-3 13H7L9 5Z" fill="currentColor" fillOpacity="0.16" />
          <path d="M9 9h14" />
        </svg>
      );
    case "dress":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5l2 5-1 3-6 14h20l-6-14-1-3 2-5-5 2-5-2Z" fill="currentColor" fillOpacity="0.16" />
          <path d="M12 13h8" />
        </svg>
      );
    case "suit":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 5l6 4 6-4 5 4-2 6-3-1v13H10V14l-3 1-2-6 5-4Z" fill="currentColor" fillOpacity="0.16" />
          <path d="M16 9v18M12 6l4 7 4-7" />
        </svg>
      );
    case "towel":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 7h14a3 3 0 0 1 3 3v14H11V10a3 3 0 0 0-3-3Z" fill="currentColor" fillOpacity="0.16" />
          <path d="M8 7a3 3 0 0 0-3 3v9h6" />
          <path d="M11 20h14" />
        </svg>
      );
    case "bedding":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 17h24v7H4z" fill="currentColor" fillOpacity="0.16" />
          <path d="M4 10v16M28 14v12" />
          <rect x="7" y="12" width="7" height="5" rx="1.5" />
          <path d="M14 14h11a3 3 0 0 1 3 3" />
        </svg>
      );
    case "tie":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 5h6l-1.5 4h-3L13 5Z" fill="currentColor" fillOpacity="0.2" />
          <path d="M14.5 9l-2.5 13 4 5 4-5-2.5-13h-3Z" fill="currentColor" fillOpacity="0.15" />
        </svg>
      );
    case "sock":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6h6v10l-3.5 3.5a3 3 0 0 1-4.2-4.2L9 13.5V6Z" fill="currentColor" fillOpacity="0.16" />
          <path d="M18 8h6v10l-3.5 3.5a3 3 0 0 1-4.2-4.2L18 15.5V8Z" fill="currentColor" fillOpacity="0.22" />
        </svg>
      );
    case "single_sock":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 6h7v11l-4.5 4.5a3.5 3.5 0 0 1-5-5L13 14V6Z" fill="currentColor" fillOpacity="0.2" />
          <path d="M13 9h7" />
          <text x="23" y="13" fontSize="9" fontWeight="bold" fill="currentColor" stroke="none">1</text>
        </svg>
      );
    case "shoe":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 20V11l5 3 4-4 5 6h5a3 3 0 0 1 3 3v3H5v-2Z" fill="currentColor" fillOpacity="0.16" />
          <path d="M5 22h22" />
        </svg>
      );
    case "delivery":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="9" width="15" height="12" rx="1.5" fill="currentColor" fillOpacity="0.16" />
          <path d="M18 13h6l3 4v4h-9v-8Z" fill="currentColor" fillOpacity="0.1" />
          <circle cx="9" cy="23" r="2.5" />
          <circle cx="22" cy="23" r="2.5" />
        </svg>
      );
    case "wash":
    default:
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="5" width="22" height="22" rx="3" fill="currentColor" fillOpacity="0.12" />
          <path d="M5 10h22" />
          <circle cx="16" cy="18.5" r="5" fill="currentColor" fillOpacity="0.16" />
          <path d="M13 18.5c1-1.2 2-1.2 3 0s2 1.2 3 0" />
        </svg>
      );
  }
}

export function ServiceItemVisual({
  name,
  category,
  imageUrl,
  selected = false,
  sizeClass = "w-10 h-10",
}: ServiceItemVisualProps) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={`${sizeClass} rounded-lg object-cover shrink-0 border ${
          selected ? "border-white/60 bg-white" : "border-slate-200 bg-white"
        }`}
      />
    );
  }

  const kind = detectVisualKind(name, category);
  const paletteClass = selected
    ? "bg-white/95 border-white/80 text-indigo-700"
    : BADGE_BG[kind];

  return (
    <div
      className={`${sizeClass} rounded-lg border flex items-center justify-center shrink-0 ${paletteClass}`}
      aria-hidden="true"
    >
      {renderIconSvg(kind)}
    </div>
  );
}

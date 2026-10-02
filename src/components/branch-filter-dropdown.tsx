"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Store, ChevronDown, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface BranchOption {
  id: string;
  name: string;
  area?: string | null;
  branchCode?: string | null;
  isMain?: boolean;
}

export const UNASSIGNED_BRANCH_ID = "UNASSIGNED";

interface BranchFilterDropdownProps {
  branches: BranchOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  includeUnassigned?: boolean;
  className?: string;
  triggerClassName?: string;
  placeholder?: string;
  align?: "left" | "right";
}

/**
 * Strips prefix brand names and parentheses so only the clean branch name remains.
 * E.g. "That Laundry Shop (Phattanakarn)" -> "Phattanakarn"
 * E.g. "That Laundry Shop (Pattaya)" -> "Pattaya"
 * E.g. "That Laundry Shop (15 Sukhumvit Residences)" -> "15 Sukhumvit Residences"
 */
export function getCleanBranchName(name?: string | null): string {
  if (!name || name === "-") return "-";
  // Matches "That Laundry Shop (15 Sukhumvit Residences)" or any "... (Branch Name)"
  const parenMatch = name.match(/\(([^)]+)\)/);
  if (parenMatch && parenMatch[1]?.trim()) {
    return parenMatch[1].trim();
  }
  // Matches "That Laundry Shop - Branch Name"
  const dashParts = name.split(/[-–—]/);
  if (dashParts.length > 1 && /that\s*laundry\s*shop|tls/i.test(dashParts[0])) {
    return dashParts.slice(1).join("-").trim();
  }
  // Strip "That Laundry Shop" or "TLS" prefix
  const stripped = name.replace(/^(that\s*laundry\s*shop|tls)\s*[:—–-]?\s*/i, "").trim();
  return stripped || name;
}

export function BranchFilterDropdown({
  branches,
  selectedIds,
  onChange,
  includeUnassigned = false,
  className = "",
  triggerClassName = "",
  placeholder = "All Branches",
  align = "left",
}: BranchFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // All possible selectable IDs
  const allSelectableIds = useMemo(() => {
    const ids = branches.map((b) => b.id);
    if (includeUnassigned) {
      ids.push(UNASSIGNED_BRANCH_ID);
    }
    return ids;
  }, [branches, includeUnassigned]);

  // Check if every branch is currently selected
  const isAllSelected = useMemo(() => {
    if (allSelectableIds.length === 0) return false;
    return allSelectableIds.every((id) => selectedIds.includes(id));
  }, [allSelectableIds, selectedIds]);

  const isNoneSelected = selectedIds.length === 0;

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Toggle single branch
  const toggleBranch = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  // Toggle Select All
  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      onChange([]);
    } else {
      onChange([...allSelectableIds]);
    }
  };

  // Trigger button label display
  const triggerLabel = useMemo(() => {
    if (isAllSelected) {
      return (
        <span className="flex items-center gap-1.5 truncate">
          <span>{placeholder}</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-slate-100 text-slate-600">
            {branches.length}
          </span>
        </span>
      );
    }
    if (selectedIds.length === 1) {
      const singleId = selectedIds[0];
      if (singleId === UNASSIGNED_BRANCH_ID) {
        return <span className="truncate">ไม่ระบุสาขา (Unassigned)</span>;
      }
      const b = branches.find((item) => item.id === singleId);
      if (b) {
        return <span className="truncate font-semibold">{getCleanBranchName(b.name)}</span>;
      }
    }
    if (selectedIds.length > 1) {
      return (
        <span className="flex items-center gap-1.5 truncate">
          <span>{selectedIds.length} สาขา</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-700">
            {selectedIds.length}
          </span>
        </span>
      );
    }
    return <span className="text-slate-400">เลือกสาขา (None)</span>;
  }, [isAllSelected, selectedIds, branches, placeholder]);

  return (
    <div className={`relative inline-block text-left ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`h-10 text-xs border border-slate-200 rounded-md px-3 bg-white font-bold flex items-center justify-between gap-2.5 shadow-xs hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-slate-700 transition-all ${triggerClassName}`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Store size={15} className="text-slate-400 shrink-0" />
          <div className="truncate max-w-[190px] text-left">{triggerLabel}</div>
        </div>
        <ChevronDown
          size={14}
          className={`text-slate-400 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-indigo-600" : ""
          }`}
        />
      </button>

      {/* Excel-style Dropdown Panel */}
      {isOpen && (
        <div
          className={`absolute ${
            align === "right" ? "right-0" : "left-0"
          } mt-1.5 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100 select-none`}
        >
          {/* Header Bar: Select All Checkbox & Quick Clear */}
          <div className="px-3 pb-2 border-b border-slate-100 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={handleToggleSelectAll}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span className="text-xs font-black text-slate-800 group-hover:text-indigo-600 transition-colors">
                (Select All / เลือกทั้งหมด)
              </span>
            </label>

            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[11px] font-bold text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Branch List */}
          <div className="max-h-60 overflow-y-auto py-1 px-1 space-y-0.5">
            {branches.map((b) => {
              const isChecked = selectedIds.includes(b.id);
              const cleanName = getCleanBranchName(b.name);

              return (
                <label
                  key={b.id}
                  onClick={() => toggleBranch(b.id)}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    isChecked
                      ? "bg-indigo-50/70 text-slate-900"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}} // handled by label onClick
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                  />
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="truncate text-slate-800 font-semibold">{cleanName}</span>
                  </div>
                </label>
              );
            })}

            {/* Optional: Unassigned Branch Row */}
            {includeUnassigned && (
              <>
                <div className="my-1 border-t border-slate-100" />
                <label
                  onClick={() => toggleBranch(UNASSIGNED_BRANCH_ID)}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    selectedIds.includes(UNASSIGNED_BRANCH_ID)
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(UNASSIGNED_BRANCH_ID)}
                    onChange={() => {}}
                    className="w-4 h-4 rounded border-slate-300 text-slate-600 focus:ring-slate-500 cursor-pointer shrink-0"
                  />
                  <div className="flex items-center gap-1.5 flex-1 min-w-0 text-slate-500">
                    <span className="truncate italic">ไม่ระบุสาขา (Unassigned)</span>
                  </div>
                </label>
              </>
            )}
          </div>

          {/* Footer Bar: Selected summary */}
          <div className="px-3 pt-2 mt-1 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
            <span>
              เลือก {selectedIds.length} จาก {allSelectableIds.length} สาขา
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-indigo-600 font-bold hover:underline cursor-pointer"
            >
              ตกลง (Done)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Resolves the branch IDs assigned to a user based on user.branchId and user.area
 */
export function getUserAssignedBranchIds(
  user?: { area?: string | null; branchId?: string | null } | null,
  branches: BranchOption[] = []
): string[] {
  if (!user) return branches.map((b) => b.id);

  if ((!user.area && !user.branchId) || user.area === "ALL") {
    return branches.map((b) => b.id);
  }

  const ids = new Set<string>();

  if (user.branchId && branches.some((b) => b.id === user.branchId)) {
    ids.add(user.branchId);
  }

  if (user.area) {
    const parts = user.area.split(",").map((p) => p.trim());
    for (const part of parts) {
      if (branches.some((b) => b.id === part)) {
        ids.add(part);
      } else if (part.toUpperCase() === "BKK") {
        branches
          .filter((b) => (b.area || "BKK").toUpperCase() === "BKK")
          .forEach((b) => ids.add(b.id));
      } else if (part.toUpperCase() === "PTY") {
        branches
          .filter((b) => (b.area || "").toUpperCase() === "PTY")
          .forEach((b) => ids.add(b.id));
      }
    }
  }

  return ids.size > 0 ? Array.from(ids) : branches.map((b) => b.id);
}

/**
 * Renders an informative badge for user's assigned branch/area
 */
export function UserBranchBadge({
  user,
  branches = [],
}: {
  user?: { area?: string | null; branchId?: string | null } | null;
  branches: BranchOption[];
}) {
  if (!user || (!user.area && !user.branchId) || user.area === "ALL") {
    return (
      <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-slate-100 text-slate-600 border border-slate-200">
        ทุกสาขา (All)
      </span>
    );
  }

  if (user.area === "BKK") {
    return (
      <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-200">
        BKK ทุกสาขา
      </span>
    );
  }

  if (user.area === "PTY") {
    return (
      <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-amber-50 text-amber-700 border border-amber-200">
        PTY ทุกสาขา
      </span>
    );
  }

  const ids = getUserAssignedBranchIds(user, branches);

  if (ids.length >= branches.length && branches.length > 0) {
    return (
      <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-slate-100 text-slate-600 border border-slate-200">
        ทุกสาขา (All)
      </span>
    );
  }

  if (ids.length === 1) {
    const branch = branches.find((b) => b.id === ids[0]);
    if (branch) {
      return (
        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
          {getCleanBranchName(branch.name)}
        </span>
      );
    }
  }

  if (ids.length > 1) {
    const matchedNames = branches
      .filter((b) => ids.includes(b.id))
      .map((b) => getCleanBranchName(b.name))
      .join(", ");
    return (
      <span
        title={matchedNames}
        className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 cursor-help"
      >
        {ids.length} สาขา
      </span>
    );
  }

  return (
    <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-slate-100 text-slate-500 border border-slate-200">
      {user.area || "-"}
    </span>
  );
}


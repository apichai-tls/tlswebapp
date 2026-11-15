"use client";

import React, { Suspense, use } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import {
  ItemCheckDepartmentStation,
  type DedicatedDepartmentSlug,
} from "@/app/item-check/page";

const VALID_DEPARTMENTS: DedicatedDepartmentSlug[] = [
  "checker",
  "washing",
  "ironing",
  "delivery-prep",
];

export default function DedicatedDepartmentPage({
  params,
}: {
  params: Promise<{ department: string }>;
}) {
  const resolved = use(params);
  const rawSlug = (resolved?.department || "").toLowerCase() as DedicatedDepartmentSlug;
  const fixedDepartment: DedicatedDepartmentSlug = VALID_DEPARTMENTS.includes(rawSlug)
    ? rawSlug
    : "checker";

  return (
    <ProtectedRoute allowedRole="non-rider">
      <Suspense
        fallback={
          <div className="h-[100dvh] flex items-center justify-center bg-slate-50 text-sm font-bold text-slate-500">
            Loading Department Workspace...
          </div>
        }
      >
        <ItemCheckDepartmentStation fixedDepartment={fixedDepartment} />
      </Suspense>
    </ProtectedRoute>
  );
}

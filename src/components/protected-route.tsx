"use client";

import { useAuth } from "@/providers/auth-provider";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({
  children,
  allowedRole,
}: {
  children: React.ReactNode;
  allowedRole?: string | string[];
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isRoleAllowed = (role?: string) => {
    if (!allowedRole || !role) return true;
    const roles = Array.isArray(allowedRole) ? allowedRole : [allowedRole];
    if (roles.includes("non-rider") || roles.includes("staff") || roles.includes("admin")) {
      // If allowed roles represent office/staff/admin, allow any non-rider role
      if (role !== "rider") return true;
    }
    return roles.includes(role);
  };

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        // Redirect to login and save the attempted URL
        router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
      } else {
        // Check if running in a native platform (BILL APK context)
        import("@capacitor/core")
          .then(({ Capacitor }) => {
            if (Capacitor.isNativePlatform() && user.role !== "rider") {
              // BILL APK isolation: Force the user to only view the billing page
              if (pathname !== "/billing") {
                router.push("/billing");
              }
            } else if (allowedRole && !isRoleAllowed(user.role)) {
              // Role mismatch, send them to their proper dashboard
              router.push(user.role === "rider" ? "/rider" : "/admin");
            }
          })
          .catch(() => {
            if (allowedRole && !isRoleAllowed(user.role)) {
              router.push(user.role === "rider" ? "/rider" : "/admin");
            }
          });
      }
    }
  }, [user, isLoading, router, pathname, allowedRole]);

  // While checking auth status, show a minimal loading spinner
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="animate-spin text-slate-300" size={32} />
      </div>
    );
  }

  // If not logged in, or role mismatch, render nothing while redirect happens
  if (!user) return null;
  if (allowedRole && !isRoleAllowed(user.role)) return null;

  return <>{children}</>;
}

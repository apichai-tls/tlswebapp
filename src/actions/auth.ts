"use server";

import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword } from "@/lib/crypto";
import { signStaffSessionToken } from "@/lib/server-auth";

export async function loginUser(email: string, password?: string) {
  try {
    const targetEmail = email.toLowerCase().trim();
    
    const user = await prisma.adminUser.findUnique({
      where: { email: targetEmail }
    });

    if (!user) {
      const riderAccounts: Record<string, { id: string; pass: string }> = {
        "rider1@tls.com": { id: "RIDER-01", pass: process.env.RIDER_DEFAULT_PASSWORD || "rider1234" },
        "rider2@tls.com": { id: "RIDER-02", pass: process.env.RIDER_DEFAULT_PASSWORD || "rider1234" },
        "rider3@tls.com": { id: "RIDER-03", pass: process.env.RIDER_DEFAULT_PASSWORD || "rider1234" },
        "rider4@tls.com": { id: "RIDER-04", pass: process.env.RIDER_DEFAULT_PASSWORD || "rider1234" },
      };
      const matchedRider = riderAccounts[targetEmail];
      if (matchedRider && password === matchedRider.pass) {
        const dbRider = await prisma.rider.findUnique({ where: { id: matchedRider.id } });
        if (dbRider && dbRider.isActive === false) {
          return { success: false, error: "This rider account has been deactivated" };
        }
        const sessionToken = signStaffSessionToken({
          id: matchedRider.id,
          email: targetEmail,
          role: "rider",
          branchId: dbRider?.branchId || null,
          area: null,
        });
        try {
          const { cookies } = await import("next/headers");
          const cookieStore = await cookies();
          cookieStore.set("tls_session", sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 18,
          });
        } catch {}
        return {
          success: true,
          user: {
            id: matchedRider.id,
            email: targetEmail,
            name: dbRider?.name || matchedRider.id,
            role: "rider",
            permissions: [],
            branchId: dbRider?.branchId || null,
            sessionToken,
          }
        };
      }

      return { success: false, error: "Invalid email or password" };
    }

    if (user.isActive === false) {
      return { success: false, error: "This account has been deactivated (Resigned)" };
    }

    if (!password) {
      return { success: false, error: "Invalid email or password" };
    }

    const { isValid, shouldRehash } = verifyPassword(password, user.password);
    if (!isValid) {
      return { success: false, error: "Invalid email or password" };
    }

    // Lazy migration: Auto-hash plain text password on successful login
    if (shouldRehash) {
      try {
        await prisma.adminUser.update({
          where: { id: user.id },
          data: { password: hashPassword(password) }
        });
      } catch (e) {
        console.error("Failed to rehash password for user during lazy migration:", e);
      }
    }

    let permissionsArray: string[] = [];
    try {
      permissionsArray = JSON.parse(user.permissions || "[]");
    } catch (e) {
      permissionsArray = [];
    }

    const sessionToken = signStaffSessionToken({
      id: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId || null,
      area: user.area || null,
    });

    try {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      cookieStore.set("tls_session", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 18,
      });
    } catch {
      // Ignore when invoked outside request cookie context
    }

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department || undefined,
        isDepartmentHead: user.isDepartmentHead ?? false,
        permissions: permissionsArray,
        area: user.area || undefined,
        branchId: user.branchId || null,
        sessionToken,
      }
    };
  } catch (error: any) {
    console.error("Login error:", error);
    return { success: false, error: error.message || "Internal server error during login" };
  }
}

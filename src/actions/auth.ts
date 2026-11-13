"use server";

import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword } from "@/lib/crypto";
import {
  signStaffSessionToken,
  verifyStaffSessionToken,
  isTokenRevoked,
  invalidateServerAuthCache,
  assertServerActionAuthorized,
  resolveServerActionUser,
  revokeSessionToken,
  revokeAllUserSessions
} from "@/lib/server-auth";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";

export async function loginUser(email: string, password?: string) {
  try {
    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return { success: false, error: "Email and password are required" };
    }

    const targetEmail = email.toLowerCase().trim();

    let clientIp = "unknown";
    try {
      const { headers } = await import("next/headers");
      const h = await headers();
      const xff = h.get("x-forwarded-for");
      if (xff) clientIp = xff.split(",")[0].trim() || "unknown";
    } catch {}

    const ipLimit = checkRateLimit(`sa-login:ip:${clientIp}`, 20, 15 * 60 * 1000);
    if (!ipLimit.allowed) {
      return { success: false, error: "Too many login attempts. Please try again later." };
    }
    const acctLimit = checkRateLimit(`sa-login:acct:${targetEmail}:${clientIp}`, 10, 15 * 60 * 1000);
    if (!acctLimit.allowed) {
      return { success: false, error: "Too many failed login attempts for this account. Please try again later." };
    }

    const user = await prisma.adminUser.findUnique({
      where: { email: targetEmail }
    });

    if (!user) {
      return { success: false, error: "Invalid email or password" };
    }

    if (user.isActive === false) {
      return { success: false, error: "This account has been deactivated (Resigned)" };
    }

    const { isValid, shouldRehash } = verifyPassword(password, user.password);
    if (!isValid) {
      return { success: false, error: "Invalid email or password" };
    }

    resetRateLimit(`sa-login:acct:${targetEmail}:${clientIp}`);

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
    } catch {
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

/**
 * Reauthenticates the current user by verifying their currentPassword
 * before allowing sensitive account updates (like changing password).
 */
export async function changePasswordWithReauthAction(params: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const authUser = await assertServerActionAuthorized();

    if (!params.currentPassword || !params.newPassword) {
      return { success: false, error: "Current password and new password are required" };
    }

    if (params.newPassword.length < 6) {
      return { success: false, error: "New password must be at least 6 characters long" };
    }

    const dbUser = await prisma.adminUser.findUnique({
      where: { id: authUser.id }
    });

    if (!dbUser || dbUser.isActive === false) {
      return { success: false, error: "Account not found or has been deactivated" };
    }

    const { isValid } = verifyPassword(params.currentPassword, dbUser.password);
    if (!isValid) {
      return { success: false, error: "Current password verification failed" };
    }

    await prisma.adminUser.update({
      where: { id: dbUser.id },
      data: { password: hashPassword(params.newPassword) }
    });

    await revokeAllUserSessions(dbUser.id);
    invalidateServerAuthCache(dbUser.id);

    // Issue a fresh session token after revoking prior sessions
    const freshToken = signStaffSessionToken({
      id: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
      branchId: dbUser.branchId || null,
      area: dbUser.area || null,
    });
    try {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      cookieStore.set("tls_session", freshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 18,
      });
    } catch {}

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to change password" };
  }
}

export async function logoutUserAction() {
  try {
    const { user } = await resolveServerActionUser();
    const { cookies, headers } = await import("next/headers");
    const cookieStore = await cookies();
    const headerStore = await headers();
    const authHeader = headerStore.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    const sessionToken = bearerToken || cookieStore.get("tls_session")?.value || null;

    await revokeSessionToken(sessionToken, user?.id || null);
    cookieStore.delete("tls_session");
    cookieStore.delete("tls_user_id");
  } catch {}
  return { success: true };
}

export async function syncSessionCookieAction(token: string): Promise<{ success: boolean }> {
  try {
    const verified = verifyStaffSessionToken(token);
    if (verified?.id && !isTokenRevoked(token, verified)) {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      cookieStore.set("tls_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 18,
      });
      return { success: true };
    }
  } catch {}
  return { success: false };
}

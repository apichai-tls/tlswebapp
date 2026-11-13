import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword } from "@/lib/crypto";
import { signStaffSessionToken, invalidateServerAuthCache, revokeSessionToken, resolveRequestUser } from "@/lib/server-auth";
import { setRiderOfflineOnLogout } from "@/lib/rider-presence";
import { checkRateLimit, resetRateLimit, getRequestClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const clientIp = getRequestClientIp(req);
    const ipLimit = checkRateLimit(`staff-login:ip:${clientIp}`, 20, 15 * 60 * 1000);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many login attempts. Please wait a few minutes and try again." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } }
      );
    }

    const { email, password } = await req.json();

    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ success: false, error: "Email and password are required" }, { status: 400 });
    }

    const targetEmail = email.toLowerCase().trim();
    const accountLimit = checkRateLimit(`staff-login:acct:${targetEmail}:${clientIp}`, 10, 15 * 60 * 1000);
    if (!accountLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many failed login attempts for this account. Please try again later." },
        { status: 429, headers: { "Retry-After": String(accountLimit.retryAfterSeconds) } }
      );
    }

    const user = await prisma.adminUser.findUnique({
      where: { email: targetEmail },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "Invalid email or password" }, { status: 401 });
    }

    if (user.isActive === false) {
      return NextResponse.json({ success: false, error: "This account has been deactivated (Resigned)" }, { status: 403 });
    }

    const { isValid, shouldRehash } = verifyPassword(password, user.password);
    if (!isValid) {
      return NextResponse.json({ success: false, error: "Invalid email or password" }, { status: 401 });
    }

    resetRateLimit(`staff-login:acct:${targetEmail}:${clientIp}`);

    // Lazy migration: Auto-hash plain text password on successful API login
    if (shouldRehash) {
      try {
        await prisma.adminUser.update({
          where: { id: user.id },
          data: { password: hashPassword(password) }
        });
      } catch (e) {
        console.error("Failed to rehash password for user during lazy migration in API:", e);
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

    invalidateServerAuthCache(user.id);

    const res = NextResponse.json({
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
      },
    });

    res.cookies.set("tls_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 18,
    });

    return res;
  } catch (error: any) {
    console.error("API login error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    const cookieToken = req.cookies.get("tls_session")?.value || null;
    const token = bearerToken || cookieToken;

    const { user } = await resolveRequestUser(req);
    const verifiedUserId = user?.id || null;

    if (token || verifiedUserId) {
      await revokeSessionToken(token, verifiedUserId);
    }

    // Only mark Rider as offline when authenticated via a verified session token
    if (verifiedUserId) {
      await setRiderOfflineOnLogout(verifiedUserId);
    }

    const res = NextResponse.json({ success: true });
    res.cookies.set("tls_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    res.cookies.set("tls_user_id", "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
    });
    return res;
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to log out" }, { status: 500 });
  }
}

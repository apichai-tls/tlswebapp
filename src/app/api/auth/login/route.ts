import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword } from "@/lib/crypto";
import { signStaffSessionToken } from "@/lib/server-auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email) {
      return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 });
    }

    const targetEmail = email.toLowerCase().trim();

    const user = await prisma.adminUser.findUnique({
      where: { email: targetEmail },
    });

    if (!user) {
      // Support built-in Rider accounts on server side so riders get server-signed session & HttpOnly cookie
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
          return NextResponse.json({ success: false, error: "This rider account has been deactivated" }, { status: 403 });
        }
        const sessionToken = signStaffSessionToken({
          id: matchedRider.id,
          email: targetEmail,
          role: "rider",
          branchId: dbRider?.branchId || null,
          area: null,
        });
        const res = NextResponse.json({
          success: true,
          user: {
            id: matchedRider.id,
            email: targetEmail,
            name: dbRider?.name || matchedRider.id,
            role: "rider",
            permissions: [],
            branchId: dbRider?.branchId || null,
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
      }

      return NextResponse.json({ success: false, error: "Invalid email or password" }, { status: 401 });
    }

    if (user.isActive === false) {
      return NextResponse.json({ success: false, error: "This account has been deactivated (Resigned)" }, { status: 403 });
    }

    if (!password) {
      return NextResponse.json({ success: false, error: "Invalid email or password" }, { status: 401 });
    }

    const { isValid, shouldRehash } = verifyPassword(password, user.password);
    if (!isValid) {
      return NextResponse.json({ success: false, error: "Invalid email or password" }, { status: 401 });
    }

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
      maxAge: 60 * 60 * 18, // 18 hours
    });

    return res;
  } catch (error: any) {
    console.error("Login API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set("tls_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword } from "@/lib/crypto";

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
      return NextResponse.json({ success: false, error: "Invalid email or password" }, { status: 401 });
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

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: permissionsArray,
        area: user.area || undefined,
        branchId: user.branchId || null
      },
    });
  } catch (error: any) {
    console.error("Login API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

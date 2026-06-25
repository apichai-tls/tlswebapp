import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

    if (!password || password !== user.password) {
      return NextResponse.json({ success: false, error: "Invalid email or password" }, { status: 401 });
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

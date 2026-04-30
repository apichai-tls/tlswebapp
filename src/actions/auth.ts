"use server";

import { prisma } from "@/lib/prisma";

export async function loginUser(email: string, password?: string) {
  try {
    const targetEmail = email.toLowerCase().trim();
    
    const user = await prisma.adminUser.findUnique({
      where: { email: targetEmail }
    });

    if (!user) {
      return { success: false, error: "Invalid email or password" };
    }

    if (!password || password !== user.password) {
      return { success: false, error: "Invalid email or password" };
    }

    let permissionsArray: string[] = [];
    try {
      permissionsArray = JSON.parse(user.permissions || "[]");
    } catch (e) {
      permissionsArray = [];
    }

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as "admin" | "manager" | "cso" | "staff",
        permissions: permissionsArray
      }
    };
  } catch (error: any) {
    console.error("Login error:", error);
    return { success: false, error: error.message || "Internal server error during login" };
  }
}

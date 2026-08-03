"use server";

import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword } from "@/lib/crypto";

export async function loginUser(email: string, password?: string) {
  try {
    const targetEmail = email.toLowerCase().trim();
    
    const user = await prisma.adminUser.findUnique({
      where: { email: targetEmail }
    });

    if (!user) {
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

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as "admin" | "manager" | "cso" | "staff",
        permissions: permissionsArray,
        area: user.area || undefined
      }
    };
  } catch (error: any) {
    console.error("Login error:", error);
    return { success: false, error: error.message || "Internal server error during login" };
  }
}

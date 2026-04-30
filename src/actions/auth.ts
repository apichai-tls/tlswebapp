"use server";

import { prisma } from "@/lib/prisma";

export async function loginUser(email: string, password?: string) {
  const targetEmail = email.toLowerCase().trim();
  
  const user = await prisma.adminUser.findUnique({
    where: { email: targetEmail }
  });

  if (!user) {
    throw new Error("Invalid email or password");
  }

  // In a real production app with high security requirements, you'd use bcrypt to compare hashes here.
  // For this internal tool, we're using plain text passwords as requested to allow admins to easily see/manage them.
  if (password && password !== user.password) {
    throw new Error("Invalid email or password");
  }

  let permissionsArray: string[] = [];
  try {
    permissionsArray = JSON.parse(user.permissions || "[]");
  } catch (e) {
    permissionsArray = [];
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as "admin" | "manager" | "cso" | "staff",
    permissions: permissionsArray
  };
}

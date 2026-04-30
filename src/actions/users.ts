"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getUsers() {
  try {
    const users = await prisma.adminUser.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return { success: true, data: users };
  } catch (error: any) {
    console.error("Failed to fetch users:", error);
    return { success: false, error: "Failed to load users" };
  }
}

export async function createUser(data: { name: string; email: string; password?: string; role: string; permissions: string[] }) {
  try {
    const existingUser = await prisma.adminUser.findUnique({
      where: { email: data.email.toLowerCase().trim() }
    });

    if (existingUser) {
      return { success: false, error: "Email already exists" };
    }

    const newUser = await prisma.adminUser.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase().trim(),
        password: data.password || 'password123',
        role: data.role,
        permissions: JSON.stringify(data.permissions)
      }
    });

    revalidatePath('/admin');
    return { success: true, data: newUser };
  } catch (error: any) {
    console.error("Failed to create user:", error);
    return { success: false, error: "Failed to create user" };
  }
}

export async function updateUser(id: string, data: { name: string; email: string; password?: string; role: string; permissions: string[] }) {
  try {
    const existingUser = await prisma.adminUser.findUnique({
      where: { email: data.email.toLowerCase().trim() }
    });

    if (existingUser && existingUser.id !== id) {
      return { success: false, error: "Email already exists and is used by another account" };
    }

    const updateData: any = {
      name: data.name,
      email: data.email.toLowerCase().trim(),
      role: data.role,
      permissions: JSON.stringify(data.permissions)
    };

    if (data.password) {
      updateData.password = data.password;
    }

    const updated = await prisma.adminUser.update({
      where: { id },
      data: updateData
    });

    revalidatePath('/admin');
    return { success: true, data: updated };
  } catch (error: any) {
    console.error("Failed to update user:", error);
    return { success: false, error: "Failed to update user" };
  }
}

export async function deleteUser(id: string, currentUserEmail: string) {
  try {
    const targetUser = await prisma.adminUser.findUnique({ where: { id } });
    if (!targetUser) {
      return { success: false, error: "User not found" };
    }

    if (targetUser.email === currentUserEmail) {
      return { success: false, error: "You cannot delete your own account" };
    }

    if (targetUser.role === 'admin') {
      const allAdmins = await prisma.adminUser.count({ where: { role: 'admin' } });
      if (allAdmins <= 1) {
        return { success: false, error: "Cannot delete the last admin account" };
      }
    }

    const deleted = await prisma.adminUser.delete({ where: { id } });
    revalidatePath('/admin');
    return { success: true, data: deleted };
  } catch (error: any) {
    console.error("Failed to delete user:", error);
    return { success: false, error: "Failed to delete user" };
  }
}

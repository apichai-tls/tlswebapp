"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { hashPassword } from "@/lib/crypto";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (e) {
    // Expected in standalone tests where static generation store is not initialized
  }
}

export async function getUsers() {
  try {
    const users = await prisma.adminUser.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        area: true,
        permissions: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });
    return { success: true, data: users };
  } catch (error: any) {
    console.error("Failed to fetch users:", error);
    return { success: false, error: "Failed to load users" };
  }
}

export async function createUser(data: { name: string; email: string; password?: string; role: string; permissions: string[]; area?: string | null }) {
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
        password: hashPassword(data.password || 'password123'),
        role: data.role,
        permissions: JSON.stringify(data.permissions),
        area: data.area
      }
    });

    if (data.role === 'rider') {
      await prisma.rider.create({
        data: {
          id: newUser.id,
          name: newUser.name,
          nickname: newUser.name.split(' ')[0],
          phone: "N/A",
          status: "offline",
          avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(newUser.name)}&background=0D8ABC&color=fff&size=150`
        }
      });
    }

    safeRevalidatePath('/admin');
    return { success: true, data: newUser };
  } catch (error: any) {
    console.error("Failed to create user:", error);
    return { success: false, error: "Failed to create user" };
  }
}

export async function updateUser(id: string, data: { name: string; email: string; password?: string; role: string; permissions: string[]; area?: string | null; isActive?: boolean }) {
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
      permissions: JSON.stringify(data.permissions),
      area: data.area,
      ...(data.isActive !== undefined && { isActive: data.isActive })
    };

    if (data.password) {
      updateData.password = hashPassword(data.password);
    }

    const updated = await prisma.adminUser.update({
      where: { id },
      data: updateData
    });

    if (data.role === 'rider') {
      const existingRider = await prisma.rider.findUnique({ where: { id } });
      if (!existingRider) {
        await prisma.rider.create({
          data: {
            id,
            name: data.name,
            nickname: data.name.split(' ')[0],
            phone: "N/A",
            status: "offline",
            avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}&background=0D8ABC&color=fff&size=150`
          }
        });
      } else {
        await prisma.rider.update({
          where: { id },
          data: { 
            name: data.name,
            ...(data.isActive !== undefined && { isActive: data.isActive })
          }
        });
      }
    }

    safeRevalidatePath('/admin');
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
    
    if (targetUser.role === 'rider') {
      try {
        await prisma.rider.delete({ where: { id } });
      } catch (e) {
        // ignore if rider profile didn't exist
      }
    }

    safeRevalidatePath('/admin');
    return { success: true, data: deleted };
  } catch (error: any) {
    console.error("Failed to delete user:", error);
    return { success: false, error: "Failed to delete user" };
  }
}

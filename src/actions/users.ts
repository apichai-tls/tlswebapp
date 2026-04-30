"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getUsers() {
  const users = await prisma.adminUser.findMany({
    orderBy: { createdAt: 'desc' }
  });
  return users;
}

export async function createUser(data: {
  email: string;
  password?: string;
  name: string;
  role: string;
  permissions: string;
}) {
  const email = data.email.toLowerCase().trim();
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    throw new Error("Email already exists");
  }

  const user = await prisma.adminUser.create({
    data: {
      email,
      password: data.password || "password123",
      name: data.name,
      role: data.role,
      permissions: data.permissions
    }
  });

  revalidatePath('/admin');
  return user;
}

export async function updateUser(id: string, data: {
  email?: string;
  password?: string;
  name?: string;
  role?: string;
  permissions?: string;
}) {
  if (data.email) {
    data.email = data.email.toLowerCase().trim();
    const existing = await prisma.adminUser.findUnique({ where: { email: data.email } });
    if (existing && existing.id !== id) {
      throw new Error("Email already exists");
    }
  }

  const user = await prisma.adminUser.update({
    where: { id },
    data
  });

  revalidatePath('/admin');
  return user;
}

export async function deleteUser(id: string) {
  // Prevent deleting the very last admin
  const user = await prisma.adminUser.findUnique({ where: { id } });
  if (user?.role === 'admin') {
    const adminCount = await prisma.adminUser.count({ where: { role: 'admin' } });
    if (adminCount <= 1) {
      throw new Error("Cannot delete the last admin user");
    }
  }

  await prisma.adminUser.delete({ where: { id } });
  revalidatePath('/admin');
  return true;
}

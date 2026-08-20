"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export interface RoleItem {
  id: string;
  key: string;
  name: string;
  nameTh?: string | null;
  color: string;
  isSystem: boolean;
  order: number;
  isActive: boolean;
  userCount?: number;
}

const DEFAULT_ROLES = [
  {
    key: "admin",
    name: "Super Admin",
    nameTh: "ผู้ดูแลระบบสูงสุด",
    color: "indigo",
    isSystem: true,
    order: 1,
  },
  {
    key: "manager",
    name: "Branch Manager",
    nameTh: "ผู้จัดการสาขา",
    color: "emerald",
    isSystem: false,
    order: 2,
  },
  {
    key: "cso",
    name: "Customer Service Officer",
    nameTh: "เจ้าหน้าที่บริการลูกค้า & เซลล์",
    color: "sky",
    isSystem: false,
    order: 3,
  },
  {
    key: "staff",
    name: "Operations Staff",
    nameTh: "พนักงานปฏิบัติการสาขา",
    color: "slate",
    isSystem: false,
    order: 4,
  },
  {
    key: "rider",
    name: "Logistics Driver",
    nameTh: "ไรเดอร์ขนส่ง & พลขับ",
    color: "amber",
    isSystem: true,
    order: 5,
  },
];

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (e) {
    // Standalone fallback
  }
}

export async function getRoles(includeInactive = false) {
  try {
    let list = await prisma.roleDefinition.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });

    // Auto-seed default 5 roles if table is empty
    if (list.length === 0) {
      for (const def of DEFAULT_ROLES) {
        await prisma.roleDefinition.upsert({
          where: { key: def.key },
          update: {},
          create: {
            key: def.key,
            name: def.name,
            nameTh: def.nameTh,
            color: def.color,
            isSystem: def.isSystem,
            order: def.order,
            isActive: true,
          },
        });
      }
      list = await prisma.roleDefinition.findMany({
        where: includeInactive ? undefined : { isActive: true },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      });
    }

    // Count active users in each role
    const users = await prisma.adminUser.findMany({
      where: { isActive: true },
      select: { role: true },
    });

    const userCountMap: Record<string, number> = {};
    users.forEach((u) => {
      const roleKey = u.role || "staff";
      userCountMap[roleKey] = (userCountMap[roleKey] || 0) + 1;
    });

    const enriched: RoleItem[] = list.map((r) => ({
      ...r,
      userCount: userCountMap[r.key] || 0,
    }));

    return { success: true, data: enriched };
  } catch (error: any) {
    console.error("Failed to fetch roles:", error);
    return { success: false, error: "Failed to load roles" };
  }
}

export async function createRole(data: {
  key?: string;
  name: string;
  nameTh?: string;
  color?: string;
  order?: number;
}) {
  try {
    const rawName = data.name.trim();
    if (!rawName) return { success: false, error: "Role name is required" };

    const key = (
      data.key ||
      rawName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") ||
      `role_${Date.now()}`
    ).trim();

    const existing = await prisma.roleDefinition.findUnique({
      where: { key },
    });

    if (existing) {
      return { success: false, error: `Role key '${key}' already exists` };
    }

    const created = await prisma.roleDefinition.create({
      data: {
        key,
        name: rawName,
        nameTh: data.nameTh?.trim() || null,
        color: data.color?.trim() || "slate",
        isSystem: false,
        order: data.order ?? 99,
        isActive: true,
      },
    });

    safeRevalidatePath("/admin");
    return { success: true, data: created };
  } catch (error: any) {
    console.error("Failed to create role:", error);
    return { success: false, error: error.message || "Failed to create role" };
  }
}

export async function updateRole(
  id: string,
  data: {
    name?: string;
    nameTh?: string | null;
    color?: string;
    order?: number;
    isActive?: boolean;
  }
) {
  try {
    const existing = await prisma.roleDefinition.findUnique({ where: { id } });
    if (!existing) return { success: false, error: "Role not found" };

    const updated = await prisma.roleDefinition.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.nameTh !== undefined && { nameTh: data.nameTh ? data.nameTh.trim() : null }),
        ...(data.color !== undefined && { color: data.color.trim() }),
        ...(data.order !== undefined && { order: data.order }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    safeRevalidatePath("/admin");
    return { success: true, data: updated };
  } catch (error: any) {
    console.error("Failed to update role:", error);
    return { success: false, error: error.message || "Failed to update role" };
  }
}

export async function deleteRole(id: string) {
  try {
    const existing = await prisma.roleDefinition.findUnique({ where: { id } });
    if (!existing) return { success: false, error: "Role not found" };

    if (existing.isSystem) {
      return {
        success: false,
        error: `System role '${existing.name}' is protected and cannot be deleted.`,
      };
    }

    const userCount = await prisma.adminUser.count({
      where: { role: existing.key },
    });

    if (userCount > 0) {
      return {
        success: false,
        error: `Cannot delete '${existing.name}'. There are ${userCount} user(s) currently assigned to this role. Please reassign them first.`,
      };
    }

    await prisma.roleDefinition.delete({ where: { id } });
    safeRevalidatePath("/admin");
    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete role:", error);
    return { success: false, error: error.message || "Failed to delete role" };
  }
}

"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export interface DepartmentItem {
  id: string;
  key: string;
  name: string;
  nameTh?: string | null;
  icon: string;
  color: string;
  order: number;
  isActive: boolean;
  userCount?: number;
}

const DEFAULT_DEPARTMENTS = [
  {
    key: "management",
    name: "Management & IT",
    nameTh: "ฝ่ายบริหาร & ไอที",
    icon: "🏢",
    color: "indigo",
    order: 1,
  },
  {
    key: "accounting_cso",
    name: "Accounting & CSO",
    nameTh: "ฝ่ายบัญชี & CSO",
    icon: "💼",
    color: "sky",
    order: 2,
  },
  {
    key: "branch_ops",
    name: "Branch Operations",
    nameTh: "ฝ่ายปฏิบัติการสาขา",
    icon: "🧺",
    color: "emerald",
    order: 3,
  },
  {
    key: "logistics",
    name: "Logistics Fleet",
    nameTh: "ฝ่ายขนส่ง & ไรเดอร์",
    icon: "🛵",
    color: "amber",
    order: 4,
  },
];

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (e) {
    // Expected in standalone environments
  }
}

export async function getDepartments(includeInactive = false) {
  try {
    let list = await prisma.department.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });

    // Auto-seed default 4 departments if none exist in DB
    if (list.length === 0) {
      for (const def of DEFAULT_DEPARTMENTS) {
        await prisma.department.upsert({
          where: { key: def.key },
          update: {},
          create: {
            key: def.key,
            name: def.name,
            nameTh: def.nameTh,
            icon: def.icon,
            color: def.color,
            order: def.order,
            isActive: true,
          },
        });
      }
      list = await prisma.department.findMany({
        where: includeInactive ? undefined : { isActive: true },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      });
    }

    // Count active users in each department
    const users = await prisma.adminUser.findMany({
      where: { isActive: true },
      select: { department: true },
    });

    const userCountMap: Record<string, number> = {};
    users.forEach((u) => {
      const deptKey = u.department || "branch_ops";
      userCountMap[deptKey] = (userCountMap[deptKey] || 0) + 1;
    });

    const enriched: DepartmentItem[] = list.map((d) => ({
      ...d,
      userCount: userCountMap[d.key] || 0,
    }));

    return { success: true, data: enriched };
  } catch (error: any) {
    console.error("Failed to fetch departments:", error);
    return { success: false, error: "Failed to load departments" };
  }
}

export async function createDepartment(data: {
  key?: string;
  name: string;
  nameTh?: string;
  icon?: string;
  color?: string;
  order?: number;
}) {
  try {
    const rawName = data.name.trim();
    if (!rawName) return { success: false, error: "Department name is required" };

    const key = (
      data.key ||
      rawName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") ||
      `dept_${Date.now()}`
    ).trim();

    const existing = await prisma.department.findUnique({
      where: { key },
    });

    if (existing) {
      return { success: false, error: `Department key '${key}' already exists` };
    }

    const created = await prisma.department.create({
      data: {
        key,
        name: rawName,
        nameTh: data.nameTh?.trim() || null,
        icon: data.icon?.trim() || "🏢",
        color: data.color?.trim() || "indigo",
        order: data.order ?? 99,
        isActive: true,
      },
    });

    safeRevalidatePath("/admin");
    return { success: true, data: created };
  } catch (error: any) {
    console.error("Failed to create department:", error);
    return { success: false, error: error.message || "Failed to create department" };
  }
}

export async function updateDepartment(
  id: string,
  data: {
    name?: string;
    nameTh?: string | null;
    icon?: string;
    color?: string;
    order?: number;
    isActive?: boolean;
  }
) {
  try {
    const existing = await prisma.department.findUnique({ where: { id } });
    if (!existing) return { success: false, error: "Department not found" };

    const updated = await prisma.department.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.nameTh !== undefined && { nameTh: data.nameTh ? data.nameTh.trim() : null }),
        ...(data.icon !== undefined && { icon: data.icon.trim() }),
        ...(data.color !== undefined && { color: data.color.trim() }),
        ...(data.order !== undefined && { order: data.order }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    safeRevalidatePath("/admin");
    return { success: true, data: updated };
  } catch (error: any) {
    console.error("Failed to update department:", error);
    return { success: false, error: error.message || "Failed to update department" };
  }
}

export async function deleteDepartment(id: string) {
  try {
    const existing = await prisma.department.findUnique({ where: { id } });
    if (!existing) return { success: false, error: "Department not found" };

    // Check if any users belong to this department
    const userCount = await prisma.adminUser.count({
      where: { department: existing.key },
    });

    if (userCount > 0) {
      return {
        success: false,
        error: `Cannot delete '${existing.name}'. There are ${userCount} user(s) currently assigned to this department. Please reassign them first or edit this department instead.`,
      };
    }

    await prisma.department.delete({ where: { id } });
    safeRevalidatePath("/admin");
    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete department:", error);
    return { success: false, error: error.message || "Failed to delete department" };
  }
}

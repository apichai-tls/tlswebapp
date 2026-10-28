"use server";

import { prisma } from "@/lib/prisma";
import { format, isToday, startOfDay } from "date-fns";
import { assertServerActionAuthorized } from "@/lib/server-auth";

export interface AppNotification {
  id: string;
  userId: string;
  taskId?: string | null;
  taskTitle?: string | null;
  title: string;
  message: string;
  type: "overdue" | "due_today" | "assigned" | "note" | "system";
  isRead: boolean;
  createdAt: string; // ISO string
}

const userNotifCache = new Map<string, { res: any; cachedAt: number }>();
const NOTIF_CACHE_TTL_MS = 75000;

export async function createNotification(data: {
  userId: string;
  taskId?: string;
  title: string;
  message: string;
  type: "overdue" | "due_today" | "assigned" | "note" | "system" | "wallet_approval";
}) {
  try {
    await assertServerActionAuthorized({ requireWrite: true });

    const notif = await prisma.notification.create({
      data: {
        userId: data.userId,
        taskId: data.taskId || null,
        title: data.title,
        message: data.message,
        type: data.type,
        isRead: false,
      },
    });
    userNotifCache.delete(data.userId);
    return { success: true, data: notif };
  } catch (e: any) {
    console.error("Failed to create notification:", e);
    return { success: false, error: e.message };
  }
}

export async function getUserNotifications(userId: string, _userRole?: string) {
  try {
    const authUser = await assertServerActionAuthorized();
    const role = (authUser.role || "").toLowerCase();
    const isAdmin = role === "admin" || role === "superadmin";
    const effectiveUserId = isAdmin && userId ? userId : authUser.id;

    const cacheKey = `${effectiveUserId}:${isAdmin ? "admin" : "staff"}`;
    const cached = userNotifCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < NOTIF_CACHE_TTL_MS) {
      return cached.res;
    }

    const todayStart = startOfDay(new Date());

    // 1 & 2. Fetch persistent DB notifications and active tasks in parallel
    const [dbNotifs, userTasks] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: effectiveUserId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.task.findMany({
        where: {
          isArchived: false,
          status: { not: "done" },
          ...(isAdmin
            ? {}
            : { OR: [{ assignedToId: { contains: effectiveUserId } }, { createdById: effectiveUserId }] }),
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          status: true,
          priority: true,
          assignedToId: true,
          assignedToName: true,
        },
      }),
    ]);

    // 3. Generate dynamic Overdue and Due Today alerts
    const dynamicAlerts: AppNotification[] = [];

    userTasks.forEach((t) => {
      if (!t.dueDate) return;
      const due = new Date(t.dueDate);

      if (isToday(due)) {
        dynamicAlerts.push({
          id: `due-today-${t.id}`,
          userId: effectiveUserId,
          taskId: t.id,
          taskTitle: t.title,
          title: "Due Today ⏰",
          message: `Task "${t.title}" is due today`,
          type: "due_today",
          isRead: false,
          createdAt: due.toISOString(),
        });
      } else if (due < todayStart) {
        dynamicAlerts.push({
          id: `overdue-${t.id}`,
          userId: effectiveUserId,
          taskId: t.id,
          taskTitle: t.title,
          title: "Overdue Alert 🚨",
          message: `Task "${t.title}" was overdue since ${format(due, "d MMM")}`,
          type: "overdue",
          isRead: false,
          createdAt: due.toISOString(),
        });
      }
    });

    const formattedDbNotifs: AppNotification[] = dbNotifs.map((n) => ({
      id: n.id,
      userId: n.userId,
      taskId: n.taskId,
      title: n.title,
      message: n.message,
      type: n.type as any,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    }));

    const combined = [...dynamicAlerts, ...formattedDbNotifs];
    combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const unreadCount = combined.filter((n) => !n.isRead).length;
    const overdueCount = dynamicAlerts.filter((a) => a.type === "overdue").length;
    const dueTodayCount = dynamicAlerts.filter((a) => a.type === "due_today").length;

    const result = {
      success: true,
      data: combined,
      unreadCount,
      overdueCount,
      dueTodayCount,
    };
    userNotifCache.set(cacheKey, { res: result, cachedAt: Date.now() });
    return result;
  } catch (e: any) {
    console.error("Failed to get notifications:", e);
    return { success: false, error: e.message, data: [], unreadCount: 0, overdueCount: 0, dueTodayCount: 0 };
  }
}

export async function markNotificationAsRead(id: string) {
  try {
    const authUser = await assertServerActionAuthorized({ requireWrite: true });

    if (id.startsWith("due-today-") || id.startsWith("overdue-")) {
      return { success: true };
    }

    const role = (authUser.role || "").toLowerCase();
    const isAdmin = role === "admin" || role === "superadmin";

    await prisma.notification.updateMany({
      where: isAdmin ? { id } : { id, userId: authUser.id },
      data: { isRead: true },
    });
    userNotifCache.clear();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function markAllNotificationsAsRead(userId: string) {
  try {
    const authUser = await assertServerActionAuthorized({ requireWrite: true });
    const role = (authUser.role || "").toLowerCase();
    const isAdmin = role === "admin" || role === "superadmin";
    const effectiveUserId = isAdmin && userId ? userId : authUser.id;

    await prisma.notification.updateMany({
      where: { userId: effectiveUserId, isRead: false },
      data: { isRead: true },
    });
    userNotifCache.clear();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

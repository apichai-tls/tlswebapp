"use server";

import { prisma } from "@/lib/prisma";
import { format, isToday, isPast, startOfDay, endOfDay } from "date-fns";

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

export async function createNotification(data: {
  userId: string;
  taskId?: string;
  title: string;
  message: string;
  type: "overdue" | "due_today" | "assigned" | "note" | "system";
}) {
  try {
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
    return { success: true, data: notif };
  } catch (e: any) {
    console.error("Failed to create notification:", e);
    return { success: false, error: e.message };
  }
}

export async function getUserNotifications(userId: string, userRole?: string) {
  try {
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    // 1. Fetch persistent DB notifications for this user
    const dbNotifs = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // 2. Fetch active tasks relevant to this user (Assigned or Created by them, or all if Admin)
    const userTasks = await prisma.task.findMany({
      where: {
        isArchived: false,
        status: { not: "done" },
        ...(userRole === "admin"
          ? {}
          : { OR: [{ assignedToId: { contains: userId } }, { createdById: userId }] }),
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
    });

    // 3. Generate dynamic Overdue and Due Today alerts
    const dynamicAlerts: AppNotification[] = [];

    userTasks.forEach((t) => {
      if (!t.dueDate) return;
      const due = new Date(t.dueDate);

      if (isToday(due)) {
        // Due Today alert
        dynamicAlerts.push({
          id: `due-today-${t.id}`,
          userId,
          taskId: t.id,
          taskTitle: t.title,
          title: "Due Today ⏰",
          message: `Task "${t.title}" is due today`,
          type: "due_today",
          isRead: false,
          createdAt: due.toISOString(),
        });
      } else if (due < todayStart) {
        // Overdue alert
        dynamicAlerts.push({
          id: `overdue-${t.id}`,
          userId,
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

    // Map DB notifications to AppNotification
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

    // Combine & deduplicate
    const combined = [...dynamicAlerts, ...formattedDbNotifs];

    // Sort newest first
    combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const unreadCount = combined.filter((n) => !n.isRead).length;

    // Overdue / Due Today specific counts for quick filter badges
    const overdueCount = dynamicAlerts.filter((a) => a.type === "overdue").length;
    const dueTodayCount = dynamicAlerts.filter((a) => a.type === "due_today").length;

    return {
      success: true,
      data: combined,
      unreadCount,
      overdueCount,
      dueTodayCount,
    };
  } catch (e: any) {
    console.error("Failed to get notifications:", e);
    return { success: false, error: e.message, data: [], unreadCount: 0, overdueCount: 0, dueTodayCount: 0 };
  }
}

export async function markNotificationAsRead(id: string) {
  try {
    if (id.startsWith("due-today-") || id.startsWith("overdue-")) {
      // Dynamic alerts don't need DB update
      return { success: true };
    }

    await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function markAllNotificationsAsRead(userId: string) {
  try {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

"use server";

import { prisma } from "@/lib/prisma";

export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "in_progress" | "done";

export interface TaskNote {
  id: string;
  text: string;
  userId: string;
  userName: string;
  timestamp: string; // ISO string
}

export interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  jobId: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  createdById: string;
  createdByName: string;
  dueDate: Date | null;
  completedAt: Date | null;
  notesJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getTasks() {
  try {
    const tasks = await prisma.task.findMany({
      orderBy: [{ createdAt: "desc" }],
    });
    return { success: true, data: tasks as TaskItem[] };
  } catch (error: any) {
    console.error("Failed to fetch tasks:", error);
    return { success: false, error: "Failed to load tasks" };
  }
}

export async function createTask(data: {
  title: string;
  description?: string;
  priority: TaskPriority;
  jobId?: string;
  assignedToId?: string;
  assignedToName?: string;
  dueDate?: string;
  createdById: string;
  createdByName: string;
}) {
  try {
    const task = await prisma.task.create({
      data: {
        title: data.title.trim(),
        description: data.description?.trim() || null,
        priority: data.priority,
        status: "todo",
        jobId: data.jobId?.trim() || null,
        assignedToId: data.assignedToId || null,
        assignedToName: data.assignedToName || null,
        createdById: data.createdById,
        createdByName: data.createdByName,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        notesJson: null,
      },
    });
    return { success: true, data: task as TaskItem };
  } catch (error: any) {
    console.error("Failed to create task:", error);
    return { success: false, error: "Failed to create task" };
  }
}

export async function updateTask(
  id: string,
  updates: {
    title?: string;
    description?: string | null;
    priority?: TaskPriority;
    status?: TaskStatus;
    jobId?: string | null;
    assignedToId?: string | null;
    assignedToName?: string | null;
    dueDate?: string | null;
  }
) {
  try {
    const data: any = {};
    if (updates.title !== undefined) data.title = updates.title.trim();
    if (updates.description !== undefined) data.description = updates.description?.trim() || null;
    if (updates.priority !== undefined) data.priority = updates.priority;
    if (updates.jobId !== undefined) data.jobId = updates.jobId?.trim() || null;
    if (updates.assignedToId !== undefined) data.assignedToId = updates.assignedToId;
    if (updates.assignedToName !== undefined) data.assignedToName = updates.assignedToName;
    if (updates.dueDate !== undefined) data.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
    if (updates.status !== undefined) {
      data.status = updates.status;
      data.completedAt = updates.status === "done" ? new Date() : null;
    }

    const task = await prisma.task.update({ where: { id }, data });
    return { success: true, data: task as TaskItem };
  } catch (error: any) {
    console.error("Failed to update task:", error);
    return { success: false, error: "Failed to update task" };
  }
}

export async function addTaskNote(
  taskId: string,
  note: { text: string; userId: string; userName: string }
) {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { notesJson: true },
    });
    if (!task) return { success: false, error: "Task not found" };

    const existing: TaskNote[] = task.notesJson ? JSON.parse(task.notesJson) : [];
    const newNote: TaskNote = {
      id: Math.random().toString(36).slice(2, 9),
      text: note.text.trim(),
      userId: note.userId,
      userName: note.userName,
      timestamp: new Date().toISOString(),
    };
    const updated = [newNote, ...existing]; // newest first

    const result = await prisma.task.update({
      where: { id: taskId },
      data: { notesJson: JSON.stringify(updated) },
    });
    return { success: true, data: result as TaskItem, note: newNote };
  } catch (error: any) {
    console.error("Failed to add task note:", error);
    return { success: false, error: "Failed to add note" };
  }
}

export async function deleteTaskNote(taskId: string, noteId: string) {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { notesJson: true },
    });
    if (!task) return { success: false, error: "Task not found" };

    const existing: TaskNote[] = task.notesJson ? JSON.parse(task.notesJson) : [];
    const filtered = existing.filter((n) => n.id !== noteId);

    const result = await prisma.task.update({
      where: { id: taskId },
      data: { notesJson: filtered.length > 0 ? JSON.stringify(filtered) : null },
    });
    return { success: true, data: result as TaskItem };
  } catch (error: any) {
    console.error("Failed to delete task note:", error);
    return { success: false, error: "Failed to delete note" };
  }
}

export async function deleteTask(id: string) {
  try {
    await prisma.task.delete({ where: { id } });
    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete task:", error);
    return { success: false, error: "Failed to delete task" };
  }
}

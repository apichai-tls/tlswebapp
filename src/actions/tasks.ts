"use server";

import { prisma } from "@/lib/prisma";
import { format } from "date-fns";

export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "in_progress" | "stuck" | "done";

function getAutoDueDate(priority: TaskPriority | string, baseDate: Date = new Date()): Date {
  const d = new Date(baseDate);
  switch (priority) {
    case "urgent":
      // ภายในวันที่ Assign (Today)
      d.setHours(23, 59, 59, 999);
      return d;
    case "high":
      // 48 hr (2 days)
      d.setHours(d.getHours() + 48);
      return d;
    case "medium":
      // 4 Day
      d.setDate(d.getDate() + 4);
      return d;
    case "low":
      // 7 Day
      d.setDate(d.getDate() + 7);
      return d;
    default:
      d.setDate(d.getDate() + 4);
      return d;
  }
}

export interface TaskAttachment {
  id: string;
  name: string;        // original filename
  url: string;         // public url (GCS or local)
  type: string;        // mime type (e.g. image/jpeg, application/pdf)
  size?: number;       // file size in bytes
  uploadedAt: string;  // ISO timestamp
}

export interface TaskNote {
  id: string;
  text: string;
  userId: string;
  userName: string;
  timestamp: string; // ISO string
  type?: "user" | "activity"; // user message vs system field change log
  attachments?: TaskAttachment[];
}

export interface TaskChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  completedAt?: string | null;
  completedById?: string | null;
  completedByName?: string | null;
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
  attachmentsJson: string | null;
  notesJson: string | null;
  checklistJson: string | null;
  isArchived: boolean;
  archivedAt: Date | null;
  archivedById: string | null;
  archivedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getTasks(viewer?: { id?: string; role?: string }) {
  try {
    const isAdmin = viewer?.role === "admin";
    const viewerId = viewer?.id;

    const whereClause: any = {};
    if (!isAdmin && viewerId) {
      whereClause.OR = [
        { createdById: viewerId },
        { assignedToId: { contains: viewerId } },
      ];
    }

    const tasks = await prisma.task.findMany({
      where: whereClause,
      orderBy: [{ createdAt: "desc" }],
    });
    return { success: true, data: tasks as TaskItem[] };
  } catch (error: any) {
    console.error("Failed to fetch tasks:", error);
    return { success: false, error: "Failed to load tasks" };
  }
}

export async function generateNextTaskId(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const prefix = `${year}${month}`; // e.g. "202608"

  try {
    const latestTask = await prisma.task.findFirst({
      where: {
        id: {
          startsWith: prefix,
        },
      },
      orderBy: {
        id: "desc",
      },
      select: {
        id: true,
      },
    });

    if (latestTask && latestTask.id.length >= prefix.length + 4) {
      const seqStr = latestTask.id.substring(prefix.length);
      const seqNum = parseInt(seqStr, 10);
      if (!isNaN(seqNum)) {
        return `${prefix}${(seqNum + 1).toString().padStart(4, "0")}`;
      }
    }
  } catch (e) {
    console.error("Error finding latest task id:", e);
  }

  return `${prefix}0001`;
}

export async function createTask(data: {
  title: string;
  description?: string;
  priority: TaskPriority;
  jobId?: string;
  assignedToId?: string;
  assignedToName?: string;
  dueDate?: string;
  attachments?: TaskAttachment[];
  checklist?: TaskChecklistItem[];
  createdById: string;
  createdByName: string;
}) {
  try {
    const cleanAssigneeId = data.assignedToId && data.assignedToId.trim() !== "" ? data.assignedToId.trim() : null;
    const cleanAssigneeName = cleanAssigneeId ? (data.assignedToName?.trim() || null) : null;
    const nextId = await generateNextTaskId();
    const effectiveDueDate = data.dueDate ? new Date(data.dueDate) : getAutoDueDate(data.priority);

    const task = await prisma.task.create({
      data: {
        id: nextId,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        priority: data.priority,
        status: "todo",
        jobId: data.jobId?.trim() || null,
        assignedToId: cleanAssigneeId,
        assignedToName: cleanAssigneeName,
        createdById: data.createdById,
        createdByName: data.createdByName,
        dueDate: effectiveDueDate,
        attachmentsJson: data.attachments && data.attachments.length > 0 ? JSON.stringify(data.attachments) : null,
        checklistJson: data.checklist && data.checklist.length > 0 ? JSON.stringify(data.checklist) : null,
        notesJson: JSON.stringify([
          {
            id: Math.random().toString(36).slice(2, 9),
            text: `Created task "${data.title.trim()}" (Priority: ${data.priority.toUpperCase()}${data.assignedToName ? `, Assigned to: ${data.assignedToName}` : ""}${effectiveDueDate ? `, Due: ${format(effectiveDueDate, "d MMM yyyy")}` : ""})`,
            userId: data.createdById,
            userName: data.createdByName,
            timestamp: new Date().toISOString(),
            type: "activity",
          }
        ]),
      },
    });

    // Write to ActivityLog table
    try {
      await prisma.activityLog.create({
        data: {
          entityId: task.id,
          entityType: "task",
          action: "create",
          details: JSON.stringify({
            title: task.title,
            priority: task.priority,
            assignedTo: task.assignedToName,
            dueDate: task.dueDate,
          }),
          userId: data.createdById,
          userName: data.createdByName,
        }
      });
    } catch (e) {
      console.warn("Failed to write ActivityLog on task creation:", e);
    }

    // Trigger Notification for each Assignee
    if (cleanAssigneeId) {
      const assigneeIds = cleanAssigneeId.split(",").map((id) => id.trim()).filter(Boolean);
      for (const uid of assigneeIds) {
        if (uid !== data.createdById) {
          try {
            await prisma.notification.create({
              data: {
                userId: uid,
                taskId: task.id,
                title: "New Task Assigned 👤",
                message: `${data.createdByName} assigned task "${task.title}" to you`,
                type: "assigned",
                isRead: false,
              },
            });
          } catch (e) {}
        }
      }
    }

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
    attachments?: TaskAttachment[];
    checklist?: TaskChecklistItem[];
  },
  actor?: {
    id: string;
    name: string;
    role?: string;
  }
) {
  try {
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) return { success: false, error: "Task not found" };

    const actorId = actor?.id || "unknown";
    const actorName = actor?.name || "User";
    const actorRole = actor?.role || "staff";

    // 🔒 Authorization check: Only Creator, Assignee, or Super Admin can modify this Task
    const isAssignee = existing.assignedToId
      ? existing.assignedToId.split(",").map((s) => s.trim()).includes(actorId)
      : false;
    const isAuthorized = actorRole === "admin" || existing.createdById === actorId || isAssignee;
    if (!isAuthorized) {
      return { success: false, error: "Unauthorized: You do not have permission to edit this task" };
    }

    const isCreator = existing.createdById === actorId;
    const isAdmin = actorRole === "admin";

    // 🔒 Assignee Rule: The person who is assigned (not creator & not admin) is FORBIDDEN from editing core details EXCEPT status, checklist toggling, and assigning additional people
    if (!isCreator && !isAdmin) {
      if (
        (updates.title !== undefined && updates.title.trim() !== existing.title) ||
        (updates.description !== undefined && (updates.description?.trim() || null) !== existing.description) ||
        (updates.priority !== undefined && updates.priority !== existing.priority) ||
        (updates.jobId !== undefined && (updates.jobId?.trim() || null) !== existing.jobId) ||
        (updates.dueDate !== undefined && (updates.dueDate ? new Date(updates.dueDate).getTime() : null) !== (existing.dueDate ? new Date(existing.dueDate).getTime() : null)) ||
        (updates.attachments !== undefined && JSON.stringify(updates.attachments) !== (existing.attachmentsJson || "[]"))
      ) {
        return {
          success: false,
          error: "Only the Task Creator or Super Admin can edit core details like Title, Description, Due Date or Attachments",
        };
      }
    }

    // 🔒 Permission check: Only creator or Admin can change Due Date
    if (updates.dueDate !== undefined) {
      const oldDueTime = existing.dueDate ? new Date(existing.dueDate).getTime() : null;
      const newDueTime = updates.dueDate ? new Date(updates.dueDate).getTime() : null;

      if (oldDueTime !== newDueTime) {
        if (!isCreator && !isAdmin) {
          return {
            success: false,
            error: "Only the Task Creator or Admin can modify the Due Date",
          };
        }
      }
    }

    const data: any = {};
    const changes: Record<string, { from: any; to: any }> = {};
    const activityMessages: string[] = [];

    // Track Title change
    if (updates.title !== undefined && updates.title.trim() !== existing.title) {
      const newTitle = updates.title.trim();
      changes.title = { from: existing.title, to: newTitle };
      activityMessages.push(`Changed title to "${newTitle}"`);
      data.title = newTitle;
    }

    // Track Description change
    if (updates.description !== undefined && (updates.description?.trim() || null) !== existing.description) {
      const newDesc = updates.description?.trim() || null;
      changes.description = { from: existing.description, to: newDesc };
      activityMessages.push("Updated description");
      data.description = newDesc;
    }

    // Track Priority change
    if (updates.priority !== undefined && updates.priority !== existing.priority) {
      changes.priority = { from: existing.priority, to: updates.priority };
      activityMessages.push(`Changed priority from ${existing.priority.toUpperCase()} to ${updates.priority.toUpperCase()}`);
      data.priority = updates.priority;
    }

    // Track Status change
    if (updates.status !== undefined && updates.status !== existing.status) {
      changes.status = { from: existing.status, to: updates.status };
      const statusLabels: Record<string, string> = { todo: "To Do", in_progress: "In Progress", stuck: "Stuck", done: "Done" };
      activityMessages.push(`Changed status from ${statusLabels[existing.status] || existing.status} to ${statusLabels[updates.status] || updates.status}`);
      data.status = updates.status;
      data.completedAt = updates.status === "done" ? new Date() : null;
    }

    // Track Job ID change
    if (updates.jobId !== undefined && (updates.jobId?.trim() || null) !== existing.jobId) {
      const newJobId = updates.jobId?.trim() || null;
      changes.jobId = { from: existing.jobId, to: newJobId };
      activityMessages.push(newJobId ? `Linked to Job #${newJobId}` : "Removed Job link");
      data.jobId = newJobId;
    }

    // Track Assignee change
    if (updates.assignedToId !== undefined) {
      const newAssigneeId = updates.assignedToId && updates.assignedToId.trim() !== "" ? updates.assignedToId.trim() : null;
      const newAssigneeName = newAssigneeId ? (updates.assignedToName?.trim() || null) : null;

      if (newAssigneeId !== existing.assignedToId) {
        changes.assignedTo = {
          from: existing.assignedToName || "Unassigned",
          to: newAssigneeName || "Unassigned",
        };
        activityMessages.push(`Reassigned from ${existing.assignedToName || "Unassigned"} to ${newAssigneeName || "Unassigned"}`);
        data.assignedToId = newAssigneeId;
        data.assignedToName = newAssigneeName;
      }
    }

    // Track Due Date change
    if (updates.dueDate !== undefined) {
      const oldDueStr = existing.dueDate ? format(new Date(existing.dueDate), "d MMM yyyy") : "None";
      const newDueStr = updates.dueDate ? format(new Date(updates.dueDate), "d MMM yyyy") : "None";
      const oldDueTime = existing.dueDate ? new Date(existing.dueDate).getTime() : null;
      const newDueTime = updates.dueDate ? new Date(updates.dueDate).getTime() : null;

      if (oldDueTime !== newDueTime) {
        changes.dueDate = { from: oldDueStr, to: newDueStr };
        activityMessages.push(`Changed Due Date from ${oldDueStr} to ${newDueStr}`);
        data.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
      }
    }

    // Track Attachments change
    if (updates.attachments !== undefined) {
      const newAttachmentsJson = updates.attachments && updates.attachments.length > 0 ? JSON.stringify(updates.attachments) : null;
      if (newAttachmentsJson !== existing.attachmentsJson) {
        const oldAtts: TaskAttachment[] = existing.attachmentsJson ? JSON.parse(existing.attachmentsJson) : [];
        const newAtts: TaskAttachment[] = updates.attachments || [];
        changes.attachments = { from: oldAtts.length, to: newAtts.length };
        activityMessages.push(`Updated attachments (${newAtts.length} files)`);
        data.attachmentsJson = newAttachmentsJson;
      }
    }

    // Track Checklist change
    if (updates.checklist !== undefined) {
      const newChecklistJson = updates.checklist && updates.checklist.length > 0 ? JSON.stringify(updates.checklist) : null;
      if (newChecklistJson !== existing.checklistJson) {
        const oldList: TaskChecklistItem[] = existing.checklistJson ? JSON.parse(existing.checklistJson) : [];
        const newList: TaskChecklistItem[] = updates.checklist || [];
        
        const completedCountOld = oldList.filter(i => i.completed).length;
        const completedCountNew = newList.filter(i => i.completed).length;
        
        if (oldList.length !== newList.length) {
          changes.checklist = { from: `${oldList.length} items`, to: `${newList.length} items` };
          activityMessages.push(`Updated checklist (${newList.length} items)`);
        } else if (completedCountOld !== completedCountNew) {
          changes.checklist = { from: `${completedCountOld}/${oldList.length}`, to: `${completedCountNew}/${newList.length}` };
          activityMessages.push(`Checklist progress: ${completedCountNew}/${newList.length} completed`);
        }
        data.checklistJson = newChecklistJson;
      }
    }

    // Append auto-activity note if any fields changed
    let notes: TaskNote[] = existing.notesJson ? JSON.parse(existing.notesJson) : [];
    if (activityMessages.length > 0) {
      const activityNote: TaskNote = {
        id: Math.random().toString(36).slice(2, 9),
        text: activityMessages.join(" · "),
        userId: actorId,
        userName: actorName,
        timestamp: new Date().toISOString(),
        type: "activity",
      };
      notes = [activityNote, ...notes];
      data.notesJson = JSON.stringify(notes);
    }

    // Execute Task update
    const updatedTask = await prisma.task.update({
      where: { id },
      data,
    });

    // Write to ActivityLog table if changes occurred
    if (Object.keys(changes).length > 0) {
      try {
        await prisma.activityLog.create({
          data: {
            entityId: id,
            entityType: "task",
            action: "update",
            details: JSON.stringify(changes),
            userId: actorId,
            userName: actorName,
          },
        });
      } catch (err: any) {
        console.warn("Failed to write ActivityLog on task update:", err.message);
      }
    }

    // Trigger Notification for newly added assignees
    if (data.assignedToId && data.assignedToId !== existing.assignedToId) {
      const oldIds = new Set((existing.assignedToId || "").split(",").map((s) => s.trim()).filter(Boolean));
      const newIds = data.assignedToId.split(",").map((s: string) => s.trim()).filter(Boolean);
      for (const newId of newIds) {
        if (!oldIds.has(newId) && newId !== actorId) {
          try {
            await prisma.notification.create({
              data: {
                userId: newId,
                taskId: id,
                title: "Added to Task 👤",
                message: `${actorName} assigned task "${updatedTask.title}" to you`,
                type: "assigned",
                isRead: false,
              },
            });
          } catch (e) {}
        }
      }
    }

    return { success: true, data: updatedTask as TaskItem };
  } catch (error: any) {
    console.error("Failed to update task:", error);
    return { success: false, error: error.message || "Failed to update task" };
  }
}

export async function addTaskAttachment(taskId: string, attachment: TaskAttachment, actor?: { id: string; name: string }) {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { attachmentsJson: true, notesJson: true },
    });
    if (!task) return { success: false, error: "Task not found" };

    const existing: TaskAttachment[] = task.attachmentsJson ? JSON.parse(task.attachmentsJson) : [];
    const updated = [...existing, attachment];

    const notes: TaskNote[] = task.notesJson ? JSON.parse(task.notesJson) : [];
    if (actor) {
      const activityNote: TaskNote = {
        id: Math.random().toString(36).slice(2, 9),
        text: `Uploaded attachment: ${attachment.name}`,
        userId: actor.id,
        userName: actor.name,
        timestamp: new Date().toISOString(),
        type: "activity",
      };
      notes.unshift(activityNote);
    }

    const result = await prisma.task.update({
      where: { id: taskId },
      data: {
        attachmentsJson: JSON.stringify(updated),
        notesJson: JSON.stringify(notes),
      },
    });
    return { success: true, data: result as TaskItem };
  } catch (error: any) {
    console.error("Failed to add task attachment:", error);
    return { success: false, error: "Failed to add attachment" };
  }
}

export async function deleteTaskAttachment(taskId: string, attachmentId: string, actor?: { id: string; name: string }) {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { attachmentsJson: true, notesJson: true },
    });
    if (!task) return { success: false, error: "Task not found" };

    const existing: TaskAttachment[] = task.attachmentsJson ? JSON.parse(task.attachmentsJson) : [];
    const removed = existing.find((a) => a.id === attachmentId);
    const filtered = existing.filter((a) => a.id !== attachmentId);

    const notes: TaskNote[] = task.notesJson ? JSON.parse(task.notesJson) : [];
    if (actor && removed) {
      const activityNote: TaskNote = {
        id: Math.random().toString(36).slice(2, 9),
        text: `Removed attachment: ${removed.name}`,
        userId: actor.id,
        userName: actor.name,
        timestamp: new Date().toISOString(),
        type: "activity",
      };
      notes.unshift(activityNote);
    }

    const result = await prisma.task.update({
      where: { id: taskId },
      data: {
        attachmentsJson: filtered.length > 0 ? JSON.stringify(filtered) : null,
        notesJson: JSON.stringify(notes),
      },
    });
    return { success: true, data: result as TaskItem };
  } catch (error: any) {
    console.error("Failed to delete task attachment:", error);
    return { success: false, error: "Failed to delete attachment" };
  }
}

export async function addTaskNote(
  taskId: string,
  note: { text: string; userId: string; userName: string; attachments?: TaskAttachment[] }
) {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { title: true, assignedToId: true, createdById: true, notesJson: true },
    });
    if (!task) return { success: false, error: "Task not found" };

    const existing: TaskNote[] = task.notesJson ? JSON.parse(task.notesJson) : [];
    const newNote: TaskNote = {
      id: Math.random().toString(36).slice(2, 9),
      text: note.text.trim(),
      userId: note.userId,
      userName: note.userName,
      timestamp: new Date().toISOString(),
      type: "user",
      attachments: note.attachments && note.attachments.length > 0 ? note.attachments : undefined,
    };
    const updated = [newNote, ...existing]; // newest first

    const result = await prisma.task.update({
      where: { id: taskId },
      data: { notesJson: JSON.stringify(updated) },
    });

    // Write to ActivityLog table
    try {
      await prisma.activityLog.create({
        data: {
          entityId: taskId,
          entityType: "task",
          action: "add_note",
          details: JSON.stringify({
            text: note.text.trim().substring(0, 100),
            attachmentsCount: note.attachments?.length || 0,
          }),
          userId: note.userId,
          userName: note.userName,
        },
      });
    } catch (e) {
      console.warn("Failed to write ActivityLog on add note:", e);
    }

    // Trigger Notification for Assignees, Creator, and @Mentioned users
    const recipients = new Set<string>();
    if (task.assignedToId) {
      task.assignedToId.split(",").map((s) => s.trim()).filter(Boolean).forEach((id) => {
        if (id !== note.userId) recipients.add(id);
      });
    }
    if (task.createdById && task.createdById !== note.userId) recipients.add(task.createdById);

    // Scan note text for @mentions
    try {
      const mentionMatches = note.text.match(/@([\w\u0E00-\u0E7F]+(?:\s+[\w\u0E00-\u0E7F]+)?)/g);
      if (mentionMatches && mentionMatches.length > 0) {
        const allUsers = await prisma.adminUser.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
        });

        for (const rawMatch of mentionMatches) {
          const mentionedName = rawMatch.slice(1).trim().toLowerCase();
          const matchedUser = allUsers.find(
            (u) => u.name.toLowerCase() === mentionedName || u.name.toLowerCase().startsWith(mentionedName)
          );
          if (matchedUser && matchedUser.id !== note.userId) {
            recipients.add(matchedUser.id);
          }
        }
      }
    } catch (e) {
      console.warn("Failed to parse mentions:", e);
    }

    for (const recipientId of recipients) {
      try {
        await prisma.notification.create({
          data: {
            userId: recipientId,
            taskId,
            title: "New Note on Task 💬",
            message: `${note.userName} added a note on task "${task.title}": "${note.text.slice(0, 80)}"`,
            type: "note",
            isRead: false,
          },
        });
      } catch (e) {}
    }

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

export async function deleteTask(id: string, actor?: { id: string; name: string; role?: string }) {
  try {
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) return { success: false, error: "Task not found" };

    const isAdmin = actor?.role === "admin";
    const isCreator = actor?.id && existing.createdById === actor.id;

    if (!isAdmin && !isCreator) {
      return { success: false, error: "Unauthorized: Only the Task Creator or Super Admin can delete this task" };
    }

    await prisma.task.delete({ where: { id } });

    if (actor) {
      try {
        await prisma.activityLog.create({
          data: {
            entityId: id,
            entityType: "task",
            action: "delete",
            userId: actor.id,
            userName: actor.name,
          },
        });
      } catch (e) {}
    }

    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete task:", error);
    return { success: false, error: "Failed to delete task" };
  }
}

export async function getLinkedJobDetails(jobId: string) {
  try {
    const cleanId = jobId.trim();
    if (!cleanId) return { success: false, error: "No Job ID provided" };

    const job = await prisma.job.findFirst({
      where: {
        OR: [
          { id: cleanId },
          { id: { equals: cleanId, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        status: true,
        serviceType: true,
        pickupLocation: true,
        dropoffLocation: true,
        bagImageUrl: true,
        billImageUrl: true,
        pickupProofImageUrl: true,
        deliveryProofImageUrl: true,
        proofImageUrl: true,
        adminNotesJson: true,
        totalAmount: true,
        fee: true,
        remark: true,
        createdAt: true,
      },
    });

    if (!job) return { success: false, error: "Job not found" };
    return { success: true, data: job };
  } catch (e: any) {
    console.error("Failed to fetch linked job details:", e);
    return { success: false, error: e.message || "Failed to fetch job" };
  }
}

export async function archiveTask(id: string, actor: { id: string; name: string; role?: string }) {
  try {
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return { success: false, error: "Task not found" };

    const isAdmin = actor.role === "admin";
    const isOwnerOrAssignee = task.createdById === actor.id || task.assignedToId === actor.id;
    if (!isAdmin && !isOwnerOrAssignee) {
      return { success: false, error: "Unauthorized: You do not have permission to manage this task" };
    }

    const notes: TaskNote[] = task.notesJson ? JSON.parse(task.notesJson) : [];
    notes.unshift({
      id: Math.random().toString(36).slice(2, 9),
      text: `Archived this task`,
      userId: actor.id,
      userName: actor.name,
      timestamp: new Date().toISOString(),
      type: "activity",
    });

    const updated = await prisma.task.update({
      where: { id },
      data: {
        isArchived: true,
        archivedAt: new Date(),
        archivedById: actor.id,
        archivedByName: actor.name,
        notesJson: JSON.stringify(notes),
      },
    });

    try {
      await prisma.activityLog.create({
        data: {
          entityId: id,
          entityType: "task",
          action: "archive",
          userId: actor.id,
          userName: actor.name,
        },
      });
    } catch (e) {}

    return { success: true, data: updated as TaskItem };
  } catch (error: any) {
    console.error("Failed to archive task:", error);
    return { success: false, error: error.message || "Failed to archive task" };
  }
}

export async function unarchiveTask(id: string, actor: { id: string; name: string; role?: string }) {
  try {
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return { success: false, error: "Task not found" };

    const isAdmin = actor.role === "admin";
    const isOwnerOrAssignee = task.createdById === actor.id || task.assignedToId === actor.id;
    if (!isAdmin && !isOwnerOrAssignee) {
      return { success: false, error: "Unauthorized: You do not have permission to manage this task" };
    }

    const notes: TaskNote[] = task.notesJson ? JSON.parse(task.notesJson) : [];
    notes.unshift({
      id: Math.random().toString(36).slice(2, 9),
      text: `Restored (Unarchived) this task`,
      userId: actor.id,
      userName: actor.name,
      timestamp: new Date().toISOString(),
      type: "activity",
    });

    const updated = await prisma.task.update({
      where: { id },
      data: {
        isArchived: false,
        archivedAt: null,
        archivedById: null,
        archivedByName: null,
        notesJson: JSON.stringify(notes),
      },
    });

    try {
      await prisma.activityLog.create({
        data: {
          entityId: id,
          entityType: "task",
          action: "unarchive",
          userId: actor.id,
          userName: actor.name,
        },
      });
    } catch (e) {}

    return { success: true, data: updated as TaskItem };
  } catch (error: any) {
    console.error("Failed to unarchive task:", error);
    return { success: false, error: error.message || "Failed to unarchive task" };
  }
}

export async function archiveAllDoneTasks(actor: { id: string; name: string; role?: string }) {
  try {
    const isAdmin = actor.role === "admin";
    const whereClause: any = { status: "done", isArchived: false };
    if (!isAdmin && actor.id) {
      whereClause.OR = [
        { createdById: actor.id },
        { assignedToId: actor.id },
      ];
    }

    const doneTasks = await prisma.task.findMany({
      where: whereClause,
    });

    if (doneTasks.length === 0) {
      return { success: true, count: 0 };
    }

    const now = new Date();
    await Promise.all(
      doneTasks.map((t) => {
        const notes: TaskNote[] = t.notesJson ? JSON.parse(t.notesJson) : [];
        notes.unshift({
          id: Math.random().toString(36).slice(2, 9),
          text: `Archived this task (Batch archive all done)`,
          userId: actor.id,
          userName: actor.name,
          timestamp: now.toISOString(),
          type: "activity",
        });

        return prisma.task.update({
          where: { id: t.id },
          data: {
            isArchived: true,
            archivedAt: now,
            archivedById: actor.id,
            archivedByName: actor.name,
            notesJson: JSON.stringify(notes),
          },
        });
      })
    );

    try {
      await prisma.activityLog.create({
        data: {
          entityId: "batch",
          entityType: "task",
          action: "batch_archive",
          details: JSON.stringify({ count: doneTasks.length }),
          userId: actor.id,
          userName: actor.name,
        },
      });
    } catch (e) {}

    return { success: true, count: doneTasks.length };
  } catch (error: any) {
    console.error("Failed to batch archive done tasks:", error);
    return { success: false, error: error.message || "Failed to batch archive" };
  }
}

export async function toggleTaskChecklistItem(
  taskId: string,
  itemId: string,
  completed: boolean,
  actor: { id: string; name: string; role?: string }
) {
  try {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return { success: false, error: "Task not found" };

    const isAdmin = actor.role === "admin";
    const isOwnerOrAssignee = task.createdById === actor.id || task.assignedToId === actor.id;
    if (!isAdmin && !isOwnerOrAssignee) {
      return { success: false, error: "Unauthorized: You do not have permission to access this task" };
    }

    const list: TaskChecklistItem[] = task.checklistJson ? JSON.parse(task.checklistJson) : [];
    const item = list.find((i) => i.id === itemId);
    if (!item) return { success: false, error: "Checklist item not found" };

    item.completed = completed;
    item.completedAt = completed ? new Date().toISOString() : null;
    item.completedById = completed ? actor.id : null;
    item.completedByName = completed ? actor.name : null;

    const notes: TaskNote[] = task.notesJson ? JSON.parse(task.notesJson) : [];
    notes.unshift({
      id: Math.random().toString(36).slice(2, 9),
      text: completed
        ? `Checked sub-task: "${item.text}"`
        : `Unchecked sub-task: "${item.text}"`,
      userId: actor.id,
      userName: actor.name,
      timestamp: new Date().toISOString(),
      type: "activity",
    });

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        checklistJson: JSON.stringify(list),
        notesJson: JSON.stringify(notes),
      },
    });

    return { success: true, data: updated as TaskItem };
  } catch (e: any) {
    console.error("Failed to toggle checklist item:", e);
    return { success: false, error: e.message || "Failed to update checklist item" };
  }
}

export async function addChecklistItem(
  taskId: string,
  text: string,
  actor: { id: string; name: string; role?: string }
) {
  try {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return { success: false, error: "Task not found" };

    const isAdmin = actor.role === "admin";
    const isCreator = task.createdById === actor.id;
    if (!isAdmin && !isCreator) {
      return { success: false, error: "Only the Task Creator or Super Admin can add sub-tasks" };
    }

    const cleanText = text.trim();
    if (!cleanText) return { success: false, error: "Sub-task text cannot be empty" };

    const list: TaskChecklistItem[] = task.checklistJson ? JSON.parse(task.checklistJson) : [];
    const newItem: TaskChecklistItem = {
      id: Math.random().toString(36).slice(2, 9),
      text: cleanText,
      completed: false,
    };
    list.push(newItem);

    const notes: TaskNote[] = task.notesJson ? JSON.parse(task.notesJson) : [];
    notes.unshift({
      id: Math.random().toString(36).slice(2, 9),
      text: `Added sub-task: "${cleanText}"`,
      userId: actor.id,
      userName: actor.name,
      timestamp: new Date().toISOString(),
      type: "activity",
    });

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        checklistJson: JSON.stringify(list),
        notesJson: JSON.stringify(notes),
      },
    });

    return { success: true, data: updated as TaskItem };
  } catch (e: any) {
    console.error("Failed to add checklist item:", e);
    return { success: false, error: e.message || "Failed to add checklist item" };
  }
}

export async function deleteChecklistItem(
  taskId: string,
  itemId: string,
  actor: { id: string; name: string; role?: string }
) {
  try {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return { success: false, error: "Task not found" };

    const isAdmin = actor.role === "admin";
    const isCreator = task.createdById === actor.id;
    if (!isAdmin && !isCreator) {
      return { success: false, error: "Only the Task Creator or Super Admin can remove sub-tasks" };
    }

    const list: TaskChecklistItem[] = task.checklistJson ? JSON.parse(task.checklistJson) : [];
    const targetItem = list.find((i) => i.id === itemId);
    const filtered = list.filter((i) => i.id !== itemId);

    const notes: TaskNote[] = task.notesJson ? JSON.parse(task.notesJson) : [];
    if (targetItem) {
      notes.unshift({
        id: Math.random().toString(36).slice(2, 9),
        text: `Removed sub-task: "${targetItem.text}"`,
        userId: actor.id,
        userName: actor.name,
        timestamp: new Date().toISOString(),
        type: "activity",
      });
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        checklistJson: filtered.length > 0 ? JSON.stringify(filtered) : null,
        notesJson: JSON.stringify(notes),
      },
    });

    return { success: true, data: updated as TaskItem };
  } catch (e: any) {
    console.error("Failed to delete checklist item:", e);
    return { success: false, error: e.message || "Failed to delete checklist item" };
  }
}


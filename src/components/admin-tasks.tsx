"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardCheck, Plus, LayoutGrid, List, X, Calendar,
  AlertTriangle, ArrowRight, CheckCircle2, Clock, User,
  Trash2, Edit2, Hash, Flag, Loader2, MessageSquare, Send,
  ChevronDown, ChevronUp, Paperclip, FileText, Image as ImageIcon,
  Download, ExternalLink, File, FileSpreadsheet, ZoomIn, Lock,
  History, ShieldAlert, Sparkles, Check, Archive, ArchiveRestore,
  Inbox, Flame, CheckSquare, RotateCw, Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { format, isPast, isToday } from "date-fns";
import {
  getTasks, createTask, updateTask, deleteTask, addTaskNote, deleteTaskNote,
  getLinkedJobDetails, archiveTask, unarchiveTask, archiveAllDoneTasks,
  toggleTaskChecklistItem, addChecklistItem, deleteChecklistItem,
  type TaskItem, type TaskPriority, type TaskStatus, type TaskNote, type TaskAttachment, type TaskChecklistItem,
} from "@/actions/tasks";
import { getUsers } from "@/actions/users";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  name: string;
  role: string;
  area: string | null;
  isActive: boolean;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  low:    { label: "Low",    color: "bg-slate-100 text-slate-600 border-slate-200",     icon: "▽" },
  medium: { label: "Medium", color: "bg-amber-50 text-amber-700 border-amber-200",     icon: "◇" },
  high:   { label: "High",   color: "bg-orange-100 text-orange-700 border-orange-200", icon: "△" },
  urgent: { label: "Urgent", color: "bg-red-100 text-red-700 border-red-200",          icon: "▲" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  todo:        { label: "To Do",       color: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  in_progress: { label: "In Progress", color: "bg-blue-50 text-blue-700",   dot: "bg-blue-500"  },
  done:        { label: "Done",        color: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", manager: "Manager", cso: "CSO", staff: "Staff", rider: "Rider",
};

const KANBAN_COLS: { key: TaskStatus; label: string; icon: React.ReactNode }[] = [
  { key: "todo",        label: "To Do",       icon: <Clock size={14} /> },
  { key: "in_progress", label: "In Progress", icon: <ArrowRight size={14} /> },
  { key: "done",        label: "Done",        icon: <CheckCircle2 size={14} /> },
];

// ─── File Upload Helper ───────────────────────────────────────────────────────

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(type?: string, name?: string): boolean {
  if (type && type.startsWith("image/")) return true;
  if (name) {
    const ext = name.split(".").pop()?.toLowerCase();
    return ["jpg", "jpeg", "png", "webp", "gif", "svg", "bmp"].includes(ext || "");
  }
  return false;
}

function getFileIcon(type?: string, name?: string) {
  if (isImageFile(type, name)) return <ImageIcon size={14} className="text-blue-500 shrink-0" />;
  const ext = name?.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <FileText size={14} className="text-red-500 shrink-0" />;
  if (["xls", "xlsx", "csv"].includes(ext || "")) return <FileSpreadsheet size={14} className="text-emerald-500 shrink-0" />;
  return <File size={14} className="text-slate-500 shrink-0" />;
}

interface JobPhoto {
  url: string;
  label: string;
}

function extractJobImages(job: any): JobPhoto[] {
  if (!job) return [];
  const list: JobPhoto[] = [];

  const parse = (field: any, label: string) => {
    if (!field) return;
    if (typeof field === "string") {
      const trimmed = field.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const arr = JSON.parse(trimmed);
          if (Array.isArray(arr)) {
            arr.forEach((u: string) => {
              if (u && typeof u === "string" && u.trim() !== "") {
                list.push({ url: u.trim(), label });
              }
            });
          }
        } catch {}
      } else if (trimmed !== "") {
        list.push({ url: trimmed, label });
      }
    }
  };

  parse(job.bagImageUrl, "Laundry Bag");
  parse(job.billImageUrl, "Bill / Receipt");
  parse(job.pickupProofImageUrl, "Pickup Proof");
  parse(job.deliveryProofImageUrl, "Delivery Proof");
  parse(job.proofImageUrl, "Proof Image");

  if (job.adminNotesJson) {
    try {
      const notes = JSON.parse(job.adminNotesJson);
      if (Array.isArray(notes)) {
        notes.forEach((n: any) => {
          if (Array.isArray(n.imageUrls)) {
            n.imageUrls.forEach((u: string) => {
              if (u && typeof u === "string" && u.trim() !== "") {
                list.push({ url: u.trim(), label: `Note (${n.userName || "Admin"})` });
              }
            });
          }
        });
      }
    } catch {}
  }

  return list;
}

async function uploadTaskFile(
  file: File,
  entityId: string = "temp",
  subType: "attachments" | "notes" = "attachments"
): Promise<TaskAttachment> {
  const fileId = Math.random().toString(36).slice(2, 9);
  
  try {
    // 1. Try GCS Signed URL
    const urlRes = await fetch("/api/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "task",
        entityId,
        subType,
        contentType: file.type || "application/octet-stream",
        fileName: file.name,
      }),
    });

    if (urlRes.ok) {
      const { uploadUrl, publicUrl } = await urlRes.json();
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (putRes.ok) {
        return {
          id: fileId,
          name: file.name,
          url: publicUrl,
          type: file.type || "application/octet-stream",
          size: file.size,
          uploadedAt: new Date().toISOString(),
        };
      } else {
        console.warn("GCS upload returned status:", putRes.status, "falling back to local storage");
      }
    }
  } catch (err) {
    console.warn("GCS upload failed, falling back to local storage:", err);
  }

  // 2. Fallback to Local Upload API
  const formData = new FormData();
  formData.append("file", file);
  formData.append("entityType", "task");
  formData.append("entityId", entityId);
  formData.append("subType", subType);

  const localRes = await fetch("/api/upload-local", {
    method: "POST",
    body: formData,
  });

  if (!localRes.ok) {
    throw new Error("Failed to upload file");
  }

  const data = await localRes.json();
  return {
    id: fileId,
    name: file.name,
    url: data.publicUrl,
    type: file.type || "application/octet-stream",
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
}

// ─── Attachment Item View ─────────────────────────────────────────────────────

function AttachmentBadge({
  attachment,
  onDelete,
  onPreviewImage,
}: {
  attachment: TaskAttachment;
  onDelete?: () => void;
  onPreviewImage?: (url: string) => void;
}) {
  const isImg = isImageFile(attachment.type, attachment.name);

  return (
    <div className="group relative flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-xs transition-colors max-w-[200px]">
      {isImg ? (
        <button
          type="button"
          onClick={() => onPreviewImage?.(attachment.url)}
          className="flex items-center gap-1.5 truncate text-slate-700 hover:text-indigo-600 cursor-pointer"
          title={`Click to view ${attachment.name}`}
        >
          <ImageIcon size={13} className="text-blue-500 shrink-0" />
          <span className="truncate text-[11px] font-medium">{attachment.name}</span>
        </button>
      ) : (
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 truncate text-slate-700 hover:text-indigo-600"
          title={`Download/Open ${attachment.name}`}
        >
          {getFileIcon(attachment.type, attachment.name)}
          <span className="truncate text-[11px] font-medium">{attachment.name}</span>
        </a>
      )}

      {attachment.size && (
        <span className="text-[9px] text-slate-400 shrink-0">({formatFileSize(attachment.size)})</span>
      )}

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="p-0.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors ml-auto shrink-0"
          title="Remove file"
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}

// ─── Notes & Activity Timeline ────────────────────────────────────────────────

function NotesPanel({
  task,
  currentUserId,
  currentUserName,
  onUpdate,
  onPreviewImage,
  compact = false,
}: {
  task: TaskItem;
  currentUserId: string;
  currentUserName: string;
  onUpdate: (updated: TaskItem) => void;
  onPreviewImage: (url: string) => void;
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const [noteAttachments, setNoteAttachments] = useState<TaskAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const notes: TaskNote[] = useMemo(() => {
    try { return task.notesJson ? JSON.parse(task.notesJson) : []; }
    catch { return []; }
  }, [task.notesJson]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploadedList: TaskAttachment[] = [];
      for (let i = 0; i < files.length; i++) {
        const item = await uploadTaskFile(files[i], task.id, "notes");
        uploadedList.push(item);
      }
      setNoteAttachments((prev) => [...prev, ...uploadedList]);
      toast.success(`${uploadedList.length} file(s) attached to note`);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAdd = async () => {
    if (!text.trim() && noteAttachments.length === 0) return;
    setSaving(true);
    const res = await addTaskNote(task.id, {
      text,
      userId: currentUserId,
      userName: currentUserName,
      attachments: noteAttachments,
    });
    setSaving(false);
    if (res.success && res.data) {
      setText("");
      setNoteAttachments([]);
      onUpdate(res.data);
      toast.success("Note added");
    } else {
      toast.error("Failed to add note");
    }
  };

  const handleDelete = async (noteId: string) => {
    const res = await deleteTaskNote(task.id, noteId);
    if (res.success && res.data) {
      onUpdate(res.data);
    } else {
      toast.error("Failed to delete note");
    }
  };

  const [viewFilter, setViewFilter] = useState<"notes" | "logs">("notes");
  const listEndRef = useRef<HTMLDivElement>(null);

  // Sort chronological ascending: oldest at top, latest at bottom (like standard chat)
  const userNotes = useMemo(() => {
    return notes
      .filter((n) => n.type !== "activity")
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [notes]);

  const activityLogs = useMemo(() => {
    return notes
      .filter((n) => n.type === "activity")
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [notes]);

  // Auto-scroll to latest message at the bottom
  useEffect(() => {
    const timer = setTimeout(() => {
      listEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
    return () => clearTimeout(timer);
  }, [userNotes.length, activityLogs.length, viewFilter]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAdd();
  };

  return (
    <div className={`flex flex-col h-full ${compact ? "mt-3 border-t border-slate-100 pt-3" : ""}`}>
      {/* Header title / Tab Switcher */}
      {!compact && (
        <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-1 bg-slate-100/90 p-0.5 rounded-lg border border-slate-200/60">
            <button
              type="button"
              onClick={() => setViewFilter("notes")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewFilter === "notes"
                  ? "bg-white text-indigo-700 shadow-2xs font-bold"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <MessageSquare size={13} className={viewFilter === "notes" ? "text-indigo-600" : "text-slate-400"} />
              <span>Notes / Chat</span>
              {userNotes.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  viewFilter === "notes" ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-600"
                }`}>
                  {userNotes.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setViewFilter("logs")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewFilter === "logs"
                  ? "bg-white text-indigo-700 shadow-2xs font-bold"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <History size={13} className={viewFilter === "logs" ? "text-indigo-600" : "text-slate-400"} />
              <span>Activity Logs</span>
              {activityLogs.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  viewFilter === "logs" ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-600"
                }`}>
                  {activityLogs.length}
                </span>
              )}
            </button>
          </div>

          <span className="text-[10px] text-slate-400 font-medium">
            {viewFilter === "notes" ? "Chat & Team Notes" : "System Activity Logs"}
          </span>
        </div>
      )}

      {/* Content Stream (Notes or Logs) */}
      <div className={`space-y-3 overflow-y-auto pr-1.5 flex-1 ${compact ? "max-h-56 mb-3" : "min-h-[420px] max-h-[580px] mb-3"}`}>
        {viewFilter === "notes" ? (
          // ── USER NOTES / CHAT VIEW ───────────────────────────────────────
          userNotes.length > 0 ? (
            userNotes.map((note) => {
              const isOwn = note.userId === currentUserId;
              const date = new Date(note.timestamp);

              return (
                <div key={note.id} className="group flex gap-2.5">
                  {/* Avatar */}
                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                    <span className="text-[10px] font-bold text-indigo-700">
                      {note.userName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 bg-white border border-slate-200 rounded-xl p-2.5 shadow-2xs">
                    <div className="flex items-baseline justify-between gap-1.5">
                      <span className="text-xs font-bold text-slate-800">{note.userName}</span>
                      <span className="text-[10px] text-slate-400">
                        {format(date, "d MMM yyyy HH:mm")}
                      </span>
                    </div>
                    {note.text && (
                      <p className="text-xs text-slate-700 leading-relaxed mt-1 break-words whitespace-pre-wrap">
                        {note.text}
                      </p>
                    )}
                    {/* Note attachments */}
                    {note.attachments && note.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2 pt-1.5 border-t border-slate-100">
                        {note.attachments.map((att) => (
                          <AttachmentBadge
                            key={att.id}
                            attachment={att}
                            onPreviewImage={onPreviewImage}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  {isOwn && (
                    <button
                      type="button"
                      onClick={() => handleDelete(note.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all shrink-0 mt-1 cursor-pointer"
                      title="Delete this message"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-16 text-slate-400 flex flex-col items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center mb-2">
                <MessageSquare size={20} />
              </div>
              <p className="text-xs font-semibold text-slate-600">No conversation notes yet in this task</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Type a message or attach files below to collaborate with team</p>
            </div>
          )
        ) : (
          // ── SYSTEM ACTIVITY LOGS VIEW ────────────────────────────────────
          activityLogs.length > 0 ? (
            <div className="space-y-2 relative before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 pl-1">
              {activityLogs.map((note) => {
                const date = new Date(note.timestamp);
                return (
                  <div key={note.id} className="relative flex items-start gap-2.5 pl-6 text-xs">
                    {/* Timeline dot */}
                    <div className="absolute left-1.5 top-2 w-2.5 h-2.5 rounded-full bg-indigo-500 ring-4 ring-white shrink-0" />
                    <div className="flex-1 bg-slate-50/90 border border-slate-200/80 rounded-lg p-2 shadow-2xs">
                      <p className="text-[11px] text-slate-700 leading-snug">
                        <span className="font-bold text-slate-900">{note.userName}</span> {note.text}
                      </p>
                      <span className="text-[9px] text-slate-400 block mt-1">
                        {format(date, "d MMM yyyy HH:mm:ss")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 text-slate-400 flex flex-col items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mb-2">
                <History size={20} />
              </div>
              <p className="text-xs font-semibold text-slate-600">No Activity Logs recorded</p>
            </div>
          )
        )}
        <div ref={listEndRef} />
      </div>

      {/* Attachments preview before posting */}
      {noteAttachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2 p-2 bg-slate-50 border border-slate-200 rounded-lg shrink-0">
          {noteAttachments.map((att) => (
            <AttachmentBadge
              key={att.id}
              attachment={att}
              onDelete={() => setNoteAttachments((prev) => prev.filter((a) => a.id !== att.id))}
              onPreviewImage={onPreviewImage}
            />
          ))}
        </div>
      )}

      {/* Input box (Available in both tabs for convenience) */}
      <div className="flex gap-2 items-end mt-auto pt-2 border-t border-slate-100 shrink-0">
        <div className="flex-1 relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type an update or attach documents... (Ctrl+Enter to send)"
            rows={2}
            className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 pr-9 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all bg-white"
          />
          {/* File attach button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute right-2.5 bottom-3 p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
            title="Attach photos or documents to Note"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileUpload}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || (!text.trim() && noteAttachments.length === 0)}
          className="h-9 w-9 flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white transition-colors shrink-0 mb-0.5 cursor-pointer shadow-2xs"
          title="Send message"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
        </button>
      </div>
    </div>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  currentUserId,
  currentUserName,
  onEdit,
  onDelete,
  onStatusChange,
  onArchive,
  onUnarchive,
  onUpdate,
  onPreviewImage,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  task: TaskItem;
  currentUserId: string;
  currentUserName: string;
  onEdit: (t: TaskItem) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onArchive?: (id: string) => void;
  onUnarchive?: (id: string) => void;
  onUpdate: (updated: TaskItem) => void;
  onPreviewImage: (url: string) => void;
  isDragging?: boolean;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
  const overdue = task.dueDate && isPast(new Date(task.dueDate)) && task.status !== "done";

  const noteCount = useMemo(() => {
    try {
      const parsed: TaskNote[] = task.notesJson ? JSON.parse(task.notesJson) : [];
      return parsed.filter((n) => n.type !== "activity").length;
    } catch {
      return 0;
    }
  }, [task.notesJson]);

  const attachments: TaskAttachment[] = useMemo(() => {
    try { return task.attachmentsJson ? JSON.parse(task.attachmentsJson) : []; }
    catch { return []; }
  }, [task.attachmentsJson]);

  const checklist: TaskChecklistItem[] = useMemo(() => {
    try { return task.checklistJson ? JSON.parse(task.checklistJson) : []; }
    catch { return []; }
  }, [task.checklistJson]);

  const completedChecklistCount = checklist.filter((i) => i.completed).length;

  return (
    <motion.div
      layout
      draggable={!task.isArchived}
      onDragStart={(e: any) => {
        if (e.dataTransfer) {
          e.dataTransfer.setData("text/plain", task.id);
          e.dataTransfer.effectAllowed = "move";
        }
        onDragStart?.(task.id);
      }}
      onDragEnd={() => {
        onDragEnd?.();
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isDragging ? 0.35 : 1, y: 0, scale: isDragging ? 0.96 : 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`bg-white rounded-xl border shadow-xs p-3.5 group hover:shadow-md transition-all select-none ${
        isDragging
          ? "border-dashed border-indigo-400 opacity-40 shadow-none ring-2 ring-indigo-300"
          : task.isArchived
          ? "border-slate-200/80 bg-slate-50/50 opacity-80 hover:opacity-100 cursor-pointer"
          : "border-slate-200 hover:border-slate-300 cursor-grab active:cursor-grabbing"
      }`}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button") || target.closest("a") || target.closest("input") || target.closest("textarea") || target.closest("select")) return;
        onEdit(task);
      }}
    >
      {/* Priority + Archive status + Actions */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
            #{task.id.startsWith("20") ? task.id : task.id.slice(-6).toUpperCase()}
          </span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${priority.color}`}>
            {priority.icon} {priority.label}
          </span>
          {task.isArchived && (
            <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded flex items-center gap-1">
              <Archive size={9} /> Archived
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Archive / Unarchive Button */}
          {task.isArchived ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onUnarchive?.(task.id); }}
              className="p-1 rounded hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"
              title="Unarchive / Restore Task"
            >
              <ArchiveRestore size={12} />
            </button>
          ) : (
            task.status === "done" && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onArchive?.(task.id); }}
                className="p-1 rounded hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
                title="Archive Task (Move completed task to archive)"
              >
                <Archive size={12} />
              </button>
            )
          )}

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(task); }}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
            title="Edit Task / View Details"
          >
            <Edit2 size={12} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
            className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
            title="Delete Task"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-slate-800 leading-snug mb-2">{task.title}</p>

      {/* Description */}
      {task.description && (
        <p className="text-xs text-slate-500 leading-relaxed mb-2 line-clamp-2">{task.description}</p>
      )}

      {/* Checklist Mini Progress Bar on Card */}
      {checklist.length > 0 && (
        <div className="mb-2.5 bg-slate-50/80 border border-slate-200/80 rounded-lg p-2 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-semibold">
            <span className="flex items-center gap-1 text-slate-600">
              <CheckSquare size={11} className={completedChecklistCount === checklist.length ? "text-emerald-600" : "text-indigo-600"} />
              Checklist ({completedChecklistCount}/{checklist.length})
            </span>
            <span className={completedChecklistCount === checklist.length ? "text-emerald-600" : "text-slate-500"}>
              {Math.round((completedChecklistCount / checklist.length) * 100)}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-200/70 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                completedChecklistCount === checklist.length ? "bg-emerald-500" : "bg-indigo-500"
              }`}
              style={{ width: `${(completedChecklistCount / checklist.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Task Attachments Strip */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {attachments.map((att) => (
            <AttachmentBadge
              key={att.id}
              attachment={att}
              onPreviewImage={onPreviewImage}
            />
          ))}
        </div>
      )}

      {/* Meta tags */}
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {task.jobId && (
          <span className="flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded font-mono font-medium">
            <Hash size={9} /> {task.jobId}
          </span>
        )}
        {task.assignedToName && (
          <span className="flex items-center gap-1 text-[10px] bg-slate-50 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">
            <User size={9} /> {task.assignedToName}
          </span>
        )}
        {task.dueDate && (
          <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${overdue ? "bg-red-50 text-red-600 border-red-200 font-semibold" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
            <Calendar size={9} />
            {overdue && <AlertTriangle size={9} />}
            {format(new Date(task.dueDate), "d MMM")}
          </span>
        )}
        {checklist.length > 0 && (
          <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium ${
            completedChecklistCount === checklist.length
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-slate-50 text-slate-600 border-slate-200"
          }`}>
            <CheckSquare size={9} /> {completedChecklistCount}/{checklist.length}
          </span>
        )}
        {attachments.length > 0 && (
          <span className="flex items-center gap-1 text-[10px] bg-slate-50 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded">
            <Paperclip size={9} /> {attachments.length}
          </span>
        )}
      </div>

      {/* Notes quick toggle on card */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setNotesOpen((o) => !o); }}
        className="mt-2.5 flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-indigo-600 transition-colors w-full cursor-pointer"
      >
        <MessageSquare size={11} />
        <span className="font-medium">
          {noteCount > 0 ? `${noteCount} note${noteCount > 1 ? "s" : ""}` : "Add note"}
        </span>
        <span className="ml-auto">{notesOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}</span>
      </button>

      {/* Inline notes panel */}
      <AnimatePresence>
        {notesOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <NotesPanel
              task={task}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              onUpdate={onUpdate}
              onPreviewImage={onPreviewImage}
              compact
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Creator / Archived info */}
      <p className="text-[9px] text-slate-400 mt-2">
        {task.isArchived
          ? `Archived by ${task.archivedByName || "User"} · ${task.archivedAt ? format(new Date(task.archivedAt), "d MMM HH:mm") : ""}`
          : `by ${task.createdByName} · ${format(new Date(task.createdAt), "d MMM HH:mm")}`
        }
      </p>
    </motion.div>
  );
}

// ─── Task Form Modal (Includes Notes & Activity Inside) ───────────────────────

function TaskFormModal({
  open,
  onClose,
  onSave,
  onArchive,
  onUnarchive,
  initialTask,
  adminUsers,
  currentUser,
  onUpdateTask,
  onPreviewImage,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  onArchive?: (id: string) => Promise<void>;
  onUnarchive?: (id: string) => Promise<void>;
  initialTask?: TaskItem | null;
  adminUsers: AdminUser[];
  currentUser?: any;
  onUpdateTask: (task: TaskItem) => void;
  onPreviewImage: (url: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [jobId, setJobId] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [assignedToName, setAssignedToName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [checklist, setChecklist] = useState<TaskChecklistItem[]>([]);
  const [newChecklistText, setNewChecklistText] = useState("");
  const [mobileTab, setMobileTab] = useState<"info" | "checklist" | "chat">("info");
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingJob, setLoadingJob] = useState(false);
  const [linkedJob, setLinkedJob] = useState<any>(null);

  const modalFileInputRef = useRef<HTMLInputElement>(null);
  const assigneeContainerRef = useRef<HTMLDivElement>(null);

  const currentUserId = currentUser?.id ?? "unknown";
  const currentUserName = currentUser?.name ?? currentUser?.email ?? "User";
  const currentUserRole = currentUser?.role ?? "staff";

  // 🔒 Permission check: Only Creator or Super Admin can edit core task details (Title, Description, Priority, Job ID, Assign To, Due Date, Task Attachments)
  const canEditTaskDetails = useMemo(() => {
    if (!initialTask) return true; // Can set everything when creating a new task
    const isCreator = initialTask.createdById === currentUserId;
    const isAdmin = currentUserRole === "admin";
    return isCreator || isAdmin;
  }, [initialTask, currentUserId, currentUserRole]);

  const groupedUsers = useMemo(() => {
    const active = adminUsers.filter((u) => u.isActive !== false && u.role !== "rider");
    const byRole: Record<string, Record<string, AdminUser[]>> = {};
    active.forEach((u) => {
      const role = u.role || "staff";
      const branch = u.area || "General";
      if (!byRole[role]) byRole[role] = {};
      if (!byRole[role][branch]) byRole[role][branch] = [];
      byRole[role][branch].push(u);
    });
    return byRole;
  }, [adminUsers]);

  useEffect(() => {
    if (open) {
      setTitle(initialTask?.title ?? "");
      setDescription(initialTask?.description ?? "");
      setPriority((initialTask?.priority as TaskPriority) ?? "medium");
      setStatus((initialTask?.status as TaskStatus) ?? "todo");
      setJobId(initialTask?.jobId ?? "");
      setAssignedToId(initialTask?.assignedToId ?? "");
      setAssignedToName(initialTask?.assignedToName ?? "");
      setDueDate(initialTask?.dueDate ? format(new Date(initialTask.dueDate), "yyyy-MM-dd") : "");
      setAssigneeSearch(initialTask?.assignedToName ?? "");
      setAssigneeDropdownOpen(false);
      setLinkedJob(null);
      try {
        setAttachments(initialTask?.attachmentsJson ? JSON.parse(initialTask.attachmentsJson) : []);
      } catch {
        setAttachments([]);
      }
      try {
        setChecklist(initialTask?.checklistJson ? JSON.parse(initialTask.checklistJson) : []);
      } catch {
        setChecklist([]);
      }
      setNewChecklistText("");
      setMobileTab("info");
    } else {
      setLinkedJob(null);
      setJobId("");
      setAssigneeSearch("");
      setAssigneeDropdownOpen(false);
    }
  }, [open, initialTask]);

  // Click outside to close assignee auto-complete dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (assigneeContainerRef.current && !assigneeContainerRef.current.contains(e.target as Node)) {
        setAssigneeDropdownOpen(false);
      }
    };
    if (assigneeDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [assigneeDropdownOpen]);

  const filteredUsers = useMemo(() => {
    const q = assigneeSearch.trim().toLowerCase();
    const active = adminUsers.filter((u) => u.isActive !== false && u.role !== "rider");
    if (!q || (assignedToName && q === assignedToName.toLowerCase())) {
      return active;
    }
    return active.filter((u) => {
      const nameMatch = u.name.toLowerCase().includes(q);
      const roleMatch = (ROLE_LABELS[u.role] || u.role).toLowerCase().includes(q);
      const areaMatch = (u.area || "").toLowerCase().includes(q);
      return nameMatch || roleMatch || areaMatch;
    });
  }, [adminUsers, assigneeSearch, assignedToName]);

  // Auto-fetch linked job details and photos
  useEffect(() => {
    if (open && jobId && jobId.trim().length >= 4) {
      setLoadingJob(true);
      getLinkedJobDetails(jobId.trim())
        .then((res) => {
          if (res.success && res.data) {
            setLinkedJob(res.data);
          } else {
            setLinkedJob(null);
          }
        })
        .catch(() => setLinkedJob(null))
        .finally(() => setLoadingJob(false));
    } else {
      setLinkedJob(null);
    }
  }, [open, jobId]);

  const jobPhotos: JobPhoto[] = useMemo(() => {
    return extractJobImages(linkedJob);
  }, [linkedJob]);

  const handleAssignChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = adminUsers.find((u) => u.id === e.target.value);
    setAssignedToId(e.target.value);
    setAssignedToName(selected?.name ?? "");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploadedList: TaskAttachment[] = [];
      for (let i = 0; i < files.length; i++) {
        const item = await uploadTaskFile(files[i], initialTask?.id || "new-task", "attachments");
        uploadedList.push(item);
      }
      setAttachments((prev) => [...prev, ...uploadedList]);
      toast.success(`${uploadedList.length} file(s) attached`);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload file");
    } finally {
      setUploading(false);
      if (modalFileInputRef.current) modalFileInputRef.current.value = "";
    }
  };

  const handleToggleChecklistItem = async (itemId: string) => {
    const item = checklist.find((i) => i.id === itemId);
    if (!item) return;
    const nextCompleted = !item.completed;
    const nowIso = new Date().toISOString();

    const nextList = checklist.map((i) =>
      i.id === itemId
        ? {
            ...i,
            completed: nextCompleted,
            completedAt: nextCompleted ? nowIso : null,
            completedById: nextCompleted ? currentUserId : null,
            completedByName: nextCompleted ? currentUserName : null,
          }
        : i
    );
    setChecklist(nextList);

    // If editing existing task, persist immediately to server and update live state
    if (initialTask?.id) {
      try {
        const res = await toggleTaskChecklistItem(initialTask.id, itemId, nextCompleted, {
          id: currentUserId,
          name: currentUserName,
          role: currentUserRole,
        });
        if (res.success && res.data) {
          onUpdateTask(res.data);
        }
      } catch (err: any) {
        toast.error("Failed to update checklist item");
      }
    }
  };

  const handleAddChecklistItem = async () => {
    if (!newChecklistText.trim()) return;
    const text = newChecklistText.trim();
    const newItem: TaskChecklistItem = {
      id: Math.random().toString(36).slice(2, 9),
      text,
      completed: false,
    };
    setChecklist((prev) => [...prev, newItem]);
    setNewChecklistText("");

    // If editing existing task, persist immediately to server
    if (initialTask?.id) {
      try {
        const res = await addChecklistItem(initialTask.id, text, {
          id: currentUserId,
          name: currentUserName,
          role: currentUserRole,
        });
        if (res.success && res.data) {
          onUpdateTask(res.data);
          toast.success("Added sub-task");
        }
      } catch (err: any) {
        toast.error("Failed to add sub-task");
      }
    }
  };

  const handleDeleteChecklistItem = async (itemId: string) => {
    setChecklist((prev) => prev.filter((i) => i.id !== itemId));

    // If editing existing task, persist immediately to server
    if (initialTask?.id) {
      try {
        const res = await deleteChecklistItem(initialTask.id, itemId, {
          id: currentUserId,
          name: currentUserName,
          role: currentUserRole,
        });
        if (res.success && res.data) {
          onUpdateTask(res.data);
          toast.success("Removed sub-task");
        }
      } catch (err: any) {
        toast.error("Failed to delete sub-task");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error("Please enter a task title"); return; }
    setSaving(true);
    await onSave({
      title,
      description,
      priority,
      status,
      jobId,
      assignedToId,
      assignedToName,
      dueDate,
      attachments,
      checklist,
    });
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-h-[94vh] sm:max-h-[90vh] flex flex-col p-3.5 sm:p-6 overflow-hidden ${
        initialTask
          ? "h-[92vh] sm:h-[88vh] sm:max-w-6xl max-w-[96vw] lg:max-w-7xl"
          : "h-[90vh] sm:h-[680px] sm:max-w-3xl lg:max-w-4xl max-w-[96vw]"
      }`}>
        {/* Header */}
        <DialogHeader className="shrink-0 pb-2.5 sm:pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between pr-6">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                <ClipboardCheck size={17} />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-sm sm:text-base font-bold text-slate-900 flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span>{initialTask ? `Edit Task #${initialTask.id.startsWith("20") ? initialTask.id : initialTask.id.slice(-6).toUpperCase()}` : "Create New Task"}</span>
                  {initialTask && (
                    <span className={`text-[9px] sm:text-[10px] uppercase font-bold px-1.5 sm:px-2 py-0.5 rounded border ${PRIORITY_CONFIG[initialTask.priority]?.color}`}>
                      {PRIORITY_CONFIG[initialTask.priority]?.icon} {PRIORITY_CONFIG[initialTask.priority]?.label}
                    </span>
                  )}
                </DialogTitle>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate max-w-[280px] sm:max-w-none">
                  {initialTask ? `Created by ${initialTask.createdByName} on ${format(new Date(initialTask.createdAt), "d MMM yyyy HH:mm")}` : "Assign tasks, checklist sub-tasks and track team workflow."}
                </p>
              </div>
            </div>
            {initialTask?.isArchived && (
              <span className="text-[10px] sm:text-xs bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md border border-slate-200 flex items-center gap-1 shadow-2xs shrink-0">
                <Archive size={11} /> Archived
              </span>
            )}
          </div>
        </DialogHeader>

        {/* 📱 Mobile Section Switcher (< lg) */}
        <div className="flex lg:hidden items-center gap-1 p-1 bg-slate-100/90 rounded-lg shrink-0 border border-slate-200/60 my-1">
          <button
            type="button"
            onClick={() => setMobileTab("info")}
            className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1 cursor-pointer ${
              mobileTab === "info" ? "bg-white text-indigo-700 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <FileText size={12} className={mobileTab === "info" ? "text-indigo-600" : "text-slate-400"} />
            <span>Info & Job</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab("checklist")}
            className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1 cursor-pointer ${
              mobileTab === "checklist" ? "bg-white text-indigo-700 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <CheckSquare size={12} className={mobileTab === "checklist" ? "text-indigo-600" : "text-slate-400"} />
            <span>Checklist ({checklist.length})</span>
          </button>

          {initialTask && (
            <button
              type="button"
              onClick={() => setMobileTab("chat")}
              className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1 cursor-pointer ${
                mobileTab === "chat" ? "bg-white text-indigo-700 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <MessageSquare size={12} className={mobileTab === "chat" ? "text-indigo-600" : "text-slate-400"} />
              <span>Chat / Logs</span>
            </button>
          )}
        </div>

        {/* Body (Desktop: 2 columns for Create, 3 columns for Edit) */}
        <div className={`grid grid-cols-1 gap-5 flex-1 min-h-0 py-2 overflow-y-auto lg:overflow-hidden ${
          initialTask ? "lg:grid-cols-12" : "lg:grid-cols-2"
        }`}>
          {/* ─── COLUMN 1: Basic Info & Linked Job ─── */}
          <div className={`${
            initialTask ? "lg:col-span-4" : "lg:col-span-1"
          } flex flex-col min-h-0 overflow-y-auto overflow-x-hidden pr-1 space-y-3.5 ${mobileTab === "info" ? "flex" : "hidden lg:flex"}`}>
            <form id="task-form" onSubmit={handleSubmit} className="space-y-3">
              {/* Title */}
              <div className="space-y-1">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  Task Title * {!canEditTaskDetails && <Lock size={10} className="text-amber-500" />}
                </Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={!canEditTaskDetails}
                  placeholder="e.g. Follow up with customer..."
                  className={`h-9 text-sm font-semibold ${!canEditTaskDetails ? "bg-slate-100 text-slate-600 cursor-not-allowed border-slate-200" : ""}`}
                  autoFocus={canEditTaskDetails}
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  Description {!canEditTaskDetails && <Lock size={10} className="text-amber-500" />}
                </Label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!canEditTaskDetails}
                  placeholder="Additional task description or instructions..."
                  rows={2}
                  className={`w-full text-xs border rounded-lg px-3 py-2 resize-none transition-all ${
                    !canEditTaskDetails
                      ? "bg-slate-100 text-slate-600 cursor-not-allowed border-slate-200"
                      : "border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                  }`}
                />
              </div>

              {/* Priority & Status */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                    Priority {!canEditTaskDetails && <Lock size={10} className="text-amber-500" />}
                  </Label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    disabled={!canEditTaskDetails}
                    className={`w-full h-8.5 text-xs font-medium border rounded-lg px-2 transition-all ${
                      !canEditTaskDetails
                        ? "bg-slate-100 text-slate-600 cursor-not-allowed border-slate-200"
                        : "bg-white border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 cursor-pointer"
                    }`}
                  >
                    {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    Status
                  </Label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TaskStatus)}
                    className="w-full h-8.5 text-xs font-semibold border border-slate-200 rounded-lg px-2 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 bg-white text-slate-800 cursor-pointer"
                  >
                    <option value="todo">📋 To Do</option>
                    <option value="in_progress">⚡ In Progress</option>
                    <option value="done">✅ Done</option>
                  </select>
                </div>
              </div>

              {/* Assign To (Searchable Auto-complete - Full Width for Perfect Dropdown Fit) */}
              <div className="space-y-1 relative" ref={assigneeContainerRef}>
                <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  Assign To {!canEditTaskDetails && <Lock size={10} className="text-amber-500" />}
                </Label>
                <div className="relative">
                  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={13} />
                  <Input
                    type="text"
                    value={assigneeSearch}
                    onChange={(e) => {
                      setAssigneeSearch(e.target.value);
                      setAssigneeDropdownOpen(true);
                      if (!e.target.value.trim()) {
                        setAssignedToId("");
                        setAssignedToName("");
                      }
                    }}
                    onFocus={() => {
                      if (canEditTaskDetails) setAssigneeDropdownOpen(true);
                    }}
                    disabled={!canEditTaskDetails}
                    placeholder="Search or select staff..."
                    className={`h-8.5 pl-8 pr-14 text-xs font-medium w-full ${
                      !canEditTaskDetails
                        ? "bg-slate-100 text-slate-600 cursor-not-allowed border-slate-200"
                        : "bg-white border-slate-200 focus-visible:ring-indigo-500"
                    }`}
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                    {assignedToId && canEditTaskDetails && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAssignedToId("");
                          setAssignedToName("");
                          setAssigneeSearch("");
                          setAssigneeDropdownOpen(false);
                        }}
                        className="text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 cursor-pointer"
                        title="Unassign / Clear"
                      >
                        <X size={12} />
                      </button>
                    )}
                    {canEditTaskDetails && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAssigneeDropdownOpen((prev) => !prev);
                        }}
                        className="text-slate-400 hover:text-indigo-600 p-1 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Toggle user list"
                      >
                        {assigneeDropdownOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Auto-complete floating dropdown - fits 100% width cleanly */}
                {assigneeDropdownOpen && canEditTaskDetails && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                    {/* Option to Unassign */}
                    <button
                      type="button"
                      onClick={() => {
                        setAssignedToId("");
                        setAssignedToName("");
                        setAssigneeSearch("");
                        setAssigneeDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                        !assignedToId ? "bg-indigo-50 text-indigo-700 font-bold border border-indigo-100" : "hover:bg-slate-50 text-slate-500"
                      }`}
                    >
                      <span className="italic font-medium">— Unassigned —</span>
                      {!assignedToId && <Check size={14} className="text-indigo-600" />}
                    </button>

                    {/* Matching user list */}
                    {filteredUsers.length > 0 ? (
                      filteredUsers.map((u) => {
                        const isSelected = assignedToId === u.id;
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setAssignedToId(u.id);
                              setAssignedToName(u.name);
                              setAssigneeSearch(u.name);
                              setAssigneeDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                              isSelected ? "bg-indigo-50 text-indigo-700 font-bold border border-indigo-100" : "hover:bg-slate-50 text-slate-700 font-medium"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div className={`w-5.5 h-5.5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                isSelected ? "bg-indigo-600 text-white shadow-2xs" : "bg-slate-100 text-slate-700 border border-slate-200"
                              }`}>
                                {u.name.slice(0, 1).toUpperCase()}
                              </div>
                              <span className="truncate text-xs font-semibold text-slate-800">{u.name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full font-medium">
                                {ROLE_LABELS[u.role] ?? u.role} {u.area ? `· ${u.area}` : ""}
                              </span>
                              {isSelected && <Check size={14} className="text-indigo-600 shrink-0" />}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-3 text-center text-xs text-slate-400">
                        No staff found matching "{assigneeSearch}"
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Due Date & Linked Job ID */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                    Due Date {!canEditTaskDetails && <Lock size={10} className="text-amber-500" />}
                  </Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    disabled={!canEditTaskDetails}
                    className={`h-8.5 text-xs ${!canEditTaskDetails ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200" : ""}`}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                    <Hash size={11} className="text-indigo-600" /> Linked Job ID {!canEditTaskDetails && <Lock size={10} className="text-amber-500" />}
                  </Label>
                  <Input
                    value={jobId}
                    onChange={(e) => setJobId(e.target.value)}
                    disabled={!canEditTaskDetails}
                    placeholder="e.g. 2026002684"
                    className={`h-8.5 text-xs font-mono ${!canEditTaskDetails ? "bg-slate-100 text-slate-600 cursor-not-allowed border-slate-200" : ""}`}
                  />
                </div>
              </div>

                {/* 📸 Linked Job Live Card */}
                {Boolean(jobId && jobId.trim().length >= 4 && linkedJob) && (
                  <div className="bg-indigo-50/60 border border-indigo-150 rounded-xl p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950 truncate">
                        <span className="font-mono text-indigo-700">#{linkedJob.id}</span>
                        <span className="text-indigo-800 truncate">· {linkedJob.customerName || "Customer"}</span>
                      </div>
                      <span className="text-[9px] bg-white border border-indigo-200 text-indigo-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0">
                        {linkedJob.status}
                      </span>
                    </div>

                    {linkedJob.customerPhone && (
                      <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-1.5">
                        <span>📞 {linkedJob.customerPhone}</span>
                        {linkedJob.serviceType && <span>· 🧺 {linkedJob.serviceType}</span>}
                        {linkedJob.totalAmount !== null && linkedJob.totalAmount !== undefined && (
                          <span className="font-semibold text-slate-800">· ฿{Number(linkedJob.totalAmount).toLocaleString()}</span>
                        )}
                      </div>
                    )}

                    {/* Photos from the Linked Job */}
                    {jobPhotos.length > 0 ? (
                      <div className="space-y-1 pt-1.5 border-t border-indigo-100/80">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1">
                            <ImageIcon size={10} className="text-indigo-600" />
                            Job Photos ({jobPhotos.length})
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-white/90 rounded-lg border border-indigo-100">
                          {jobPhotos.map((photo, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => onPreviewImage(photo.url)}
                              className="group relative flex flex-col items-center gap-0.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded p-0.5 transition-all cursor-pointer shadow-2xs"
                              title={`Preview: ${photo.label}`}
                            >
                              <img
                                src={photo.url}
                                alt={photo.label}
                                className="w-10 h-10 object-cover rounded group-hover:scale-105 transition-transform"
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 italic pt-1 border-t border-indigo-100/80">
                        No photos attached in this Job
                      </p>
                    )}
                  </div>
                )}
            </form>
          </div>

          {/* ─── COLUMN 2: Checklist & Attachments ─── */}
          <div className={`${
            initialTask ? "lg:col-span-4" : "lg:col-span-1"
          } flex flex-col min-h-0 overflow-y-auto pr-1 space-y-3.5 lg:border-l lg:border-slate-200/80 lg:pl-5 ${mobileTab === "checklist" ? "flex" : "hidden lg:flex"}`}>
            {/* Checklist Section */}
            <div className="space-y-2 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between shrink-0">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <CheckSquare size={14} className="text-indigo-600" />
                  Checklist / Sub-tasks
                  {checklist.length > 0 && (
                    <span className="text-slate-500 font-normal">
                      ({checklist.filter((i) => i.completed).length}/{checklist.length})
                    </span>
                  )}
                </Label>
                {checklist.length > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    checklist.filter((i) => i.completed).length === checklist.length ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-600"
                  }`}>
                    {Math.round((checklist.filter((i) => i.completed).length / checklist.length) * 100)}%
                  </span>
                )}
              </div>

              {/* Progress bar */}
              {checklist.length > 0 && (
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
                  <div
                    className={`h-full transition-all duration-300 ${
                      checklist.filter((i) => i.completed).length === checklist.length ? "bg-emerald-500" : "bg-indigo-500"
                    }`}
                    style={{
                      width: `${(checklist.filter((i) => i.completed).length / checklist.length) * 100}%`,
                    }}
                  />
                </div>
              )}

              {/* Checklist Items list */}
              <div className="space-y-1.5 bg-slate-50/80 border border-slate-200 rounded-xl p-2 flex-1 min-h-[140px] max-h-[260px] overflow-y-auto">
                {checklist.length > 0 ? (
                  checklist.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-start justify-between gap-2 p-2 rounded-lg text-xs transition-colors group ${
                        item.completed ? "bg-emerald-50/70 border border-emerald-100 shadow-2xs" : "bg-white border border-slate-200 hover:border-slate-300 shadow-2xs"
                      }`}
                    >
                      <label className="flex items-start gap-2 cursor-pointer flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={() => handleToggleChecklistItem(item.id)}
                          className="mt-0.5 w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                        />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className={`leading-relaxed break-words text-xs ${item.completed ? "line-through text-slate-400 font-normal" : "text-slate-800 font-medium"}`}>
                            {item.text}
                          </span>
                          {item.completed && item.completedByName && (
                            <span className="text-[9px] text-emerald-600 font-normal mt-0.5">
                              ✓ Completed by {item.completedByName} {item.completedAt ? `(${format(new Date(item.completedAt), "d MMM HH:mm")})` : ""}
                            </span>
                          )}
                        </div>
                      </label>

                      {canEditTaskDetails && (
                        <button
                          type="button"
                          onClick={() => handleDeleteChecklistItem(item.id)}
                          className="text-slate-300 hover:text-red-500 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shrink-0"
                          title="Delete this sub-task"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-slate-400 flex flex-col items-center justify-center">
                    <CheckSquare size={22} className="text-slate-300 mb-1" />
                    <p className="text-xs font-semibold text-slate-500">No checklist items yet</p>
                    <p className="text-[10px] text-slate-400">Add sub-tasks below to track task progress</p>
                  </div>
                )}
              </div>

              {/* Add Checklist Item Input */}
              {canEditTaskDetails && (
                <div className="flex items-center gap-1.5 shrink-0 pt-1">
                  <Input
                    value={newChecklistText}
                    onChange={(e) => setNewChecklistText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddChecklistItem();
                      }
                    }}
                    placeholder="+ Add sub-task item (Press Enter)..."
                    className="h-8.5 text-xs bg-white border-slate-200 focus-visible:ring-indigo-500"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddChecklistItem}
                    disabled={!newChecklistText.trim()}
                    className="h-8.5 px-3 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 shrink-0 cursor-pointer"
                  >
                    <Plus size={13} className="mr-0.5" /> Add
                  </Button>
                </div>
              )}
            </div>

            {/* Task Attachments Section */}
            <div className="space-y-2 pt-2.5 border-t border-slate-100 shrink-0">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Paperclip size={13} className="text-indigo-600" />
                  Attachments {attachments.length > 0 && `(${attachments.length})`}
                </Label>
                {canEditTaskDetails && (
                  <button
                    type="button"
                    onClick={() => modalFileInputRef.current?.click()}
                    disabled={uploading}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {uploading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    Upload File
                  </button>
                )}
                <input
                  ref={modalFileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                />
              </div>

              {/* Uploaded attachments badge list */}
              {attachments.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl max-h-24 overflow-y-auto">
                  {attachments.map((att) => (
                    <AttachmentBadge
                      key={att.id}
                      attachment={att}
                      onDelete={canEditTaskDetails ? () => setAttachments((prev) => prev.filter((a) => a.id !== att.id)) : undefined}
                      onPreviewImage={onPreviewImage}
                    />
                  ))}
                </div>
              ) : (
                canEditTaskDetails ? (
                  <div
                    onClick={() => modalFileInputRef.current?.click()}
                    className="border border-dashed border-slate-200 hover:border-indigo-300 rounded-xl p-2.5 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-indigo-50/30"
                  >
                    <Paperclip size={14} className="mx-auto text-slate-400 mb-0.5" />
                    <p className="text-xs text-slate-500 font-medium">Click to upload photos or documents</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic p-2 bg-slate-50 rounded-lg border border-slate-100">
                    No attachments uploaded
                  </p>
                )
              )}
            </div>
          </div>

          {/* ─── COLUMN 3: Notes / Chat & Activity Logs (Only for existing tasks) ─── */}
          {initialTask && (
            <div className={`lg:col-span-4 flex flex-col min-h-0 lg:border-l lg:border-slate-200/80 lg:pl-5 ${mobileTab === "chat" ? "flex" : "hidden lg:flex"}`}>
              <NotesPanel
                task={initialTask}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                onUpdate={onUpdateTask}
                onPreviewImage={onPreviewImage}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="pt-3 border-t border-slate-100 shrink-0 flex items-center justify-between gap-2">
          <div>
            {initialTask && (
              initialTask.isArchived ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onUnarchive?.(initialTask.id)}
                  className="text-indigo-600 hover:bg-indigo-50 border-indigo-200 cursor-pointer"
                >
                  <ArchiveRestore size={14} className="mr-1.5" /> Unarchive Task
                </Button>
              ) : (
                initialTask.status === "done" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onArchive?.(initialTask.id)}
                    className="text-amber-700 hover:bg-amber-50 border-amber-200 cursor-pointer"
                  >
                    <Archive size={14} className="mr-1.5" /> Archive Task
                  </Button>
                )
              )
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              form="task-form"
              size="sm"
              disabled={saving || uploading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shadow-sm"
            >
              {saving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <ClipboardCheck size={14} className="mr-1.5" />}
              {initialTask ? "Save Changes" : "Create Task"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Module Level Cache for Instant Tab Switching ────────────────────────────
let cachedTasks: TaskItem[] | null = null;
let cachedAdminUsers: AdminUser[] | null = null;

// ─── Main Component ───────────────────────────────────────────────────────────

export function AdminTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>(() => cachedTasks || []);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>(() => cachedAdminUsers || []);
  const [loading, setLoading] = useState(() => !cachedTasks);
  const [isSyncing, setIsSyncing] = useState(false);
  const isFetchingRef = useRef(false);
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [filterStatus, setFilterStatus] = useState<"all" | "mine" | "open" | "overdue" | "due_today" | "archived">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [mobileKanbanCol, setMobileKanbanCol] = useState<TaskStatus>("todo");
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const currentUserId   = user?.id ?? "unknown";
  const currentUserName = (user as any)?.name ?? user?.email ?? "Admin";

  const loadTasks = async (silent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (!silent) setIsSyncing(true);
    try {
      const res = await getTasks(user ? { id: user.id, role: user.role } : undefined);
      if (res.success && res.data) {
        cachedTasks = res.data;
        setTasks(res.data);

        // If a task modal is currently open, keep editingTask fresh with live updates
        setEditingTask((prev) => {
          if (!prev) return null;
          const updated = res.data!.find((t) => t.id === prev.id);
          return updated || prev;
        });
      }
    } catch (e) {
      console.error("Failed to load tasks:", e);
    } finally {
      isFetchingRef.current = false;
      if (!silent) setIsSyncing(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!cachedTasks) setLoading(true);
      await Promise.all([
        loadTasks(true),
        getUsers().then((res) => {
          if (res.success && res.data && mounted) {
            cachedAdminUsers = res.data as AdminUser[];
            setAdminUsers(res.data as AdminUser[]);
          }
        }),
      ]);
      if (mounted) setLoading(false);
    })();

    // 🔄 Auto-Sync: Poll tasks in background every 10 seconds when tab is active
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && !document.hidden) {
        loadTasks(true);
      }
    }, 10000);

    // 🔄 Auto-Sync: Immediately refresh when user switches back to this tab or focus
    const handleVisibility = () => {
      if (!document.hidden) {
        loadTasks(true);
      }
    };
    const handleFocus = () => {
      loadTasks(true);
    };
    const handleTasksChanged = () => {
      loadTasks(true);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("tasks-changed", handleTasksChanged);

    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("tasks-changed", handleTasksChanged);
    };
  }, [user?.id, user?.role]);

  // Listen to external navigation events from NotificationBell
  useEffect(() => {
    const handleOpenTask = (e: any) => {
      const taskId = e.detail?.taskId;
      if (taskId) {
        const target = tasks.find((t) => t.id === taskId);
        if (target) {
          setEditingTask(target);
          setModalOpen(true);
        } else {
          // If task not loaded yet, reload tasks and open
          getTasks(user ? { id: user.id, role: user.role } : undefined).then((res) => {
            if (res.success && res.data) {
              setTasks(res.data);
              const found = res.data.find((t) => t.id === taskId);
              if (found) {
                setEditingTask(found);
                setModalOpen(true);
              }
            }
          });
        }
      }
    };
    window.addEventListener("open-task-modal", handleOpenTask);
    return () => window.removeEventListener("open-task-modal", handleOpenTask);
  }, [tasks, user?.id, user?.role]);

  const overdueCount = useMemo(() => {
    return tasks.filter((t) => !t.isArchived && t.status !== "done" && t.dueDate && isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate))).length;
  }, [tasks]);

  const dueTodayCount = useMemo(() => {
    return tasks.filter((t) => !t.isArchived && t.status !== "done" && t.dueDate && isToday(new Date(t.dueDate))).length;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const terms = q ? q.split(/\s+/).filter(Boolean) : [];

    return tasks.filter((t) => {
      // 1. Status / archive filter
      if (filterStatus === "archived") {
        if (t.isArchived !== true) return false;
      } else {
        if (t.isArchived) return false;
        if (filterStatus === "mine") {
          if (t.assignedToId !== user?.id && t.createdById !== user?.id) return false;
        }
        if (filterStatus === "open") {
          if (t.status === "done") return false;
        }
        if (filterStatus === "overdue") {
          if (t.status === "done" || !t.dueDate || !isPast(new Date(t.dueDate)) || isToday(new Date(t.dueDate))) return false;
        }
        if (filterStatus === "due_today") {
          if (t.status === "done" || !t.dueDate || !isToday(new Date(t.dueDate))) return false;
        }
      }

      // 2. Super Search multi-term matching (searches ID, title, description, job, staff, notes, checklist, attachments)
      if (terms.length === 0) return true;

      const checklistTexts = (() => {
        try {
          const list: TaskChecklistItem[] = t.checklistJson ? JSON.parse(t.checklistJson) : [];
          return list.map((i) => `${i.text} ${i.completedByName || ""}`).join(" ");
        } catch { return ""; }
      })();

      const notesTexts = (() => {
        try {
          const notes: TaskNote[] = t.notesJson ? JSON.parse(t.notesJson) : [];
          return notes.map((n) => `${n.text} ${n.userName || ""}`).join(" ");
        } catch { return ""; }
      })();

      const attachmentNames = (() => {
        try {
          const atts: TaskAttachment[] = t.attachmentsJson ? JSON.parse(t.attachmentsJson) : [];
          return atts.map((a) => a.name).join(" ");
        } catch { return ""; }
      })();

      const priorityLabel = PRIORITY_CONFIG[t.priority]?.label || "";
      const statusLabel = STATUS_CONFIG[t.status]?.label || "";

      const searchableBlob = [
        t.id,
        t.id.slice(-6),
        t.title,
        t.description || "",
        t.jobId || "",
        t.assignedToName || "",
        t.createdByName || "",
        priorityLabel,
        t.priority,
        statusLabel,
        t.status,
        checklistTexts,
        notesTexts,
        attachmentNames,
      ].join(" ").toLowerCase();

      return terms.every((term) => searchableBlob.includes(term));
    });
  }, [tasks, filterStatus, user?.id, searchQuery]);

  const pendingCount = tasks.filter((t) => !t.isArchived && t.status !== "done").length;
  const archivedCount = tasks.filter((t) => t.isArchived).length;
  const doneUnarchivedCount = tasks.filter((t) => !t.isArchived && t.status === "done").length;

  const handleTaskUpdate = (updated: TaskItem) => {
    setTasks((ts) => ts.map((t) => t.id === updated.id ? updated : t));
    if (editingTask && editingTask.id === updated.id) {
      setEditingTask(updated);
    }
  };

  const handleSave = async (data: any) => {
    if (editingTask) {
      const res = await updateTask(editingTask.id, data, {
        id: currentUserId,
        name: currentUserName,
        role: user?.role,
      });
      if (res.success && res.data) {
        toast.success("Task updated & changes logged");
        handleTaskUpdate(res.data);
        setModalOpen(false);
        setEditingTask(null);
      } else {
        toast.error(res.error || "Failed to update task");
      }
    } else {
      const res = await createTask({
        ...data,
        createdById: currentUserId,
        createdByName: currentUserName,
      });
      if (res.success) {
        toast.success("Task created");
        await loadTasks();
        setModalOpen(false);
      } else {
        toast.error(res.error);
      }
    }
  };

  const handleStatusChange = async (id: string, status: TaskStatus) => {
    const prev = tasks;
    setTasks((ts) => ts.map((t) => t.id === id ? { ...t, status } : t));
    const res = await updateTask(
      id,
      { status },
      { id: currentUserId, name: currentUserName, role: user?.role }
    );
    if (res.success && res.data) {
      handleTaskUpdate(res.data);
    } else {
      toast.error(res.error);
      setTasks(prev);
    }
  };

  const handleArchive = async (id: string) => {
    const res = await archiveTask(id, { id: currentUserId, name: currentUserName, role: user?.role });
    if (res.success && res.data) {
      toast.success("Task archived");
      handleTaskUpdate(res.data);
      if (editingTask?.id === id) setModalOpen(false);
    } else {
      toast.error(res.error || "Failed to archive task");
    }
  };

  const handleUnarchive = async (id: string) => {
    const res = await unarchiveTask(id, { id: currentUserId, name: currentUserName, role: user?.role });
    if (res.success && res.data) {
      toast.success("Task unarchived");
      handleTaskUpdate(res.data);
      if (editingTask?.id === id) setModalOpen(false);
    } else {
      toast.error(res.error || "Failed to unarchive task");
    }
  };

  const handleArchiveAllDone = async () => {
    if (!confirm(`Archive all ${doneUnarchivedCount} completed tasks?`)) return;
    const res = await archiveAllDoneTasks({ id: currentUserId, name: currentUserName, role: user?.role });
    if (res.success) {
      toast.success(`Archived ${res.count} completed task(s)`);
      await loadTasks();
    } else {
      toast.error(res.error || "Failed to batch archive");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this task?")) return;
    setTasks((ts) => ts.filter((t) => t.id !== id));
    const res = await deleteTask(id, { id: currentUserId, name: currentUserName, role: user?.role });
    if (res.success) toast.success("Task deleted");
    else { toast.error(res.error); await loadTasks(); }
  };

  const openEdit   = (task: TaskItem) => { setEditingTask(task); setModalOpen(true); };
  const openCreate = () => { setEditingTask(null); setModalOpen(true); };

  if (loading && tasks.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50 p-6 animate-pulse">
        <div className="h-10 bg-slate-200/70 rounded-xl w-64 mb-6" />
        <div className="grid grid-cols-3 gap-4 flex-1">
          <div className="bg-slate-200/50 rounded-xl p-4 h-64 border border-slate-200/60" />
          <div className="bg-slate-200/50 rounded-xl p-4 h-64 border border-slate-200/60" />
          <div className="bg-slate-200/50 rounded-xl p-4 h-64 border border-slate-200/60" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
              <ClipboardCheck size={18} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                {filterStatus === "archived"
                  ? "Archived Tasks"
                  : filterStatus === "overdue"
                  ? "Overdue Tasks"
                  : filterStatus === "due_today"
                  ? "Due Today"
                  : "Task Board"}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500">
                {filterStatus === "archived"
                  ? `${archivedCount} archived task${archivedCount !== 1 ? "s" : ""}`
                  : filterStatus === "overdue"
                  ? `${overdueCount} task${overdueCount !== 1 ? "s" : ""} past due date`
                  : filterStatus === "due_today"
                  ? `${dueTodayCount} task${dueTodayCount !== 1 ? "s" : ""} due today`
                  : `${pendingCount} task${pendingCount !== 1 ? "s" : ""} pending`
                }
              </p>
            </div>
          </div>

          {/* New Task button on mobile header */}
          {filterStatus !== "archived" && (
            <Button size="sm" onClick={openCreate} className="md:hidden bg-indigo-600 hover:bg-indigo-700 text-white h-8 px-2.5 text-xs gap-1 cursor-pointer shrink-0">
              <Plus size={13} /> New
            </Button>
          )}
        </div>

        <div className="flex flex-wrap lg:flex-nowrap items-center justify-between md:justify-end gap-2.5 flex-1 min-w-0">
          {/* 🔍 Super Search Input */}
          <div className="relative flex-1 min-w-[180px] max-w-full sm:max-w-[280px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            <Input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Super Search (ID, Job#, Note, Name...)"
              className="h-8 pl-8 pr-7 text-xs bg-slate-50 hover:bg-white focus:bg-white border-slate-200 focus-visible:ring-indigo-500 transition-all rounded-lg"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(""); searchInputRef.current?.focus(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 cursor-pointer"
                title="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 overflow-x-auto scrollbar-hide py-1 max-w-full">
            <button
              type="button"
              onClick={() => setFilterStatus("all")}
              className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${filterStatus === "all" ? "bg-white text-slate-800 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-700"}`}
            >
              All Active
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus("mine")}
              className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${filterStatus === "mine" ? "bg-white text-slate-800 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-700"}`}
            >
              My Tasks
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus("open")}
              className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${filterStatus === "open" ? "bg-white text-slate-800 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-700"}`}
            >
              Open
            </button>

            {/* Overdue Quick Tab */}
            {overdueCount > 0 && (
              <button
                type="button"
                onClick={() => setFilterStatus("overdue")}
                className={`px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                  filterStatus === "overdue"
                    ? "bg-red-500 text-white shadow-2xs"
                    : "text-red-600 hover:bg-red-50"
                }`}
              >
                <AlertTriangle size={12} />
                <span>Overdue ({overdueCount})</span>
              </button>
            )}

            {/* Due Today Quick Tab */}
            {dueTodayCount > 0 && (
              <button
                type="button"
                onClick={() => setFilterStatus("due_today")}
                className={`px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                  filterStatus === "due_today"
                    ? "bg-amber-500 text-white shadow-2xs"
                    : "text-amber-700 hover:bg-amber-50"
                }`}
              >
                <Clock size={12} />
                <span>Today ({dueTodayCount})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setFilterStatus("archived")}
              className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap ${filterStatus === "archived" ? "bg-white text-indigo-700 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-700"}`}
            >
              <Archive size={12} />
              <span>Archived</span>
              {archivedCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded-full text-[10px]">
                  {archivedCount}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* View Mode Switcher */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("board")}
                className={`p-1.5 rounded-md transition-all cursor-pointer ${viewMode === "board" ? "bg-white text-slate-800 shadow-2xs" : "text-slate-500 hover:text-slate-700"}`}
                title="Kanban Board"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-md transition-all cursor-pointer ${viewMode === "list" ? "bg-white text-slate-800 shadow-2xs" : "text-slate-500 hover:text-slate-700"}`}
                title="List View"
              >
                <List size={15} />
              </button>
            </div>

            {/* Desktop New Task Button */}
            {filterStatus !== "archived" && (
              <Button size="sm" onClick={openCreate} className="hidden md:flex bg-indigo-600 hover:bg-indigo-700 text-white h-8 px-3 gap-1.5 cursor-pointer shadow-2xs">
                <Plus size={14} /> New Task
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 min-h-0">
        {/* Active Super Search Results Feedback Badge */}
        {searchQuery.trim() && (
          <div className="mb-3 px-3 py-1.5 bg-indigo-50/90 border border-indigo-150 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-indigo-900 font-medium truncate">
              <Sparkles size={13} className="text-indigo-600 shrink-0" />
              <span>
                Super Search: <span className="font-bold text-indigo-950">"{searchQuery.trim()}"</span>
              </span>
              <span className="bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full text-[10px] border border-indigo-200 shrink-0">
                {filteredTasks.length} {filteredTasks.length === 1 ? "task" : "tasks"} found
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline shrink-0 ml-2 cursor-pointer"
            >
              Clear
            </button>
          </div>
        )}
        <AnimatePresence mode="wait">
          {viewMode === "board" && filterStatus !== "archived" ? (
            // ── KANBAN BOARD ─────────────────────────────────────────────────
            <div className="flex flex-col gap-3 min-h-0">
              {/* Mobile Column Switcher (< md) */}
              <div className="flex md:hidden items-center gap-1 p-1 bg-slate-100/90 rounded-lg shrink-0 border border-slate-200/60">
                {KANBAN_COLS.map((col) => {
                  const count = filteredTasks.filter((t) => t.status === col.key).length;
                  const isActive = mobileKanbanCol === col.key;
                  return (
                    <button
                      key={col.key}
                      type="button"
                      onClick={() => setMobileKanbanCol(col.key)}
                      className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        isActive ? "bg-white text-indigo-700 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[col.key].dot}`} />
                      <span>{col.label}</span>
                      <span className="text-[10px] font-bold bg-slate-200/70 text-slate-700 px-1.5 rounded-full">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Grid of Columns */}
              <motion.div
                key="board"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-0"
              >
                {KANBAN_COLS.map((col) => {
                  const colTasks = filteredTasks.filter((t) => t.status === col.key);
                  const cfg = STATUS_CONFIG[col.key];
                  const isVisibleOnMobile = mobileKanbanCol === col.key;
                  const isHovered = dragOverCol === col.key;

                  return (
                    <div
                      key={col.key}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverCol !== col.key) setDragOverCol(col.key);
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDragOverCol(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const taskId = e.dataTransfer.getData("text/plain") || draggedTaskId;
                        setDragOverCol(null);
                        setDraggedTaskId(null);
                        if (taskId) {
                          handleStatusChange(taskId, col.key);
                        }
                      }}
                      className={`flex-col gap-3 min-h-0 rounded-2xl p-2 sm:p-2.5 transition-all ${
                        isVisibleOnMobile ? "flex" : "hidden md:flex"
                      } ${
                        isHovered
                          ? "bg-indigo-50/80 ring-2 ring-indigo-400 ring-dashed shadow-sm"
                          : "bg-slate-100/40"
                      }`}
                    >
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">{col.label}</span>
                          <span className="text-xs text-slate-400 font-semibold bg-white border border-slate-200 px-1.5 py-0.5 rounded-full">{colTasks.length}</span>
                        </div>

                        {/* Batch Archive button in Done column header */}
                        {col.key === "done" && colTasks.length > 0 && (
                          <button
                            type="button"
                            onClick={handleArchiveAllDone}
                            className="text-[11px] font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1 hover:bg-white px-2 py-0.5 rounded transition-all cursor-pointer"
                            title="Archive all completed tasks"
                          >
                            <Archive size={11} /> Archive all
                          </button>
                        )}
                      </div>

                      <div className="flex flex-col gap-2.5 min-h-[140px]">
                        <AnimatePresence>
                          {colTasks.map((task) => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              currentUserId={currentUserId}
                              currentUserName={currentUserName}
                              onEdit={openEdit}
                              onDelete={handleDelete}
                              onStatusChange={handleStatusChange}
                              onArchive={handleArchive}
                              onUnarchive={handleUnarchive}
                              onUpdate={handleTaskUpdate}
                              onPreviewImage={(url) => setPreviewImage(url)}
                              isDragging={draggedTaskId === task.id}
                              onDragStart={(id) => setDraggedTaskId(id)}
                              onDragEnd={() => { setDraggedTaskId(null); setDragOverCol(null); }}
                            />
                          ))}
                        </AnimatePresence>

                        {/* Drop Zone Placeholder when dragging over column */}
                        {isHovered && (
                          <div className="border-2 border-dashed border-indigo-400 bg-indigo-100/60 rounded-xl p-3.5 text-center text-xs font-bold text-indigo-700 animate-pulse flex items-center justify-center gap-1.5 shadow-2xs">
                            <span>📥 Drop here to move to {col.label}</span>
                          </div>
                        )}

                        {colTasks.length === 0 && !isHovered && (
                          <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center text-center">
                            <p className="text-xs text-slate-400 font-medium">No tasks in {col.label}</p>
                            <p className="text-[10px] text-slate-300 mt-0.5">Drag card here to change status</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            </div>
          ) : (
            // ── LIST VIEW / ARCHIVED VIEW ────────────────────────────────────
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-x-auto"
            >
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3 w-8">#</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3">Task</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3">Priority</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3">Assigned To</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3">Job ID</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3">Due</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3">Checklist</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3">Files</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3">Notes</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3">Status</th>
                    <th className="px-4 py-3 w-28" />
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {filteredTasks.length === 0 && (
                      <tr>
                        <td colSpan={11} className="text-center text-slate-400 py-12 text-sm">
                          {filterStatus === "archived" ? "No archived tasks" : "No tasks found"}
                        </td>
                      </tr>
                    )}
                    {filteredTasks.map((task, i) => {
                      const priority = PRIORITY_CONFIG[task.priority];
                      const status   = STATUS_CONFIG[task.status];
                      const overdue  = task.dueDate && isPast(new Date(task.dueDate)) && task.status !== "done";
                      const noteCount = (() => {
                        try {
                          const parsed: TaskNote[] = task.notesJson ? JSON.parse(task.notesJson) : [];
                          return parsed.filter((n) => n.type !== "activity").length;
                        } catch { return 0; }
                      })();
                      const attachments: TaskAttachment[] = (() => { try { return task.attachmentsJson ? JSON.parse(task.attachmentsJson) : []; } catch { return []; } })();
                      const checklist: TaskChecklistItem[] = (() => { try { return task.checklistJson ? JSON.parse(task.checklistJson) : []; } catch { return []; } })();
                      const completedChecklist = checklist.filter((item) => item.completed).length;

                      return (
                        <React.Fragment key={task.id}>
                          <motion.tr
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors cursor-pointer ${
                              task.isArchived ? "bg-slate-50/40 text-slate-500" : ""
                            }`}
                            onClick={() => openEdit(task)}
                          >
                            <td className="px-4 py-3 text-xs text-slate-400">{i + 1}</td>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                                  #{task.id.startsWith("20") ? task.id : task.id.slice(-6).toUpperCase()}
                                </span>
                                <span className="truncate">{task.title}</span>
                                {task.isArchived && (
                                  <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded shrink-0">
                                    Archived
                                  </span>
                                )}
                              </div>
                              {task.description && <div className="text-xs text-slate-400 mt-0.5 line-clamp-1">{task.description}</div>}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${priority.color}`}>
                                {priority.icon} {priority.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600">{task.assignedToName || <span className="text-slate-400">Unassigned</span>}</td>
                            <td className="px-4 py-3">
                              {task.jobId
                                ? <span className="font-mono text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{task.jobId}</span>
                                : <span className="text-slate-300">—</span>
                              }
                            </td>
                            <td className="px-4 py-3">
                              {task.dueDate
                                ? <span className={`text-xs ${overdue ? "text-red-600 font-semibold" : "text-slate-600"}`}>
                                    {overdue && <AlertTriangle size={10} className="inline mr-1" />}
                                    {format(new Date(task.dueDate), "d MMM yy")}
                                  </span>
                                : <span className="text-slate-300">—</span>
                              }
                            </td>
                            <td className="px-4 py-3">
                              {checklist.length > 0 ? (
                                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border ${
                                  completedChecklist === checklist.length
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-slate-50 text-slate-600 border-slate-200"
                                }`}>
                                  <CheckSquare size={11} className={completedChecklist === checklist.length ? "text-emerald-600" : "text-indigo-500"} />
                                  {completedChecklist}/{checklist.length}
                                </span>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {attachments.length > 0 ? (
                                <span className="flex items-center gap-1 text-xs text-slate-600 font-medium">
                                  <Paperclip size={11} className="text-indigo-500" />
                                  {attachments.length}
                                </span>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`flex items-center gap-1 text-xs ${noteCount > 0 ? "text-indigo-600 font-semibold" : "text-slate-400"}`}>
                                <MessageSquare size={11} />
                                {noteCount > 0 ? noteCount : "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              {task.isArchived ? (
                                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                                  Archived
                                </span>
                              ) : (
                                <select
                                  value={task.status}
                                  onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                                  className={`text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none ${status.color}`}
                                >
                                  {KANBAN_COLS.map((c) => <option key={c.key} value={c.key}>{STATUS_CONFIG[c.key].label}</option>)}
                                </select>
                              )}
                            </td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1">
                                {task.isArchived ? (
                                  <button
                                    onClick={() => handleUnarchive(task.id)}
                                    className="p-1.5 rounded hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                                    title="Unarchive / Restore"
                                  >
                                    <ArchiveRestore size={13} />
                                  </button>
                                ) : (
                                  task.status === "done" && (
                                    <button
                                      onClick={() => handleArchive(task.id)}
                                      className="p-1.5 rounded hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors cursor-pointer"
                                      title="Archive"
                                    >
                                      <Archive size={13} />
                                    </button>
                                  )
                                )}
                                <button onClick={() => openEdit(task)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer" title="Edit Task">
                                  <Edit2 size={13} />
                                </button>
                                <button onClick={() => handleDelete(task.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors cursor-pointer" title="Delete Task">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </motion.tr>
                        </React.Fragment>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modal with Details + Notes & Activity Timeline */}
      <TaskFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingTask(null); }}
        onSave={handleSave}
        onArchive={handleArchive}
        onUnarchive={handleUnarchive}
        initialTask={editingTask}
        adminUsers={adminUsers}
        currentUser={user}
        onUpdateTask={handleTaskUpdate}
        onPreviewImage={(url) => setPreviewImage(url)}
      />

      {/* Image Lightbox Modal */}
      {previewImage && (
        <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
          <DialogContent className="sm:max-w-3xl w-[95vw] rounded-2xl mx-auto p-0 bg-black/95 border-none shadow-2xl overflow-hidden flex flex-col items-center justify-center h-[70vh] sm:h-[80vh] z-[99999]">
            <button
              type="button"
              className="absolute top-4 right-4 text-white hover:text-red-400 bg-black/40 hover:bg-black/60 rounded-full p-2 transition-colors z-10 cursor-pointer"
              onClick={() => setPreviewImage(null)}
            >
              <X size={22} />
            </button>
            <img src={previewImage} className="max-w-full max-h-[80vh] object-contain rounded-xl" alt="Preview" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardCheck, Plus, LayoutGrid, List, X, Calendar,
  AlertTriangle, ArrowRight, CheckCircle2, Clock, User, Users, AtSign,
  Trash2, Edit2, Hash, Flag, Loader2, MessageSquare, Send,
  ChevronDown, ChevronUp, Paperclip, FileText, Image as ImageIcon,
  Download, ExternalLink, File, FileSpreadsheet, ZoomIn, Lock,
  History, ShieldAlert, Sparkles, Check, Archive, ArchiveRestore,
  Inbox, Flame, CheckSquare, RotateCw, Search,
  BarChart2, Star, Award, TrendingUp, Timer, Target, Activity,
  Layers, ShieldCheck, ArrowUpRight, ChevronRight, Zap, Trophy,
  UserCheck, AlertCircle, HelpCircle, UploadCloud, Upload
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
import { getDepartments, type DepartmentItem } from "@/actions/departments";
import { getRoles, type RoleItem } from "@/actions/roles";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  name: string;
  role: string;
  department?: string | null;
  isDepartmentHead?: boolean;
  area: string | null;
  isActive: boolean;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export const DEPARTMENT_CONFIG: Record<string, { key: string; label: string; labelTh: string; color: string; badgeClass: string; icon: string }> = {
  management: { key: "management", label: "Management & IT", labelTh: "ฝ่ายบริหาร & ไอที", color: "text-indigo-700", badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: "🏢" },
  accounting_cso: { key: "accounting_cso", label: "Accounting & CSO", labelTh: "ฝ่ายบัญชี & CSO", color: "text-sky-700", badgeClass: "bg-sky-50 text-sky-700 border-sky-200", icon: "💼" },
  branch_ops: { key: "branch_ops", label: "Branch Operations", labelTh: "ฝ่ายปฏิบัติการสาขา", color: "text-emerald-700", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "🧺" },
  logistics: { key: "logistics", label: "Logistics Fleet", labelTh: "ฝ่ายขนส่ง & ไรเดอร์", color: "text-amber-700", badgeClass: "bg-amber-50 text-amber-700 border-amber-200", icon: "🛵" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; icon: string; dueHint: string }> = {
  low:    { label: "Low",    color: "bg-slate-100 text-slate-600 border-slate-200",     icon: "▽", dueHint: "7 Days" },
  medium: { label: "Medium", color: "bg-amber-50 text-amber-700 border-amber-200",     icon: "◇", dueHint: "4 Days" },
  high:   { label: "High",   color: "bg-orange-100 text-orange-700 border-orange-200", icon: "△", dueHint: "48 hr" },
  urgent: { label: "Urgent", color: "bg-red-100 text-red-700 border-red-200",          icon: "▲", dueHint: "Today" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  todo:        { label: "To Do",       color: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  in_progress: { label: "In Progress", color: "bg-blue-50 text-blue-700",   dot: "bg-blue-500"  },
  stuck:       { label: "Stuck",       color: "bg-amber-100 text-amber-800 border-amber-200", dot: "bg-amber-500" },
  done:        { label: "Done",        color: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", manager: "Manager", cso: "CSO", staff: "Staff", rider: "Rider",
};

const KANBAN_COLS: { key: TaskStatus; label: string; icon: React.ReactNode }[] = [
  { key: "todo",        label: "To Do",       icon: <Clock size={14} /> },
  { key: "in_progress", label: "In Progress", icon: <ArrowRight size={14} /> },
  { key: "stuck",       label: "Stuck",       icon: <AlertTriangle size={14} /> },
  { key: "done",        label: "Done",        icon: <CheckCircle2 size={14} /> },
];

export function formatDurationString(ms: number): string {
  if (ms <= 0 || isNaN(ms)) return "< 1m";
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (totalHours > 0) {
    return minutes > 0 ? `${totalHours}h ${minutes}m` : `${totalHours}h`;
  }
  if (totalMinutes > 0) {
    return `${totalMinutes}m`;
  }
  return "< 1m";
}

function getAutoDueDateString(priority: TaskPriority | string, baseDate: Date = new Date()): string {
  const d = new Date(baseDate);
  switch (priority) {
    case "urgent":
      // ภายในวันที่ Assign (Today)
      return format(d, "yyyy-MM-dd");
    case "high":
      // 48 hr (2 days)
      d.setDate(d.getDate() + 2);
      return format(d, "yyyy-MM-dd");
    case "medium":
      // 4 Day
      d.setDate(d.getDate() + 4);
      return format(d, "yyyy-MM-dd");
    case "low":
      // 7 Day
      d.setDate(d.getDate() + 7);
      return format(d, "yyyy-MM-dd");
    default:
      d.setDate(d.getDate() + 4);
      return format(d, "yyyy-MM-dd");
  }
}

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

// ─── File Download Helper ─────────────────────────────────────────────────────

export async function downloadAttachment(url: string, filename: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Fetch failed");
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename || "download";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
  } catch {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "download";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
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

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    const mime = attachment.type || (isImg ? "image/jpeg" : "application/octet-stream");
    const name = attachment.name || "download";
    const url = attachment.url;
    try {
      // Standard HTML5 DownloadURL for WebKit/Chrome dragging out to Mac Desktop/Finder
      e.dataTransfer.setData("DownloadURL", `${mime}:${name}:${url}`);
      e.dataTransfer.setData("text/uri-list", url);
      e.dataTransfer.setData("text/plain", url);
      e.dataTransfer.effectAllowed = "copy";
    } catch (err) {
      console.error("Drag start error:", err);
    }
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    downloadAttachment(attachment.url, attachment.name);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="group relative flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg p-1.5 text-xs transition-all max-w-[260px] cursor-grab active:cursor-grabbing hover:border-indigo-300 shadow-2xs hover:shadow-xs select-none"
    >
      {isImg ? (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onPreviewImage?.(attachment.url);
          }}
          className="flex items-center gap-1.5 min-w-0 truncate text-slate-700 hover:text-indigo-600 cursor-pointer text-left flex-1"
          title={`Click to view ${attachment.name} (Drag to Mac Desktop to save)`}
        >
          <div className="w-7 h-7 rounded overflow-hidden bg-slate-200 border border-slate-300 shrink-0 relative pointer-events-none">
            <img
              src={attachment.url}
              alt={attachment.name}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-150"
            />
          </div>
          <div className="min-w-0 flex-1 truncate">
            <span className="truncate text-[11px] font-bold block leading-tight">{attachment.name}</span>
            {attachment.size && (
              <span className="text-[9px] text-slate-400 block leading-none mt-0.5">
                {formatFileSize(attachment.size)}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div
          onClick={handleDownload}
          className="flex items-center gap-1.5 truncate text-slate-700 hover:text-indigo-600 px-1 cursor-pointer flex-1"
          title={`Click to download ${attachment.name} (Drag to Mac Desktop to save)`}
        >
          <div className="shrink-0 pointer-events-none">
            {getFileIcon(attachment.type, attachment.name)}
          </div>
          <div className="min-w-0 flex-1 truncate">
            <span className="truncate text-[11px] font-bold block leading-tight text-slate-800 group-hover:text-indigo-700">
              {attachment.name}
            </span>
            {attachment.size && (
              <span className="text-[9px] text-slate-400 block leading-none mt-0.5">
                {formatFileSize(attachment.size)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Quick Download Action Button */}
      <button
        type="button"
        onClick={handleDownload}
        className="p-1 rounded hover:bg-indigo-100 text-slate-400 hover:text-indigo-600 transition-colors shrink-0 cursor-pointer"
        title={`Download ${attachment.name}`}
      >
        <Download size={12} />
      </button>

      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors shrink-0 cursor-pointer"
          title="Remove file"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

function AttachmentsGallery({
  attachments,
  onDelete,
  onPreviewImage,
  imageSize = "normal",
}: {
  attachments: TaskAttachment[];
  onDelete?: (attId: string) => void;
  onPreviewImage?: (url: string) => void;
  imageSize?: "small" | "normal" | "large";
}) {
  const images = attachments.filter((a) => isImageFile(a.type, a.name));
  const docs = attachments.filter((a) => !isImageFile(a.type, a.name));

  const gridCols =
    imageSize === "small"
      ? "grid-cols-3 sm:grid-cols-4"
      : imageSize === "large"
      ? "grid-cols-2 sm:grid-cols-3"
      : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4";

  return (
    <div className="space-y-2">
      {/* Image Gallery Grid */}
      {images.length > 0 && (
        <div className={`grid ${gridCols} gap-2`}>
          {images.map((img) => (
            <div
              key={img.id}
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                const mime = img.type || "image/jpeg";
                const name = img.name || "image.jpg";
                const url = img.url;
                try {
                  e.dataTransfer.setData("DownloadURL", `${mime}:${name}:${url}`);
                  e.dataTransfer.setData("text/uri-list", url);
                  e.dataTransfer.setData("text/plain", url);
                  e.dataTransfer.effectAllowed = "copy";
                } catch (err) {
                  console.error("Drag start error:", err);
                }
              }}
              onClick={() => onPreviewImage?.(img.url)}
              className="group relative flex flex-col rounded-xl overflow-hidden border border-slate-200 hover:border-indigo-400 bg-slate-100 transition-all cursor-grab active:cursor-grabbing shadow-2xs hover:shadow-md aspect-square select-none"
              title={`Click to zoom: ${img.name} (Drag to Mac Desktop to save)`}
            >
              <img
                src={img.url}
                alt={img.name}
                className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-200 pointer-events-none"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center pointer-events-none">
                <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md transition-opacity" />
              </div>

              {/* Action Buttons Top-Right (Download & Delete) */}
              <div className="absolute top-1 right-1 flex items-center gap-1 z-10">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadAttachment(img.url, img.name);
                  }}
                  className="p-1 rounded-full bg-black/60 hover:bg-indigo-600 text-white transition-colors cursor-pointer shadow-sm"
                  title={`Download ${img.name}`}
                >
                  <Download size={11} />
                </button>
                {onDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(img.id);
                    }}
                    className="p-1 rounded-full bg-black/60 hover:bg-rose-600 text-white transition-colors cursor-pointer shadow-sm"
                    title="Remove image"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>

              {/* Bottom filename overlay */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5 pt-3 pointer-events-none">
                <span className="text-[10px] text-white font-medium block truncate leading-tight">
                  {img.name}
                </span>
                {img.size && (
                  <span className="text-[8px] text-slate-300 block leading-none mt-0.5">
                    {formatFileSize(img.size)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Non-Image Documents */}
      {docs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {docs.map((doc) => (
            <AttachmentBadge
              key={doc.id}
              attachment={doc}
              onDelete={onDelete ? () => onDelete(doc.id) : undefined}
              onPreviewImage={onPreviewImage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Notes & Activity Timeline ────────────────────────────────────────────────

function renderMessageText(text: string) {
  if (!text) return null;
  const regex = /(@[\w\u0E00-\u0E7F]+(?:\s+[\w\u0E00-\u0E7F]+)?)/g;
  const parts = text.split(regex);

  return parts.map((part, idx) => {
    if (part.startsWith("@") && part.length > 1) {
      return (
        <span
          key={idx}
          className="inline-flex items-center gap-0.5 bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.2 rounded-md border border-indigo-200/80 shadow-2xs mx-0.5 text-[11px]"
        >
          {part}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function NotesPanel({
  task,
  currentUserId,
  currentUserName,
  onUpdate,
  onPreviewImage,
  adminUsers = [],
  compact = false,
}: {
  task: TaskItem;
  currentUserId: string;
  currentUserName: string;
  onUpdate: (updated: TaskItem) => void;
  onPreviewImage: (url: string) => void;
  adminUsers?: AdminUser[];
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const [noteAttachments, setNoteAttachments] = useState<TaskAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);

  const notes: TaskNote[] = useMemo(() => {
    try { return task.notesJson ? JSON.parse(task.notesJson) : []; }
    catch { return []; }
  }, [task.notesJson]);

  // Mention State
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);

  // Compute mentionable users (ONLY assigned staff / members in this task)
  const mentionCandidates = useMemo(() => {
    const list: Array<{ id: string; name: string; roleLabel: string }> = [];
    const seenIds = new Set<string>();

    // 1. Task Assignees
    if (task.assignedToId) {
      const ids = task.assignedToId.split(",").map((s) => s.trim()).filter(Boolean);
      const names = task.assignedToName ? task.assignedToName.split(",").map((s) => s.trim()) : [];
      ids.forEach((id, idx) => {
        if (!seenIds.has(id)) {
          const userObj = adminUsers.find((u) => u.id === id);
          list.push({
            id,
            name: names[idx] || userObj?.name || "Staff",
            roleLabel: userObj?.role ? (ROLE_LABELS[userObj.role] || userObj.role) : "Assignee",
          });
          seenIds.add(id);
        }
      });
    }

    // 2. Task Creator (if not already included)
    if (task.createdById && !seenIds.has(task.createdById)) {
      list.push({
        id: task.createdById,
        name: task.createdByName,
        roleLabel: "Creator",
      });
      seenIds.add(task.createdById);
    }

    return list;
  }, [task.assignedToId, task.assignedToName, task.createdById, task.createdByName, adminUsers]);

  const filteredMentionCandidates = useMemo(() => {
    const q = mentionSearch.trim().toLowerCase();
    if (!q) return mentionCandidates;
    return mentionCandidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.roleLabel.toLowerCase().includes(q)
    );
  }, [mentionCandidates, mentionSearch]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setText(val);

    // Check if cursor is right after @[search]
    const textBeforeCursor = val.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/(?:^|\s)@([\w\u0E00-\u0E7F]*)$/);

    if (atMatch) {
      setMentionSearch(atMatch[1] || "");
      setMentionOpen(true);
      setMentionIndex(0);
    } else {
      setMentionOpen(false);
    }
  };

  const insertMention = (candidate: { id: string; name: string }) => {
    if (!textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart || 0;
    const textBeforeCursor = text.slice(0, cursorPos);
    const textAfterCursor = text.slice(cursorPos);

    const updatedBefore = textBeforeCursor.replace(/(?:^|\s)@([\w\u0E00-\u0E7F]*)$/, (match) => {
      const leadingSpace = match.startsWith(" ") ? " " : "";
      return `${leadingSpace}@${candidate.name} `;
    });

    const newFullText = updatedBefore + textAfterCursor;
    setText(newFullText);
    setMentionOpen(false);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPos = updatedBefore.length;
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 10);
  };

  const [isDraggingNoteFile, setIsDraggingNoteFile] = useState(false);

  const processNoteFiles = async (files: FileList | File[]) => {
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processNoteFiles(e.target.files);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      const files = Array.from(e.clipboardData.files);
      e.preventDefault();
      await processNoteFiles(files);
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

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && filteredMentionCandidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % filteredMentionCandidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + filteredMentionCandidates.length) % filteredMentionCandidates.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          const selected = filteredMentionCandidates[mentionIndex];
          if (selected) {
            insertMention(selected);
          }
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }

    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleAdd();
    }
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
                        {renderMessageText(note.text)}
                      </p>
                    )}
                    {/* Note attachments */}
                    {note.attachments && note.attachments.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-100">
                        <AttachmentsGallery
                          attachments={note.attachments}
                          onPreviewImage={onPreviewImage}
                          imageSize="large"
                        />
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
        <div className="mb-2 p-2 bg-slate-50 border border-slate-200 rounded-xl shrink-0">
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
              <Paperclip size={11} className="text-indigo-600" /> Attached ({noteAttachments.length})
            </span>
            <button
              type="button"
              onClick={() => setNoteAttachments([])}
              className="text-[10px] text-rose-500 hover:text-rose-700 font-semibold cursor-pointer"
            >
              Clear all
            </button>
          </div>
          <AttachmentsGallery
            attachments={noteAttachments}
            onDelete={(attId) => setNoteAttachments((prev) => prev.filter((a) => a.id !== attId))}
            onPreviewImage={onPreviewImage}
            imageSize="small"
          />
        </div>
      )}

      {/* Input box (Available in both tabs for convenience) with Drag & Drop & Paste */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingNoteFile(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingNoteFile(false);
        }}
        onDrop={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingNoteFile(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await processNoteFiles(e.dataTransfer.files);
          }
        }}
        className={`flex gap-2 items-end mt-auto pt-2 border-t border-slate-100 shrink-0 relative transition-all rounded-xl p-1 ${
          isDraggingNoteFile ? "bg-indigo-50/90 ring-2 ring-indigo-400 ring-dashed" : ""
        }`}
      >
        {/* Drag & Drop Visual Overlay */}
        {isDraggingNoteFile && (
          <div className="absolute inset-0 bg-indigo-600/95 text-white z-50 flex items-center justify-center gap-2 rounded-xl backdrop-blur-xs font-bold text-xs shadow-lg animate-in fade-in duration-150 pointer-events-none">
            <UploadCloud size={20} className="animate-bounce text-indigo-200" />
            <span>Drop images or files here to attach to Note</span>
          </div>
        )}

        {/* @Mention Suggestion Menu (Strictly for Assigned Staff in this Task) */}
        {mentionOpen && (
          <div
            ref={mentionDropdownRef}
            className="absolute bottom-full left-0 right-12 mb-2 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-slate-100 mb-1">
              <span className="flex items-center gap-1">
                <AtSign size={10} className="text-indigo-600" /> Mention Assignee ({mentionCandidates.length})
              </span>
              <span className="text-[9px] text-slate-400 font-normal">↑↓ to navigate · Enter to select</span>
            </div>

            {mentionCandidates.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
                <User size={13} className="text-slate-300" />
                <span>No staff assigned to this task</span>
              </div>
            ) : filteredMentionCandidates.length > 0 ? (
              filteredMentionCandidates.map((candidate, idx) => {
                const isHighlighted = idx === mentionIndex;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onMouseEnter={() => setMentionIndex(idx)}
                    onClick={() => insertMention(candidate)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                      isHighlighted
                        ? "bg-indigo-50 text-indigo-900 font-semibold"
                        : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 shadow-2xs">
                        {candidate.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate text-xs font-semibold text-slate-800">{candidate.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded font-medium">
                        {candidate.roleLabel}
                      </span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-3 text-center text-xs text-slate-400">
                No assigned staff matching "{mentionSearch}"
              </div>
            )}
          </div>
        )}

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKey}
            onPaste={handlePaste}
            placeholder="Type @ to mention someone, paste/drag images, or type message... (Ctrl+Enter to send)"
            rows={2}
            className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 pr-16 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all bg-white"
          />
          {/* Action buttons inside textarea: @ Mention + File Attach */}
          <div className="absolute right-1.5 bottom-2.5 flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                setText((prev) => prev + (prev.endsWith(" ") || prev === "" ? "@" : " @"));
                setMentionSearch("");
                setMentionOpen(true);
                setTimeout(() => textareaRef.current?.focus(), 10);
              }}
              className="p-1 rounded hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
              title="Mention a team member (@)"
            >
              <AtSign size={13} />
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
              title="Attach photos or documents to Note (or Drag & Drop / Paste)"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
            </button>
          </div>

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
  adminUsers = [],
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
  adminUsers?: AdminUser[];
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

  const latestNote = useMemo(() => {
    try {
      const parsed: TaskNote[] = task.notesJson ? JSON.parse(task.notesJson) : [];
      const userNotes = parsed.filter((n) => n.type !== "activity");
      if (userNotes.length === 0) return null;
      const sorted = [...userNotes].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return sorted[0] || null;
    } catch {
      return null;
    }
  }, [task.notesJson]);

  const attachments: TaskAttachment[] = useMemo(() => {
    try { return task.attachmentsJson ? JSON.parse(task.attachmentsJson) : []; }
    catch { return []; }
  }, [task.attachmentsJson]);

  const imageAttachments = useMemo(() => {
    return attachments.filter((a) => isImageFile(a.type, a.name));
  }, [attachments]);

  const docAttachments = useMemo(() => {
    return attachments.filter((a) => !isImageFile(a.type, a.name));
  }, [attachments]);

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
      {/* Priority + Duration + Archive status + Actions */}
      <div className="flex items-start justify-between gap-1.5 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="font-mono text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
            #{task.id.startsWith("20") ? task.id : task.id.slice(-6).toUpperCase()}
          </span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide shrink-0 ${priority.color}`}>
            {priority.icon} {priority.label}
          </span>

          {/* Duration Badge: Open elapsed time for active / Total completion time for Done */}
          {task.status === "done" ? (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/90 shadow-2xs shrink-0"
              title={`Total completion duration: ${formatDurationString(
                new Date(task.completedAt || task.updatedAt).getTime() - new Date(task.createdAt).getTime()
              )} (Created: ${format(new Date(task.createdAt), "d MMM HH:mm")} → Done: ${format(new Date(task.completedAt || task.updatedAt), "d MMM HH:mm")})`}
            >
              <CheckCircle2 size={10} className="text-emerald-600 shrink-0" />
              <span>{formatDurationString(new Date(task.completedAt || task.updatedAt).getTime() - new Date(task.createdAt).getTime())}</span>
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border shadow-2xs shrink-0 ${
                task.status === "stuck"
                  ? "bg-amber-50 text-amber-800 border-amber-200/90"
                  : overdue
                  ? "bg-rose-50 text-rose-800 border-rose-200/90"
                  : "bg-slate-100/80 text-slate-600 border-slate-200/70"
              }`}
              title={`Open elapsed duration: ${formatDurationString(Date.now() - new Date(task.createdAt).getTime())} (Created: ${format(new Date(task.createdAt), "d MMM yyyy HH:mm")})`}
            >
              <Clock size={10} className={task.status === "stuck" ? "text-amber-600 shrink-0" : overdue ? "text-rose-600 shrink-0" : "text-slate-400 shrink-0"} />
              <span>{formatDurationString(Date.now() - new Date(task.createdAt).getTime())}</span>
            </span>
          )}

          {task.isArchived && (
            <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0">
              <Archive size={9} /> Archived
            </span>
          )}
        </div>

        {/* Top-Right: Action buttons on hover */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-auto">
          {task.isArchived ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onUnarchive?.(task.id); }}
              className="p-1 rounded hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
              title="Unarchive / Restore Task"
            >
              <ArchiveRestore size={12} />
            </button>
          ) : (
            task.status === "done" && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onArchive?.(task.id); }}
                className="p-1 rounded hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors cursor-pointer"
                title="Archive Task (Move completed task to archive)"
              >
                <Archive size={12} />
              </button>
            )
          )}

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(task); }}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            title="Edit Task / View Details"
          >
            <Edit2 size={12} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
            className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
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

      {/* Task Image Attachments Large Visual Strip on Card */}
      {imageAttachments.length > 0 && (
        imageAttachments.length === 1 ? (
          <div
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              const img = imageAttachments[0];
              const mime = img.type || "image/jpeg";
              const name = img.name || "image.jpg";
              const url = img.url;
              try {
                e.dataTransfer.setData("DownloadURL", `${mime}:${name}:${url}`);
                e.dataTransfer.setData("text/uri-list", url);
                e.dataTransfer.setData("text/plain", url);
                e.dataTransfer.effectAllowed = "copy";
              } catch (err) {}
            }}
            onClick={(e) => {
              e.stopPropagation();
              onPreviewImage?.(imageAttachments[0].url);
            }}
            className="relative w-full h-32 rounded-xl overflow-hidden mb-2.5 border border-slate-200 hover:border-indigo-400 group/cardimg bg-slate-100 cursor-grab active:cursor-grabbing shadow-2xs hover:shadow-md transition-all select-none"
            title={`Click to zoom: ${imageAttachments[0].name} (Drag to Mac Desktop to save)`}
          >
            <img
              src={imageAttachments[0].url}
              alt={imageAttachments[0].name}
              className="w-full h-full object-cover group-hover/cardimg:scale-105 transition-transform duration-200 pointer-events-none"
            />
            <div className="absolute inset-0 bg-black/0 group-hover/cardimg:bg-black/20 transition-colors flex items-center justify-center pointer-events-none">
              <ZoomIn size={22} className="text-white opacity-0 group-hover/cardimg:opacity-100 drop-shadow-md transition-opacity" />
            </div>

            {/* Top-Right Download Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                downloadAttachment(imageAttachments[0].url, imageAttachments[0].name);
              }}
              className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 hover:bg-indigo-600 text-white transition-colors cursor-pointer shadow-sm z-10 opacity-0 group-hover/cardimg:opacity-100"
              title={`Download ${imageAttachments[0].name}`}
            >
              <Download size={12} />
            </button>

            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5 pt-3 pointer-events-none">
              <span className="text-[10px] text-white font-medium block truncate">
                {imageAttachments[0].name}
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 mb-2.5">
            {imageAttachments.slice(0, 4).map((img, idx) => (
              <div
                key={img.id}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  const mime = img.type || "image/jpeg";
                  const name = img.name || "image.jpg";
                  const url = img.url;
                  try {
                    e.dataTransfer.setData("DownloadURL", `${mime}:${name}:${url}`);
                    e.dataTransfer.setData("text/uri-list", url);
                    e.dataTransfer.setData("text/plain", url);
                    e.dataTransfer.effectAllowed = "copy";
                  } catch (err) {}
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onPreviewImage?.(img.url);
                }}
                className="relative h-20 rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-400 group/cardimg bg-slate-100 cursor-grab active:cursor-grabbing shadow-2xs hover:shadow-md transition-all select-none"
                title={`Click to zoom: ${img.name} (Drag to Mac Desktop to save)`}
              >
                <img
                  src={img.url}
                  alt={img.name}
                  className="w-full h-full object-cover group-hover/cardimg:scale-110 transition-transform duration-200 pointer-events-none"
                />
                <div className="absolute inset-0 bg-black/0 group-hover/cardimg:bg-black/20 transition-colors flex items-center justify-center pointer-events-none">
                  <ZoomIn size={14} className="text-white opacity-0 group-hover/cardimg:opacity-100 drop-shadow transition-opacity" />
                </div>

                {/* Top-Right Download Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadAttachment(img.url, img.name);
                  }}
                  className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 hover:bg-indigo-600 text-white transition-colors cursor-pointer shadow-sm z-10 opacity-0 group-hover/cardimg:opacity-100"
                  title={`Download ${img.name}`}
                >
                  <Download size={10} />
                </button>

                {idx === 3 && imageAttachments.length > 4 && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-xs font-bold pointer-events-none">
                    +{imageAttachments.length - 3}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Non-Image Document Attachments on Card */}
      {docAttachments.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {docAttachments.map((att) => (
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
          <span
            className="flex items-center gap-1 text-[10px] bg-slate-50 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded max-w-[180px] truncate"
            title={task.assignedToName}
          >
            {task.assignedToName.includes(",") ? (
              <>
                <Users size={10} className="text-indigo-600 shrink-0" />
                <span className="truncate">{task.assignedToName}</span>
              </>
            ) : (
              <>
                <User size={9} className="shrink-0" />
                <span className="truncate">{task.assignedToName}</span>
              </>
            )}
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
        <MessageSquare size={11} className={noteCount > 0 ? "text-indigo-600" : "text-slate-400"} />
        <span className="font-medium">
          {noteCount > 0 ? `${noteCount} note${noteCount > 1 ? "s" : ""}` : "Add note"}
        </span>
        <span className="ml-auto">{notesOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}</span>
      </button>

      {/* Latest Note Snippet Preview under note header (when notes panel is closed) */}
      {!notesOpen && latestNote && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setNotesOpen(true);
          }}
          className="mt-1.5 p-2 bg-slate-50 hover:bg-indigo-50/50 border border-slate-200/80 hover:border-indigo-200 rounded-lg text-slate-700 transition-colors cursor-pointer group/note"
          title={`Click to view discussion thread (${noteCount} notes)`}
        >
          <div className="flex items-center justify-between gap-1.5 mb-1 text-[10px]">
            <span className="font-bold text-slate-800 flex items-center gap-1 truncate group-hover/note:text-indigo-600 transition-colors">
              <span className="w-3.5 h-3.5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[8px] font-extrabold shrink-0">
                {latestNote.userName?.charAt(0).toUpperCase() || "U"}
              </span>
              <span className="truncate">{latestNote.userName}</span>
            </span>
            <span className="text-[9px] text-slate-400 shrink-0">
              {format(new Date(latestNote.timestamp), "d MMM HH:mm")}
            </span>
          </div>
          {latestNote.text && (
            <div className="text-[11px] text-slate-600 leading-snug line-clamp-2 pl-4 break-words">
              {renderMessageText(latestNote.text)}
            </div>
          )}
          {/* Note images preview in Latest Note box */}
          {latestNote.attachments && latestNote.attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2 pl-4">
              {latestNote.attachments.map((att) => {
                const isImg = isImageFile(att.type, att.name);
                if (isImg) {
                  return (
                    <div
                      key={att.id}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        const mime = att.type || "image/jpeg";
                        const name = att.name || "image.jpg";
                        const url = att.url;
                        try {
                          e.dataTransfer.setData("DownloadURL", `${mime}:${name}:${url}`);
                          e.dataTransfer.setData("text/uri-list", url);
                          e.dataTransfer.setData("text/plain", url);
                          e.dataTransfer.effectAllowed = "copy";
                        } catch (err) {}
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPreviewImage?.(att.url);
                      }}
                      className="relative w-14 h-14 rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-400 group/noteimg bg-slate-100 cursor-grab active:cursor-grabbing shadow-2xs hover:shadow-md transition-all shrink-0 select-none"
                      title={`Click to zoom: ${att.name} (Drag to Mac Desktop to save)`}
                    >
                      <img
                        src={att.url}
                        alt={att.name}
                        className="w-full h-full object-cover group-hover/noteimg:scale-110 transition-transform duration-150 pointer-events-none"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover/noteimg:bg-black/20 transition-colors flex items-center justify-center pointer-events-none">
                        <ZoomIn size={12} className="text-white opacity-0 group-hover/noteimg:opacity-100 drop-shadow transition-opacity" />
                      </div>
                    </div>
                  );
                }
                return (
                  <AttachmentBadge
                    key={att.id}
                    attachment={att}
                    onPreviewImage={onPreviewImage}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

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
              adminUsers={adminUsers}
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

export function TaskFormModal({
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
  const [selectedAssignees, setSelectedAssignees] = useState<AdminUser[]>([]);
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
  const assigneeInputRef = useRef<HTMLInputElement>(null);

  const currentUserId = currentUser?.id ?? "unknown";
  const currentUserName = currentUser?.name ?? currentUser?.email ?? "User";
  const currentUserRole = currentUser?.role ?? "staff";

  // 🔒 Permission check: Only Creator or Super Admin can edit core task details (Title, Description, Priority, Job ID, Due Date, Task Attachments)
  const canEditTaskDetails = useMemo(() => {
    if (!initialTask) return true; // Can set everything when creating a new task
    const isCreator = initialTask.createdById === currentUserId;
    const isAdmin = currentUserRole === "admin";
    return isCreator || isAdmin;
  }, [initialTask, currentUserId, currentUserRole]);

  // 🔒 Permission check: Creator, Super Admin, AND Assignees can edit/add Assignees
  const canEditAssignees = useMemo(() => {
    if (!initialTask) return true;
    const isCreator = initialTask.createdById === currentUserId;
    const isAdmin = currentUserRole === "admin";
    const isAssignee = initialTask.assignedToId
      ? initialTask.assignedToId.split(",").map((s) => s.trim()).includes(currentUserId)
      : false;
    return isCreator || isAdmin || isAssignee;
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

  const prevTaskIdRef = useRef<string | null>(null);
  const lastFetchedJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      const currentId = initialTask?.id || "new";
      const isDifferentTask = prevTaskIdRef.current !== currentId;

      if (isDifferentTask) {
        prevTaskIdRef.current = currentId;
        const initPriority = (initialTask?.priority as TaskPriority) ?? "medium";
        setTitle(initialTask?.title ?? "");
        setDescription(initialTask?.description ?? "");
        setPriority(initPriority);
        setStatus((initialTask?.status as TaskStatus) ?? "todo");
        setJobId(initialTask?.jobId ?? "");
        
        // Parse assignees list
        if (initialTask?.assignedToId) {
          const ids = initialTask.assignedToId.split(",").map((s) => s.trim()).filter(Boolean);
          const names = initialTask.assignedToName ? initialTask.assignedToName.split(",").map((s) => s.trim()) : [];
          const parsed = ids.map((id, index) => {
            const found = adminUsers.find((u) => u.id === id);
            if (found) return found;
            return {
              id,
              name: names[index] || "Staff",
              role: "staff",
              area: null,
              isActive: true,
            };
          });
          setSelectedAssignees(parsed);
        } else {
          setSelectedAssignees([]);
        }

        setDueDate(
          initialTask?.dueDate
            ? format(new Date(initialTask.dueDate), "yyyy-MM-dd")
            : getAutoDueDateString(initPriority)
        );
        setAssigneeSearch("");
        setAssigneeDropdownOpen(false);
        lastFetchedJobIdRef.current = null;
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
      }
    } else {
      prevTaskIdRef.current = null;
      lastFetchedJobIdRef.current = null;
      setLinkedJob(null);
      setJobId("");
      setSelectedAssignees([]);
      setAssigneeSearch("");
      setAssigneeDropdownOpen(false);
    }
  }, [open, initialTask?.id, adminUsers]);

  // Synchronize checklist and attachments in real-time when updated remotely
  useEffect(() => {
    if (open && initialTask) {
      if (initialTask.checklistJson) {
        try {
          const remoteChecklist = JSON.parse(initialTask.checklistJson);
          setChecklist((prev) => {
            if (JSON.stringify(prev) !== JSON.stringify(remoteChecklist)) {
              return remoteChecklist;
            }
            return prev;
          });
        } catch {}
      }
      if (initialTask.attachmentsJson) {
        try {
          const remoteAtts = JSON.parse(initialTask.attachmentsJson);
          setAttachments((prev) => {
            if (JSON.stringify(prev) !== JSON.stringify(remoteAtts)) {
              return remoteAtts;
            }
            return prev;
          });
        } catch {}
      }
    }
  }, [open, initialTask?.checklistJson, initialTask?.attachmentsJson]);

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
    if (!q) return active;
    return active.filter((u) => {
      const nameMatch = u.name.toLowerCase().includes(q);
      const roleMatch = (ROLE_LABELS[u.role] || u.role).toLowerCase().includes(q);
      const areaMatch = (u.area || "").toLowerCase().includes(q);
      return nameMatch || roleMatch || areaMatch;
    });
  }, [adminUsers, assigneeSearch]);

  // Auto-fetch linked job details and photos
  useEffect(() => {
    const cleanJobId = jobId ? jobId.trim() : "";
    if (open && cleanJobId.length >= 4) {
      if (lastFetchedJobIdRef.current === cleanJobId && linkedJob) {
        return; // Already loaded this exact job
      }
      setLoadingJob(true);
      lastFetchedJobIdRef.current = cleanJobId;
      getLinkedJobDetails(cleanJobId)
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
      lastFetchedJobIdRef.current = null;
      setLinkedJob(null);
    }
  }, [open, jobId]);

  const jobPhotos: JobPhoto[] = useMemo(() => {
    return extractJobImages(linkedJob);
  }, [linkedJob]);

  const [isDraggingModalFiles, setIsDraggingModalFiles] = useState(false);

  const processModalFiles = async (files: FileList | File[]) => {
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processModalFiles(e.target.files);
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
    const finalAssigneeId = selectedAssignees.length > 0 ? selectedAssignees.map((a) => a.id).join(",") : "";
    const finalAssigneeName = selectedAssignees.length > 0 ? selectedAssignees.map((a) => a.name).join(", ") : "";

    await onSave({
      title,
      description,
      priority,
      status,
      jobId,
      assignedToId: finalAssigneeId,
      assignedToName: finalAssigneeName,
      dueDate,
      attachments,
      checklist,
    });
    setSaving(false);
  };

  return (
    <Dialog 
      open={open} 
      onOpenChange={(newOpen, eventDetails) => {
        if (!newOpen && eventDetails?.reason === 'outside-press') {
          return;
        }
        onClose();
      }}
      disablePointerDismissal={true}
    >
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
                    onChange={(e) => {
                      const newP = e.target.value as TaskPriority;
                      setPriority(newP);
                      if (!initialTask) {
                        setDueDate(getAutoDueDateString(newP));
                      }
                    }}
                    disabled={!canEditTaskDetails}
                    className={`w-full h-8.5 text-xs font-medium border rounded-lg px-2 transition-all ${
                      !canEditTaskDetails
                        ? "bg-slate-100 text-slate-600 cursor-not-allowed border-slate-200"
                        : "bg-white border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 cursor-pointer"
                    }`}
                  >
                    {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label} ({v.dueHint})</option>
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
                    <option value="stuck">⚠️ Stuck</option>
                    <option value="done">✅ Done</option>
                  </select>
                </div>
              </div>

              {/* Assign To (Multi-Select Tags / Chips + Auto-complete Dropdown) */}
              <div className="space-y-1 relative" ref={assigneeContainerRef}>
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                    Assign To {!canEditAssignees && <Lock size={10} className="text-amber-500" />}
                  </Label>
                  {selectedAssignees.length > 0 && (
                    <span className="text-[10px] text-slate-400 font-medium">
                      {selectedAssignees.length} staff selected
                    </span>
                  )}
                </div>

                {/* Chips Container with Search Input */}
                <div
                  onClick={() => {
                    if (canEditAssignees) {
                      setAssigneeDropdownOpen(true);
                      assigneeInputRef.current?.focus();
                    }
                  }}
                  className={`min-h-[38px] p-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border transition-all cursor-text ${
                    !canEditAssignees
                      ? "bg-slate-100 border-slate-200 cursor-not-allowed"
                      : assigneeDropdownOpen
                      ? "bg-white border-indigo-400 ring-2 ring-indigo-100"
                      : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {selectedAssignees.map((assignee) => (
                    <span
                      key={assignee.id}
                      className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] font-semibold px-2 py-0.5 rounded-md shadow-2xs group"
                    >
                      <User size={11} className="text-indigo-600 shrink-0" />
                      <span className="truncate max-w-[130px]">{assignee.name}</span>
                      {assignee.role && (
                        <span className="text-[9px] text-indigo-500 font-normal">
                          ({ROLE_LABELS[assignee.role] || assignee.role})
                        </span>
                      )}
                      {canEditAssignees && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAssignees((prev) => prev.filter((a) => a.id !== assignee.id));
                          }}
                          className="text-indigo-400 hover:text-red-500 hover:bg-indigo-100/60 p-0.5 rounded transition-colors ml-0.5 cursor-pointer"
                          title={`Remove ${assignee.name}`}
                        >
                          <X size={11} />
                        </button>
                      )}
                    </span>
                  ))}

                  {canEditAssignees && (
                    <div className="flex-1 min-w-[120px] flex items-center">
                      <input
                        ref={assigneeInputRef}
                        type="text"
                        value={assigneeSearch}
                        onChange={(e) => {
                          setAssigneeSearch(e.target.value);
                          setAssigneeDropdownOpen(true);
                        }}
                        onFocus={() => setAssigneeDropdownOpen(true)}
                        placeholder={selectedAssignees.length === 0 ? "Search or select staff..." : "+ Add more..."}
                        className="w-full text-xs bg-transparent border-none outline-none text-slate-800 placeholder:text-slate-400 py-0.5 px-1"
                      />
                    </div>
                  )}

                  {canEditAssignees && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAssigneeDropdownOpen((prev) => !prev);
                      }}
                      className="text-slate-400 hover:text-indigo-600 p-0.5 rounded transition-colors cursor-pointer shrink-0 ml-auto"
                      title="Toggle staff list"
                    >
                      {assigneeDropdownOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  )}
                </div>

                {/* Auto-complete floating dropdown */}
                {assigneeDropdownOpen && canEditAssignees && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                    {/* Clear selection */}
                    {selectedAssignees.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAssignees([]);
                          setAssigneeSearch("");
                        }}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-xs flex items-center justify-between text-red-600 hover:bg-red-50 transition-colors cursor-pointer border-b border-slate-100 mb-1"
                      >
                        <span className="font-medium">✕ Clear all assignees</span>
                        <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">{selectedAssignees.length} selected</span>
                      </button>
                    )}

                    {/* Matching user list grouped by Department */}
                    {filteredUsers.length > 0 ? (
                      Object.entries(
                        filteredUsers.reduce((acc, u) => {
                          const deptKey = u.department || "branch_ops";
                          if (!acc[deptKey]) acc[deptKey] = [];
                          acc[deptKey].push(u);
                          return acc;
                        }, {} as Record<string, AdminUser[]>)
                      ).map(([deptKey, groupUsers]) => {
                        const dept = DEPARTMENT_CONFIG[deptKey] || {
                          label: deptKey,
                          icon: "📁",
                          badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
                        };
                        const allGroupSelected = groupUsers.every((u) => selectedAssignees.some((a) => a.id === u.id));

                        return (
                          <div key={deptKey} className="space-y-1 mb-2 last:mb-0">
                            {/* Department Header with Select All Button */}
                            <div className="flex items-center justify-between px-2 py-1 bg-slate-50 border border-slate-100 rounded-lg text-[10px] font-bold text-slate-700">
                              <span className="flex items-center gap-1">
                                <span>{dept.icon}</span>
                                <span>{dept.label}</span>
                                <span className="text-slate-400 font-normal">({groupUsers.length})</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (allGroupSelected) {
                                    const groupIds = groupUsers.map((u) => u.id);
                                    setSelectedAssignees((prev) => prev.filter((a) => !groupIds.includes(a.id)));
                                  } else {
                                    const toAdd = groupUsers.filter((u) => !selectedAssignees.some((a) => a.id === u.id));
                                    setSelectedAssignees((prev) => [...prev, ...toAdd]);
                                  }
                                }}
                                className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                              >
                                {allGroupSelected ? "Deselect all" : "+ Select all"}
                              </button>
                            </div>

                            {/* Staff items in department */}
                            {groupUsers.map((u) => {
                              const isSelected = selectedAssignees.some((a) => a.id === u.id);
                              return (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedAssignees((prev) => prev.filter((a) => a.id !== u.id));
                                    } else {
                                      setSelectedAssignees((prev) => [...prev, u]);
                                    }
                                    setAssigneeSearch("");
                                    assigneeInputRef.current?.focus();
                                  }}
                                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                                    isSelected
                                      ? "bg-indigo-50 text-indigo-700 font-bold border border-indigo-100"
                                      : "hover:bg-slate-50 text-slate-700 font-medium"
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <div
                                      className={`w-5.5 h-5.5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                        isSelected
                                          ? "bg-indigo-600 text-white shadow-2xs"
                                          : "bg-slate-100 text-slate-700 border border-slate-200"
                                      }`}
                                    >
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
                            })}
                          </div>
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
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      Due Date {!canEditTaskDetails && <Lock size={10} className="text-amber-500" />}
                    </Label>
                    {canEditTaskDetails && (
                      <button
                        type="button"
                        onClick={() => setDueDate(getAutoDueDateString(priority))}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                        title="Auto-set due date based on priority"
                      >
                        Auto: {PRIORITY_CONFIG[priority]?.dueHint}
                      </button>
                    )}
                  </div>
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

                {/* 📸 Linked Job Live Card / Loading State */}
                {loadingJob && (
                  <div className="flex items-center gap-2 p-2.5 bg-indigo-50/60 border border-indigo-150 rounded-xl text-xs text-indigo-700 font-medium">
                    <Loader2 size={13} className="animate-spin text-indigo-600 shrink-0" />
                    <span>Loading details for linked Job #{jobId}...</span>
                  </div>
                )}

                {Boolean(jobId && jobId.trim().length >= 4 && !loadingJob && linkedJob) && (
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
                      <div className="space-y-1.5 pt-2 border-t border-indigo-100/80">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1">
                            <ImageIcon size={11} className="text-indigo-600" />
                            Job Photos ({jobPhotos.length})
                          </span>
                          <span className="text-[10px] text-indigo-600 font-medium">Click to zoom</span>
                        </div>

                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-56 overflow-y-auto p-2 bg-white/95 rounded-xl border border-indigo-100/90 shadow-2xs">
                          {jobPhotos.map((photo, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => onPreviewImage(photo.url)}
                              className="group relative flex flex-col rounded-xl overflow-hidden border border-slate-200 hover:border-indigo-400 bg-slate-100 transition-all cursor-pointer shadow-2xs hover:shadow-md aspect-square"
                              title={`Preview: ${photo.label}`}
                            >
                              <img
                                src={photo.url}
                                alt={photo.label}
                                className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-200"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                                <ZoomIn size={18} className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md transition-opacity" />
                              </div>
                              {photo.label && (
                                <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent text-[9px] text-white font-medium px-1.5 py-0.5 truncate text-left">
                                  {photo.label}
                                </span>
                              )}
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

            {/* Task Attachments Section with Drag & Drop */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (canEditTaskDetails) setIsDraggingModalFiles(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingModalFiles(false);
              }}
              onDrop={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingModalFiles(false);
                if (canEditTaskDetails && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  await processModalFiles(e.dataTransfer.files);
                }
              }}
              className={`space-y-2 pt-2.5 border-t border-slate-100 shrink-0 rounded-xl transition-all ${
                isDraggingModalFiles ? "bg-indigo-50/70 p-2 border-indigo-300 ring-2 ring-indigo-400 ring-dashed" : ""
              }`}
            >
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

              {/* Uploaded attachments gallery */}
              {attachments.length > 0 ? (
                <div className="space-y-2">
                  <div className="p-2 bg-slate-50/80 border border-slate-200 rounded-xl max-h-52 overflow-y-auto">
                    <AttachmentsGallery
                      attachments={attachments}
                      onDelete={canEditTaskDetails ? (attId) => setAttachments((prev) => prev.filter((a) => a.id !== attId)) : undefined}
                      onPreviewImage={onPreviewImage}
                      imageSize="normal"
                    />
                  </div>

                  {canEditTaskDetails && (
                    <div
                      onClick={() => modalFileInputRef.current?.click()}
                      className={`border border-dashed rounded-lg p-2 text-center cursor-pointer transition-all flex items-center justify-center gap-1.5 text-xs ${
                        isDraggingModalFiles
                          ? "border-indigo-500 bg-indigo-100/70 text-indigo-800 font-bold"
                          : "border-slate-200 hover:border-indigo-300 bg-white hover:bg-slate-50 text-slate-500"
                      }`}
                    >
                      <UploadCloud size={14} className={isDraggingModalFiles ? "text-indigo-600 animate-bounce" : "text-slate-400"} />
                      <span>{isDraggingModalFiles ? "Drop files to add" : "+ Drag & Drop or click to add more files"}</span>
                    </div>
                  )}
                </div>
              ) : (
                canEditTaskDetails ? (
                  <div
                    onClick={() => modalFileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all ${
                      isDraggingModalFiles
                        ? "border-indigo-500 bg-indigo-50 text-indigo-800 ring-2 ring-indigo-300 scale-[1.01]"
                        : "border-slate-200 hover:border-indigo-300 bg-slate-50/50 hover:bg-indigo-50/30 text-slate-500"
                    }`}
                  >
                    <UploadCloud size={18} className={`mx-auto mb-1 ${isDraggingModalFiles ? "text-indigo-600 animate-bounce" : "text-slate-400"}`} />
                    <p className="text-xs font-semibold">
                      {isDraggingModalFiles ? "Drop files to upload immediately" : "Click to upload or Drag & Drop images/files here"}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Supports PNG, JPG, WebP, PDF, Documents</p>
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
                adminUsers={adminUsers}
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

// ─── Staff Analytics & Star Rating Helpers ─────────────────────────────────────

export interface StaffMetric {
  user: AdminUser;
  totalAssigned: number;
  completed: number;
  onTimeCompleted: number;
  inProgress: number;
  todo: number;
  stuck: number;
  overdue: number;
  completionRate: number;
  onTimeRate: number;
  avgResolutionHours: number;
  starRating: number;
  starScore: number;
  ratingTier: {
    label: string;
    badgeClass: string;
    color: string;
    icon: string;
  };
}

export function StarRatingDisplay({
  rating,
  showNumber = true,
  size = 13,
}: {
  rating: number;
  showNumber?: boolean;
  size?: number;
}) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.35;
  const stars = [];

  for (let i = 1; i <= 5; i++) {
    if (i <= fullStars) {
      stars.push(<Star key={i} size={size} className="fill-amber-400 text-amber-400 shrink-0" />);
    } else if (i === fullStars + 1 && hasHalf) {
      stars.push(
        <div key={i} className="relative inline-block shrink-0" style={{ width: size, height: size }}>
          <Star size={size} className="text-slate-200" />
          <div className="absolute top-0 left-0 overflow-hidden w-[55%] h-full">
            <Star size={size} className="fill-amber-400 text-amber-400" />
          </div>
        </div>
      );
    } else {
      stars.push(<Star key={i} size={size} className="text-slate-200 shrink-0" />);
    }
  }

  return (
    <div className="inline-flex items-center gap-1">
      <div className="flex items-center gap-0.5">{stars}</div>
      {showNumber && (
        <span className="font-bold text-xs text-slate-800 ml-0.5">{rating.toFixed(1)}</span>
      )}
    </div>
  );
}

export function calculateStaffMetrics(tasks: TaskItem[], users: AdminUser[]): StaffMetric[] {
  const activeUsers = users.filter((u) => u.isActive !== false && u.role !== "rider");

  return activeUsers.map((u) => {
    const userTasks = tasks.filter((t) => {
      if (!t.assignedToId) return false;
      return t.assignedToId.split(",").map((s) => s.trim()).includes(u.id);
    });

    const totalAssigned = userTasks.length;
    const completedTasks = userTasks.filter((t) => t.status === "done");
    const completed = completedTasks.length;

    const onTimeCompleted = completedTasks.filter((t) => {
      if (!t.dueDate) return true;
      const doneDate = t.completedAt ? new Date(t.completedAt) : new Date(t.updatedAt);
      const dueDate = new Date(t.dueDate);
      return doneDate.getTime() <= dueDate.getTime() + 24 * 60 * 60 * 1000;
    }).length;

    // Active (non-archived) tasks trigger active WIP, stuck, and overdue alerts
    const activeTasksOnly = userTasks.filter((t) => !t.isArchived);
    const inProgress = activeTasksOnly.filter((t) => t.status === "in_progress").length;
    const todo = activeTasksOnly.filter((t) => t.status === "todo").length;
    const stuck = activeTasksOnly.filter((t) => t.status === "stuck").length;
    const overdue = activeTasksOnly.filter(
      (t) => t.status !== "done" && t.dueDate && isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate))
    ).length;

    const completionRate = totalAssigned > 0 ? Math.round((completed / totalAssigned) * 100) : 100;
    const onTimeRate = completed > 0 ? Math.round((onTimeCompleted / completed) * 100) : 100;

    const resolutionTimes = completedTasks
      .map((t) => {
        const start = new Date(t.createdAt).getTime();
        const end = (t.completedAt ? new Date(t.completedAt) : new Date(t.updatedAt)).getTime();
        return Math.max(0, (end - start) / (1000 * 60 * 60));
      })
      .filter((h) => !isNaN(h));

    const avgResolutionHours =
      resolutionTimes.length > 0
        ? Math.round((resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length) * 10) / 10
        : 0;

    let starScore = 5.0;
    if (totalAssigned > 0) {
      const onTimePoints = (onTimeRate / 100) * 2.0;
      const completionPoints = (completionRate / 100) * 1.5;
      const penaltyPoints = Math.max(0, 1.0 - overdue * 0.25 - stuck * 0.15);
      const activityBonus = completed > 0 ? 0.5 : 0.2;

      starScore = Math.min(5.0, Math.max(1.0, onTimePoints + completionPoints + penaltyPoints + activityBonus));
    }
    const starRating = Math.round(starScore * 10) / 10;

    let ratingTier = {
      label: "Top Performer",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      color: "text-emerald-600",
      icon: "🏆",
    };
    if (starRating < 3.0) {
      ratingTier = {
        label: "Needs Attention",
        badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
        color: "text-rose-600",
        icon: "🚨",
      };
    } else if (starRating < 3.8) {
      ratingTier = {
        label: "Fair Progress",
        badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
        color: "text-amber-600",
        icon: "⚡",
      };
    } else if (starRating < 4.6) {
      ratingTier = {
        label: "Very Good",
        badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
        color: "text-blue-600",
        icon: "⭐",
      };
    }

    return {
      user: u,
      totalAssigned,
      completed,
      onTimeCompleted,
      inProgress,
      todo,
      stuck,
      overdue,
      completionRate,
      onTimeRate,
      avgResolutionHours,
      starRating,
      starScore,
      ratingTier,
    };
  })
    .filter((m) => m.totalAssigned > 0)
    .sort((a, b) => b.starRating - a.starRating || b.completed - a.completed);
}

// ─── Admin Dashboard Component (role === 'admin') ──────────────────────────────

export function TaskAdminDashboard({
  tasks,
  adminUsers,
  departments = [],
  onOpenTask,
  onFilterStaff,
}: {
  tasks: TaskItem[];
  adminUsers: AdminUser[];
  departments?: DepartmentItem[];
  onOpenTask: (task: TaskItem) => void;
  onFilterStaff?: (staffName: string) => void;
}) {
  const [timeframe, setTimeframe] = useState<"all" | "month" | "week" | "today">("all");
  const [includeArchived, setIncludeArchived] = useState(true);
  const [leftPanelTab, setLeftPanelTab] = useState<"bottlenecks" | "archived">("bottlenecks");
  const [staffSearch, setStaffSearch] = useState("");
  const [dashboardDept, setDashboardDept] = useState<string>("all");
  const [showFormulaTooltip, setShowFormulaTooltip] = useState(false);

  const totalAllTasks = tasks.length;
  const totalArchivedTasks = tasks.filter((t) => t.isArchived).length;
  const totalActiveTasks = tasks.filter((t) => !t.isArchived).length;

  const now = new Date();
  const filteredTasksByTime = useMemo(() => {
    return tasks.filter((t) => {
      if (!includeArchived && t.isArchived) return false;
      if (timeframe === "all") return true;
      const created = new Date(t.createdAt);
      if (timeframe === "today") return isToday(created);
      if (timeframe === "week") {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return created >= weekAgo;
      }
      if (timeframe === "month") {
        return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }, [tasks, timeframe, includeArchived]);

  // Overall System KPIs
  const totalTasks = filteredTasksByTime.length;
  const archivedInTimeframe = filteredTasksByTime.filter((t) => t.isArchived).length;
  const completedTasks = filteredTasksByTime.filter((t) => t.status === "done").length;
  const inProgressTasks = filteredTasksByTime.filter((t) => !t.isArchived && t.status === "in_progress").length;
  const todoTasks = filteredTasksByTime.filter((t) => !t.isArchived && t.status === "todo").length;
  const stuckTasks = filteredTasksByTime.filter((t) => !t.isArchived && t.status === "stuck").length;
  const overdueTasks = filteredTasksByTime.filter(
    (t) => !t.isArchived && t.status !== "done" && t.dueDate && isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate))
  ).length;

  const onTimeDone = filteredTasksByTime.filter((t) => {
    if (t.status !== "done") return false;
    if (!t.dueDate) return true;
    const doneDate = t.completedAt ? new Date(t.completedAt) : new Date(t.updatedAt);
    const dueDate = new Date(t.dueDate);
    return doneDate.getTime() <= dueDate.getTime() + 24 * 60 * 60 * 1000;
  }).length;

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;
  const onTimeRate = completedTasks > 0 ? Math.round((onTimeDone / completedTasks) * 100) : 100;

  const doneResolutionTimes = filteredTasksByTime
    .filter((t) => t.status === "done")
    .map((t) => {
      const start = new Date(t.createdAt).getTime();
      const end = (t.completedAt ? new Date(t.completedAt) : new Date(t.updatedAt)).getTime();
      return Math.max(0, (end - start) / (1000 * 60 * 60));
    });
  const avgTatHours =
    doneResolutionTimes.length > 0
      ? Math.round((doneResolutionTimes.reduce((a, b) => a + b, 0) / doneResolutionTimes.length) * 10) / 10
      : 0;

  // Staff Metrics (Strictly show only staff members who have at least 1 task assigned in the selected timeframe)
  const staffMetrics = useMemo(() => {
    const list = calculateStaffMetrics(filteredTasksByTime, adminUsers);
    return list.filter((m) => m.totalAssigned > 0);
  }, [filteredTasksByTime, adminUsers]);

  const filteredStaffList = useMemo(() => {
    return staffMetrics.filter((m) => {
      if (dashboardDept !== "all") {
        if ((m.user.department || "branch_ops") !== dashboardDept) return false;
      }
      const q = staffSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        m.user.name.toLowerCase().includes(q) ||
        (ROLE_LABELS[m.user.role] || m.user.role).toLowerCase().includes(q) ||
        (m.user.area || "").toLowerCase().includes(q) ||
        ((m.user.department && DEPARTMENT_CONFIG[m.user.department]?.label) || "").toLowerCase().includes(q)
      );
    });
  }, [staffMetrics, staffSearch, dashboardDept]);

  // Bottleneck tasks (stuck or overdue)
  const bottleneckTasks = useMemo(() => {
    return filteredTasksByTime
      .filter((t) => !t.isArchived && (t.status === "stuck" || (t.status !== "done" && t.dueDate && isPast(new Date(t.dueDate)))))
      .sort((a, b) => {
        if (a.status === "stuck" && b.status !== "stuck") return -1;
        if (b.status === "stuck" && a.status !== "stuck") return 1;
        const dueA = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        const dueB = b.dueDate ? new Date(b.dueDate).getTime() : 0;
        return dueA - dueB;
      })
      .slice(0, 8);
  }, [filteredTasksByTime]);

  // Archived tasks list
  const archivedTasksList = useMemo(() => {
    return tasks
      .filter((t) => t.isArchived)
      .sort((a, b) => {
        const timeA = a.archivedAt ? new Date(a.archivedAt).getTime() : new Date(a.updatedAt).getTime();
        const timeB = b.archivedAt ? new Date(b.archivedAt).getTime() : new Date(b.updatedAt).getTime();
        return timeB - timeA;
      });
  }, [tasks]);

  // Priority Distribution
  const priorityCounts = useMemo(() => {
    return {
      urgent: filteredTasksByTime.filter((t) => t.priority === "urgent").length,
      high: filteredTasksByTime.filter((t) => t.priority === "high").length,
      medium: filteredTasksByTime.filter((t) => t.priority === "medium").length,
      low: filteredTasksByTime.filter((t) => t.priority === "low").length,
    };
  }, [filteredTasksByTime]);

  // Area / Branch Distribution
  const areaCounts = useMemo(() => {
    const map: Record<string, number> = { BKK: 0, PTY: 0, General: 0 };
    filteredTasksByTime.forEach((t) => {
      if (!t.assignedToId) {
        map.General++;
        return;
      }
      const firstId = t.assignedToId.split(",")[0]?.trim();
      const u = adminUsers.find((user) => user.id === firstId);
      const area = u?.area || "General";
      if (!map[area]) map[area] = 0;
      map[area]++;
    });
    return map;
  }, [filteredTasksByTime, adminUsers]);

  // 7-Day Velocity Trend
  const velocity7Days = useMemo(() => {
    const days: Array<{ label: string; dateStr: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = format(d, "yyyy-MM-dd");
      const label = i === 0 ? "Today" : format(d, "d MMM");
      const doneOnDay = tasks.filter((t) => {
        if (t.status !== "done") return false;
        const doneDateStr = format(new Date(t.completedAt || t.updatedAt), "yyyy-MM-dd");
        return doneDateStr === dateKey;
      }).length;
      days.push({ label, dateStr: dateKey, count: doneOnDay });
    }
    return days;
  }, [tasks]);

  const maxVelocity = Math.max(1, ...velocity7Days.map((d) => d.count));

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header with Timeframe Pill Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
            <Trophy size={20} className="text-amber-500" />
            <span>Task Intelligence & Staff Performance</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            System-wide task health, completion velocity, and staff 5-star response ratings.
          </p>
        </div>

        {/* Controls: Timeframe selector + Include Archived toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Include Archived toggle */}
          <button
            type="button"
            onClick={() => setIncludeArchived(!includeArchived)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
              includeArchived
                ? "bg-indigo-50/90 border-indigo-200 text-indigo-700 font-bold shadow-2xs"
                : "bg-slate-100/80 border-slate-200/80 text-slate-500 hover:bg-slate-200/60"
            }`}
            title="Toggle whether archived tasks are included in dashboard metrics"
          >
            <Archive size={12} className={includeArchived ? "text-indigo-600" : "text-slate-400"} />
            <span>Include Archived</span>
            {totalArchivedTasks > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${includeArchived ? "bg-indigo-200 text-indigo-800" : "bg-slate-200 text-slate-600"}`}>
                {totalArchivedTasks}
              </span>
            )}
          </button>

          {/* Timeframe selector */}
          <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/70 shrink-0">
            {(
              [
                { id: "all", label: "All Time" },
                { id: "month", label: "This Month" },
                { id: "week", label: "This Week" },
                { id: "today", label: "Today" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTimeframe(t.id)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  timeframe === t.id
                    ? "bg-white text-indigo-700 shadow-2xs font-bold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 1. KPI STAT CARDS GRID ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Tasks & Completion Rate */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Tasks</span>
                {archivedInTimeframe > 0 && (
                  <span className="text-[9px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200 flex items-center gap-0.5">
                    <Archive size={9} /> {archivedInTimeframe}
                  </span>
                )}
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">{totalTasks}</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <ClipboardCheck size={18} />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Completion Rate</span>
            <span className="font-bold text-indigo-600">{completionRate}% ({completedTasks} Done)</span>
          </div>
        </div>

        {/* On-Time Delivery Rate */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">On-Time Delivery</span>
              <div className="text-2xl font-extrabold text-emerald-600 mt-1">{onTimeRate}%</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Target size={18} />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">On-time / Completed</span>
            <span className="font-bold text-emerald-700">{onTimeDone} / {completedTasks} tasks</span>
          </div>
        </div>

        {/* Attention Needed (Stuck & Overdue) */}
        <div className={`border rounded-2xl p-4 shadow-2xs flex flex-col justify-between transition-colors ${
          stuckTasks > 0 || overdueTasks > 0
            ? "bg-rose-50/40 border-rose-200"
            : "bg-white border-slate-200"
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Needs Attention</span>
              <div className="text-2xl font-extrabold text-rose-600 mt-1">
                {stuckTasks + overdueTasks}
              </div>
            </div>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
              stuckTasks > 0 || overdueTasks > 0 ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-500"
            }`}>
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100/80 flex items-center justify-between text-xs font-semibold">
            <span className="text-amber-700 flex items-center gap-1">
              <Flame size={12} /> {stuckTasks} Stuck
            </span>
            <span className="text-rose-700 flex items-center gap-1">
              <Clock size={12} /> {overdueTasks} Overdue
            </span>
          </div>
        </div>

        {/* Avg Resolution Speed (TAT) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Avg Turnaround Time</span>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">
                {avgTatHours > 24 ? `${(avgTatHours / 24).toFixed(1)} d` : `${avgTatHours} h`}
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Timer size={18} />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Active WIP</span>
            <span className="font-bold text-blue-600">{inProgressTasks} In Progress · {todoTasks} Todo</span>
          </div>
        </div>
      </div>

      {/* ── 2. STAFF LEADERBOARD & 5-STAR RATING TABLE ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-50/80 to-indigo-50/30">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Star size={16} className="text-amber-500 fill-amber-500" />
                Staff Performance Leaderboard & Response Rate
              </h3>
              <div className="relative">
                <button
                  type="button"
                  onMouseEnter={() => setShowFormulaTooltip(true)}
                  onMouseLeave={() => setShowFormulaTooltip(false)}
                  onClick={() => setShowFormulaTooltip((prev) => !prev)}
                  className="text-slate-400 hover:text-indigo-600 transition-colors p-0.5 cursor-pointer"
                  title="How is Star Rating calculated?"
                >
                  <HelpCircle size={14} />
                </button>
                {showFormulaTooltip && (
                  <div className="absolute left-0 top-full mt-1.5 w-72 bg-slate-900 text-white text-[11px] p-2.5 rounded-xl shadow-xl z-50 leading-relaxed border border-slate-700">
                    <p className="font-bold text-amber-300 mb-1">⭐ Star Rating Formula (Max 5.0):</p>
                    <ul className="space-y-0.5 text-slate-300 list-disc list-inside">
                      <li><strong>On-Time Delivery (40%)</strong>: Tasks done before due date.</li>
                      <li><strong>Completion Ratio (30%)</strong>: Completed vs assigned.</li>
                      <li><strong>Reliability (20%)</strong>: Penalized by overdue/stuck tasks.</li>
                      <li><strong>Activity Diligence (10%)</strong>: Checklists & responsiveness.</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Ranked objectively by response rate, completion speed, and task execution reliability.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            {/* Department Filter Selector in Leaderboard */}
            <select
              value={dashboardDept}
              onChange={(e) => setDashboardDept(e.target.value)}
              className="h-8 text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2.5 text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
            >
              <option value="all">🏢 All Departments</option>
              {departments.length > 0
                ? departments.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.icon} {d.name} {d.nameTh ? `(${d.nameTh})` : ""}
                    </option>
                  ))
                : Object.entries(DEPARTMENT_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.icon} {v.label} ({v.labelTh})
                    </option>
                  ))}
            </select>

            <div className="relative w-full sm:w-56">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                placeholder="Search staff or role..."
                className="h-8 pl-8 text-xs bg-white"
              />
              {staffSearch && (
                <button
                  onClick={() => setStaffSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3 w-12 text-center">Rank</th>
                <th className="px-4 py-3">Team Member</th>
                <th className="px-4 py-3">Response Rating (⭐ 1-5)</th>
                <th className="px-4 py-3 text-center">Workload</th>
                <th className="px-4 py-3 text-center">On-Time %</th>
                <th className="px-4 py-3 text-center">Avg TAT</th>
                <th className="px-4 py-3 text-center">Alerts</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStaffList.length > 0 ? (
                filteredStaffList.map((m, idx) => {
                  const rankBadge =
                    idx === 0
                      ? "🥇 #1"
                      : idx === 1
                      ? "🥈 #2"
                      : idx === 2
                      ? "🥉 #3"
                      : `#${idx + 1}`;

                  const dept = m.user.department ? DEPARTMENT_CONFIG[m.user.department] : undefined;

                  return (
                    <tr
                      key={m.user.id}
                      className="hover:bg-indigo-50/30 transition-colors group"
                    >
                      {/* Rank */}
                      <td className="px-4 py-3 text-center font-bold text-slate-700">
                        <span className={`text-xs ${idx === 0 ? "text-amber-600 font-extrabold" : ""}`}>
                          {rankBadge}
                        </span>
                      </td>

                      {/* Staff Info */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                            {m.user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                              <span>{m.user.name}</span>
                              {dept && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${dept.badgeClass}`}>
                                  {dept.icon} {dept.label}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1">
                              <span>{ROLE_LABELS[m.user.role] || m.user.role}</span>
                              {m.user.area && <span>· {m.user.area}</span>}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Star Rating */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <StarRatingDisplay rating={m.starRating} />
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${m.ratingTier.badgeClass}`}>
                            {m.ratingTier.icon} {m.ratingTier.label}
                          </span>
                        </div>
                      </td>

                      {/* Workload */}
                      <td className="px-4 py-3 text-center">
                        <div className="font-semibold text-slate-800">
                          {m.completed} / {m.totalAssigned} Done
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {m.inProgress} active · {m.todo} todo
                        </div>
                      </td>

                      {/* On-Time Rate */}
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <div className="w-12 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                m.onTimeRate >= 85 ? "bg-emerald-500" : m.onTimeRate >= 60 ? "bg-amber-500" : "bg-rose-500"
                              }`}
                              style={{ width: `${m.onTimeRate}%` }}
                            />
                          </div>
                          <span className="font-bold text-slate-800">{m.onTimeRate}%</span>
                        </div>
                      </td>

                      {/* Avg Turnaround Time */}
                      <td className="px-4 py-3 text-center font-medium text-slate-600">
                        {m.avgResolutionHours > 0 ? (
                          m.avgResolutionHours > 24 ? (
                            `${(m.avgResolutionHours / 24).toFixed(1)} days`
                          ) : (
                            `${m.avgResolutionHours} hrs`
                          )
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Alerts */}
                      <td className="px-4 py-3 text-center">
                        {m.stuck > 0 || m.overdue > 0 ? (
                          <div className="inline-flex items-center gap-1 text-[10px] font-bold">
                            {m.stuck > 0 && (
                              <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                                {m.stuck} stuck
                              </span>
                            )}
                            {m.overdue > 0 && (
                              <span className="bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded">
                                {m.overdue} overdue
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                            ✓ Clear
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onFilterStaff?.(m.user.name)}
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded transition-colors cursor-pointer"
                        >
                          View Tasks →
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    {staffSearch
                      ? `No staff records found matching "${staffSearch}"`
                      : "No staff task activity found for the selected timeframe."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 3. TWO-COLUMN ANALYTICS & BOTTLENECK MONITOR ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left (7 Cols): Dual Monitor — Bottleneck Radar OR Archived Tasks */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setLeftPanelTab("bottlenecks")}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  leftPanelTab === "bottlenecks"
                    ? "bg-white text-rose-700 shadow-2xs font-bold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <AlertTriangle size={13} className={leftPanelTab === "bottlenecks" ? "text-rose-600" : "text-slate-400"} />
                <span>Bottleneck Radar</span>
                {bottleneckTasks.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                    {bottleneckTasks.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setLeftPanelTab("archived")}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  leftPanelTab === "archived"
                    ? "bg-white text-indigo-700 shadow-2xs font-bold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Archive size={13} className={leftPanelTab === "archived" ? "text-indigo-600" : "text-slate-400"} />
                <span>Archived Tasks</span>
                <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${leftPanelTab === "archived" ? "bg-indigo-100 text-indigo-800" : "bg-slate-200 text-slate-600"}`}>
                  {archivedTasksList.length}
                </span>
              </button>
            </div>

            <span className="text-[11px] text-slate-400 hidden sm:inline">
              {leftPanelTab === "bottlenecks" ? "Tasks needing action" : "Completed / Archived archive"}
            </span>
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[360px] pr-1">
            {leftPanelTab === "bottlenecks" ? (
              bottleneckTasks.length > 0 ? (
                bottleneckTasks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => onOpenTask(t)}
                    className="p-3 rounded-xl border border-slate-200/80 hover:border-indigo-300 hover:bg-indigo-50/20 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                          #{t.id.slice(-6).toUpperCase()}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase border ${PRIORITY_CONFIG[t.priority]?.color}`}>
                          {PRIORITY_CONFIG[t.priority]?.label}
                        </span>
                        {t.status === "stuck" && (
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded border border-amber-200">
                            ⚠️ STUCK
                          </span>
                        )}
                        {t.dueDate && isPast(new Date(t.dueDate)) && t.status !== "done" && (
                          <span className="text-[9px] font-bold bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded border border-rose-200">
                            🚨 OVERDUE
                          </span>
                        )}
                        <span className="text-[9px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200">
                          ⏱️ {formatDurationString(Date.now() - new Date(t.createdAt).getTime())}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                        {t.title}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>👤 {t.assignedToName || "Unassigned"}</span>
                        {t.dueDate && <span>📅 Due: {format(new Date(t.dueDate), "d MMM yyyy")}</span>}
                      </div>
                    </div>

                    <Button size="sm" variant="ghost" className="shrink-0 h-7 text-xs font-semibold text-indigo-600 group-hover:bg-indigo-100">
                      Open Task →
                    </Button>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center">
                  <CheckCircle2 size={32} className="text-emerald-500 mb-2" />
                  <p className="text-xs font-bold text-slate-700">No Bottlenecks Detected!</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">All tasks are progressing smoothly on schedule.</p>
                </div>
              )
            ) : (
              // ── ARCHIVED TASKS TAB LIST ──
              archivedTasksList.length > 0 ? (
                archivedTasksList.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => onOpenTask(t)}
                    className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/40 hover:border-indigo-300 hover:bg-indigo-50/20 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200">
                          #{t.id.slice(-6).toUpperCase()}
                        </span>
                        <span className="text-[9px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.2 rounded flex items-center gap-1">
                          <Archive size={9} /> Archived
                        </span>
                        <span className="text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded flex items-center gap-1">
                          <CheckCircle2 size={9} /> {formatDurationString(new Date(t.completedAt || t.updatedAt).getTime() - new Date(t.createdAt).getTime())}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">
                        {t.title}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>👤 {t.assignedToName || "Unassigned"}</span>
                        <span>📦 Archived by: {t.archivedByName || "Admin"}</span>
                        {t.archivedAt && <span>({format(new Date(t.archivedAt), "d MMM HH:mm")})</span>}
                      </div>
                    </div>

                    <Button size="sm" variant="ghost" className="shrink-0 h-7 text-xs font-semibold text-slate-600 group-hover:text-indigo-600 group-hover:bg-indigo-100">
                      View Details →
                    </Button>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center">
                  <Archive size={32} className="text-slate-300 mb-2" />
                  <p className="text-xs font-bold text-slate-700">No Archived Tasks</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Completed tasks moved to archive will appear here.</p>
                </div>
              )
            )}
          </div>
        </div>

        {/* Right (5 Cols): Distribution & Velocity */}
        <div className="lg:col-span-5 space-y-4">
          {/* 7-Day Velocity Trend Bar Chart */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 mb-3">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 uppercase tracking-wider">
                <TrendingUp size={14} className="text-indigo-600" />
                7-Day Completion Velocity
              </h4>
              <span className="text-[10px] text-slate-400 font-medium">Completed / Day</span>
            </div>

            <div className="h-28 flex items-end justify-between gap-2 pt-4">
              {velocity7Days.map((v, i) => {
                const heightPercent = Math.max(8, (v.count / maxVelocity) * 100);
                const isTodayBar = i === velocity7Days.length - 1;
                return (
                  <div key={v.dateStr} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                    <span className="text-[10px] font-bold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      {v.count}
                    </span>
                    <div className="w-full bg-slate-100 rounded-t-lg overflow-hidden flex items-end" style={{ height: "70px" }}>
                      <div
                        className={`w-full rounded-t-lg transition-all duration-500 ${
                          isTodayBar ? "bg-indigo-600 shadow-2xs" : "bg-indigo-300 group-hover:bg-indigo-400"
                        }`}
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                    <span className={`text-[9px] truncate max-w-full font-medium ${isTodayBar ? "font-bold text-indigo-700" : "text-slate-400"}`}>
                      {v.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Priority & Workload Breakdown */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Layers size={14} className="text-indigo-600" />
              Priority Breakdown
            </h4>
            <div className="space-y-2">
              {[
                { label: "Urgent", count: priorityCounts.urgent, color: "bg-red-500", text: "text-red-700" },
                { label: "High", count: priorityCounts.high, color: "bg-orange-500", text: "text-orange-700" },
                { label: "Medium", count: priorityCounts.medium, color: "bg-amber-500", text: "text-amber-700" },
                { label: "Low", count: priorityCounts.low, color: "bg-slate-400", text: "text-slate-600" },
              ].map((p) => {
                const pct = totalTasks > 0 ? Math.round((p.count / totalTasks) * 100) : 0;
                return (
                  <div key={p.label} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-[80px]">
                      <span className={`w-2 h-2 rounded-full ${p.color}`} />
                      <span className="font-semibold text-slate-700">{p.label}</span>
                    </div>
                    <div className="flex-1 mx-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${p.color}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-slate-600 w-10 text-right">{p.count} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Staff User Personalized Dashboard (role !== 'admin') ───────────────────────

export function TaskUserDashboard({
  tasks,
  adminUsers,
  currentUserId,
  currentUserName,
  currentUserDept,
  isDepartmentHead,
  onOpenTask,
  onToggleChecklist,
}: {
  tasks: TaskItem[];
  adminUsers: AdminUser[];
  currentUserId: string;
  currentUserName: string;
  currentUserDept?: string | null;
  isDepartmentHead?: boolean;
  onOpenTask: (task: TaskItem) => void;
  onToggleChecklist: (taskId: string, itemId: string, completed: boolean) => void;
}) {
  const [userQueueTab, setUserQueueTab] = useState<"active" | "archived" | "department_team">("active");

  // Department Subordinates (for Department Heads)
  const departmentSubordinates = useMemo(() => {
    if (!currentUserDept) return [];
    return adminUsers.filter((u) => u.department === currentUserDept && u.isActive !== false);
  }, [adminUsers, currentUserDept]);

  // Department Subordinate Tasks
  const departmentSubordinateTasks = useMemo(() => {
    if (!isDepartmentHead || !currentUserDept) return [];
    const subIds = departmentSubordinates.map((u) => u.id);
    return tasks.filter((t) => {
      if (t.isArchived) return false;
      if (subIds.includes(t.createdById)) return true;
      if (!t.assignedToId) return false;
      const assignees = t.assignedToId.split(",").map((s) => s.trim());
      return assignees.some((aid) => subIds.includes(aid));
    });
  }, [tasks, departmentSubordinates, isDepartmentHead, currentUserDept]);

  // My Assigned Tasks
  const myAssignedTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.isArchived) return false;
      if (!t.assignedToId) return false;
      return t.assignedToId.split(",").map((s) => s.trim()).includes(currentUserId);
    });
  }, [tasks, currentUserId]);

  const myCreatedTasks = useMemo(() => {
    return tasks.filter((t) => !t.isArchived && t.createdById === currentUserId);
  }, [tasks, currentUserId]);

  const myArchivedTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (!t.isArchived) return false;
      if (!t.assignedToId) return t.createdById === currentUserId;
      return t.assignedToId.split(",").map((s) => s.trim()).includes(currentUserId) || t.createdById === currentUserId;
    });
  }, [tasks, currentUserId]);

  // Personal Metrics
  const myMetric = useMemo(() => {
    const list = calculateStaffMetrics(tasks, [
      { id: currentUserId, name: currentUserName, role: "staff", area: null, isActive: true },
    ]);
    return list[0] || null;
  }, [tasks, currentUserId, currentUserName]);

  const myActiveTasks = myAssignedTasks.filter(
    (t) => t.status === "todo" || t.status === "in_progress" || t.status === "stuck"
  );
  const myDoneTasks = myAssignedTasks.filter((t) => t.status === "done");
  const myDueToday = myActiveTasks.filter((t) => t.dueDate && isToday(new Date(t.dueDate)));
  const myOverdue = myActiveTasks.filter(
    (t) => t.dueDate && isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate))
  );

  // Action Priority Queue ("What should I work on next?")
  const actionQueue = useMemo(() => {
    return [...myActiveTasks].sort((a, b) => {
      const aOverdue = a.dueDate && isPast(new Date(a.dueDate)) && !isToday(new Date(a.dueDate));
      const bOverdue = b.dueDate && isPast(new Date(b.dueDate)) && !isToday(new Date(b.dueDate));
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;

      const pWeights: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
      const diffP = (pWeights[b.priority] || 0) - (pWeights[a.priority] || 0);
      if (diffP !== 0) return diffP;

      if (a.status === "in_progress" && b.status === "todo") return -1;
      if (a.status === "todo" && b.status === "in_progress") return 1;

      const dueA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const dueB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return dueA - dueB;
    });
  }, [myActiveTasks]);

  // Open checklist items in my active tasks
  const openChecklistItems = useMemo(() => {
    const items: Array<{ task: TaskItem; item: TaskChecklistItem }> = [];
    myActiveTasks.forEach((t) => {
      try {
        const list: TaskChecklistItem[] = t.checklistJson ? JSON.parse(t.checklistJson) : [];
        list.filter((i) => !i.completed).forEach((item) => {
          items.push({ task: t, item });
        });
      } catch {}
    });
    return items.slice(0, 8);
  }, [myActiveTasks]);

  // Recent mentions & notes on my tasks
  const recentMentions = useMemo(() => {
    const notesList: Array<{ task: TaskItem; note: TaskNote }> = [];
    tasks.forEach((t) => {
      if (t.isArchived) return;
      try {
        const parsed: TaskNote[] = t.notesJson ? JSON.parse(t.notesJson) : [];
        parsed
          .filter((n) => n.type !== "activity")
          .forEach((n) => {
            const isMentioned = n.text && n.text.toLowerCase().includes(`@${currentUserName.toLowerCase()}`);
            const isMyTask = t.assignedToId?.includes(currentUserId) || t.createdById === currentUserId;
            if (isMentioned || isMyTask) {
              notesList.push({ task: t, note: n });
            }
          });
      } catch {}
    });
    return notesList
      .sort((a, b) => new Date(b.note.timestamp).getTime() - new Date(a.note.timestamp).getTime())
      .slice(0, 5);
  }, [tasks, currentUserId, currentUserName]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ── 1. PERSONAL HERO BANNER & STAR RATING ── */}
      <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 rounded-3xl p-5 sm:p-7 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 text-white/5 pointer-events-none">
          <Trophy size={220} />
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/15 px-3 py-1 rounded-full text-xs font-semibold text-indigo-200">
                <UserCheck size={13} className="text-emerald-400" />
                <span>Personal Action Center</span>
              </div>
              {isDepartmentHead && (
                <div className="inline-flex items-center gap-1.5 bg-amber-400/90 text-amber-950 px-3 py-1 rounded-full text-xs font-black shadow-2xs">
                  <span>👑 Head of {DEPARTMENT_CONFIG[currentUserDept || ""]?.labelTh || currentUserDept || "Department"}</span>
                </div>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              Welcome back, {currentUserName}! 👋
            </h2>
            <p className="text-xs sm:text-sm text-indigo-200 mt-1 max-w-xl">
              {isDepartmentHead ? (
                <>
                  You are tracking <strong className="text-white">{departmentSubordinateTasks.length} department tasks</strong> across {departmentSubordinates.length} team members · <strong className="text-amber-300">{myActiveTasks.length} personal tasks</strong> assigned to you.
                </>
              ) : (
                <>
                  You have <strong className="text-white">{myActiveTasks.length} active tasks</strong> assigned.{" "}
                  {myDueToday.length > 0 && (
                    <span className="text-amber-300 font-bold">
                      🔥 {myDueToday.length} task(s) due today!
                    </span>
                  )}
                </>
              )}
            </p>
          </div>

          {/* Star Rating Card */}
          {myMetric && (
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 flex flex-col items-center justify-center shrink-0 min-w-[200px] shadow-lg">
              <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-wider mb-1">
                My Performance Rating
              </span>
              <div className="flex items-center gap-1.5 my-1">
                <StarRatingDisplay rating={myMetric.starRating} size={16} />
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${myMetric.ratingTier.badgeClass}`}>
                {myMetric.ratingTier.icon} {myMetric.ratingTier.label}
              </span>
            </div>
          )}
        </div>

        {/* Quick Personal KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-white/10 text-xs">
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <span className="text-[10px] font-semibold text-indigo-200 uppercase block">My Active Tasks</span>
            <span className="text-xl font-bold text-white mt-0.5 block">{myActiveTasks.length}</span>
          </div>
          {isDepartmentHead ? (
            <div className="bg-amber-400/10 rounded-xl p-3 border border-amber-400/20">
              <span className="text-[10px] font-semibold text-amber-200 uppercase block">👑 Team Tasks</span>
              <span className="text-xl font-bold text-amber-300 mt-0.5 block">{departmentSubordinateTasks.length}</span>
            </div>
          ) : (
            <div className="bg-white/5 rounded-xl p-3 border border-white/10">
              <span className="text-[10px] font-semibold text-indigo-200 uppercase block">Due Today / Urgent</span>
              <span className={`text-xl font-bold mt-0.5 block ${myDueToday.length > 0 ? "text-amber-300" : "text-white"}`}>
                {myDueToday.length}
              </span>
            </div>
          )}
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <span className="text-[10px] font-semibold text-indigo-200 uppercase block">Completed Work</span>
            <span className="text-xl font-bold text-emerald-400 mt-0.5 block">{myDoneTasks.length + myArchivedTasks.length}</span>
          </div>
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <span className="text-[10px] font-semibold text-indigo-200 uppercase block">Archived Tasks</span>
            <span className="text-xl font-bold text-slate-300 mt-0.5 block">📦 {myArchivedTasks.length}</span>
          </div>
        </div>
      </div>

      {/* ── 2. ACTION PRIORITY QUEUE ("What to do next") ── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl flex-wrap">
              <button
                type="button"
                onClick={() => setUserQueueTab("active")}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  userQueueTab === "active"
                    ? "bg-white text-indigo-700 shadow-2xs font-bold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Zap size={14} className={userQueueTab === "active" ? "text-indigo-600" : "text-slate-400"} />
                <span>My Action Queue</span>
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                  {actionQueue.length}
                </span>
              </button>

              {isDepartmentHead && (
                <button
                  type="button"
                  onClick={() => setUserQueueTab("department_team")}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    userQueueTab === "department_team"
                      ? "bg-amber-500 text-white shadow-2xs font-bold"
                      : "text-amber-800 hover:text-amber-950 hover:bg-amber-100/60"
                  }`}
                >
                  <Users size={14} className={userQueueTab === "department_team" ? "text-white" : "text-amber-700"} />
                  <span>👑 Department Team Tasks</span>
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      userQueueTab === "department_team"
                        ? "bg-amber-600 text-white"
                        : "bg-amber-100 text-amber-900 border border-amber-200"
                    }`}
                  >
                    {departmentSubordinateTasks.length}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setUserQueueTab("archived")}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  userQueueTab === "archived"
                    ? "bg-white text-indigo-700 shadow-2xs font-bold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Archive size={14} className={userQueueTab === "archived" ? "text-indigo-600" : "text-slate-400"} />
                <span>My Archived Work</span>
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                  {myArchivedTasks.length}
                </span>
              </button>
            </div>
          </div>
        </div>

        {userQueueTab === "active" ? (
          actionQueue.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {actionQueue.map((task) => {
                const isOverdue = task.dueDate && isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate));
                const isDueTodayTask = task.dueDate && isToday(new Date(task.dueDate));
                const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
                const statusCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.todo;

                const checklistCount = (() => {
                  try {
                    const list: TaskChecklistItem[] = task.checklistJson ? JSON.parse(task.checklistJson) : [];
                    const done = list.filter((i) => i.completed).length;
                    return { total: list.length, done };
                  } catch {
                    return { total: 0, done: 0 };
                  }
                })();

                return (
                  <div
                    key={task.id}
                    onClick={() => onOpenTask(task)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between hover:shadow-md ${
                      isOverdue
                        ? "bg-red-50/40 border-red-200 hover:border-red-300"
                        : isDueTodayTask
                        ? "bg-amber-50/40 border-amber-200 hover:border-amber-300"
                        : task.status === "in_progress"
                        ? "bg-blue-50/20 border-blue-200 hover:border-indigo-300"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1.5 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase ${priority.color}`}>
                            {priority.icon} {priority.label}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.2 rounded-full ${statusCfg.color}`}>
                            {statusCfg.label}
                          </span>
                        </div>
                        <span className="text-[10px] font-medium text-slate-600 bg-slate-100/90 border border-slate-200/80 px-1.5 py-0.2 rounded flex items-center gap-1">
                          <Clock size={10} className="text-slate-400" />
                          <span>{formatDurationString(Date.now() - new Date(task.createdAt).getTime())}</span>
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug">
                        {task.title}
                      </h4>

                      {task.description && (
                        <p className="text-[11px] text-slate-500 line-clamp-2 mt-1">
                          {task.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5">
                        {isOverdue ? (
                          <span className="font-bold text-rose-600 flex items-center gap-1">
                            <AlertTriangle size={11} /> Overdue
                          </span>
                        ) : isDueTodayTask ? (
                          <span className="font-bold text-amber-600 flex items-center gap-1">
                            <Clock size={11} /> Due Today!
                          </span>
                        ) : task.dueDate ? (
                          <span className="text-slate-500 flex items-center gap-1">
                            <Calendar size={11} /> {format(new Date(task.dueDate), "d MMM")}
                          </span>
                        ) : (
                          <span className="text-slate-400">No deadline</span>
                        )}
                      </div>

                      {checklistCount.total > 0 && (
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                          ✓ {checklistCount.done}/{checklistCount.total}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center">
              <CheckCircle2 size={36} className="text-emerald-500 mb-2" />
              <p className="text-xs font-bold text-slate-700">All Caught Up! 🎉</p>
              <p className="text-[11px] text-slate-400 mt-0.5">You have no active pending tasks in your queue.</p>
            </div>
          )
        ) : userQueueTab === "department_team" ? (
          // ── 👑 DEPARTMENT TEAM TASKS TAB (FOR DEPARTMENT HEADS) ──
          departmentSubordinateTasks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {departmentSubordinateTasks.map((task) => {
                const isOverdue = task.dueDate && isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate));
                const isDueTodayTask = task.dueDate && isToday(new Date(task.dueDate));
                const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
                const statusCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.todo;

                const assigneeNames = task.assignedToName || "Unassigned";

                return (
                  <div
                    key={task.id}
                    onClick={() => onOpenTask(task)}
                    className="p-4 rounded-xl border border-amber-200/80 bg-amber-50/20 hover:border-amber-400 hover:bg-amber-50/50 transition-all cursor-pointer flex flex-col justify-between hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1.5 mb-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase ${priority.color}`}>
                            {priority.icon} {priority.label}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.2 rounded-full ${statusCfg.color}`}>
                            {statusCfg.label}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded flex items-center gap-1">
                          👤 {assigneeNames}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug">
                        {task.title}
                      </h4>

                      {task.description && (
                        <p className="text-[11px] text-slate-500 line-clamp-2 mt-1">
                          {task.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-200/70 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5">
                        {isOverdue ? (
                          <span className="font-bold text-rose-600 flex items-center gap-1">
                            <AlertTriangle size={11} /> Overdue
                          </span>
                        ) : isDueTodayTask ? (
                          <span className="font-bold text-amber-600 flex items-center gap-1">
                            <Clock size={11} /> Due Today!
                          </span>
                        ) : task.dueDate ? (
                          <span className="text-slate-500 flex items-center gap-1">
                            <Calendar size={11} /> {format(new Date(task.dueDate), "d MMM")}
                          </span>
                        ) : (
                          <span className="text-slate-400">No deadline</span>
                        )}
                      </div>

                      <span className="text-[10px] text-amber-900 font-bold hover:underline">
                        Supervise & Edit →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center">
              <Users size={36} className="text-amber-400 mb-2" />
              <p className="text-xs font-bold text-slate-700">No Active Team Tasks</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Tasks created by or assigned to staff in your department will appear here.</p>
            </div>
          )
        ) : (
          // ── USER'S ARCHIVED TASKS TAB ──
          myArchivedTasks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {myArchivedTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => onOpenTask(task)}
                  className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:border-indigo-300 hover:bg-indigo-50/20 transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1.5 mb-2 flex-wrap">
                      <span className="font-mono text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200">
                        #{task.id.slice(-6).toUpperCase()}
                      </span>
                      <span className="text-[9px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.2 rounded flex items-center gap-1">
                        <Archive size={9} /> Archived
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-slate-800 line-clamp-2 leading-snug">
                      {task.title}
                    </h4>

                    {task.description && (
                      <p className="text-[11px] text-slate-500 line-clamp-2 mt-1">
                        {task.description}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                    <span>📦 Archived: {task.archivedAt ? format(new Date(task.archivedAt), "d MMM yyyy") : "-"}</span>
                    <span className="text-indigo-600 font-bold">View Task →</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center">
              <Archive size={36} className="text-slate-300 mb-2" />
              <p className="text-xs font-bold text-slate-700">No Archived Tasks Found</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Tasks you completed and archived will appear here.</p>
            </div>
          )
        )}
      </div>

      {/* ── 3. TWO-COLUMN SUB-TASKS & RECENT MENTIONS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left (6 Cols): My Pending Checklist Items */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 mb-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <CheckSquare size={14} className="text-indigo-600" />
              My Pending Checklist Sub-Tasks
            </h4>
            <span className="text-[10px] text-slate-400 font-medium">Click to complete</span>
          </div>

          <div className="space-y-2 flex-1 overflow-y-auto max-h-[300px] pr-1">
            {openChecklistItems.length > 0 ? (
              openChecklistItems.map(({ task, item }) => (
                <div
                  key={`${task.id}-${item.id}`}
                  className="p-2.5 rounded-xl border border-slate-100 hover:border-indigo-200 bg-slate-50/50 hover:bg-white transition-all flex items-start gap-2.5"
                >
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={(e) => onToggleChecklist(task.id, item.id, e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-800 leading-snug">{item.text}</p>
                    <button
                      type="button"
                      onClick={() => onOpenTask(task)}
                      className="text-[10px] text-indigo-600 hover:underline font-semibold mt-0.5 block truncate text-left"
                    >
                      In #{task.id.slice(-6).toUpperCase()}: {task.title}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-10 text-center text-slate-400 flex flex-col items-center justify-center">
                <CheckCircle2 size={24} className="text-emerald-400 mb-1" />
                <p className="text-xs text-slate-600 font-semibold">No pending sub-tasks</p>
              </div>
            )}
          </div>
        </div>

        {/* Right (6 Cols): Recent Mentions & Task Chat */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 mb-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare size={14} className="text-indigo-600" />
              Recent Notes & Mentions (@Me)
            </h4>
            <span className="text-[10px] text-slate-400 font-medium">Task discussions</span>
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[300px] pr-1">
            {recentMentions.length > 0 ? (
              recentMentions.map(({ task, note }) => (
                <div
                  key={note.id}
                  onClick={() => onOpenTask(task)}
                  className="p-2.5 rounded-xl border border-slate-100 hover:border-indigo-200 bg-slate-50/50 hover:bg-indigo-50/20 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1">
                      <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[9px]">
                        {note.userName.charAt(0).toUpperCase()}
                      </span>
                      {note.userName}
                    </span>
                    <span className="text-[10px] text-slate-400">{format(new Date(note.timestamp), "d MMM HH:mm")}</span>
                  </div>
                  <p className="text-xs text-slate-700 line-clamp-2 pl-5">
                    {renderMessageText(note.text)}
                  </p>
                  <span className="text-[10px] text-indigo-600 font-semibold mt-1 block pl-5 truncate">
                    Task: #{task.id.slice(-6).toUpperCase()} · {task.title}
                  </span>
                </div>
              ))
            ) : (
              <div className="py-10 text-center text-slate-400 flex flex-col items-center justify-center">
                <MessageSquare size={24} className="text-slate-300 mb-1" />
                <p className="text-xs text-slate-600 font-semibold">No recent conversation notes</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
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
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(() => !cachedTasks);
  const [isSyncing, setIsSyncing] = useState(false);
  const isFetchingRef = useRef(false);
  const [viewMode, setViewMode] = useState<"board" | "list" | "dashboard">("board");
  const [filterStatus, setFilterStatus] = useState<"all" | "mine" | "open" | "overdue" | "due_today" | "archived">("all");
  const [filterDepartment, setFilterDepartment] = useState<string>(() => {
    if (user?.isDepartmentHead && user?.department) {
      return user.department;
    }
    return "all";
  });
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (user?.isDepartmentHead && user?.department) {
      setFilterDepartment(user.department);
    }
  }, [user?.isDepartmentHead, user?.department]);
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
      const res = await getTasks(
        user
          ? {
              id: user.id,
              role: user.role,
              isDepartmentHead: user.isDepartmentHead,
              department: user.department,
            }
          : undefined
      );
      if (res.success && res.data) {
        cachedTasks = res.data;
        setTasks(res.data);

        // If a task modal is currently open, keep editingTask fresh with live updates
        setEditingTask((prev) => {
          if (!prev) return null;
          const updated = res.data!.find((t) => t.id === prev.id);
          if (!updated) return prev;
          const isSame =
            updated.updatedAt === prev.updatedAt &&
            updated.title === prev.title &&
            updated.description === prev.description &&
            updated.priority === prev.priority &&
            updated.status === prev.status &&
            updated.jobId === prev.jobId &&
            updated.assignedToId === prev.assignedToId &&
            updated.dueDate === prev.dueDate &&
            updated.notesJson === prev.notesJson &&
            updated.checklistJson === prev.checklistJson &&
            updated.attachmentsJson === prev.attachmentsJson &&
            updated.isArchived === prev.isArchived;

          return isSame ? prev : updated;
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
        getDepartments().then((res) => {
          if (res.success && res.data && mounted) {
            setDepartments(res.data as DepartmentItem[]);
          }
        }),
        getRoles().then((res) => {
          if (res.success && res.data && mounted) {
            setRoles(res.data as RoleItem[]);
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
  }, [user?.id, user?.role, user?.isDepartmentHead, user?.department]);

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
          getTasks(
            user
              ? {
                  id: user.id,
                  role: user.role,
                  isDepartmentHead: user.isDepartmentHead,
                  department: user.department,
                }
              : undefined
          ).then((res) => {
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
  }, [tasks, user?.id, user?.role, user?.isDepartmentHead, user?.department]);

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
          const isMine =
            t.createdById === user?.id ||
            (t.assignedToId && t.assignedToId.split(",").map((s) => s.trim()).includes(user?.id || ""));
          if (!isMine) return false;
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

      // 2. Department filter
      if (filterDepartment !== "all") {
        const assigneeIds = t.assignedToId ? t.assignedToId.split(",").map((s) => s.trim()) : [];
        const assignedUsers = adminUsers.filter((u) => assigneeIds.includes(u.id));
        const hasMatchingAssignee = assignedUsers.some((u) => (u.department || 'branch_ops') === filterDepartment);

        const creatorUser = adminUsers.find((u) => u.id === t.createdById);
        const isMatchingCreator = creatorUser ? (creatorUser.department || 'branch_ops') === filterDepartment : false;

        if (!hasMatchingAssignee && !isMatchingCreator) return false;
      }

      // 3. Super Search multi-term matching (searches ID, title, description, job, staff, notes, checklist, attachments)
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
  }, [tasks, filterStatus, filterDepartment, adminUsers, user?.id, searchQuery]);

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

          {/* Department Filter Dropdown */}
          <div className="relative shrink-0">
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className={`h-8 text-xs font-bold rounded-lg px-2.5 pr-7 border transition-all cursor-pointer appearance-none bg-no-repeat bg-right ${
                filterDepartment !== "all"
                  ? "bg-indigo-50 text-indigo-800 border-indigo-300 ring-2 ring-indigo-100"
                  : "bg-slate-50 hover:bg-white text-slate-700 border-slate-200"
              }`}
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundPosition: "calc(100% - 8px) center",
              }}
            >
              <option value="all">🏢 All Departments</option>
              {departments.length > 0
                ? departments.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.icon} {d.name} {d.nameTh ? `(${d.nameTh})` : ""}
                    </option>
                  ))
                : Object.entries(DEPARTMENT_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.icon} {v.label} ({v.labelTh})
                    </option>
                  ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* View Mode Switcher: Dashboard / Board / List */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("dashboard")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === "dashboard"
                    ? "bg-white text-indigo-700 shadow-2xs font-bold"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                title={user?.role === "admin" ? "Management Dashboard & Staff Ratings" : "My Personal Task Hub"}
              >
                <BarChart2 size={13} className={viewMode === "dashboard" ? "text-indigo-600" : "text-slate-400"} />
                <span>Dashboard</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("board")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === "board"
                    ? "bg-white text-indigo-700 shadow-2xs font-bold"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                title="Kanban Board"
              >
                <LayoutGrid size={13} className={viewMode === "board" ? "text-indigo-600" : "text-slate-400"} />
                <span>Board</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === "list"
                    ? "bg-white text-indigo-700 shadow-2xs font-bold"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                title="Table List View"
              >
                <List size={13} className={viewMode === "list" ? "text-indigo-600" : "text-slate-400"} />
                <span>List</span>
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
          {viewMode === "dashboard" ? (
            user?.role === "admin" ? (
              <TaskAdminDashboard
                tasks={tasks}
                adminUsers={adminUsers}
                departments={departments}
                onOpenTask={openEdit}
                onFilterStaff={(staffName) => {
                  setSearchQuery(staffName);
                  setViewMode("board");
                }}
              />
            ) : (
              <TaskUserDashboard
                tasks={tasks}
                adminUsers={adminUsers}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                onOpenTask={openEdit}
                onToggleChecklist={async (taskId, itemId, completed) => {
                  await toggleTaskChecklistItem(taskId, itemId, completed, { id: currentUserId, name: currentUserName });
                  loadTasks(true);
                }}
              />
            )
          ) : viewMode === "board" && filterStatus !== "archived" ? (
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
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 min-h-0"
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
                              adminUsers={adminUsers}
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
                            <td className="px-4 py-3 text-xs text-slate-600">
                              {task.assignedToName ? (
                                <div className="flex flex-wrap gap-1 max-w-[200px]">
                                  {task.assignedToName.split(",").map((name, idx) => (
                                    <span key={idx} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[11px]">
                                      <User size={10} className="text-slate-400" />
                                      {name.trim()}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-400">Unassigned</span>
                              )}
                            </td>
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
            <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
              <button
                type="button"
                className="text-white hover:text-indigo-300 bg-black/50 hover:bg-black/80 rounded-full p-2 transition-colors cursor-pointer"
                onClick={() => downloadAttachment(previewImage, "image.jpg")}
                title="Download Image"
              >
                <Download size={20} />
              </button>
              <button
                type="button"
                className="text-white hover:text-red-400 bg-black/50 hover:bg-black/80 rounded-full p-2 transition-colors cursor-pointer"
                onClick={() => setPreviewImage(null)}
                title="Close"
              >
                <X size={22} />
              </button>
            </div>
            <img
              src={previewImage}
              draggable
              onDragStart={(e) => {
                try {
                  e.dataTransfer.setData("DownloadURL", `image/jpeg:image.jpg:${previewImage}`);
                  e.dataTransfer.setData("text/uri-list", previewImage);
                  e.dataTransfer.setData("text/plain", previewImage);
                  e.dataTransfer.effectAllowed = "copy";
                } catch (err) {}
              }}
              className="max-w-full max-h-[80vh] object-contain rounded-xl select-none cursor-grab active:cursor-grabbing"
              alt="Preview"
              title="Click and drag to Mac Desktop to save"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardCheck, Plus, LayoutGrid, List, X, Calendar,
  AlertTriangle, ArrowRight, CheckCircle2, Clock, User,
  Trash2, Edit2, Hash, Flag, Loader2, MessageSquare, Send,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { format, isPast } from "date-fns";
import {
  getTasks, createTask, updateTask, deleteTask, addTaskNote, deleteTaskNote,
  type TaskItem, type TaskPriority, type TaskStatus, type TaskNote,
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

// ─── Notes Panel ──────────────────────────────────────────────────────────────

function NotesPanel({
  task, currentUserId, currentUserName, onUpdate,
}: {
  task: TaskItem;
  currentUserId: string;
  currentUserName: string;
  onUpdate: (updated: TaskItem) => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const notes: TaskNote[] = useMemo(() => {
    try { return task.notesJson ? JSON.parse(task.notesJson) : []; }
    catch { return []; }
  }, [task.notesJson]);

  const handleAdd = async () => {
    if (!text.trim()) return;
    setSaving(true);
    const res = await addTaskNote(task.id, { text, userId: currentUserId, userName: currentUserName });
    setSaving(false);
    if (res.success && res.data) {
      setText("");
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

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAdd();
  };

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      {/* Notes list */}
      {notes.length > 0 && (
        <div className="space-y-2 mb-3 max-h-52 overflow-y-auto pr-1">
          {notes.map((note) => {
            const isOwn = note.userId === currentUserId;
            const date = new Date(note.timestamp);
            return (
              <div key={note.id} className="group flex gap-2">
                {/* Avatar */}
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[9px] font-bold text-indigo-700">
                    {note.userName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-[11px] font-semibold text-slate-700">{note.userName}</span>
                    <span className="text-[10px] text-slate-400">
                      {format(date, "d MMM yyyy HH:mm")}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mt-0.5 break-words whitespace-pre-wrap">
                    {note.text}
                  </p>
                </div>
                {isOwn && (
                  <button
                    onClick={() => handleDelete(note.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all shrink-0 mt-0.5"
                    title="Delete note"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {notes.length === 0 && (
        <p className="text-[10px] text-slate-400 italic mb-2">No updates yet</p>
      )}

      {/* Input */}
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="เพิ่ม note... (Ctrl+Enter เพื่อส่ง)"
          rows={2}
          className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all"
        />
        <button
          onClick={handleAdd}
          disabled={saving || !text.trim()}
          className="h-8 w-8 flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white transition-colors shrink-0 mb-0.5"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        </button>
      </div>
    </div>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({
  task, currentUserId, currentUserName, onEdit, onDelete, onStatusChange, onUpdate,
}: {
  task: TaskItem;
  currentUserId: string;
  currentUserName: string;
  onEdit: (t: TaskItem) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onUpdate: (updated: TaskItem) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
  const overdue = task.dueDate && isPast(new Date(task.dueDate)) && task.status !== "done";
  const noteCount = useMemo(() => {
    try { return task.notesJson ? JSON.parse(task.notesJson).length : 0; }
    catch { return 0; }
  }, [task.notesJson]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white rounded-xl border border-slate-200 shadow-sm p-3.5 group hover:shadow-md hover:border-slate-300 transition-all"
    >
      {/* Priority + Actions */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${priority.color}`}>
          {priority.icon} {priority.label}
        </span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(task)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
            <Edit2 size={12} />
          </button>
          <button onClick={() => onDelete(task.id)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors">
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

      {/* Meta */}
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
          <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${overdue ? "bg-red-50 text-red-600 border-red-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
            <Calendar size={9} />
            {overdue && <AlertTriangle size={9} />}
            {format(new Date(task.dueDate), "d MMM")}
          </span>
        )}
      </div>

      {/* Status changer */}
      <div className="flex gap-1">
        {KANBAN_COLS.map((col) => (
          <button
            key={col.key}
            disabled={task.status === col.key}
            onClick={() => onStatusChange(task.id, col.key)}
            className={`flex-1 text-[9px] py-1 rounded font-semibold uppercase tracking-wide transition-all border ${
              task.status === col.key
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-400 border-slate-200 hover:border-slate-400 hover:text-slate-700"
            }`}
          >
            {col.label}
          </button>
        ))}
      </div>

      {/* Notes toggle */}
      <button
        onClick={() => setNotesOpen((o) => !o)}
        className="mt-2.5 flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-indigo-600 transition-colors w-full"
      >
        <MessageSquare size={11} />
        <span className="font-medium">
          {noteCount > 0 ? `${noteCount} note${noteCount > 1 ? "s" : ""}` : "Add note"}
        </span>
        <span className="ml-auto">{notesOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}</span>
      </button>

      {/* Notes panel */}
      <AnimatePresence>
        {notesOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <NotesPanel
              task={task}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              onUpdate={onUpdate}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Creator */}
      <p className="text-[9px] text-slate-400 mt-2">by {task.createdByName} · {format(new Date(task.createdAt), "d MMM HH:mm")}</p>
    </motion.div>
  );
}

// ─── Task Form Modal ──────────────────────────────────────────────────────────

function TaskFormModal({
  open, onClose, onSave, initialTask, adminUsers,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  initialTask?: TaskItem | null;
  adminUsers: AdminUser[];
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [jobId, setJobId] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [assignedToName, setAssignedToName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

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
      setJobId(initialTask?.jobId ?? "");
      setAssignedToId(initialTask?.assignedToId ?? "");
      setAssignedToName(initialTask?.assignedToName ?? "");
      setDueDate(initialTask?.dueDate ? format(new Date(initialTask.dueDate), "yyyy-MM-dd") : "");
    }
  }, [open, initialTask]);

  const handleAssignChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = adminUsers.find((u) => u.id === e.target.value);
    setAssignedToId(e.target.value);
    setAssignedToName(selected?.name ?? "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error("Please enter a task title"); return; }
    setSaving(true);
    await onSave({ title, description, priority, jobId, assignedToId, assignedToName, dueDate });
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck size={18} className="text-indigo-600" />
            {initialTask ? "Edit Task" : "Create New Task"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Task Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Follow up with customer..." className="h-9 text-sm" autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Description</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional details..."
              rows={2}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Priority</Label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full h-9 text-sm border border-slate-200 rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all bg-white"
              >
                {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Job ID</Label>
              <Input value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="e.g. 2026001234" className="h-9 text-sm font-mono" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Assign To</Label>
            <select
              value={assignedToId}
              onChange={handleAssignChange}
              className="w-full h-9 text-sm border border-slate-200 rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all bg-white"
            >
              <option value="">— Unassigned —</option>
              {Object.entries(groupedUsers).sort().map(([role, branches]) =>
                Object.entries(branches).sort().map(([branch, users]) => (
                  <optgroup key={`${role}-${branch}`} label={`${ROLE_LABELS[role] ?? role} · ${branch}`}>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </optgroup>
                ))
              )}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Due Date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9 text-sm" />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {saving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <ClipboardCheck size={14} className="mr-1.5" />}
              {initialTask ? "Save Changes" : "Create Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AdminTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [filterStatus, setFilterStatus] = useState<"all" | "mine" | "open">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);

  const currentUserId   = user?.id ?? "unknown";
  const currentUserName = (user as any)?.name ?? user?.email ?? "Admin";

  const loadTasks = async () => {
    const res = await getTasks();
    if (res.success && res.data) setTasks(res.data);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([
        loadTasks(),
        getUsers().then((res) => { if (res.success && res.data) setAdminUsers(res.data as AdminUser[]); }),
      ]);
      setLoading(false);
    })();
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterStatus === "mine") return t.assignedToId === user?.id || t.createdById === user?.id;
      if (filterStatus === "open") return t.status !== "done";
      return true;
    });
  }, [tasks, filterStatus, user?.id]);

  const pendingCount = tasks.filter((t) => t.status !== "done").length;

  // Update a single task in state (used by notes)
  const handleTaskUpdate = (updated: TaskItem) => {
    setTasks((ts) => ts.map((t) => t.id === updated.id ? updated : t));
  };

  const handleSave = async (data: any) => {
    if (editingTask) {
      const res = await updateTask(editingTask.id, data);
      if (res.success) { toast.success("Task updated"); await loadTasks(); setModalOpen(false); setEditingTask(null); }
      else toast.error(res.error);
    } else {
      const res = await createTask({ ...data, createdById: currentUserId, createdByName: currentUserName });
      if (res.success) { toast.success("Task created"); await loadTasks(); setModalOpen(false); }
      else toast.error(res.error);
    }
  };

  const handleStatusChange = async (id: string, status: TaskStatus) => {
    const prev = tasks;
    setTasks((ts) => ts.map((t) => t.id === id ? { ...t, status } : t));
    const res = await updateTask(id, { status });
    if (!res.success) { toast.error(res.error); setTasks(prev); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this task?")) return;
    setTasks((ts) => ts.filter((t) => t.id !== id));
    const res = await deleteTask(id);
    if (res.success) toast.success("Task deleted");
    else { toast.error(res.error); await loadTasks(); }
  };

  const openEdit   = (task: TaskItem) => { setEditingTask(task); setModalOpen(true); };
  const openCreate = () => { setEditingTask(null); setModalOpen(true); };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-16">
        <Loader2 className="animate-spin text-slate-300" size={32} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <ClipboardCheck size={20} className="text-indigo-600" />
          <div>
            <h2 className="text-base font-bold text-slate-900">Task Board</h2>
            <p className="text-xs text-slate-500">{pendingCount} task{pendingCount !== 1 ? "s" : ""} pending</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
            {(["all", "mine", "open"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterStatus(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all capitalize ${filterStatus === f ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {f === "mine" ? "My Tasks" : f === "open" ? "Open" : "All"}
              </button>
            ))}
          </div>

          {/* View Mode */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("board")}
              className={`p-1.5 rounded-md transition-all ${viewMode === "board" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              title="Kanban Board"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              title="List View"
            >
              <List size={15} />
            </button>
          </div>

          <Button size="sm" onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white h-8 px-3 gap-1.5">
            <Plus size={14} /> New Task
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <AnimatePresence mode="wait">
          {viewMode === "board" ? (
            // ── KANBAN BOARD ─────────────────────────────────────────────────
            <motion.div
              key="board"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-3 gap-4 h-full"
            >
              {KANBAN_COLS.map((col) => {
                const colTasks = filteredTasks.filter((t) => t.status === col.key);
                const cfg = STATUS_CONFIG[col.key];
                return (
                  <div key={col.key} className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 px-1">
                      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">{col.label}</span>
                      <span className="ml-auto text-xs text-slate-400 font-semibold bg-slate-100 px-1.5 py-0.5 rounded-full">{colTasks.length}</span>
                    </div>
                    <div className="flex flex-col gap-2.5 min-h-[120px]">
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
                            onUpdate={handleTaskUpdate}
                          />
                        ))}
                      </AnimatePresence>
                      {colTasks.length === 0 && (
                        <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 flex items-center justify-center">
                          <p className="text-xs text-slate-400">No tasks</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          ) : (
            // ── LIST VIEW ─────────────────────────────────────────────────────
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3 w-8">#</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3">Task</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3">Priority</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3">Assigned To</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3">Job ID</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3">Due</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3">Notes</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3">Status</th>
                    <th className="px-4 py-3 w-20" />
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {filteredTasks.length === 0 && (
                      <tr>
                        <td colSpan={9} className="text-center text-slate-400 py-12 text-sm">No tasks found</td>
                      </tr>
                    )}
                    {filteredTasks.map((task, i) => {
                      const priority = PRIORITY_CONFIG[task.priority];
                      const status   = STATUS_CONFIG[task.status];
                      const overdue  = task.dueDate && isPast(new Date(task.dueDate)) && task.status !== "done";
                      const noteCount = (() => { try { return task.notesJson ? JSON.parse(task.notesJson).length : 0; } catch { return 0; } })();
                      return (
                        <React.Fragment key={task.id}>
                          <motion.tr
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors"
                          >
                            <td className="px-4 py-3 text-xs text-slate-400">{i + 1}</td>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-800 text-sm">{task.title}</div>
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
                              <span className={`flex items-center gap-1 text-xs ${noteCount > 0 ? "text-indigo-600 font-semibold" : "text-slate-400"}`}>
                                <MessageSquare size={11} />
                                {noteCount > 0 ? noteCount : "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={task.status}
                                onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                                className={`text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none ${status.color}`}
                              >
                                {KANBAN_COLS.map((c) => <option key={c.key} value={c.key}>{STATUS_CONFIG[c.key].label}</option>)}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <button onClick={() => openEdit(task)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
                                  <Edit2 size={13} />
                                </button>
                                <button onClick={() => handleDelete(task.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </motion.tr>
                          {/* Inline notes in list view */}
                          <tr className="border-b border-slate-50 bg-slate-50/30">
                            <td colSpan={9} className="px-6 pb-3 pt-0">
                              <NotesPanel
                                task={task}
                                currentUserId={currentUserId}
                                currentUserName={currentUserName}
                                onUpdate={handleTaskUpdate}
                              />
                            </td>
                          </tr>
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

      {/* Modal */}
      <TaskFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingTask(null); }}
        onSave={handleSave}
        initialTask={editingTask}
        adminUsers={adminUsers}
      />
    </div>
  );
}

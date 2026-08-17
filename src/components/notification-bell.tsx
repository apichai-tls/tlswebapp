"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, CheckCheck, Clock, AlertTriangle, UserCheck,
  MessageSquare, ExternalLink, X, ChevronRight, Sparkles
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import {
  getUserNotifications, markNotificationAsRead, markAllNotificationsAsRead,
  type AppNotification,
} from "@/actions/notifications";
import { formatDistanceToNow, format } from "date-fns";

export function NotificationBell({
  onSelectTask,
}: {
  onSelectTask?: (taskId: string) => void;
}) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);

  const userId = user?.id || (user as any)?.email || "unknown";

  const fetchNotifications = async () => {
    if (!userId || userId === "unknown" || isFetchingRef.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    isFetchingRef.current = true;
    try {
      const res = await getUserNotifications(userId, user?.role);
      if (res.success && res.data) {
        setNotifications(res.data);
        setUnreadCount(res.unreadCount);
      }
    } finally {
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Poll notifications every 30 seconds when tab is active
    const interval = setInterval(fetchNotifications, 30000);
    const handleVisibility = () => {
      if (!document.hidden) fetchNotifications();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [userId, user?.role]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleMarkAllRead = async () => {
    await markAllNotificationsAsRead(userId);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.isRead) {
      await markNotificationAsRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (notif.taskId && onSelectTask) {
      onSelectTask(notif.taskId);
    }
  };

  const getNotifIcon = (type: AppNotification["type"]) => {
    switch (type) {
      case "overdue":
        return <AlertTriangle size={15} className="text-red-500 shrink-0" />;
      case "due_today":
        return <Clock size={15} className="text-amber-500 shrink-0" />;
      case "assigned":
        return <UserCheck size={15} className="text-indigo-500 shrink-0" />;
      case "note":
        return <MessageSquare size={15} className="text-blue-500 shrink-0" />;
      default:
        return <Bell size={15} className="text-slate-500 shrink-0" />;
    }
  };

  const getNotifBg = (type: AppNotification["type"], isRead: boolean) => {
    if (isRead) return "hover:bg-slate-50 bg-white";
    switch (type) {
      case "overdue":
        return "bg-red-50/60 hover:bg-red-50/90 border-l-2 border-red-500";
      case "due_today":
        return "bg-amber-50/60 hover:bg-amber-50/90 border-l-2 border-amber-500";
      case "assigned":
        return "bg-indigo-50/60 hover:bg-indigo-50/90 border-l-2 border-indigo-500";
      case "note":
        return "bg-blue-50/60 hover:bg-blue-50/90 border-l-2 border-blue-500";
      default:
        return "bg-slate-50 hover:bg-slate-100";
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          if (!open) fetchNotifications();
        }}
        className="relative p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all cursor-pointer"
        title="Notifications & Alerts"
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-xs animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white shadow-2xl border border-slate-200 z-[9999] overflow-hidden flex flex-col max-h-[80vh]"
          >
            {/* Header */}
            <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-indigo-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[11px] text-slate-300 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <CheckCheck size={13} />
                  <span>Mark all read</span>
                </button>
              )}
            </div>

            {/* Notifications List */}
            <div className="overflow-y-auto flex-1 divide-y divide-slate-100 max-h-[380px]">
              {notifications.length > 0 ? (
                notifications.map((notif) => {
                  const time = new Date(notif.createdAt);
                  return (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`p-3 transition-colors cursor-pointer flex items-start gap-2.5 ${getNotifBg(
                        notif.type,
                        notif.isRead
                      )}`}
                    >
                      <div className="mt-0.5">{getNotifIcon(notif.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`text-xs font-bold truncate ${
                              notif.isRead ? "text-slate-700" : "text-slate-900"
                            }`}
                          >
                            {notif.title}
                          </span>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {formatDistanceToNow(time, { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5 line-clamp-2 leading-relaxed">
                          {notif.message}
                        </p>
                      </div>
                      <ChevronRight size={13} className="text-slate-300 shrink-0 mt-1" />
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center p-4">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-2 text-slate-400">
                    <Sparkles size={18} />
                  </div>
                  <p className="text-xs font-medium text-slate-600">You're all caught up!</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">No notifications or urgent alerts at the moment.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-2 bg-slate-50 border-t border-slate-100 text-center shrink-0">
              <span className="text-[10px] text-slate-400">
                Click any notification to jump to the Task
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

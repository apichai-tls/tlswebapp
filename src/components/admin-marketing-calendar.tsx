"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Calendar, dateFnsLocalizer, Views, View } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { 
  format, 
  parse, 
  startOfWeek, 
  getDay, 
  addDays, 
  addHours,
  isSameDay 
} from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Calendar as CalendarIcon,
  Plus,
  Search,
  Filter,
  Tag,
  Megaphone,
  Share2,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  Edit3,
  Trash2,
  Copy,
  ExternalLink,
  Sparkles,
  Layers,
  ChevronLeft,
  ChevronRight,
  Store,
  RefreshCw,
  List,
  Eye,
  CalendarDays,
  UploadCloud,
  Image as ImageIcon,
  Star,
  X
} from "lucide-react";

// Localizer for react-big-calendar
const locales = {
  "en-US": enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const DnDCalendar: any = withDragAndDrop(Calendar as any);

export type MarketingCategory = "promo" | "content" | "ads" | "event";
export type MarketingChannel = "line" | "facebook" | "tiktok" | "instagram" | "offline" | "sms" | "other";
export type MarketingBrand = "that_laundry_shop" | "noname_laundry" | "all";
export type MarketingStatus = "draft" | "scheduled" | "active" | "completed" | "cancelled";

export interface MarketingCampaignEvent {
  id: string;
  title: string;
  description?: string;
  category: MarketingCategory;
  channel: MarketingChannel;
  brand: MarketingBrand;
  start: Date;
  end: Date;
  allDay?: boolean;
  status: MarketingStatus;
  budget?: number;
  promoCode?: string;
  targetGoal?: string;
  assignedTo?: string;
  contentUrl?: string;
  imageUrl?: string;
  images?: string[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

const CATEGORY_CONFIG: Record<MarketingCategory, { label: string; bg: string; text: string; border: string; badge: string; icon: any }> = {
  promo: {
    label: "Promotion & Discounts (ส่วนลด/โปรโมชั่น)",
    bg: "bg-emerald-600",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-300 dark:border-emerald-700",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    icon: Tag,
  },
  ads: {
    label: "Broadcast & Paid Ads (บรอดแคสต์/ยิงแอด)",
    bg: "bg-indigo-600",
    text: "text-indigo-700 dark:text-indigo-300",
    border: "border-indigo-300 dark:border-indigo-700",
    badge: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
    icon: Megaphone,
  },
  content: {
    label: "Social Content & Media (คอนเทนต์/สื่อ)",
    bg: "bg-sky-600",
    text: "text-sky-700 dark:text-sky-300",
    border: "border-sky-300 dark:border-sky-700",
    badge: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
    icon: Share2,
  },
  event: {
    label: "Offline & In-Store Events (อีเวนต์/หน้าร้าน)",
    bg: "bg-amber-600",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-300 dark:border-amber-700",
    badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
    icon: Sparkles,
  },
};

const CHANNEL_CONFIG: Record<MarketingChannel, { label: string; color: string }> = {
  line: { label: "LINE OA (ไลน์)", color: "bg-emerald-500 text-white" },
  facebook: { label: "Facebook (เฟซบุ๊ก)", color: "bg-blue-600 text-white" },
  tiktok: { label: "TikTok (ติ๊กต็อก)", color: "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" },
  instagram: { label: "Instagram (ไอจี)", color: "bg-pink-600 text-white" },
  offline: { label: "Offline / In-Store (หน้าร้าน)", color: "bg-orange-500 text-white" },
  sms: { label: "SMS (ข้อความ)", color: "bg-teal-600 text-white" },
  other: { label: "Other (อื่นๆ)", color: "bg-slate-600 text-white" },
};

const BRAND_CONFIG: Record<MarketingBrand, { label: string; badge: string }> = {
  that_laundry_shop: { label: "That Laundry Shop (TLS)", badge: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800" },
  noname_laundry: { label: "Noname Laundry (โนเนม)", badge: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800" },
  all: { label: "All Brands (ทุกแบรนด์)", badge: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" },
};

const STATUS_CONFIG: Record<MarketingStatus, { label: string; badge: string }> = {
  draft: { label: "Draft (แบบร่าง)", badge: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300" },
  scheduled: { label: "Scheduled (วางแผนแล้ว)", badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300" },
  active: { label: "Active (กำลังรัน)", badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300" },
  completed: { label: "Completed (เสร็จสิ้น)", badge: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300" },
  cancelled: { label: "Cancelled (ยกเลิก)", badge: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300" },
};

export function AdminMarketingCalendar() {
  const [events, setEvents] = useState<MarketingCampaignEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState<boolean>(false);
  const [urlInput, setUrlInput] = useState<string>("");

  // Calendar Controls
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [currentView, setCurrentView] = useState<View>(Views.MONTH);
  const [mainDisplayMode, setMainDisplayMode] = useState<"calendar" | "list">("calendar");

  // Filters
  const [filterBrand, setFilterBrand] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterChannel, setFilterChannel] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingEvent, setEditingEvent] = useState<MarketingCampaignEvent | null>(null);
  const [formValues, setFormValues] = useState<{
    id?: string;
    title: string;
    description: string;
    category: MarketingCategory;
    channel: MarketingChannel;
    brand: MarketingBrand;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    status: MarketingStatus;
    budget: string;
    promoCode: string;
    targetGoal: string;
    assignedTo: string;
    contentUrl: string;
    imageUrl: string;
    images: string[];
    notes: string;
  }>({
    title: "",
    description: "",
    category: "promo",
    channel: "line",
    brand: "that_laundry_shop",
    startDate: format(new Date(), "yyyy-MM-dd"),
    startTime: "09:00",
    endDate: format(addDays(new Date(), 2), "yyyy-MM-dd"),
    endTime: "21:00",
    status: "scheduled",
    budget: "",
    promoCode: "",
    targetGoal: "",
    assignedTo: "",
    contentUrl: "",
    imageUrl: "",
    images: [],
    notes: "",
  });

  // Fetch Events from API
  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/marketing/events");
      const data = await res.json();
      if (data && data.events) {
        const parsed = data.events.map((e: any) => ({
          ...e,
          start: new Date(e.start),
          end: new Date(e.end),
          images: Array.isArray(e.images) ? e.images : (e.imageUrl ? [e.imageUrl] : []),
        }));
        setEvents(parsed);
      }
    } catch (err) {
      console.error("Failed to load marketing events:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (filterBrand !== "all" && ev.brand !== filterBrand && ev.brand !== "all") {
        return false;
      }
      if (filterCategory !== "all" && ev.category !== filterCategory) {
        return false;
      }
      if (filterChannel !== "all" && ev.channel !== filterChannel) {
        return false;
      }
      if (filterStatus !== "all" && ev.status !== filterStatus) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = ev.title?.toLowerCase().includes(q);
        const matchesDesc = ev.description?.toLowerCase().includes(q);
        const matchesCode = ev.promoCode?.toLowerCase().includes(q);
        const matchesPic = ev.assignedTo?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesCode && !matchesPic) {
          return false;
        }
      }
      return true;
    });
  }, [events, filterBrand, filterCategory, filterChannel, filterStatus, searchQuery]);

  // Statistics KPI
  const stats = useMemo(() => {
    let activeCount = 0;
    let scheduledCount = 0;
    let completedCount = 0;
    let totalBudget = 0;

    filteredEvents.forEach((ev) => {
      if (ev.status === "active") activeCount++;
      if (ev.status === "scheduled") scheduledCount++;
      if (ev.status === "completed") completedCount++;
      if (ev.budget) totalBudget += Number(ev.budget) || 0;
    });

    return { activeCount, scheduledCount, completedCount, totalBudget };
  }, [filteredEvents]);

  // Handle uploading image files to local storage API
  const handleUploadImageFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file (กรุณาเลือกไฟล์รูปภาพที่ถูกต้อง)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) { // 10MB
      alert("Image size should be less than 10MB (ไฟล์รูปภาพต้องไม่เกิน 10MB)");
      return;
    }

    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entityType", "marketing");
      formData.append("subType", "banners");
      formData.append("entityId", formValues.id || `mkt-${Date.now()}`);

      const res = await fetch("/api/upload-local", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Upload failed");
      }

      const data = await res.json();
      if (data.publicUrl) {
        setFormValues((prev) => {
          const currentImages = prev.images || [];
          const newImages = [...currentImages, data.publicUrl];
          return {
            ...prev,
            imageUrl: prev.imageUrl || data.publicUrl,
            images: newImages,
          };
        });
      }
    } catch (err: any) {
      console.error("Upload error:", err);
      alert("Failed to upload image (เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ)");
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Remove image from campaign
  const handleRemoveImage = (imgUrl: string) => {
    setFormValues((prev) => {
      const newImages = (prev.images || []).filter((u) => u !== imgUrl);
      let newImageUrl = prev.imageUrl;
      if (newImageUrl === imgUrl) {
        newImageUrl = newImages[0] || "";
      }
      return {
        ...prev,
        imageUrl: newImageUrl,
        images: newImages,
      };
    });
  };

  // Set image as primary cover
  const handleSetPrimaryImage = (imgUrl: string) => {
    setFormValues((prev) => ({
      ...prev,
      imageUrl: imgUrl,
    }));
  };

  // Open Create Modal with default dates
  const handleOpenCreateModal = (presetStart?: Date, presetEnd?: Date) => {
    const s = presetStart || new Date();
    const e = presetEnd || addDays(s, 2);

    setEditingEvent(null);
    setShowUrlInput(false);
    setUrlInput("");
    setFormValues({
      title: "",
      description: "",
      category: "promo",
      channel: "line",
      brand: "that_laundry_shop",
      startDate: format(s, "yyyy-MM-dd"),
      startTime: format(s, "HH:mm"),
      endDate: format(e, "yyyy-MM-dd"),
      endTime: format(e, "HH:mm"),
      status: "scheduled",
      budget: "",
      promoCode: "",
      targetGoal: "",
      assignedTo: "",
      contentUrl: "",
      imageUrl: "",
      images: [],
      notes: "",
    });
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (event: MarketingCampaignEvent) => {
    setEditingEvent(event);
    setShowUrlInput(false);
    setUrlInput("");
    const eventImages = Array.isArray(event.images) && event.images.length > 0 
      ? event.images 
      : (event.imageUrl ? [event.imageUrl] : []);

    setFormValues({
      id: event.id,
      title: event.title,
      description: event.description || "",
      category: event.category,
      channel: event.channel,
      brand: event.brand,
      startDate: format(new Date(event.start), "yyyy-MM-dd"),
      startTime: format(new Date(event.start), "HH:mm"),
      endDate: format(new Date(event.end), "yyyy-MM-dd"),
      endTime: format(new Date(event.end), "HH:mm"),
      status: event.status,
      budget: event.budget ? String(event.budget) : "",
      promoCode: event.promoCode || "",
      targetGoal: event.targetGoal || "",
      assignedTo: event.assignedTo || "",
      contentUrl: event.contentUrl || "",
      imageUrl: event.imageUrl || eventImages[0] || "",
      images: eventImages,
      notes: event.notes || "",
    });
    setIsModalOpen(true);
  };

  // Handle Drag & Drop Reschedule
  const handleEventDrop = async ({ event, start, end }: any) => {
    const ev = event as MarketingCampaignEvent;
    const updated = {
      ...ev,
      start: new Date(start),
      end: new Date(end),
    };

    // Optimistic Update
    setEvents((prev) => prev.map((e) => (e.id === ev.id ? updated : e)));

    try {
      await fetch("/api/marketing/events", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: {
            ...updated,
            start: updated.start.toISOString(),
            end: updated.end.toISOString(),
          },
        }),
      });
    } catch (err) {
      console.error("Failed to update event date:", err);
      fetchEvents();
    }
  };

  // Handle Resize Event
  const handleEventResize = async ({ event, start, end }: any) => {
    const ev = event as MarketingCampaignEvent;
    const updated = {
      ...ev,
      start: new Date(start),
      end: new Date(end),
    };

    setEvents((prev) => prev.map((e) => (e.id === ev.id ? updated : e)));

    try {
      await fetch("/api/marketing/events", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: {
            ...updated,
            start: updated.start.toISOString(),
            end: updated.end.toISOString(),
          },
        }),
      });
    } catch (err) {
      console.error("Failed to resize event:", err);
      fetchEvents();
    }
  };

  // Save Event from Modal
  const handleSaveForm = async () => {
    if (!formValues.title.trim()) {
      alert("Please enter a campaign title (กรุณากรอกชื่อกิจกรรม/แคมเปญ)");
      return;
    }

    setIsSaving(true);
    try {
      const startDateTime = new Date(`${formValues.startDate}T${formValues.startTime || "00:00"}`);
      const endDateTime = new Date(`${formValues.endDate}T${formValues.endTime || "23:59"}`);

      const eventPayload = {
        id: editingEvent?.id || `mkt-${Date.now()}`,
        title: formValues.title.trim(),
        description: formValues.description.trim() || undefined,
        category: formValues.category,
        channel: formValues.channel,
        brand: formValues.brand,
        start: startDateTime.toISOString(),
        end: endDateTime.toISOString(),
        status: formValues.status,
        budget: formValues.budget ? parseFloat(formValues.budget) : undefined,
        promoCode: formValues.promoCode.trim().toUpperCase() || undefined,
        targetGoal: formValues.targetGoal.trim() || undefined,
        assignedTo: formValues.assignedTo.trim() || undefined,
        contentUrl: formValues.contentUrl.trim() || undefined,
        imageUrl: formValues.imageUrl.trim() || undefined,
        images: formValues.images.length > 0 ? formValues.images : undefined,
        notes: formValues.notes.trim() || undefined,
      };

      if (editingEvent) {
        // PUT update
        const res = await fetch("/api/marketing/events", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: eventPayload }),
        });
        if (res.ok) {
          setIsModalOpen(false);
          fetchEvents();
        }
      } else {
        // POST create
        const res = await fetch("/api/marketing/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: eventPayload }),
        });
        if (res.ok) {
          setIsModalOpen(false);
          fetchEvents();
        }
      }
    } catch (err) {
      console.error("Failed to save event:", err);
      alert("Failed to save campaign data (เกิดข้อผิดพลาดในการบันทึกข้อมูล)");
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Event
  const handleDeleteEvent = async (id: string) => {
    if (!confirm("Are you sure you want to delete this marketing campaign? (คุณต้องการลบกิจกรรมการตลาดนี้ใช่หรือไม่?)")) return;

    try {
      const res = await fetch(`/api/marketing/events?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setIsModalOpen(false);
        setEvents((prev) => prev.filter((e) => e.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete event:", err);
    }
  };

  // Duplicate Event
  const handleDuplicateEvent = (event: MarketingCampaignEvent) => {
    setEditingEvent(null);
    setShowUrlInput(false);
    setUrlInput("");
    setFormValues({
      title: `${event.title} (Copy)`,
      description: event.description || "",
      category: event.category,
      channel: event.channel,
      brand: event.brand,
      startDate: format(new Date(event.start), "yyyy-MM-dd"),
      startTime: format(new Date(event.start), "HH:mm"),
      endDate: format(new Date(event.end), "yyyy-MM-dd"),
      endTime: format(new Date(event.end), "HH:mm"),
      status: "draft",
      budget: event.budget ? String(event.budget) : "",
      promoCode: event.promoCode || "",
      targetGoal: event.targetGoal || "",
      assignedTo: event.assignedTo || "",
      contentUrl: event.contentUrl || "",
      imageUrl: event.imageUrl || "",
      images: event.images ? [...event.images] : (event.imageUrl ? [event.imageUrl] : []),
      notes: event.notes || "",
    });
    setIsModalOpen(true);
  };

  // Custom Event Card in Calendar
  const eventStyleGetter = (event: MarketingCampaignEvent) => {
    let bgColor = "#4f46e5";

    if (event.category === "promo") bgColor = "#059669";
    else if (event.category === "content") bgColor = "#0284c7";
    else if (event.category === "event") bgColor = "#d97706";
    else if (event.category === "ads") bgColor = "#6366f1";

    if (event.status === "completed") {
      bgColor = "#64748b";
    } else if (event.status === "cancelled") {
      bgColor = "#ef4444";
    }

    return {
      style: {
        backgroundColor: bgColor,
        borderRadius: "6px",
        opacity: event.status === "draft" ? 0.75 : 1,
        color: "white",
        border: event.status === "draft" ? "1px dashed #ffffff" : "0px",
        display: "block",
        fontSize: "11px",
        fontWeight: "600",
        padding: "2px 6px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      },
    };
  };

  // Custom Event Element
  const EventComponent = ({ event }: { event: MarketingCampaignEvent }) => {
    return (
      <div className="flex items-center gap-1.5 overflow-hidden text-xs py-0.5 leading-tight">
        <span className="text-[10px] uppercase font-bold tracking-wider px-1 py-0.2 bg-black/25 rounded">
          {event.brand === "that_laundry_shop" ? "TLS" : event.brand === "noname_laundry" ? "NONAME" : "ALL"}
        </span>
        {event.imageUrl && (
          <span title="Has artwork (มีรูปแบนเนอร์)">
            <ImageIcon size={11} className="shrink-0 text-white/90" />
          </span>
        )}
        <span className="truncate font-semibold">{event.title}</span>
        {event.budget && (
          <span className="ml-auto text-[10px] opacity-90 font-mono hidden sm:inline">
            ฿{event.budget.toLocaleString()}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP KPI DASHBOARD */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Campaigns */}
        <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Active Campaigns (กำลังดำเนินการ)
            </p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {stats.activeCount} <span className="text-xs font-medium text-slate-400">items (รายการ)</span>
            </h3>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Live & driving customer conversions (กำลังรันและกระตุ้นยอดขาย)
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Megaphone size={22} />
          </div>
        </div>

        {/* Scheduled Plans */}
        <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Scheduled Plans (วางแผนแล้ว)
            </p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {stats.scheduledCount} <span className="text-xs font-medium text-slate-400">items (รายการ)</span>
            </h3>
            <p className="text-[11px] text-blue-600 dark:text-blue-400 font-medium mt-1 flex items-center gap-1">
              <Clock size={11} /> Planned & queued for launch (รอถึงกำหนดการ)
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <CalendarDays size={22} />
          </div>
        </div>

        {/* Total Planned Budget */}
        <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Planned Budget (งบประมาณรวม)
            </p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              ฿{stats.totalBudget.toLocaleString()}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              Ad spend, discounts & event budgets (งบแอด, ส่วนลด, กิจกรรม)
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <DollarSign size={22} />
          </div>
        </div>

        {/* Completed */}
        <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Completed Campaigns (เสร็จสิ้นแล้ว)
            </p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {stats.completedCount} <span className="text-xs font-medium text-slate-400">items (รายการ)</span>
            </h3>
            <p className="text-[11px] text-purple-600 dark:text-purple-400 font-medium mt-1 flex items-center gap-1">
              <CheckCircle2 size={11} /> Concluded marketing initiatives (วัดผลและปิดแคมเปญ)
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <CheckCircle2 size={22} />
          </div>
        </div>
      </div>

      {/* 2. TOOLBAR & FILTERS */}
      <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search & Main Filter Controls */}
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Search Input */}
            <div className="relative min-w-[220px] max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search campaign, code, PIC... (ค้นหาแคมเปญ, โค้ด...)"
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Brand Filter */}
            <select
              value={filterBrand}
              onChange={(e) => setFilterBrand(e.target.value)}
              className="text-xs font-semibold py-1.5 px-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-xl text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <option value="all">🏢 All Brands (ทุกแบรนด์)</option>
              <option value="that_laundry_shop">🧺 That Laundry Shop (TLS)</option>
              <option value="noname_laundry">✨ Noname Laundry (โนเนม)</option>
            </select>

            {/* Category Filter */}
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="text-xs font-semibold py-1.5 px-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-xl text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <option value="all">🏷️ All Categories (ทุกหมวดหมู่)</option>
              <option value="promo">🏷️ Promotion & Discounts (ส่วนลด/โปรโมชั่น)</option>
              <option value="ads">📢 Broadcast & Paid Ads (บรอดแคสต์/ยิงแอด)</option>
              <option value="content">📱 Social Content & Video (คอนเทนต์/สื่อ)</option>
              <option value="event">🎪 Offline & In-Store Events (อีเวนต์/หน้าร้าน)</option>
            </select>

            {/* Channel Filter */}
            <select
              value={filterChannel}
              onChange={(e) => setFilterChannel(e.target.value)}
              className="text-xs font-semibold py-1.5 px-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-xl text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <option value="all">🌐 All Channels (ทุกช่องทาง)</option>
              <option value="line">LINE OA (ไลน์)</option>
              <option value="facebook">Facebook (เฟซบุ๊ก)</option>
              <option value="tiktok">TikTok (ติ๊กต็อก)</option>
              <option value="instagram">Instagram (ไอจี)</option>
              <option value="offline">Offline / In-Store (หน้าร้าน/บูธ)</option>
              <option value="sms">SMS Marketing (ข้อความ SMS)</option>
              <option value="other">Other Channels (ช่องทางอื่นๆ)</option>
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs font-semibold py-1.5 px-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-xl text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <option value="all">⚡ All Statuses (ทุกสถานะ)</option>
              <option value="scheduled">Scheduled (วางแผนแล้ว)</option>
              <option value="active">Active (กำลังรัน)</option>
              <option value="draft">Draft (แบบร่าง)</option>
              <option value="completed">Completed (เสร็จสิ้น)</option>
              <option value="cancelled">Cancelled (ยกเลิก)</option>
            </select>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Display Mode Switcher (Calendar vs List) */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-750">
              <button
                onClick={() => setMainDisplayMode("calendar")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  mainDisplayMode === "calendar"
                    ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                <CalendarIcon size={14} /> Calendar (ปฏิทิน)
              </button>
              <button
                onClick={() => setMainDisplayMode("list")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  mainDisplayMode === "list"
                    ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                <List size={14} /> Table (ตารางสรุป)
              </button>
            </div>

            {/* Refresh */}
            <button
              onClick={fetchEvents}
              disabled={isLoading}
              title="Refresh Data (รีเฟรชข้อมูล)"
              className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-xl"
            >
              <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
            </button>

            {/* Create New Campaign Button */}
            <button
              onClick={() => handleOpenCreateModal()}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-3.5 rounded-xl shadow-sm transition-all cursor-pointer"
            >
              <Plus size={16} />
              <span>New Campaign (สร้างแคมเปญใหม่)</span>
            </button>
          </div>
        </div>

        {/* Legend bar */}
        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 font-medium">
          <span className="font-bold text-slate-700 dark:text-slate-300">Category Legend (สัญลักษณ์สี):</span>
          <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> Promotion (ส่วนลด)</span>
          <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-indigo-600" /> Broadcast & Ads (บรอดแคสต์/แอด)</span>
          <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-sky-600" /> Social Content (คอนเทนต์)</span>
          <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-600" /> Offline Events (หน้าร้าน)</span>
          <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-slate-400" /> Completed (เสร็จสิ้น)</span>
          <span className="ml-auto text-[11px] text-slate-400 italic hidden md:inline">
            💡 Tip: Click empty slot to create or drag to reschedule (คลิกช่องว่างเพื่อสร้าง หรือลากเพื่อเลื่อนกำหนดการ)
          </span>
        </div>
      </div>

      {/* 3. MAIN DISPLAY: CALENDAR OR LIST */}
      {mainDisplayMode === "calendar" ? (
        <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="h-[750px] marketing-calendar-container">
            <DnDCalendar
              localizer={localizer}
              events={filteredEvents}
              startAccessor="start"
              endAccessor="end"
              date={currentDate}
              onNavigate={(date: Date) => setCurrentDate(date)}
              view={currentView}
              onView={(view: View) => setCurrentView(view)}
              views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
              onEventDrop={handleEventDrop}
              onEventResize={handleEventResize}
              onSelectEvent={(event: any) => handleOpenEditModal(event)}
              onSelectSlot={(slotInfo: any) => handleOpenCreateModal(slotInfo.start, slotInfo.end)}
              selectable={true}
              resizable={true}
              eventPropGetter={eventStyleGetter}
              components={{
                event: EventComponent,
              }}
              messages={{
                month: "Month (เดือน)",
                week: "Week (สัปดาห์)",
                day: "Day (วัน)",
                agenda: "Agenda (กำหนดการ)",
                today: "Today (วันนี้)",
                previous: "Previous (ก่อนหน้า)",
                next: "Next (ถัดไป)",
                noEventsInRange: "No campaigns scheduled in this timeframe (ไม่มีกิจกรรมการตลาดในช่วงเวลานี้)",
              }}
              popup={true}
              className="font-sans h-full text-slate-800 dark:text-slate-200"
            />
          </div>
        </div>
      ) : (
        /* TABLE / LIST VIEW */
        <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Campaign / Activity (กิจกรรม/แคมเปญ)</th>
                  <th className="py-3.5 px-4">Brand (แบรนด์)</th>
                  <th className="py-3.5 px-4">Category & Channel (หมวดหมู่ & ช่องทาง)</th>
                  <th className="py-3.5 px-4">Schedule (ช่วงเวลา)</th>
                  <th className="py-3.5 px-4">Status (สถานะ)</th>
                  <th className="py-3.5 px-4">Budget (งบประมาณ)</th>
                  <th className="py-3.5 px-4">PIC / Owner (ผู้รับผิดชอบ)</th>
                  <th className="py-3.5 px-4 text-right">Actions (จัดการ)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      No marketing campaigns found matching criteria (ไม่พบรายการแคมเปญที่ตรงกับเงื่อนไข)
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map((ev) => {
                    const cat = CATEGORY_CONFIG[ev.category] || CATEGORY_CONFIG.promo;
                    const chan = CHANNEL_CONFIG[ev.channel] || CHANNEL_CONFIG.other;
                    const status = STATUS_CONFIG[ev.status] || STATUS_CONFIG.draft;
                    const brand = BRAND_CONFIG[ev.brand] || BRAND_CONFIG.all;

                    return (
                      <tr
                        key={ev.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                        onClick={() => handleOpenEditModal(ev)}
                      >
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white max-w-xs">
                          <div className="flex items-center gap-2.5">
                            {ev.imageUrl ? (
                              <div 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLightboxImageUrl(ev.imageUrl!);
                                }}
                                className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 bg-slate-100 hover:opacity-80 transition-opacity cursor-pointer shadow-xs"
                                title="Click to view full image (คลิกเพื่อดูรูปใหญ่)"
                              >
                                <img src={ev.imageUrl} alt={ev.title} className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-lg shrink-0 border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-slate-400">
                                <ImageIcon size={16} />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate">{ev.title}</span>
                                {ev.promoCode && (
                                  <span className="shrink-0 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-mono text-[10px] border border-amber-200 dark:border-amber-800">
                                    🎟️ {ev.promoCode}
                                  </span>
                                )}
                              </div>
                              {ev.description && (
                                <p className="text-[11px] text-slate-500 font-normal truncate mt-0.5">
                                  {ev.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md border ${brand.badge}`}>
                            {ev.brand === "that_laundry_shop" ? "TLS Laundry" : ev.brand === "noname_laundry" ? "Noname" : "All Brands"}
                          </span>
                        </td>
                        <td className="py-3 px-4 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${cat.badge}`}>
                              {cat.label}
                            </span>
                            <span className="text-[10px] text-slate-600 dark:text-slate-400 font-medium">
                              ({chan.label})
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                          <div>{format(new Date(ev.start), "dd/MM/yyyy HH:mm")}</div>
                          <div className="text-slate-400 text-[10px]">to {format(new Date(ev.end), "dd/MM/yyyy HH:mm")}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.badge}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-white">
                          {ev.budget ? `฿${ev.budget.toLocaleString()}` : "-"}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                          {ev.assignedTo || "-"}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleDuplicateEvent(ev)}
                            title="Duplicate (ทำสำเนา)"
                            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(ev)}
                            title="Edit (แก้ไข)"
                            className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteEvent(ev.id)}
                            title="Delete (ลบ)"
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. MODAL: CREATE / EDIT MARKETING EVENT */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              {editingEvent ? <Edit3 size={18} className="text-indigo-600" /> : <Plus size={18} className="text-indigo-600" />}
              {editingEvent ? "Edit Campaign Details (แก้ไขรายละเอียดแคมเปญ)" : "Create New Campaign (สร้างแคมเปญใหม่)"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Title */}
            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Campaign Title (ชื่อแคมเปญ/หัวข้อกิจกรรม) <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={formValues.title}
                onChange={(e) => setFormValues({ ...formValues, title: e.target.value })}
                placeholder="e.g. 10.10 Flash Sale Free Delivery (เช่น 10.10 Flash Sale ส่งฟรี)"
                className="mt-1"
              />
            </div>

            {/* ARTWORK / BANNER IMAGE UPLOAD SECTION */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <ImageIcon size={14} className="text-indigo-600" />
                  Campaign Artwork & Banners (รูปภาพแบนเนอร์/อาร์ตเวิร์ก)
                </Label>
                <button
                  type="button"
                  onClick={() => setShowUrlInput(!showUrlInput)}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={12} /> {showUrlInput ? "Hide URL input (ซ่อน)" : "Add via URL (เพิ่มด้วยลิงก์รูป)"}
                </button>
              </div>

              {/* Optional URL input */}
              {showUrlInput && (
                <div className="flex gap-2">
                  <Input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="Paste image URL (วางลิงก์รูปภาพ เช่น https://...)..."
                    className="text-xs flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      if (urlInput.trim()) {
                        setFormValues((prev) => {
                          const currentImages = prev.images || [];
                          return {
                            ...prev,
                            imageUrl: prev.imageUrl || urlInput.trim(),
                            images: [...currentImages, urlInput.trim()],
                          };
                        });
                        setUrlInput("");
                      }
                    }}
                    className="text-xs shrink-0"
                  >
                    Add (เพิ่ม)
                  </Button>
                </div>
              )}

              {/* Upload Dropzone */}
              <div className="relative border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 rounded-xl p-4 text-center bg-white dark:bg-slate-850 transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={isUploadingImage}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length > 0) {
                      files.forEach((f) => handleUploadImageFile(f));
                    }
                    e.target.value = "";
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="flex flex-col items-center justify-center gap-1.5 pointer-events-none">
                  {isUploadingImage ? (
                    <RefreshCw size={24} className="animate-spin text-indigo-600" />
                  ) : (
                    <UploadCloud size={24} className="text-slate-400" />
                  )}
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isUploadingImage
                      ? "Uploading image... (กำลังอัปโหลดรูปภาพ...)"
                      : "Click or drag images to upload (คลิกหรือลากรูปมาวางเพื่ออัปโหลด)"}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Supports JPG, PNG, WEBP, GIF up to 10MB (รองรับรูปภาพทุกประเภท บันทึกจริงในระบบ)
                  </p>
                </div>
              </div>

              {/* Uploaded Images Gallery */}
              {formValues.images && formValues.images.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-500">
                    Uploaded Artwork ({formValues.images.length}) • Click ⭐ to set primary cover (รูปหลัก)
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {formValues.images.map((img, idx) => {
                      const isPrimary = formValues.imageUrl === img;
                      return (
                        <div
                          key={idx}
                          className={`relative group rounded-xl overflow-hidden border ${
                            isPrimary
                              ? "border-indigo-600 ring-2 ring-indigo-500/30"
                              : "border-slate-200 dark:border-slate-700"
                          } bg-slate-100 dark:bg-slate-800 aspect-video flex items-center justify-center`}
                        >
                          <img
                            src={img}
                            alt="Artwork preview"
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => setLightboxImageUrl(img)}
                          />

                          {/* Action Overlay */}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-1">
                            <button
                              type="button"
                              title="View full image (ดูขนาดเต็ม)"
                              onClick={() => setLightboxImageUrl(img)}
                              className="p-1.5 rounded-lg bg-white/90 text-slate-800 hover:bg-white text-xs shadow-sm cursor-pointer"
                            >
                              <Eye size={13} />
                            </button>
                            <button
                              type="button"
                              title={isPrimary ? "Primary Cover (รูปหลัก)" : "Set as Primary (ตั้งเป็นรูปหลัก)"}
                              onClick={() => handleSetPrimaryImage(img)}
                              className={`p-1.5 rounded-lg text-xs shadow-sm cursor-pointer ${
                                isPrimary ? "bg-amber-500 text-white" : "bg-white/90 text-slate-800 hover:bg-white"
                              }`}
                            >
                              <Star size={13} fill={isPrimary ? "currentColor" : "none"} />
                            </button>
                            <button
                              type="button"
                              title="Remove image (ลบรูป)"
                              onClick={() => handleRemoveImage(img)}
                              className="p-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 text-xs shadow-sm cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                          {isPrimary && (
                            <div className="absolute top-1 left-1 bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                              Cover (รูปหลัก)
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Row: Brand & Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Brand / Store (แบรนด์/สาขา)
                </Label>
                <select
                  value={formValues.brand}
                  onChange={(e) => setFormValues({ ...formValues, brand: e.target.value as MarketingBrand })}
                  className="w-full mt-1 py-2 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
                >
                  <option value="that_laundry_shop">🧺 That Laundry Shop (TLS)</option>
                  <option value="noname_laundry">✨ Noname Laundry (โนเนม)</option>
                  <option value="all">🏢 All Brands (ทุกแบรนด์)</option>
                </select>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Campaign Category (หมวดหมู่แคมเปญ)
                </Label>
                <select
                  value={formValues.category}
                  onChange={(e) => setFormValues({ ...formValues, category: e.target.value as MarketingCategory })}
                  className="w-full mt-1 py-2 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
                >
                  <option value="promo">🏷️ Promotion & Discounts (ส่วนลด/โปรโมชั่น)</option>
                  <option value="ads">📢 Broadcast & Paid Ads (บรอดแคสต์/ยิงแอด)</option>
                  <option value="content">📱 Social Content & Video (คอนเทนต์/วิดีโอ)</option>
                  <option value="event">🎪 Offline & In-Store Events (อีเวนต์/หน้าร้าน)</option>
                </select>
              </div>
            </div>

            {/* Row: Channel & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Marketing Channel (ช่องทางเผยแพร่)
                </Label>
                <select
                  value={formValues.channel}
                  onChange={(e) => setFormValues({ ...formValues, channel: e.target.value as MarketingChannel })}
                  className="w-full mt-1 py-2 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
                >
                  <option value="line">LINE Official Account (LINE OA)</option>
                  <option value="facebook">Facebook Fanpage / Group</option>
                  <option value="tiktok">TikTok Video / Shop</option>
                  <option value="instagram">Instagram</option>
                  <option value="offline">Offline / In-Store / Booth (หน้าร้าน/บูธ)</option>
                  <option value="sms">SMS Marketing (ข้อความ SMS)</option>
                  <option value="other">Other Channels (ช่องทางอื่นๆ)</option>
                </select>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Status (สถานะ)
                </Label>
                <select
                  value={formValues.status}
                  onChange={(e) => setFormValues({ ...formValues, status: e.target.value as MarketingStatus })}
                  className="w-full mt-1 py-2 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold"
                >
                  <option value="scheduled">🔵 Scheduled (วางแผนแล้ว)</option>
                  <option value="active">🟢 Active (กำลังรัน)</option>
                  <option value="draft">⚪ Draft (แบบร่าง)</option>
                  <option value="completed">🟣 Completed (เสร็จสิ้น)</option>
                  <option value="cancelled">🔴 Cancelled (ยกเลิก)</option>
                </select>
              </div>
            </div>

            {/* Date & Time Range */}
            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-2.5">
              <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <Clock size={13} /> Schedule: Start & End Time (กำหนดการ เริ่มต้น - สิ้นสุด)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] text-slate-500">Start Date & Time (วันเวลาเริ่มต้น)</Label>
                  <div className="flex gap-1.5 mt-1">
                    <Input
                      type="date"
                      value={formValues.startDate}
                      onChange={(e) => setFormValues({ ...formValues, startDate: e.target.value })}
                      className="text-xs flex-1"
                    />
                    <Input
                      type="time"
                      value={formValues.startTime}
                      onChange={(e) => setFormValues({ ...formValues, startTime: e.target.value })}
                      className="text-xs w-24"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-500">End Date & Time (วันเวลาสิ้นสุด)</Label>
                  <div className="flex gap-1.5 mt-1">
                    <Input
                      type="date"
                      value={formValues.endDate}
                      onChange={(e) => setFormValues({ ...formValues, endDate: e.target.value })}
                      className="text-xs flex-1"
                    />
                    <Input
                      type="time"
                      value={formValues.endTime}
                      onChange={(e) => setFormValues({ ...formValues, endTime: e.target.value })}
                      className="text-xs w-24"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Promo Code & Budget */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Tag size={12} /> Linked Promo Code (โค้ดโปรโมชั่นที่ผูก)
                </Label>
                <Input
                  value={formValues.promoCode}
                  onChange={(e) => setFormValues({ ...formValues, promoCode: e.target.value })}
                  placeholder="e.g. FREEDELIVERY or TLSNEW (ถ้ามี)"
                  className="mt-1 font-mono uppercase"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <DollarSign size={12} /> Planned Budget (งบประมาณที่ตั้งไว้ - บาท)
                </Label>
                <Input
                  type="number"
                  value={formValues.budget}
                  onChange={(e) => setFormValues({ ...formValues, budget: e.target.value })}
                  placeholder="e.g. 5000"
                  className="mt-1 font-mono"
                />
              </div>
            </div>

            {/* Target Goal & Assignee */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Target / KPI Goal (เป้าหมาย/ตัวชี้วัด)
                </Label>
                <Input
                  value={formValues.targetGoal}
                  onChange={(e) => setFormValues({ ...formValues, targetGoal: e.target.value })}
                  placeholder="e.g. 300 orders, 20k views, CAC < 100 THB"
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  PIC / Lead Owner (ผู้รับผิดชอบหลัก)
                </Label>
                <Input
                  value={formValues.assignedTo}
                  onChange={(e) => setFormValues({ ...formValues, assignedTo: e.target.value })}
                  placeholder="e.g. Somchai, Marketing Team, Media Buyer"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Content URL */}
            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <ExternalLink size={12} /> Creative / Asset Link (ลิงก์สื่อ/อาร์ตเวิร์ก)
              </Label>
              <Input
                value={formValues.contentUrl}
                onChange={(e) => setFormValues({ ...formValues, contentUrl: e.target.value })}
                placeholder="https://canva.com/... or Google Drive / Social post link"
                className="mt-1 font-mono text-[11px]"
              />
            </div>

            {/* Description & Notes */}
            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Notes & Copywriting (รายละเอียด/หมายเหตุ/แคปชั่น)
              </Label>
              <textarea
                value={formValues.notes}
                onChange={(e) => setFormValues({ ...formValues, notes: e.target.value })}
                placeholder="Broadcast message copy, sub-tasks, or campaign notes... (ระบุข้อความบรอดแคสต์, แผนงานย่อย, หรือแนวทางสื่อสาร...)"
                rows={3}
                className="w-full mt-1 p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
            {editingEvent ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteEvent(editingEvent.id)}
                  className="text-xs flex items-center gap-1"
                >
                  <Trash2 size={13} /> Delete (ลบ)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleDuplicateEvent(editingEvent)}
                  className="text-xs flex items-center gap-1"
                >
                  <Copy size={13} /> Duplicate (ทำสำเนา)
                </Button>
              </div>
            ) : (
              <div></div>
            )}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(false)}
                className="text-xs"
              >
                Cancel (ยกเลิก)
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveForm}
                disabled={isSaving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                {isSaving ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                <span>{editingEvent ? "Save Changes (บันทึกการแก้ไข)" : "Create Campaign (สร้างแคมเปญ)"}</span>
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5. LIGHTBOX / FULL IMAGE PREVIEW MODAL */}
      {lightboxImageUrl && (
        <Dialog open={!!lightboxImageUrl} onOpenChange={() => setLightboxImageUrl(null)}>
          <DialogContent className="max-w-4xl p-3 bg-slate-950/95 border-slate-800 text-white">
            <div className="relative flex flex-col items-center justify-center p-2">
              <img
                src={lightboxImageUrl}
                alt="Artwork preview"
                className="max-h-[75vh] w-auto object-contain rounded-xl shadow-2xl"
              />
              <div className="mt-3 flex items-center justify-between w-full px-2 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <ImageIcon size={14} className="text-indigo-400" /> Artwork Preview (พรีวิวรูปภาพอาร์ตเวิร์ก)
                </span>
                <a
                  href={lightboxImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 underline font-medium"
                >
                  Open Original in New Tab (เปิดรูปต้นฉบับในแท็บใหม่) <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

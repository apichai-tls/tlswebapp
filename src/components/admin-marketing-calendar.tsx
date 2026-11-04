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
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
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
  Tag,
  Megaphone,
  Share2,
  DollarSign,
  Clock,
  CheckCircle2,
  Edit3,
  Trash2,
  Copy,
  ExternalLink,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  List,
  Eye,
  CalendarDays,
  UploadCloud,
  Image as ImageIcon,
  Star,
  X,
  PanelRightClose,
  PanelRightOpen,
  ArrowUpRight,
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

const CATEGORY_CONFIG: Record<
  MarketingCategory,
  { label: string; shortLabel: string; thLabel: string; dot: string; bg: string; text: string; border: string; badge: string; icon: any }
> = {
  promo: {
    label: "Promotion & Discounts (ส่วนลด/โปรโมชั่น)",
    shortLabel: "Promotion",
    thLabel: "ส่วนลด",
    dot: "bg-emerald-500",
    bg: "bg-emerald-600",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-300 dark:border-emerald-700",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    icon: Tag,
  },
  ads: {
    label: "Broadcast & Paid Ads (บรอดแคสต์/ยิงแอด)",
    shortLabel: "Broadcast & Ads",
    thLabel: "บรอดแคสต์/แอด",
    dot: "bg-indigo-500",
    bg: "bg-indigo-600",
    text: "text-indigo-700 dark:text-indigo-300",
    border: "border-indigo-300 dark:border-indigo-700",
    badge: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
    icon: Megaphone,
  },
  content: {
    label: "Social Content & Media (คอนเทนต์/สื่อ)",
    shortLabel: "Social Content",
    thLabel: "คอนเทนต์",
    dot: "bg-sky-500",
    bg: "bg-sky-600",
    text: "text-sky-700 dark:text-sky-300",
    border: "border-sky-300 dark:border-sky-700",
    badge: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
    icon: Share2,
  },
  event: {
    label: "Offline & In-Store Events (อีเวนต์/หน้าร้าน)",
    shortLabel: "Offline Events",
    thLabel: "หน้าร้าน",
    dot: "bg-amber-500",
    bg: "bg-amber-600",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-300 dark:border-amber-700",
    badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
    icon: Sparkles,
  },
};

const CHANNEL_CONFIG: Record<MarketingChannel, { label: string; shortLabel: string; color: string }> = {
  line: { label: "LINE OA (ไลน์)", shortLabel: "LINE OA", color: "bg-emerald-500 text-white" },
  facebook: { label: "Facebook (เฟซบุ๊ก)", shortLabel: "Facebook", color: "bg-blue-600 text-white" },
  tiktok: { label: "TikTok (ติ๊กต็อก)", shortLabel: "TikTok", color: "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" },
  instagram: { label: "Instagram (ไอจี)", shortLabel: "Instagram", color: "bg-pink-600 text-white" },
  offline: { label: "Offline / In-Store (หน้าร้าน)", shortLabel: "In-Store", color: "bg-orange-500 text-white" },
  sms: { label: "SMS (ข้อความ)", shortLabel: "SMS", color: "bg-teal-600 text-white" },
  other: { label: "Other (อื่นๆ)", shortLabel: "Other", color: "bg-slate-600 text-white" },
};

const BRAND_CONFIG: Record<MarketingBrand, { label: string; shortLabel: string; badge: string }> = {
  that_laundry_shop: {
    label: "That Laundry Shop (TLS)",
    shortLabel: "TLS",
    badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800",
  },
  noname_laundry: {
    label: "Noname Laundry (โนเนม)",
    shortLabel: "Noname",
    badge: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800",
  },
  all: {
    label: "All Brands (ทุกแบรนด์)",
    shortLabel: "All Brands",
    badge: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  },
};

const STATUS_CONFIG: Record<MarketingStatus, { label: string; shortLabel: string; dot: string; badge: string }> = {
  draft: {
    label: "Draft (แบบร่าง)",
    shortLabel: "Draft",
    dot: "bg-slate-400",
    badge: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300",
  },
  scheduled: {
    label: "Scheduled (วางแผนแล้ว)",
    shortLabel: "Scheduled",
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300",
  },
  active: {
    label: "Active (กำลังรัน)",
    shortLabel: "Active",
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  completed: {
    label: "Completed (เสร็จสิ้น)",
    shortLabel: "Completed",
    dot: "bg-purple-500",
    badge: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300",
  },
  cancelled: {
    label: "Cancelled (ยกเลิก)",
    shortLabel: "Cancelled",
    dot: "bg-rose-500",
    badge: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300",
  },
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
  const [showSidebar, setShowSidebar] = useState<boolean>(true);

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
          images: Array.isArray(e.images) ? e.images : e.imageUrl ? [e.imageUrl] : [],
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

  // Base filtered events (before status/category quick-pill or including them)
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

  // Statistics KPI (computed across brand/channel/search so clicking status cards works smoothly)
  const stats = useMemo(() => {
    let activeCount = 0;
    let scheduledCount = 0;
    let completedCount = 0;
    let totalBudget = 0;
    const categoryCounts: Record<string, number> = { promo: 0, ads: 0, content: 0, event: 0 };

    events.forEach((ev) => {
      if (filterBrand !== "all" && ev.brand !== filterBrand && ev.brand !== "all") return;
      if (filterChannel !== "all" && ev.channel !== filterChannel) return;
      if (ev.status === "active") activeCount++;
      if (ev.status === "scheduled") scheduledCount++;
      if (ev.status === "completed") completedCount++;
      if (ev.budget) totalBudget += Number(ev.budget) || 0;
      if (ev.category && categoryCounts[ev.category] !== undefined) {
        categoryCounts[ev.category]++;
      }
    });

    return { activeCount, scheduledCount, completedCount, totalBudget, categoryCounts };
  }, [events, filterBrand, filterChannel]);

  // Events in currently viewed month
  const currentMonthEvents = useMemo(() => {
    const mStart = startOfMonth(currentDate);
    const mEnd = endOfMonth(currentDate);
    return filteredEvents.filter(
      (ev) =>
        isWithinInterval(ev.start, { start: mStart, end: mEnd }) ||
        isWithinInterval(ev.end, { start: mStart, end: mEnd }) ||
        (ev.start <= mStart && ev.end >= mEnd)
    );
  }, [filteredEvents, currentDate]);

  // Sorted events for the sidebar pipeline
  const sortedFilteredEvents = useMemo(() => {
    return [...filteredEvents].sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [filteredEvents]);

  // Nearest month with events if current month is empty
  const nearestEventMonth = useMemo(() => {
    if (currentMonthEvents.length > 0 || sortedFilteredEvents.length === 0) return null;
    return sortedFilteredEvents[0].start;
  }, [currentMonthEvents, sortedFilteredEvents]);

  const hasActiveFilters =
    filterBrand !== "all" ||
    filterCategory !== "all" ||
    filterChannel !== "all" ||
    filterStatus !== "all" ||
    searchQuery.trim() !== "";

  const resetAllFilters = () => {
    setFilterBrand("all");
    setFilterCategory("all");
    setFilterChannel("all");
    setFilterStatus("all");
    setSearchQuery("");
  };

  // Calendar Navigation Helpers
  const handleNavigatePrev = () => {
    if (currentView === Views.MONTH) setCurrentDate((d) => subMonths(d, 1));
    else if (currentView === Views.WEEK) setCurrentDate((d) => subWeeks(d, 1));
    else setCurrentDate((d) => addDays(d, -1));
  };

  const handleNavigateNext = () => {
    if (currentView === Views.MONTH) setCurrentDate((d) => addMonths(d, 1));
    else if (currentView === Views.WEEK) setCurrentDate((d) => addWeeks(d, 1));
    else setCurrentDate((d) => addDays(d, 1));
  };

  const handleNavigateToday = () => {
    setCurrentDate(new Date());
  };

  // Handle uploading image files to local storage API
  const handleUploadImageFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file (กรุณาเลือกไฟล์รูปภาพที่ถูกต้อง)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
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
    const eventImages =
      Array.isArray(event.images) && event.images.length > 0
        ? event.images
        : event.imageUrl
        ? [event.imageUrl]
        : [];

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

      const res = await fetch("/api/marketing/events", {
        method: editingEvent ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: eventPayload }),
      });
      if (res.ok) {
        setIsModalOpen(false);
        fetchEvents();
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
    if (!confirm("Are you sure you want to delete this marketing campaign? (คุณต้องการลบกิจกรรมการตลาดนี้ใช่หรือไม่?)"))
      return;

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
      images: event.images ? [...event.images] : event.imageUrl ? [event.imageUrl] : [],
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
    else if (event.category === "ads") bgColor = "#4f46e5";

    if (event.status === "completed") {
      bgColor = "#64748b";
    } else if (event.status === "cancelled") {
      bgColor = "#ef4444";
    }

    return {
      style: {
        backgroundColor: bgColor,
        borderRadius: "8px",
        opacity: event.status === "draft" ? 0.78 : 1,
        color: "white",
        border: event.status === "draft" ? "1px dashed rgba(255,255,255,0.8)" : "0px",
        display: "block",
        fontSize: "11px",
        fontWeight: "600",
        padding: "3px 7px",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.14)",
      },
    };
  };

  // Custom Event Element
  const EventComponent = ({ event }: { event: MarketingCampaignEvent }) => {
    return (
      <div className="flex items-center gap-1.5 overflow-hidden text-[11px] py-0.5 leading-tight">
        <span className="text-[9px] uppercase font-black tracking-wider px-1.5 py-0.5 bg-black/25 rounded-md shrink-0">
          {event.brand === "that_laundry_shop" ? "TLS" : event.brand === "noname_laundry" ? "NN" : "ALL"}
        </span>
        {event.imageUrl && (
          <span title="Has artwork (มีรูปแบนเนอร์)" className="shrink-0">
            <ImageIcon size={11} className="text-white/90" />
          </span>
        )}
        <span className="truncate font-bold">{event.title}</span>
        {event.budget && (
          <span className="ml-auto text-[10px] opacity-90 font-mono font-bold hidden sm:inline shrink-0 bg-white/15 px-1 rounded">
            ฿{event.budget.toLocaleString()}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. INTERACTIVE KPI METRICS STRIP */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Active Campaigns */}
        <button
          type="button"
          onClick={() => setFilterStatus(filterStatus === "active" ? "all" : "active")}
          className={`text-left group relative overflow-hidden rounded-2xl p-4 transition-all cursor-pointer border ${
            filterStatus === "active"
              ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-400 ring-2 ring-emerald-500/20 shadow-sm"
              : "bg-white dark:bg-slate-850 border-slate-200/80 dark:border-slate-800 hover:border-emerald-300 shadow-2xs"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Active Now
                </span>
                <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">• กำลังรัน</span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {stats.activeCount}
                </span>
                <span className="text-xs font-semibold text-slate-400">campaigns</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Megaphone size={19} />
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
            <span>Driving live conversions</span>
            {filterStatus === "active" && (
              <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-bold">Filtered</span>
            )}
          </div>
        </button>

        {/* Scheduled Plans */}
        <button
          type="button"
          onClick={() => setFilterStatus(filterStatus === "scheduled" ? "all" : "scheduled")}
          className={`text-left group relative overflow-hidden rounded-2xl p-4 transition-all cursor-pointer border ${
            filterStatus === "scheduled"
              ? "bg-blue-50/70 dark:bg-blue-950/30 border-blue-400 ring-2 ring-blue-500/20 shadow-sm"
              : "bg-white dark:bg-slate-850 border-slate-200/80 dark:border-slate-800 hover:border-blue-300 shadow-2xs"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Scheduled
                </span>
                <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">• วางแผนแล้ว</span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {stats.scheduledCount}
                </span>
                <span className="text-xs font-semibold text-slate-400">planned</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <CalendarDays size={19} />
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
            <span>Queued for upcoming launch</span>
            {filterStatus === "scheduled" && (
              <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-bold">Filtered</span>
            )}
          </div>
        </button>

        {/* Total Planned Budget */}
        <button
          type="button"
          onClick={() => setFilterStatus("all")}
          className="text-left group relative overflow-hidden rounded-2xl p-4 bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-300 shadow-2xs transition-all cursor-pointer"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Planned Budget
                </span>
                <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">• งบรวม</span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight font-mono">
                  ฿{stats.totalBudget.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <DollarSign size={19} />
            </div>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
            Ads, promo subsidies & events
          </div>
        </button>

        {/* Completed Campaigns */}
        <button
          type="button"
          onClick={() => setFilterStatus(filterStatus === "completed" ? "all" : "completed")}
          className={`text-left group relative overflow-hidden rounded-2xl p-4 transition-all cursor-pointer border ${
            filterStatus === "completed"
              ? "bg-purple-50/70 dark:bg-purple-950/30 border-purple-400 ring-2 ring-purple-500/20 shadow-sm"
              : "bg-white dark:bg-slate-850 border-slate-200/80 dark:border-slate-800 hover:border-purple-300 shadow-2xs"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Completed
                </span>
                <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">• เสร็จสิ้น</span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {stats.completedCount}
                </span>
                <span className="text-xs font-semibold text-slate-400">archived</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <CheckCircle2 size={19} />
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-purple-600 dark:text-purple-400 font-semibold">
            <span>Concluded initiatives</span>
            {filterStatus === "completed" && (
              <span className="text-[10px] bg-purple-600 text-white px-1.5 py-0.5 rounded font-bold">Filtered</span>
            )}
          </div>
        </button>
      </div>

      {/* 2. UNIFIED SINGLE-ROW FILTER & ACTION BAR */}
      <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 shadow-2xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Left: Search + Compact Filter Selects */}
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            {/* Search Input */}
            <div className="relative min-w-[200px] sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search campaign, promo code, PIC..."
                className="w-full pl-8 pr-7 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
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
              className="text-xs font-semibold py-1.5 px-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-xl text-slate-700 dark:text-slate-200 cursor-pointer hover:border-slate-300"
            >
              <option value="all">🏢 All Brands (ทุกแบรนด์)</option>
              <option value="that_laundry_shop">🧺 That Laundry Shop (TLS)</option>
              <option value="noname_laundry">✨ Noname Laundry (โนเนม)</option>
            </select>

            {/* Channel Filter */}
            <select
              value={filterChannel}
              onChange={(e) => setFilterChannel(e.target.value)}
              className="text-xs font-semibold py-1.5 px-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-xl text-slate-700 dark:text-slate-200 cursor-pointer hover:border-slate-300"
            >
              <option value="all">🌐 All Channels (ทุกช่องทาง)</option>
              <option value="line">LINE OA (ไลน์)</option>
              <option value="facebook">Facebook (เฟซบุ๊ก)</option>
              <option value="tiktok">TikTok (ติ๊กต็อก)</option>
              <option value="instagram">Instagram (ไอจี)</option>
              <option value="offline">Offline / In-Store (หน้าร้าน)</option>
              <option value="sms">SMS Marketing</option>
              <option value="other">Other Channels</option>
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs font-semibold py-1.5 px-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-xl text-slate-700 dark:text-slate-200 cursor-pointer hover:border-slate-300"
            >
              <option value="all">⚡ All Statuses (ทุกสถานะ)</option>
              <option value="scheduled">🔵 Scheduled (วางแผนแล้ว)</option>
              <option value="active">🟢 Active (กำลังรัน)</option>
              <option value="draft">⚪ Draft (แบบร่าง)</option>
              <option value="completed">🟣 Completed (เสร็จสิ้น)</option>
              <option value="cancelled">🔴 Cancelled (ยกเลิก)</option>
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800 cursor-pointer transition-colors"
              >
                <X size={12} /> Reset
              </button>
            )}
          </div>

          {/* Right: Display Mode + Queue Toggle + Refresh + New Campaign CTA */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Display Mode Switcher (Calendar vs Table) */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/80 dark:border-slate-750">
              <button
                type="button"
                onClick={() => setMainDisplayMode("calendar")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  mainDisplayMode === "calendar"
                    ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                <CalendarIcon size={13} /> Calendar
              </button>
              <button
                type="button"
                onClick={() => setMainDisplayMode("list")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  mainDisplayMode === "list"
                    ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                <List size={13} /> Table ({filteredEvents.length})
              </button>
            </div>

            {/* Toggle Campaign Pipeline Sidebar (only in calendar mode) */}
            {mainDisplayMode === "calendar" && (
              <button
                type="button"
                onClick={() => setShowSidebar((v) => !v)}
                title={showSidebar ? "Hide Campaign Queue Sidebar" : "Show Campaign Queue Sidebar"}
                className={`hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  showSidebar
                    ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
                    : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-750 hover:text-slate-900"
                }`}
              >
                {showSidebar ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
                <span>Queue ({filteredEvents.length})</span>
              </button>
            )}

            {/* Refresh */}
            <button
              type="button"
              onClick={fetchEvents}
              disabled={isLoading}
              title="Refresh Data (รีเฟรชข้อมูล)"
              className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-xl cursor-pointer transition-colors"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            </button>

            {/* Create New Campaign Button */}
            <button
              type="button"
              onClick={() => handleOpenCreateModal()}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-3.5 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Plus size={15} />
              <span>New Campaign</span>
            </button>
          </div>
        </div>

        {/* Interactive Category Pills & Quick Tip */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px]">
          <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mr-1">Categories:</span>
          <button
            type="button"
            onClick={() => setFilterCategory("all")}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              filterCategory === "all"
                ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900 shadow-2xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200/70"
            }`}
          >
            All ({events.length})
          </button>

          {(Object.keys(CATEGORY_CONFIG) as MarketingCategory[]).map((catKey) => {
            const cat = CATEGORY_CONFIG[catKey];
            const isSelected = filterCategory === catKey;
            const count = stats.categoryCounts[catKey] || 0;
            return (
              <button
                key={catKey}
                type="button"
                onClick={() => setFilterCategory(isSelected ? "all" : catKey)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer border ${
                  isSelected
                    ? `${cat.badge} ring-2 ring-indigo-500/20 font-bold`
                    : "bg-slate-50/80 dark:bg-slate-900/60 border-slate-200/70 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${cat.dot}`} />
                <span>{cat.shortLabel}</span>
                <span className="text-[10px] text-slate-400">({cat.thLabel})</span>
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-white/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                  {count}
                </span>
              </button>
            );
          })}

          <span className="ml-auto text-[11px] text-slate-400 hidden lg:flex items-center gap-1">
            💡 Click any date slot to add a campaign, or drag events to reschedule
          </span>
        </div>
      </div>

      {/* 3. MAIN WORKSPACE: CALENDAR + COLLAPSIBLE PIPELINE SIDEBAR OR TABLE VIEW */}
      {mainDisplayMode === "calendar" ? (
        <div className="flex flex-col xl:flex-row gap-4 items-start">
          {/* LEFT: CALENDAR CARD WITH CUSTOM MODERN TOOLBAR */}
          <div className="flex-1 w-full bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-2xs min-w-0">
            {/* Custom Modern Calendar Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 mb-3 border-b border-slate-100 dark:border-slate-800">
              {/* Left: Navigation + Month Title + Event Badge */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/80 dark:border-slate-750">
                  <button
                    type="button"
                    onClick={handleNavigatePrev}
                    className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                    title="Previous (ก่อนหน้า)"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={handleNavigateToday}
                    className="px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={handleNavigateNext}
                    className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                    title="Next (ถัดไป)"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>

                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                    {currentView === Views.DAY
                      ? format(currentDate, "dd MMMM yyyy")
                      : format(currentDate, "MMMM yyyy")}
                  </h2>
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                      currentMonthEvents.length > 0
                        ? "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800"
                        : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                    }`}
                  >
                    {currentMonthEvents.length} {currentMonthEvents.length === 1 ? "campaign" : "campaigns"} in{" "}
                    {format(currentDate, "MMM")}
                  </span>
                </div>

                {/* Smart Jump Banner when current month is empty but campaigns exist in another month */}
                {nearestEventMonth && (
                  <button
                    type="button"
                    onClick={() => setCurrentDate(nearestEventMonth)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 shadow-2xs transition-all cursor-pointer"
                  >
                    <Sparkles size={12} className="text-amber-600" />
                    <span>
                      Jump to {format(nearestEventMonth, "MMM yyyy")} ({filteredEvents.length} scheduled)
                    </span>
                    <ArrowUpRight size={12} />
                  </button>
                )}
              </div>

              {/* Right: Segmented View Switcher (Month | Week | Day | Agenda) */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/80 dark:border-slate-750">
                {(
                  [
                    { id: Views.MONTH, label: "Month" },
                    { id: Views.WEEK, label: "Week" },
                    { id: Views.DAY, label: "Day" },
                    { id: Views.AGENDA, label: "Agenda" },
                  ] as const
                ).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setCurrentView(v.id)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      currentView === v.id
                        ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-2xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="h-[680px] marketing-calendar-container">
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
                toolbar={false}
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
                  noEventsInRange: "No campaigns scheduled in this timeframe (ไม่มีกิจกรรมการตลาดในช่วงเวลานี้)",
                }}
                popup={true}
                className="font-sans h-full text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          {/* RIGHT: CAMPAIGN PIPELINE & QUICK JUMP SIDEBAR */}
          {showSidebar && (
            <div className="w-full xl:w-80 shrink-0 bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-2xs flex flex-col max-h-[760px]">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <CalendarDays size={14} className="text-indigo-600" />
                    Campaign Queue ({sortedFilteredEvents.length})
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                    Click date to jump • Click card to edit
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenCreateModal(currentDate)}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-1 rounded-lg cursor-pointer"
                >
                  + Add
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
                {sortedFilteredEvents.length === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                      <CalendarIcon size={18} />
                    </div>
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">No campaigns found</p>
                    <p className="text-[11px] text-slate-400">
                      Click any slot on the calendar or &ldquo;New Campaign&rdquo; to create one.
                    </p>
                  </div>
                ) : (
                  sortedFilteredEvents.map((ev) => {
                    const cat = CATEGORY_CONFIG[ev.category] || CATEGORY_CONFIG.promo;
                    const status = STATUS_CONFIG[ev.status] || STATUS_CONFIG.draft;
                    const brand = BRAND_CONFIG[ev.brand] || BRAND_CONFIG.all;
                    const isSameMonth =
                      ev.start.getMonth() === currentDate.getMonth() &&
                      ev.start.getFullYear() === currentDate.getFullYear();

                    return (
                      <div
                        key={ev.id}
                        onClick={() => handleOpenEditModal(ev)}
                        className={`group p-3 rounded-xl border transition-all cursor-pointer ${
                          isSameMonth
                            ? "bg-slate-50/70 dark:bg-slate-900/60 border-slate-200/90 dark:border-slate-800 hover:border-indigo-300"
                            : "bg-white dark:bg-slate-850 border-slate-150 dark:border-slate-800/60 hover:border-indigo-300"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5 mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${cat.dot}`} />
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${brand.badge}`}>
                              {brand.shortLabel}
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full border ${status.badge}`}>
                              {status.shortLabel}
                            </span>
                          </div>
                          {ev.budget && (
                            <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200 shrink-0">
                              ฿{ev.budget.toLocaleString()}
                            </span>
                          )}
                        </div>

                        <p className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors line-clamp-1">
                          {ev.title}
                        </p>

                        {ev.promoCode && (
                          <div className="mt-1">
                            <span className="inline-block px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-mono text-[10px] font-bold border border-amber-200 dark:border-amber-800">
                              🎟️ {ev.promoCode}
                            </span>
                          </div>
                        )}

                        <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrentDate(new Date(ev.start));
                            }}
                            title="Jump calendar to this campaign's date"
                            className="flex items-center gap-1 font-mono text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            <CalendarIcon size={11} />
                            <span>
                              {format(new Date(ev.start), "dd MMM")} – {format(new Date(ev.end), "dd MMM yyyy")}
                            </span>
                          </button>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {CHANNEL_CONFIG[ev.channel]?.shortLabel || ev.channel}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* TABLE / LIST VIEW */
        <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
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
                  sortedFilteredEvents.map((ev) => {
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
                                className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 bg-slate-100 hover:opacity-80 transition-opacity cursor-pointer shadow-2xs"
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
                            {brand.shortLabel}
                          </span>
                        </td>
                        <td className="py-3 px-4 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${cat.badge}`}>
                              {cat.shortLabel}
                            </span>
                            <span className="text-[10px] text-slate-600 dark:text-slate-400 font-medium">
                              ({chan.shortLabel})
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
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{ev.assignedTo || "-"}</td>
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

      {/* 4. MODAL: CREATE / EDIT MARKETING EVENT (2-COLUMN STUDIO LAYOUT) */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-4xl p-0 gap-0 overflow-hidden border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900 rounded-2xl shadow-2xl max-h-[88vh] flex flex-col">
          {/* Dynamic Top Category Color Bar */}
          <div
            className={`h-1.5 w-full shrink-0 transition-colors ${
              formValues.category === "promo"
                ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                : formValues.category === "ads"
                ? "bg-gradient-to-r from-indigo-500 to-violet-600"
                : formValues.category === "content"
                ? "bg-gradient-to-r from-sky-500 to-blue-600"
                : "bg-gradient-to-r from-amber-500 to-orange-500"
            }`}
          />

          {/* Studio Header */}
          <DialogHeader className="px-6 py-4 bg-white dark:bg-slate-850 border-b border-slate-200/80 dark:border-slate-800 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-3 pr-6">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs transition-colors ${
                    formValues.category === "promo"
                      ? "bg-emerald-600"
                      : formValues.category === "ads"
                      ? "bg-indigo-600"
                      : formValues.category === "content"
                      ? "bg-sky-600"
                      : "bg-amber-600"
                  }`}
                >
                  {editingEvent ? <Edit3 size={18} /> : <Sparkles size={18} />}
                </div>
                <div>
                  <DialogTitle className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                    {editingEvent ? "Edit Marketing Campaign" : "Create Marketing Campaign"}
                  </DialogTitle>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    {editingEvent
                      ? "แก้ไขรายละเอียดแคมเปญ กำหนดการ และสื่ออาร์ตเวิร์ก"
                      : "สร้างแคมเปญการตลาด โปรโมชั่น หรือแผนคอนเทนต์ใหม่ลงในปฏิทิน"}
                  </p>
                </div>
              </div>

              {/* Live Status Pill Selector in Header */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-750">
                {(
                  [
                    { id: "scheduled", label: "Scheduled", dot: "bg-blue-500" },
                    { id: "active", label: "Active", dot: "bg-emerald-500" },
                    { id: "draft", label: "Draft", dot: "bg-slate-400" },
                    { id: "completed", label: "Done", dot: "bg-purple-500" },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setFormValues({ ...formValues, status: st.id })}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      formValues.status === st.id
                        ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                    <span>{st.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </DialogHeader>

          {/* Scrollable 2-Column Body */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 custom-scrollbar">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 text-xs">
              {/* LEFT COLUMN (7 COLS): CORE CAMPAIGN DETAILS, CATEGORY, SCHEDULE, COPYWRITING */}
              <div className="lg:col-span-7 space-y-4">
                {/* Card 1: Campaign Identity & Brand */}
                <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-4">
                  {/* Title */}
                  <div>
                    <Label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
                      <span>
                        Campaign Title <span className="text-rose-500">*</span>
                      </span>
                      <span className="text-[10px] font-normal normal-case text-slate-400">ชื่อแคมเปญ / หัวข้อกิจกรรม</span>
                    </Label>
                    <Input
                      value={formValues.title}
                      onChange={(e) => setFormValues({ ...formValues, title: e.target.value })}
                      placeholder="e.g. 11.11 Flash Sale Free Delivery (เช่น 11.11 Flash Sale ส่งฟรี)"
                      className="mt-1.5 h-10 text-sm font-bold bg-slate-50/70 dark:bg-slate-900 border-slate-200 dark:border-slate-750 rounded-xl focus:bg-white"
                    />
                  </div>

                  {/* Brand Visual Pill Selector */}
                  <div>
                    <Label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between mb-1.5">
                      <span>Target Brand</span>
                      <span className="text-[10px] font-normal normal-case text-slate-400">เลือกแบรนด์ที่ใช้แคมเปญนี้</span>
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { id: "that_laundry_shop", icon: "🧺", title: "That Laundry Shop", sub: "TLS Brand", activeCls: "border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20" },
                          { id: "noname_laundry", icon: "✨", title: "Noname Laundry", sub: "โนเนม ลอนดรี้", activeCls: "border-purple-500 bg-purple-50/70 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500/20" },
                          { id: "all", icon: "🏢", title: "All Brands", sub: "ทุกแบรนด์รวมกัน", activeCls: "border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/20" },
                        ] as const
                      ).map((b) => {
                        const active = formValues.brand === b.id;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setFormValues({ ...formValues, brand: b.id })}
                            className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                              active
                                ? b.activeCls
                                : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-slate-100/70 text-slate-700 dark:text-slate-300"
                            }`}
                          >
                            <span className="text-base shrink-0">{b.icon}</span>
                            <div className="min-w-0">
                              <div className="font-bold text-[11px] truncate">{b.title}</div>
                              <div className="text-[9px] opacity-75 truncate">{b.sub}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Category 2x2 Visual Cards */}
                  <div>
                    <Label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between mb-1.5">
                      <span>Campaign Category</span>
                      <span className="text-[10px] font-normal normal-case text-slate-400">หมวดหมู่กิจกรรม</span>
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.keys(CATEGORY_CONFIG) as MarketingCategory[]).map((catKey) => {
                        const cat = CATEGORY_CONFIG[catKey];
                        const IconComp = cat.icon;
                        const active = formValues.category === catKey;
                        return (
                          <button
                            key={catKey}
                            type="button"
                            onClick={() => setFormValues({ ...formValues, category: catKey })}
                            className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                              active
                                ? `${cat.badge} ring-2 ring-indigo-500/20 shadow-2xs`
                                : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-slate-100/70 text-slate-700 dark:text-slate-300"
                            }`}
                          >
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                active ? `${cat.bg} text-white` : "bg-slate-200/70 dark:bg-slate-800 text-slate-500"
                              }`}
                            >
                              <IconComp size={14} />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-[11px] truncate">{cat.shortLabel}</div>
                              <div className="text-[10px] opacity-75 truncate">{cat.thLabel}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Channel Quick-Select Pills */}
                  <div>
                    <Label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between mb-1.5">
                      <span>Marketing Channel</span>
                      <span className="text-[10px] font-normal normal-case text-slate-400">ช่องทางเผยแพร่หลัก</span>
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: "line", label: "💬 LINE OA" },
                          { id: "facebook", label: "📘 Facebook" },
                          { id: "tiktok", label: "🎵 TikTok" },
                          { id: "instagram", label: "📸 Instagram" },
                          { id: "offline", label: "🏪 In-Store / Booth" },
                          { id: "sms", label: "✉️ SMS" },
                          { id: "other", label: "🌐 Other" },
                        ] as const
                      ).map((ch) => {
                        const active = formValues.channel === ch.id;
                        return (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={() => setFormValues({ ...formValues, channel: ch.id })}
                            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                              active
                                ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white shadow-2xs"
                                : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100"
                            }`}
                          >
                            {ch.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Card 2: Schedule & Quick Duration Presets */}
                <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Clock size={13} className="text-indigo-600" />
                      <span>Campaign Schedule (กำหนดการ เริ่ม - สิ้นสุด)</span>
                    </Label>
                    {/* Quick Duration Chips */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-400 mr-1">Quick set:</span>
                      {[
                        { label: "1 Day", days: 0 },
                        { label: "3 Days", days: 2 },
                        { label: "7 Days", days: 6 },
                        { label: "30 Days", days: 29 },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            const base = formValues.startDate ? new Date(formValues.startDate) : new Date();
                            setFormValues({
                              ...formValues,
                              endDate: format(addDays(base, preset.days), "yyyy-MM-dd"),
                            });
                          }}
                          className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 dark:bg-slate-800 dark:text-slate-300 transition-colors cursor-pointer"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                        Start (วันเวลาเริ่มต้น)
                      </span>
                      <div className="flex gap-1.5">
                        <Input
                          type="date"
                          value={formValues.startDate}
                          onChange={(e) => setFormValues({ ...formValues, startDate: e.target.value })}
                          className="text-xs font-semibold flex-1 bg-white dark:bg-slate-850 h-8"
                        />
                        <Input
                          type="time"
                          value={formValues.startTime}
                          onChange={(e) => setFormValues({ ...formValues, startTime: e.target.value })}
                          className="text-xs font-mono w-24 bg-white dark:bg-slate-850 h-8"
                        />
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                        End (วันเวลาสิ้นสุด)
                      </span>
                      <div className="flex gap-1.5">
                        <Input
                          type="date"
                          value={formValues.endDate}
                          onChange={(e) => setFormValues({ ...formValues, endDate: e.target.value })}
                          className="text-xs font-semibold flex-1 bg-white dark:bg-slate-850 h-8"
                        />
                        <Input
                          type="time"
                          value={formValues.endTime}
                          onChange={(e) => setFormValues({ ...formValues, endTime: e.target.value })}
                          className="text-xs font-mono w-24 bg-white dark:bg-slate-850 h-8"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card 3: Copywriting & Notes */}
                <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-2">
                  <Label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>Broadcast Copy & Campaign Notes</span>
                    <span className="text-[10px] font-normal normal-case text-slate-400">แคปชั่น / รายละเอียดงาน</span>
                  </Label>
                  <textarea
                    value={formValues.notes}
                    onChange={(e) => setFormValues({ ...formValues, notes: e.target.value })}
                    placeholder="Write broadcast message copy, promo conditions, or campaign checklist... (ระบุข้อความบรอดแคสต์, เงื่อนไขโปรโมชั่น หรือรายละเอียดเพิ่มเติม...)"
                    rows={3}
                    className="w-full p-3 bg-slate-50/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden resize-none"
                  />
                </div>
              </div>

              {/* RIGHT COLUMN (5 COLS): ARTWORK STUDIO, BUDGET & PROMO, KPI & OWNER */}
              <div className="lg:col-span-5 space-y-4">
                {/* Card 1: Artwork & Banner Studio */}
                <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <ImageIcon size={13} className="text-indigo-600" />
                      <span>Artwork & Banners (รูปแบนเนอร์)</span>
                    </Label>
                    <button
                      type="button"
                      onClick={() => setShowUrlInput(!showUrlInput)}
                      className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus size={12} /> {showUrlInput ? "Hide URL" : "Paste URL"}
                    </button>
                  </div>

                  {showUrlInput && (
                    <div className="flex gap-1.5">
                      <Input
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://... image link"
                        className="text-xs h-8 flex-1"
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
                        className="text-xs h-8 shrink-0"
                      >
                        Add
                      </Button>
                    </div>
                  )}

                  {/* Sleek Compact Dropzone */}
                  <div className="relative border-2 border-dashed border-slate-200 dark:border-slate-750 hover:border-indigo-500 dark:hover:border-indigo-400 rounded-xl p-4 text-center bg-slate-50/60 dark:bg-slate-900/50 transition-all group">
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
                    <div className="flex flex-col items-center justify-center gap-1 pointer-events-none">
                      <div className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                        {isUploadingImage ? (
                          <RefreshCw size={18} className="animate-spin" />
                        ) : (
                          <UploadCloud size={18} />
                        )}
                      </div>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-1">
                        {isUploadingImage ? "Uploading artwork..." : "Drop banner images or click to browse"}
                      </p>
                      <p className="text-[10px] text-slate-400">JPG, PNG, WEBP, GIF up to 10MB</p>
                    </div>
                  </div>

                  {/* Uploaded Images Gallery */}
                  {formValues.images && formValues.images.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Uploaded ({formValues.images.length}) • Click ⭐ for cover
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {formValues.images.map((img, idx) => {
                          const isPrimary = formValues.imageUrl === img;
                          return (
                            <div
                              key={idx}
                              className={`relative group rounded-lg overflow-hidden border ${
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
                              <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 p-1">
                                <button
                                  type="button"
                                  onClick={() => setLightboxImageUrl(img)}
                                  className="p-1 rounded bg-white/90 text-slate-800 hover:bg-white cursor-pointer"
                                >
                                  <Eye size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSetPrimaryImage(img)}
                                  className={`p-1 rounded cursor-pointer ${
                                    isPrimary ? "bg-amber-500 text-white" : "bg-white/90 text-slate-800"
                                  }`}
                                >
                                  <Star size={12} fill={isPrimary ? "currentColor" : "none"} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveImage(img)}
                                  className="p-1 rounded bg-rose-600 text-white cursor-pointer"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                              {isPrimary && (
                                <div className="absolute top-1 left-1 bg-indigo-600 text-white text-[8px] font-bold px-1 py-0.2 rounded">
                                  Cover
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Card 2: Budget & Promo Code */}
                <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-3.5">
                  <Label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <DollarSign size={13} className="text-emerald-600" />
                    <span>Budget & Promo Code (งบประมาณ & โค้ดส่วนลด)</span>
                  </Label>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 block mb-1">Linked Promo Code</span>
                      <div className="relative">
                        <Tag size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-600" />
                        <Input
                          value={formValues.promoCode}
                          onChange={(e) => setFormValues({ ...formValues, promoCode: e.target.value })}
                          placeholder="FREEDELIVERY"
                          className="pl-7 h-9 font-mono uppercase text-xs font-bold bg-amber-50/40 dark:bg-slate-900 border-amber-200/80 dark:border-slate-750"
                        />
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-500 block mb-1">Planned Budget (฿)</span>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                          ฿
                        </span>
                        <Input
                          type="number"
                          value={formValues.budget}
                          onChange={(e) => setFormValues({ ...formValues, budget: e.target.value })}
                          placeholder="5000"
                          className="pl-6 h-9 font-mono text-xs font-bold bg-slate-50/70 dark:bg-slate-900"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Quick Budget Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-400">Quick budget:</span>
                    {[1000, 3000, 5000, 10000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setFormValues({ ...formValues, budget: String(amt) })}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                          Number(formValues.budget) === amt
                            ? "bg-indigo-600 text-white"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        ฿{amt.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Card 3: Target KPI, Owner & Asset Link */}
                <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-3">
                  <Label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    Goals, Owner & Creative Link (เป้าหมายและผู้ดูแล)
                  </Label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 block mb-1">Target / KPI Goal</span>
                      <Input
                        value={formValues.targetGoal}
                        onChange={(e) => setFormValues({ ...formValues, targetGoal: e.target.value })}
                        placeholder="e.g. 300 orders, ROI 4x"
                        className="h-8 text-xs bg-slate-50/70 dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 block mb-1">PIC / Lead Owner</span>
                      <Input
                        value={formValues.assignedTo}
                        onChange={(e) => setFormValues({ ...formValues, assignedTo: e.target.value })}
                        placeholder="e.g. Marketing Team"
                        className="h-8 text-xs bg-slate-50/70 dark:bg-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1 mb-1">
                      <ExternalLink size={11} /> Creative / Canva / Drive Link
                    </span>
                    <Input
                      value={formValues.contentUrl}
                      onChange={(e) => setFormValues({ ...formValues, contentUrl: e.target.value })}
                      placeholder="https://canva.com/... or Google Drive folder"
                      className="h-8 font-mono text-[11px] bg-slate-50/70 dark:bg-slate-900"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Studio Footer */}
          <DialogFooter className="m-0 mb-0 mx-0 px-6 py-4 bg-white dark:bg-slate-850 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between sm:justify-between shrink-0 rounded-b-2xl">
            {editingEvent ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteEvent(editingEvent.id)}
                  className="text-xs flex items-center gap-1 rounded-xl cursor-pointer h-9 px-3"
                >
                  <Trash2 size={13} /> Delete
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleDuplicateEvent(editingEvent)}
                  className="text-xs flex items-center gap-1 rounded-xl cursor-pointer h-9 px-3"
                >
                  <Copy size={13} /> Duplicate
                </Button>
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 hidden sm:flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Saves directly to Marketing Board database</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(false)}
                className="text-xs rounded-xl px-4 h-9 cursor-pointer"
              >
                Cancel (ยกเลิก)
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveForm}
                disabled={isSaving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 rounded-xl px-5 h-9 shadow-sm cursor-pointer"
              >
                {isSaving ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={14} />}
                <span>{editingEvent ? "Save Changes (บันทึก)" : "Create Campaign (สร้างแคมเปญ)"}</span>
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

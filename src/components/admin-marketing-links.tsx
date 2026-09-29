"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import QRCode from "qrcode";
import { 
  QrCode, 
  Link2, 
  ExternalLink, 
  Copy, 
  Check, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  BarChart2, 
  Trash2, 
  Edit3, 
  RefreshCw, 
  Smartphone, 
  Monitor, 
  Globe, 
  Calendar, 
  Printer, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  TrendingUp,
  Tag
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";

export interface ClickLog {
  id: string;
  timestamp: string;
  ipHash?: string;
  device: "ios" | "android" | "desktop" | "other";
  referrer: string;
}

export interface TrackingLinkItem {
  id: string;
  title: string;
  slug: string;
  targetUrl: string;
  brand: "that_laundry_shop" | "noname_laundry" | "all";
  channel: "offline_qr" | "flyer" | "standee" | "line" | "facebook" | "tiktok" | "instagram" | "sms" | "other";
  notes?: string;
  isActive: boolean;
  totalClicks: number;
  uniqueClicks: number;
  lastClickedAt?: string;
  clickLogs: ClickLog[];
  createdAt: string;
  updatedAt: string;
}

const CHANNEL_CONFIG: Record<string, { label: string; badge: string }> = {
  standee: { label: "Store Standee (ป้ายหน้าร้าน)", badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300" },
  flyer: { label: "Printed Flyer (ใบปลิว)", badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300" },
  offline_qr: { label: "Offline QR (ป้ายออฟไลน์)", badge: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300" },
  line: { label: "LINE OA (ไลน์)", badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300" },
  facebook: { label: "Facebook (เฟซบุ๊ก)", badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300" },
  tiktok: { label: "TikTok (ติ๊กต็อก)", badge: "bg-neutral-100 text-neutral-800 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-200" },
  instagram: { label: "Instagram (ไอจี)", badge: "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300" },
  sms: { label: "SMS (ข้อความ)", badge: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300" },
  other: { label: "Other (อื่นๆ)", badge: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300" },
};

const BRAND_CONFIG: Record<string, { label: string; badge: string }> = {
  that_laundry_shop: { label: "That Laundry Shop (TLS)", badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300" },
  noname_laundry: { label: "Noname Laundry (โนเนม)", badge: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300" },
  all: { label: "All Brands (ทุกแบรนด์)", badge: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300" },
};

export function AdminMarketingLinks() {
  const [links, setLinks] = useState<TrackingLinkItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterBrand, setFilterBrand] = useState<string>("all");
  const [filterChannel, setFilterChannel] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Create / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingLink, setEditingLink] = useState<TrackingLinkItem | null>(null);
  const [formValues, setFormValues] = useState<{
    id?: string;
    title: string;
    slug: string;
    targetUrl: string;
    brand: "that_laundry_shop" | "noname_laundry" | "all";
    channel: any;
    notes: string;
    isActive: boolean;
  }>({
    title: "",
    slug: "",
    targetUrl: "",
    brand: "that_laundry_shop",
    channel: "offline_qr",
    notes: "",
    isActive: true,
  });

  // Modal QR Preview Data URL
  const [modalQrUrl, setModalQrUrl] = useState<string>("");

  // QR Code Export Modal
  const [qrExportLink, setQrExportLink] = useState<TrackingLinkItem | null>(null);
  const [exportQrDataUrl, setExportQrDataUrl] = useState<string>("");

  // Detailed Analytics Modal
  const [analyticsLink, setAnalyticsLink] = useState<TrackingLinkItem | null>(null);

  // Copy Feedback State
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Base URL for short links
  const [baseUrl, setBaseUrl] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(`${window.location.origin}/q/`);
    }
  }, []);

  // Fetch Links from API
  const fetchLinks = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/marketing/links");
      const data = await res.json();
      if (data && data.links) {
        setLinks(data.links);
      }
    } catch (err) {
      console.error("Failed to load tracking links:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  // Generate QR Code data URL when slug changes in modal
  useEffect(() => {
    const slug = formValues.slug.trim() || "preview";
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const fullUrl = `${origin}/q/${slug}`;

    QRCode.toDataURL(fullUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: "#1e1b4b", // deep indigo
        light: "#ffffff",
      },
    })
      .then((url) => setModalQrUrl(url))
      .catch((err) => console.error("QR preview generation error:", err));
  }, [formValues.slug]);

  // Generate QR Code data URL when opening QR Export Modal
  useEffect(() => {
    if (!qrExportLink) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const fullUrl = `${origin}/q/${qrExportLink.slug}`;

    QRCode.toDataURL(fullUrl, {
      width: 512,
      margin: 2,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    })
      .then((url) => setExportQrDataUrl(url))
      .catch((err) => console.error("Export QR generation error:", err));
  }, [qrExportLink]);

  // Filtered Links
  const filteredLinks = useMemo(() => {
    return links.filter((l) => {
      if (filterBrand !== "all" && l.brand !== filterBrand && l.brand !== "all") {
        return false;
      }
      if (filterChannel !== "all" && l.channel !== filterChannel) {
        return false;
      }
      if (filterStatus === "active" && !l.isActive) return false;
      if (filterStatus === "paused" && l.isActive) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = l.title?.toLowerCase().includes(q);
        const matchesSlug = l.slug?.toLowerCase().includes(q);
        const matchesTarget = l.targetUrl?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesSlug && !matchesTarget) {
          return false;
        }
      }
      return true;
    });
  }, [links, filterBrand, filterChannel, filterStatus, searchQuery]);

  // Statistics KPI
  const stats = useMemo<{
    totalLinks: number;
    totalClicks: number;
    totalUnique: number;
    topLink: TrackingLinkItem | null;
  }>(() => {
    let totalClicks = 0;
    let totalUnique = 0;
    let topLink: TrackingLinkItem | null = null;
    let maxClicks = -1;

    links.forEach((l) => {
      totalClicks += Number(l.totalClicks) || 0;
      totalUnique += Number(l.uniqueClicks) || 0;
      if ((l.totalClicks || 0) > maxClicks) {
        maxClicks = l.totalClicks;
        topLink = l;
      }
    });

    return {
      totalLinks: links.length,
      totalClicks,
      totalUnique,
      topLink,
    };
  }, [links]);

  // Copy Short Link to Clipboard
  const handleCopyLink = (slug: string, id: string) => {
    const full = `${baseUrl}${slug}`;
    navigator.clipboard.writeText(full).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingLink(null);
    const randomSlug = Math.random().toString(36).substring(2, 8);
    setFormValues({
      title: "",
      slug: randomSlug,
      targetUrl: "",
      brand: "that_laundry_shop",
      channel: "offline_qr",
      notes: "",
      isActive: true,
    });
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (link: TrackingLinkItem) => {
    setEditingLink(link);
    setFormValues({
      id: link.id,
      title: link.title,
      slug: link.slug,
      targetUrl: link.targetUrl,
      brand: link.brand,
      channel: link.channel,
      notes: link.notes || "",
      isActive: link.isActive,
    });
    setIsModalOpen(true);
  };

  // Save Form (Create or Update)
  const handleSaveForm = async () => {
    if (!formValues.title.trim()) {
      alert("Please enter a campaign title (กรุณากรอกชื่อแคมเปญ)");
      return;
    }
    if (!formValues.targetUrl.trim()) {
      alert("Please enter a destination target URL (กรุณากรอกลิงก์ปลายทาง)");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        id: editingLink?.id || `lnk-${Date.now()}`,
        title: formValues.title.trim(),
        slug: formValues.slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, ""),
        targetUrl: formValues.targetUrl.trim(),
        brand: formValues.brand,
        channel: formValues.channel,
        notes: formValues.notes.trim() || undefined,
        isActive: formValues.isActive,
      };

      if (editingLink) {
        const res = await fetch("/api/marketing/links", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ link: payload }),
        });
        if (res.ok) {
          setIsModalOpen(false);
          fetchLinks();
        } else {
          const err = await res.json();
          alert(err.error || "Failed to update link");
        }
      } else {
        const res = await fetch("/api/marketing/links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ link: payload }),
        });
        if (res.ok) {
          setIsModalOpen(false);
          fetchLinks();
        } else {
          const err = await res.json();
          alert(err.error || "Failed to create link");
        }
      }
    } catch (err) {
      console.error("Save error:", err);
      alert("An error occurred while saving (เกิดข้อผิดพลาดในการบันทึก)");
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle Active Status
  const handleToggleActive = async (link: TrackingLinkItem) => {
    try {
      const updated = { ...link, isActive: !link.isActive };
      setLinks((prev) => prev.map((l) => (l.id === link.id ? updated : l)));
      await fetch("/api/marketing/links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link: { id: link.id, isActive: !link.isActive } }),
      });
    } catch (err) {
      console.error("Toggle error:", err);
      fetchLinks();
    }
  };

  // Delete Link
  const handleDeleteLink = async (id: string) => {
    if (!confirm("Are you sure you want to delete this tracked link? (คุณต้องการลบลิงก์นี้ใช่หรือไม่?)")) return;

    try {
      setLinks((prev) => prev.filter((l) => l.id !== id));
      await fetch(`/api/marketing/links?id=${id}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Delete error:", err);
      fetchLinks();
    }
  };

  // Download QR Code PNG
  const handleDownloadQrPng = (link: TrackingLinkItem, dataUrl: string) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `QR-${link.slug || "code"}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP KPI DASHBOARD */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Links */}
        <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Tracked Links (ลิงก์ & QR ทั้งหมด)
            </p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {stats.totalLinks} <span className="text-xs font-medium text-slate-400">links (รายการ)</span>
            </h3>
            <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium mt-1 flex items-center gap-1">
              <QrCode size={12} /> Dynamic QR & Short Link Tracking
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Link2 size={22} />
          </div>
        </div>

        {/* Total Clicks & Scans */}
        <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Clicks & Scans (ยอดคลิก & สแกนรวม)
            </p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {stats.totalClicks.toLocaleString()}{" "}
              <span className="text-xs font-medium text-slate-400">times (ครั้ง)</span>
            </h3>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> All channels traffic recorded
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <TrendingUp size={22} />
          </div>
        </div>

        {/* Unique Visitors */}
        <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Unique Visitors (ผู้ใช้งานไม่ซ้ำ)
            </p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {stats.totalUnique.toLocaleString()}{" "}
              <span className="text-xs font-medium text-slate-400">users (คน)</span>
            </h3>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              Deduplicated by device & IP fingerprint
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Smartphone size={22} />
          </div>
        </div>

        {/* Top Performing Link */}
        <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4.5 shadow-xs flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Top Link (ลิงก์ยอดนิยมสูงสุด)
            </p>
            <h3 className="text-base font-black text-slate-900 dark:text-white mt-1 truncate">
              {stats.topLink ? stats.topLink.title : "-"}
            </h3>
            <p className="text-[11px] text-purple-600 dark:text-purple-400 font-bold mt-1">
              {stats.topLink ? `${stats.topLink.totalClicks} clicks (คลิก)` : "No clicks yet"}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <Sparkles size={22} />
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
                placeholder="Search title, slug, or target URL... (ค้นหาลิงก์...)"
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

            {/* Channel Filter */}
            <select
              value={filterChannel}
              onChange={(e) => setFilterChannel(e.target.value)}
              className="text-xs font-semibold py-1.5 px-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-xl text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <option value="all">🌐 All Channels (ทุกช่องทาง)</option>
              <option value="standee">Store Standee (ป้ายหน้าร้าน)</option>
              <option value="flyer">Printed Flyer (ใบปลิว)</option>
              <option value="offline_qr">Offline QR (ป้ายออฟไลน์)</option>
              <option value="line">LINE OA (ไลน์)</option>
              <option value="facebook">Facebook (เฟซบุ๊ก)</option>
              <option value="tiktok">TikTok (ติ๊กต็อก)</option>
              <option value="instagram">Instagram (ไอจี)</option>
              <option value="sms">SMS Marketing</option>
              <option value="other">Other (อื่นๆ)</option>
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs font-semibold py-1.5 px-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-xl text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <option value="all">⚡ All Statuses (ทุกสถานะ)</option>
              <option value="active">Active (กำลังใช้งาน)</option>
              <option value="paused">Paused (ระงับชั่วคราว)</option>
            </select>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Refresh */}
            <button
              onClick={fetchLinks}
              disabled={isLoading}
              title="Refresh Data (รีเฟรชข้อมูล)"
              className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-xl"
            >
              <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
            </button>

            {/* Create New Link & QR Button */}
            <button
              onClick={handleOpenCreateModal}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-3.5 rounded-xl shadow-sm transition-all cursor-pointer"
            >
              <Plus size={16} />
              <span>Create Tracked Link & QR (สร้างลิงก์ & QR ใหม่)</span>
            </button>
          </div>
        </div>

        {/* Tip info bar */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 font-medium">
          <span>
            💡 <strong>Dynamic QR Code & Universal Link:</strong> ลิงก์ปลายทางสามารถเป็นเว็บไซต์ใดก็ได้ (LINE, FB, TikTok, ฟอร์ม ฯลฯ) และสามารถเข้ามาแก้ลิงก์ปลายทางได้ตลอดเวลาโดยไม่ต้องพิมพ์ QR Code ใหม่
          </span>
          <span className="font-mono text-slate-400">
            Base URL: {baseUrl || "domain/q/"}
          </span>
        </div>
      </div>

      {/* 3. TABLE OF TRACKED LINKS */}
      <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4 w-14 text-center">QR</th>
                <th className="py-3.5 px-4">Campaign Name & Channel (ชื่อแคมเปญ & ช่องทาง)</th>
                <th className="py-3.5 px-4">Tracked Short Link (ลิงก์สั้นสำหรับติดตาม)</th>
                <th className="py-3.5 px-4">Destination Target (ลิงก์ปลายทางจริง)</th>
                <th className="py-3.5 px-4 text-center">Clicks / Scans (ยอดคลิก/สแกน)</th>
                <th className="py-3.5 px-4">Status (สถานะ)</th>
                <th className="py-3.5 px-4 text-right">Actions (จัดการ)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLinks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No tracked links found matching criteria (ไม่พบรายการลิงก์ที่ตรงกับเงื่อนไข)
                  </td>
                </tr>
              ) : (
                filteredLinks.map((link) => {
                  const chan = CHANNEL_CONFIG[link.channel] || CHANNEL_CONFIG.other;
                  const brand = BRAND_CONFIG[link.brand] || BRAND_CONFIG.all;
                  const isCopied = copiedId === link.id;

                  return (
                    <tr
                      key={link.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      {/* Mini QR Icon / Thumbnail */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setQrExportLink(link)}
                          title="View & Download QR Code (ดูและดาวน์โหลด QR)"
                          className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer shadow-2xs mx-auto"
                        >
                          <QrCode size={20} />
                        </button>
                      </td>

                      {/* Title & Channel */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {link.title}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${brand.badge}`}>
                            {link.brand === "that_laundry_shop" ? "TLS" : link.brand === "noname_laundry" ? "Noname" : "All"}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${chan.badge}`}>
                            {chan.label}
                          </span>
                        </div>
                        {link.notes && (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5 font-normal">
                            {link.notes}
                          </p>
                        )}
                      </td>

                      {/* Short Tracked Link */}
                      <td className="py-3.5 px-4 font-mono">
                        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 w-fit">
                          <span className="text-indigo-600 dark:text-indigo-400 font-bold select-all">
                            /q/{link.slug}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyLink(link.slug, link.id)}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors cursor-pointer"
                            title="Copy full link (คัดลอกลิงก์เต็ม)"
                          >
                            {isCopied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                          </button>
                        </div>
                      </td>

                      {/* Target Destination URL */}
                      <td className="py-3.5 px-4 max-w-sm">
                        <a
                          href={link.targetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-mono text-[11px] truncate group"
                          title={link.targetUrl}
                        >
                          <span className="truncate">{link.targetUrl}</span>
                          <ExternalLink size={12} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      </td>

                      {/* Clicks / Scans Stats */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="font-mono font-black text-sm text-slate-900 dark:text-white">
                          {link.totalClicks.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium">
                          {link.uniqueClicks} unique (คน)
                        </div>
                      </td>

                      {/* Status Toggle */}
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(link)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors cursor-pointer ${
                            link.isActive
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${link.isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
                          {link.isActive ? "Active (ใช้งาน)" : "Paused (ระงับ)"}
                        </button>
                      </td>

                      {/* Action buttons */}
                      <td className="py-3.5 px-4 text-right space-x-1">
                        <button
                          type="button"
                          onClick={() => setAnalyticsLink(link)}
                          title="View Analytics & Logs (ดูสถิติและประวัติคลิก)"
                          className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <BarChart2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setQrExportLink(link)}
                          title="Download QR Code (ดาวน์โหลด QR)"
                          className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <QrCode size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(link)}
                          title="Edit Destination URL (แก้ไขลิงก์)"
                          className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLink(link.id)}
                          title="Delete Link (ลบลิงก์)"
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

      {/* 4. MODAL: CREATE / EDIT TRACKED LINK & QR */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              {editingLink ? <Edit3 size={18} className="text-indigo-600" /> : <Plus size={18} className="text-indigo-600" />}
              {editingLink ? "Edit Tracked Link & Destination (แก้ไขลิงก์ปลายทาง)" : "Create Tracked Link & QR (สร้างลิงก์ & QR Code ใหม่)"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Title */}
            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Campaign Name / Placement (ชื่อแคมเปญ / จุดที่นำไปวาง) <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={formValues.title}
                onChange={(e) => setFormValues({ ...formValues, title: e.target.value })}
                placeholder="e.g. ป้ายสแตนดี้หน้าร้านสาขาทองหล่อ or LINE Broadcast Summer Deal"
                className="mt-1"
              />
            </div>

            {/* Destination Target URL */}
            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Destination Target URL (ลิงก์ปลายทางที่ต้องการให้วิ่งไป) <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={formValues.targetUrl}
                onChange={(e) => setFormValues({ ...formValues, targetUrl: e.target.value })}
                placeholder="https://lin.ee/... or https://thatlaundryshop.com or https://facebook.com/..."
                className="mt-1 font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                🌐 สามารถใส่ได้ทุกเว็บไซต์ (LINE OA, เว็บไซต์ร้าน, เพจเฟซบุ๊ก, Google Form หรือ ลิงก์แผนที่)
              </p>
            </div>

            {/* Custom Slug & Live QR Preview */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-center gap-4">
              {/* QR Preview Canvas */}
              <div className="w-28 h-28 bg-white p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 shadow-xs">
                {modalQrUrl ? (
                  <img src={modalQrUrl} alt="QR Code Preview" className="w-full h-full object-contain" />
                ) : (
                  <QrCode size={36} className="text-slate-300" />
                )}
              </div>

              {/* Slug Input */}
              <div className="flex-1 space-y-2 w-full">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Custom Short Code / Slug (รหัสสั้นต่อท้าย URL)
                </Label>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    /q/
                  </span>
                  <Input
                    value={formValues.slug}
                    onChange={(e) => setFormValues({ ...formValues, slug: e.target.value })}
                    placeholder="e.g. thonglor-standee"
                    className="font-mono text-xs flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormValues({ ...formValues, slug: Math.random().toString(36).substring(2, 8) })}
                    className="text-xs shrink-0"
                    title="Generate random code"
                  >
                    Random (สุ่ม)
                  </Button>
                </div>
                <p className="text-[10px] text-slate-400">
                  เมื่อลูกค้าสแกน QR Code หรือคลิกลิงก์ จะวิ่งผ่าน <strong>{baseUrl || "/q/"}{formValues.slug || "code"}</strong> เพื่อบันทึกสถิติ ก่อนส่งต่อไปยังลิงก์ปลายทาง
                </p>
              </div>
            </div>

            {/* Row: Brand & Channel */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Brand / Store (แบรนด์/สาขา)
                </Label>
                <select
                  value={formValues.brand}
                  onChange={(e) => setFormValues({ ...formValues, brand: e.target.value as any })}
                  className="w-full mt-1 py-2 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
                >
                  <option value="that_laundry_shop">🧺 That Laundry Shop (TLS)</option>
                  <option value="noname_laundry">✨ Noname Laundry (โนเนม)</option>
                  <option value="all">🏢 All Brands (ทุกแบรนด์)</option>
                </select>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Channel / Placement (ช่องทางเผยแพร่)
                </Label>
                <select
                  value={formValues.channel}
                  onChange={(e) => setFormValues({ ...formValues, channel: e.target.value as any })}
                  className="w-full mt-1 py-2 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
                >
                  <option value="standee">Store Standee (ป้ายหน้าร้าน)</option>
                  <option value="flyer">Printed Flyer (ใบปลิวแจกลูกค้า)</option>
                  <option value="offline_qr">Offline QR / Sticker (สติกเกอร์ / นามบัตร)</option>
                  <option value="line">LINE OA (บรอดแคสต์ / Rich Menu)</option>
                  <option value="facebook">Facebook Post / Ads</option>
                  <option value="tiktok">TikTok Bio / Video</option>
                  <option value="instagram">Instagram Story / Bio</option>
                  <option value="sms">SMS Marketing</option>
                  <option value="other">Other (อื่นๆ)</option>
                </select>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Notes & Description (บันทึกหมายเหตุเพิ่มเติม)
              </Label>
              <textarea
                value={formValues.notes}
                onChange={(e) => setFormValues({ ...formValues, notes: e.target.value })}
                placeholder="ระบุจุดที่ติดป้าย, ช่วงเวลาที่วางแจก, หรือข้อมูลอ้างอิง..."
                rows={2}
                className="w-full mt-1 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              />
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between">
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
              <span>{editingLink ? "Save Changes (บันทึกการแก้ไข)" : "Create Link & QR (สร้างลิงก์และ QR)"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5. MODAL: QR CODE EXPORT & PRINT */}
      {qrExportLink && (
        <Dialog open={!!qrExportLink} onOpenChange={() => setQrExportLink(null)}>
          <DialogContent className="max-w-md text-center">
            <DialogHeader>
              <DialogTitle className="text-center font-bold text-base">
                Download QR Code (ดาวน์โหลด QR Code)
              </DialogTitle>
            </DialogHeader>

            <div className="py-4 flex flex-col items-center justify-center space-y-3">
              <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 dark:border-slate-700 shadow-md">
                {exportQrDataUrl ? (
                  <img
                    src={exportQrDataUrl}
                    alt="Export QR Code"
                    className="w-56 h-56 object-contain"
                  />
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center">
                    <RefreshCw size={32} className="animate-spin text-indigo-600" />
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  {qrExportLink.title}
                </h4>
                <p className="text-xs font-mono text-indigo-600 dark:text-indigo-400 mt-0.5">
                  {baseUrl}{qrExportLink.slug}
                </p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-xs truncate">
                  Target: {qrExportLink.targetUrl}
                </p>
              </div>
            </div>

            <DialogFooter className="flex items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQrExportLink(null)}
                className="text-xs"
              >
                Close (ปิด)
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => handleDownloadQrPng(qrExportLink, exportQrDataUrl)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Download size={14} /> Download PNG (ดาวน์โหลดรูปภาพ)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 6. MODAL: DETAILED ANALYTICS & CLICK LOGS */}
      {analyticsLink && (
        <Dialog open={!!analyticsLink} onOpenChange={() => setAnalyticsLink(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <BarChart2 size={18} className="text-indigo-600" />
                Analytics & Click History (สถิติการคลิกและอุปกรณ์)
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              {/* Campaign Header info */}
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    {analyticsLink.title}
                  </h4>
                  <p className="font-mono text-indigo-600 dark:text-indigo-400 text-xs mt-0.5">
                    {baseUrl}{analyticsLink.slug}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate mt-1">
                    Destination: {analyticsLink.targetUrl}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                    {analyticsLink.totalClicks.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">
                    Total Clicks ({analyticsLink.uniqueClicks} Unique)
                  </div>
                </div>
              </div>

              {/* Devices Breakdown */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Device Breakdown (สัดส่วนอุปกรณ์ที่สแกน/คลิก)
                </Label>
                {(() => {
                  const logs = analyticsLink.clickLogs || [];
                  const iosCount = logs.filter((l) => l.device === "ios").length;
                  const androidCount = logs.filter((l) => l.device === "android").length;
                  const desktopCount = logs.filter((l) => l.device === "desktop").length;
                  const otherCount = logs.length - iosCount - androidCount - desktopCount;
                  const total = logs.length || 1;

                  return (
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
                        <Smartphone size={16} className="mx-auto text-slate-600 mb-1" />
                        <div className="font-bold text-slate-800 dark:text-slate-200">Apple iOS</div>
                        <div className="text-xs text-indigo-600 font-mono font-bold mt-0.5">
                          {Math.round((iosCount / total) * 100)}% ({iosCount})
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
                        <Smartphone size={16} className="mx-auto text-emerald-600 mb-1" />
                        <div className="font-bold text-slate-800 dark:text-slate-200">Android</div>
                        <div className="text-xs text-emerald-600 font-mono font-bold mt-0.5">
                          {Math.round((androidCount / total) * 100)}% ({androidCount})
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
                        <Monitor size={16} className="mx-auto text-blue-600 mb-1" />
                        <div className="font-bold text-slate-800 dark:text-slate-200">Desktop / PC</div>
                        <div className="text-xs text-blue-600 font-mono font-bold mt-0.5">
                          {Math.round((desktopCount / total) * 100)}% ({desktopCount})
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Recent Click Logs Table */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Recent Click & Scan Activity (ประวัติการคลิกล่าสุด)
                </Label>
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-500">
                      <tr>
                        <th className="py-2 px-3">Time (เวลา)</th>
                        <th className="py-2 px-3">Device (อุปกรณ์)</th>
                        <th className="py-2 px-3">Referrer Source (แหล่งที่มา)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {analyticsLink.clickLogs && analyticsLink.clickLogs.length > 0 ? (
                        analyticsLink.clickLogs.slice(0, 30).map((log, idx) => (
                          <tr key={log.id || idx} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                              {format(new Date(log.timestamp), "dd/MM/yyyy HH:mm:ss")}
                            </td>
                            <td className="py-2 px-3 uppercase text-[10px] font-bold">
                              <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                                {log.device}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-[11px] text-slate-500 font-mono">
                              {log.referrer}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="py-6 text-center text-slate-400">
                            No clicks recorded yet (ยังไม่มีประวัติการคลิก)
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAnalyticsLink(null)}
                className="text-xs"
              >
                Close (ปิด)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

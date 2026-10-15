"use client";

import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { 
  Ticket, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  Search, 
  X, 
  RefreshCw, 
  Download, 
  TrendingUp, 
  DollarSign, 
  Users, 
  Layers, 
  Tag, 
  ExternalLink,
  Store,
  Check,
  AlertCircle
} from "lucide-react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  getPromotionReportAction, 
  getPromotionCampaignsAction,
  savePromotionCampaignAction 
} from "@/actions/db";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Calendar, Edit3 } from "lucide-react";
import { shopStore, type PromotionCampaign } from "@/lib/store";
import { useSyncExternalStore } from "react";

export function AdminPromotionReport() {
  const shops = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);

  // Filter States
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("promo_shoe100_oct26");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"redeemed" | "issued">("redeemed");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Data States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [reportData, setReportData] = useState<{
    stats: {
      totalIssued: number;
      totalCustomers: number;
      totalRedeemed: number;
      redemptionRate: number;
      activeRemaining: number;
      expiredOrVoid: number;
      totalDiscountGiven: number;
      totalSalesGenerated: number;
    };
    issuedList: any[];
    redeemedList: any[];
  }>({
    stats: {
      totalIssued: 0,
      totalCustomers: 0,
      totalRedeemed: 0,
      redemptionRate: 0,
      activeRemaining: 0,
      expiredOrVoid: 0,
      totalDiscountGiven: 0,
      totalSalesGenerated: 0,
    },
    issuedList: [],
    redeemedList: [],
  });

  // Load Campaigns
  useEffect(() => {
    getPromotionCampaignsAction().then((res) => {
      if (res.success && res.campaigns) {
        setCampaigns(res.campaigns);
        if (res.campaigns.length > 0 && !res.campaigns.some(c => c.id === selectedCampaignId)) {
          setSelectedCampaignId(res.campaigns[0].id);
        }
      }
    });
  }, []);

  // Fetch Report Data
  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const res = await getPromotionReportAction({
        campaignId: selectedCampaignId,
        branchId: selectedBranch,
      });
      if (res.success) {
        setReportData({
          stats: res.stats,
          issuedList: res.issuedList || [],
          redeemedList: res.redeemedList || [],
        });
      } else {
        toast.error(res.error || "ไม่สามารถโหลดข้อมูลรายงานโปรโมชั่นได้");
      }
    } catch (err: any) {
      console.error("Failed to load promotion report:", err);
      toast.error(err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [selectedCampaignId, selectedBranch]);

  // Selected Campaign Info
  const activeCampaign = useMemo(() => {
    return campaigns.find(c => c.id === selectedCampaignId);
  }, [campaigns, selectedCampaignId]);

  // Edit Campaign State & Handlers
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSavingCampaign, setIsSavingCampaign] = useState(false);
  const [editCampaignForm, setEditCampaignForm] = useState<{
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    startDate: string;
    endDate: string;
    rewardCouponExpiryDate: string;
    minOrderSubtotal: number;
    limitPerCustomer: number;
  } | null>(null);

  const handleOpenEditDialog = () => {
    if (!activeCampaign) return;
    setEditCampaignForm({
      id: activeCampaign.id,
      name: activeCampaign.name,
      description: activeCampaign.description,
      enabled: activeCampaign.enabled ?? true,
      startDate: activeCampaign.startDate ? activeCampaign.startDate.slice(0, 10) : "",
      endDate: activeCampaign.endDate ? activeCampaign.endDate.slice(0, 10) : "",
      rewardCouponExpiryDate: activeCampaign.rewardCouponExpiryDate ? activeCampaign.rewardCouponExpiryDate.slice(0, 10) : "",
      minOrderSubtotal: activeCampaign.conditions?.minOrderSubtotal ?? 1000,
      limitPerCustomer: activeCampaign.conditions?.limitPerCustomer ?? 1,
    });
    setIsEditDialogOpen(true);
  };

  const handleSaveCampaign = async () => {
    if (!editCampaignForm || !activeCampaign) return;
    setIsSavingCampaign(true);
    try {
      const updatedCampaign = {
        ...activeCampaign,
        name: editCampaignForm.name,
        description: editCampaignForm.description,
        enabled: editCampaignForm.enabled,
        startDate: editCampaignForm.startDate ? new Date(editCampaignForm.startDate + "T00:00:00.000Z").toISOString() : activeCampaign.startDate,
        endDate: editCampaignForm.endDate ? new Date(editCampaignForm.endDate + "T23:59:59.999Z").toISOString() : activeCampaign.endDate,
        rewardCouponExpiryDate: editCampaignForm.rewardCouponExpiryDate ? new Date(editCampaignForm.rewardCouponExpiryDate + "T23:59:59.999Z").toISOString() : activeCampaign.rewardCouponExpiryDate,
        conditions: {
          ...activeCampaign.conditions,
          minOrderSubtotal: Number(editCampaignForm.minOrderSubtotal) || 1000,
          limitPerCustomer: Number(editCampaignForm.limitPerCustomer) || 1,
        },
      };

      const res = await savePromotionCampaignAction(updatedCampaign);
      if (res.success) {
        toast.success("บันทึกการตั้งค่าแคมเปญเรียบร้อยแล้ว");
        setIsEditDialogOpen(false);
        const campRes = await getPromotionCampaignsAction();
        if (campRes.success && campRes.campaigns) {
          setCampaigns(campRes.campaigns);
        }
        fetchReport();
      } else {
        toast.error(res.error || "เกิดข้อผิดพลาดในการบันทึก");
      }
    } catch (e: any) {
      toast.error(`เกิดข้อผิดพลาด: ${e?.message || e}`);
    } finally {
      setIsSavingCampaign(false);
    }
  };

  // Filtered Redeemed List
  const filteredRedeemed = useMemo(() => {
    return reportData.redeemedList.filter(item => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        item.code?.toLowerCase().includes(q) ||
        item.customerName?.toLowerCase().includes(q) ||
        item.customerPhone?.includes(q) ||
        item.usedBillNo?.toLowerCase().includes(q)
      );
    });
  }, [reportData.redeemedList, searchQuery]);

  // Filtered Issued List
  const filteredIssued = useMemo(() => {
    return reportData.issuedList.filter(item => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        item.code?.toLowerCase().includes(q) ||
        item.customerName?.toLowerCase().includes(q) ||
        item.customerPhone?.includes(q) ||
        item.sourceBillNo?.toLowerCase().includes(q) ||
        item.usedBillNo?.toLowerCase().includes(q)
      );
    });
  }, [reportData.issuedList, statusFilter, searchQuery]);

  // Resolve Branch Name Helper
  const getBranchName = (branchId?: string | null) => {
    if (!branchId) return "-";
    const shop = shops.find(s => s.id === branchId);
    return shop ? shop.name : branchId;
  };

  // Export CSV
  const handleExportCSV = () => {
    const isRedeemedTab = activeTab === "redeemed";
    const headers = isRedeemedTab
      ? ["Used Date", "Coupon Code", "Customer Name", "Phone", "Used Bill No", "Shoe Items", "Order Total (THB)", "Discount (THB)", "Branch", "Cashier"]
      : ["Issued Date", "Coupon Code", "Customer Name", "Phone", "Source Bill No", "Source Amount (THB)", "Status", "Expiry Date", "Used Bill No", "Discount Used (THB)"];

    const rows = isRedeemedTab
      ? filteredRedeemed.map(r => [
          r.usedAt ? format(new Date(r.usedAt), "yyyy-MM-dd HH:mm") : "-",
          r.code,
          `"${r.customerName || ""}"`,
          `'${r.customerPhone || ""}`,
          r.usedBillNo || "-",
          `"${r.shoeItemsSummary || ""}"`,
          r.usedJobTotal ?? 0,
          r.discountAmountUsed ?? 0,
          `"${getBranchName(r.usedBranchId)}"`,
          `"${r.cashier || "-"}"`,
        ])
      : filteredIssued.map(r => [
          r.issuedAt ? format(new Date(r.issuedAt), "yyyy-MM-dd HH:mm") : "-",
          r.code,
          `"${r.customerName || ""}"`,
          `'${r.customerPhone || ""}`,
          r.sourceBillNo || "-",
          r.sourceJobAmount ?? 0,
          r.status,
          r.expiryDate ? format(new Date(r.expiryDate), "yyyy-MM-dd") : "-",
          r.usedBillNo || "-",
          r.discountAmountUsed ?? 0,
        ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `promotion_report_${selectedCampaignId}_${format(new Date(), "yyyyMMdd_HHmm")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("ส่งออกไฟล์ CSV เรียบร้อยแล้ว");
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Filter Selector */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-gradient-to-r from-indigo-900/10 via-amber-500/10 to-emerald-500/10 p-5 rounded-2xl border border-indigo-200/50 dark:border-indigo-900/50">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-600 text-white shadow-sm">
              <TrendingUp size={20} />
            </span>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Promotion Performance Report
                <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 font-bold text-[10px]">
                  ซักครบ 1,000 รับวอยเชอร์ซักรองเท้า 100.-
                </Badge>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                ติดตามสถิติการแจกวอยเชอร์ ยอดการนำมาใช้จริง (Conversion Rate) และรายได้ที่เกิดขึ้น
              </p>
            </div>
          </div>
        </div>

        {/* Campaign & Branch Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Campaign Selector */}
          <select
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="h-9 px-3 text-xs font-bold rounded-xl border border-border bg-background text-foreground shadow-2xs cursor-pointer"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Branch Selector */}
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="h-9 px-3 text-xs font-bold rounded-xl border border-border bg-background text-foreground shadow-2xs cursor-pointer"
          >
            <option value="all">ทุกสาขา (All Branches)</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Action Buttons */}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchReport}
            disabled={isLoading}
            className="h-9 px-3 text-xs font-bold rounded-xl gap-1.5"
          >
            <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
            <span>รีเฟรช</span>
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleExportCSV}
            className="h-9 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl gap-1.5 shadow-2xs"
          >
            <Download size={13} />
            <span>ส่งออก CSV</span>
          </Button>
        </div>
      </div>

      {/* Campaign Details Info Bar */}
      {activeCampaign && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border text-xs text-muted-foreground">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="font-semibold text-foreground">
              เงื่อนไข: ยอดซักครบ ฿{activeCampaign.conditions?.minOrderSubtotal?.toLocaleString()} (ไม่รวมค่าส่ง)
            </span>
            <span>•</span>
            <span>
              ระยะเวลาแจก: {activeCampaign.startDate?.slice(0, 10)} ถึง <strong className="text-amber-600 font-bold">{activeCampaign.endDate?.slice(0, 10)}</strong>
            </span>
            <span>•</span>
            <span>
              วอยเชอร์ใช้ได้ถึง: <strong className="text-emerald-600 font-bold">{activeCampaign.rewardCouponExpiryDate?.slice(0, 10)}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-bold text-[10px]">
              {activeCampaign.conditions?.limitPerCustomer ? `จำกัด ${activeCampaign.conditions.limitPerCustomer} สิทธิ์/ท่าน` : "ไม่จำกัดสิทธิ์"}
            </Badge>
            <Badge variant="outline" className="font-bold text-[10px] text-blue-600 border-blue-200">
              เฉพาะหมวดซักรองเท้า (SHOES)
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenEditDialog}
              className="h-6 px-2 text-[11px] font-bold gap-1 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer shadow-none"
            >
              <Edit3 size={11} />
              <span>แก้ไขแคมเปญ</span>
            </Button>
          </div>
        </div>
      )}

      {/* 2. Key Metric KPI Cards (6 Cards) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Issued */}
        <div className="bg-card border rounded-2xl p-3.5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-bold uppercase tracking-wider">แจกไปทั้งหมด</span>
            <Ticket size={16} className="text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-foreground">
            {reportData.stats.totalIssued}
            <span className="text-xs font-medium text-muted-foreground ml-1">ใบ</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            แจกให้ลูกค้า <strong className="text-foreground">{reportData.stats.totalCustomers}</strong> ท่าน
          </p>
        </div>

        {/* Total Redeemed */}
        <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-3.5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">นำมาใช้แล้ว</span>
            <CheckCircle2 size={16} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
            {reportData.stats.totalRedeemed}
            <span className="text-xs font-medium text-emerald-600/70 ml-1">ใบ</span>
          </div>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
            มีลูกค้ากลับมาใช้จริง
          </p>
        </div>

        {/* Conversion Rate */}
        <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-2xl p-3.5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-blue-700 dark:text-blue-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Conversion Rate</span>
            <TrendingUp size={16} className="text-blue-500" />
          </div>
          <div className="text-2xl font-black text-blue-700 dark:text-blue-400">
            {reportData.stats.redemptionRate.toFixed(1)}%
          </div>
          <p className="text-[10px] text-blue-600/80">
            อัตราการนำวอยเชอร์มาใช้
          </p>
        </div>

        {/* Active Remaining */}
        <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-3.5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-amber-700 dark:text-amber-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">คงเหลือยังไม่ใช้</span>
            <Clock size={16} className="text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-700 dark:text-amber-400">
            {reportData.stats.activeRemaining}
            <span className="text-xs font-medium text-amber-600/70 ml-1">ใบ</span>
          </div>
          <p className="text-[10px] text-amber-600/80">
            ใช้ได้ถึง 31 ธ.ค. 2026
          </p>
        </div>

        {/* Total Discount Given */}
        <div className="bg-card border rounded-2xl p-3.5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-bold uppercase tracking-wider">ส่วนลดที่ให้ไป</span>
            <Tag size={16} className="text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
            ฿{reportData.stats.totalDiscountGiven.toLocaleString()}
          </div>
          <p className="text-[10px] text-muted-foreground">
            งบส่วนลดที่ใช้จริง
          </p>
        </div>

        {/* Total Sales Generated */}
        <div className="bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50 rounded-2xl p-3.5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-purple-700 dark:text-purple-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">ยอดขายที่เกิดจากวอยเชอร์</span>
            <DollarSign size={16} className="text-purple-500" />
          </div>
          <div className="text-2xl font-black text-purple-700 dark:text-purple-400">
            ฿{reportData.stats.totalSalesGenerated.toLocaleString()}
          </div>
          <p className="text-[10px] text-purple-600/80">
            รายได้รวมจากบิลที่ใช้วอยเชอร์
          </p>
        </div>
      </div>

      {/* 3. Tab Switcher & Table Controls */}
      <div className="bg-card border rounded-2xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b pb-3">
          {/* Tab buttons */}
          <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl">
            <button
              type="button"
              onClick={() => { setActiveTab("redeemed"); setSearchQuery(""); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "redeemed"
                  ? "bg-background text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              รายการที่นำมาใช้แล้ว ({reportData.redeemedList.length})
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab("issued"); setSearchQuery(""); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "issued"
                  ? "bg-background text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              วอยเชอร์ที่แจกทั้งหมด ({reportData.issuedList.length})
            </button>
          </div>

          {/* Search bar & status filter */}
          <div className="flex items-center gap-2 flex-1 sm:max-w-md">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="ค้นหารหัสวอยเชอร์, ชื่อลูกค้า, เบอร์โทร, เลขบิล..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs rounded-xl"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {activeTab === "issued" && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 px-2 text-xs font-bold rounded-xl border border-border bg-background text-foreground cursor-pointer shrink-0"
              >
                <option value="all">สถานะทั้งหมด</option>
                <option value="ACTIVE">Active (พร้อมใช้)</option>
                <option value="USED">Used (ใช้แล้ว)</option>
                <option value="EXPIRED">Expired (หมดอายุ)</option>
                <option value="VOID">Void (ยกเลิก)</option>
              </select>
            )}
          </div>
        </div>

        {/* 4. Tab 1: Redeemed History Table */}
        {activeTab === "redeemed" && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[11px] font-bold">วันที่ใช้งาน</TableHead>
                  <TableHead className="text-[11px] font-bold">รหัสวอยเชอร์</TableHead>
                  <TableHead className="text-[11px] font-bold">ลูกค้า</TableHead>
                  <TableHead className="text-[11px] font-bold">เลขที่บิล</TableHead>
                  <TableHead className="text-[11px] font-bold">บริการซักรองเท้า</TableHead>
                  <TableHead className="text-[11px] font-bold text-right">ยอดรวมบิล</TableHead>
                  <TableHead className="text-[11px] font-bold text-right">ส่วนลด</TableHead>
                  <TableHead className="text-[11px] font-bold">สาขา</TableHead>
                  <TableHead className="text-[11px] font-bold">แคชเชียร์</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRedeemed.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground text-xs">
                      {isLoading ? "กำลังโหลดข้อมูล..." : "ยังไม่มีรายการนำวอยเชอร์มาใช้"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRedeemed.map((r) => (
                    <TableRow key={r.id} className="text-xs">
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {r.usedAt ? format(new Date(r.usedAt), "dd/MM/yyyy HH:mm") : "-"}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                          {r.code}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="font-bold text-foreground">{r.customerName}</div>
                        <div className="text-[11px] text-muted-foreground">{r.customerPhone}</div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          #{r.usedBillNo}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-[11px] text-muted-foreground" title={r.shoeItemsSummary}>
                        👟 {r.shoeItemsSummary}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ฿{Number(r.usedJobTotal || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-black text-rose-600 dark:text-rose-400">
                        -฿{Number(r.discountAmountUsed || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="outline" className="text-[10px] font-medium">
                          {getBranchName(r.usedBranchId)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap text-[11px]">
                        {r.cashier}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* 5. Tab 2: Issued List Table */}
        {activeTab === "issued" && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[11px] font-bold">วันที่แจก</TableHead>
                  <TableHead className="text-[11px] font-bold">รหัสวอยเชอร์</TableHead>
                  <TableHead className="text-[11px] font-bold">ลูกค้า</TableHead>
                  <TableHead className="text-[11px] font-bold">บิลต้นทางที่ได้สิทธิ์</TableHead>
                  <TableHead className="text-[11px] font-bold">วันหมดอายุ</TableHead>
                  <TableHead className="text-[11px] font-bold">สถานะ</TableHead>
                  <TableHead className="text-[11px] font-bold">การนำไปใช้</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIssued.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-xs">
                      {isLoading ? "กำลังโหลดข้อมูล..." : "ไม่พบวอยเชอร์ที่ตรงกับเงื่อนไขการค้นหา"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredIssued.map((c) => {
                    const isUsed = c.status === "USED";
                    const isExpired = c.status === "EXPIRED";
                    const isVoid = c.status === "VOID";

                    return (
                      <TableRow key={c.id} className="text-xs">
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {c.issuedAt ? format(new Date(c.issuedAt), "dd/MM/yyyy HH:mm") : "-"}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono font-bold text-foreground">
                            {c.code}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-foreground">{c.customerName}</div>
                          <div className="text-[11px] text-muted-foreground">{c.customerPhone}</div>
                        </TableCell>
                        <TableCell>
                          {c.sourceBillNo ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                                #{c.sourceBillNo}
                              </span>
                              {c.sourceJobAmount != null && (
                                <span className="text-[11px] text-muted-foreground">
                                  (฿{Number(c.sourceJobAmount).toLocaleString()})
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {c.expiryDate ? format(new Date(c.expiryDate), "dd/MM/yyyy") : "-"}
                        </TableCell>
                        <TableCell>
                          {isUsed ? (
                            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                              ใช้งานแล้ว
                            </Badge>
                          ) : isExpired ? (
                            <Badge variant="outline" className="text-muted-foreground border-border text-[10px]">
                              หมดอายุ
                            </Badge>
                          ) : isVoid ? (
                            <Badge variant="outline" className="text-rose-600 border-rose-300 text-[10px]">
                              ยกเลิก
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                              พร้อมใช้งาน
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {isUsed ? (
                            <div className="text-[11px]">
                              <span className="text-muted-foreground">ใช้ที่บิล </span>
                              <strong className="text-indigo-600 dark:text-indigo-400 font-mono">#{c.usedBillNo}</strong>
                              <span className="text-rose-600 font-bold ml-1">(-฿{c.discountAmountUsed ?? c.discountValue})</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">ยังไม่ได้ใช้</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Edit Campaign Modal */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md p-6 bg-card border border-border shadow-2xl rounded-2xl">
          <DialogHeader className="border-b pb-3 mb-4">
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <Calendar className="text-primary" size={18} />
              แก้ไขเงื่อนไข & ระยะเวลาแคมเปญ
            </DialogTitle>
          </DialogHeader>

          {editCampaignForm && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs font-bold mb-1.5 block">ชื่อแคมเปญ</Label>
                <Input
                  value={editCampaignForm.name}
                  onChange={(e) => setEditCampaignForm({ ...editCampaignForm, name: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">
                    📅 วันที่เริ่มแจก
                  </Label>
                  <Input
                    type="date"
                    value={editCampaignForm.startDate}
                    onChange={(e) => setEditCampaignForm({ ...editCampaignForm, startDate: e.target.value })}
                    className="h-9 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">เริ่มแจกวอยเชอร์ตั้งแต่ 00:00 น.</p>
                </div>
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">
                    🏁 วันสุดท้ายที่แจก
                  </Label>
                  <Input
                    type="date"
                    value={editCampaignForm.endDate}
                    onChange={(e) => setEditCampaignForm({ ...editCampaignForm, endDate: e.target.value })}
                    className="h-9 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">แจกถึง 23:59 น. ของวันนั้น</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">
                    ⏳ วอยเชอร์ใช้ได้ถึงวันที่
                  </Label>
                  <Input
                    type="date"
                    value={editCampaignForm.rewardCouponExpiryDate}
                    onChange={(e) => setEditCampaignForm({ ...editCampaignForm, rewardCouponExpiryDate: e.target.value })}
                    className="h-9 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">วันหมดอายุของวอยเชอร์ที่ลูกค้าได้</p>
                </div>
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">
                    💰 ยอดซักขั้นต่ำ (฿)
                  </Label>
                  <Input
                    type="number"
                    value={editCampaignForm.minOrderSubtotal}
                    onChange={(e) => setEditCampaignForm({ ...editCampaignForm, minOrderSubtotal: Number(e.target.value) || 0 })}
                    className="h-9 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">ไม่รวมค่าจัดส่ง</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/30">
                <div>
                  <span className="text-xs font-bold block">สถานะแคมเปญ</span>
                  <span className="text-[11px] text-muted-foreground">เปิดหรือปิดการแจกวอยเชอร์</span>
                </div>
                <input
                  type="checkbox"
                  checked={editCampaignForm.enabled}
                  onChange={(e) => setEditCampaignForm({ ...editCampaignForm, enabled: e.target.checked })}
                  className="w-4 h-4 accent-primary cursor-pointer"
                />
              </div>
            </div>
          )}

          <DialogFooter className="mt-5 pt-3 border-t flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditDialogOpen(false)}
              className="text-xs font-bold"
            >
              ยกเลิก
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSaveCampaign}
              disabled={isSavingCampaign}
              className="text-xs font-bold bg-primary text-primary-foreground gap-1.5"
            >
              {isSavingCampaign ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

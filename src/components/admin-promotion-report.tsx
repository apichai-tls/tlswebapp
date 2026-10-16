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
  AlertCircle,
  Calendar,
  Power,
  Percent,
  Truck,
  Gift
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
import { shopStore } from "@/lib/store";
import { 
  type PromotionCampaign, 
  PROMO_SERVICE_CATEGORIES, 
  getCategoryLabel, 
  getCategoryIcon 
} from "@/lib/promotions";
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

  const handleToggleEnableCampaign = async (campaign: PromotionCampaign) => {
    try {
      const updated = { ...campaign, enabled: !campaign.enabled };
      const res = await savePromotionCampaignAction(updated);
      if (res.success && res.campaigns) {
        setCampaigns(res.campaigns);
        toast.success(`เปลี่ยนสถานะแคมเปญ "${campaign.name}" เป็น ${updated.enabled ? "เปิดใช้งาน" : "ปิดใช้งาน"} เรียบร้อย`);
      } else {
        toast.error(res.error || "ไม่สามารถเปลี่ยนสถานะแคมเปญได้");
      }
    } catch (e: any) {
      toast.error(e?.message || "เกิดข้อผิดพลาด");
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
                  {activeCampaign?.name || "Campaign Report"}
                </Badge>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Track voucher issuance, conversion rates, and voucher-driven revenue (ติดตามสถิติการแจกวอยเชอร์ ยอดการนำมาใช้จริง และรายได้ที่เกิดขึ้น)
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
            <option value="all">All Branches (ทุกสาขา)</option>
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
            <span>Refresh <span className="text-[10px] text-muted-foreground font-normal">(รีเฟรช)</span></span>
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleExportCSV}
            className="h-9 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl gap-1.5 shadow-2xs"
          >
            <Download size={13} />
            <span>Export CSV <span className="text-[10px] text-emerald-100 font-normal">(ส่งออก)</span></span>
          </Button>
        </div>
      </div>

      {/* Campaign Details Info Bar */}
      {activeCampaign && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-card border text-xs text-muted-foreground shadow-2xs">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => handleToggleEnableCampaign(activeCampaign)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black border transition-all cursor-pointer ${
                activeCampaign.enabled
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:bg-slate-200"
              }`}
              title="Click to toggle campaign status (คลิกเพื่อเปิด/ปิดแคมเปญนี้)"
            >
              <Power size={11} className={activeCampaign.enabled ? "text-emerald-500" : "text-slate-400"} />
              <span>{activeCampaign.enabled ? "Active (เปิดแจกอยู่)" : "Paused (ปิดชั่วคราว)"}</span>
            </button>

            <span className="font-bold text-foreground">
              Min Spend: ฿{activeCampaign.conditions?.minOrderSubtotal?.toLocaleString()} {activeCampaign.conditions?.excludeDeliveryFee !== false ? "(Excl. delivery / ไม่รวมค่าส่ง)" : "(Incl. delivery / รวมค่าส่ง)"}
            </span>
            <span>•</span>
            <span>
              Period: {activeCampaign.startDate?.slice(0, 10)} to <strong className="text-amber-600 dark:text-amber-400 font-bold">{activeCampaign.endDate?.slice(0, 10)}</strong> <span className="text-[10px] text-muted-foreground">(ระยะเวลาแจก)</span>
            </span>
            <span>•</span>
            <span>
              Expiry: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{activeCampaign.rewardCouponExpiryDate?.slice(0, 10)}</strong> <span className="text-[10px] text-muted-foreground">(หมดอายุ)</span>
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="font-bold text-[10px]">
              {activeCampaign.conditions?.limitPerCustomer ? `Limit ${activeCampaign.conditions.limitPerCustomer} / Cust (จำกัด 1 สิทธิ์)` : "No Limit (ไม่จำกัด)"}
            </Badge>

            <Badge variant="outline" className="font-bold text-[10px] text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/30">
              {getCategoryIcon(activeCampaign.reward?.applicableCategory)} {getCategoryLabel(activeCampaign.reward?.applicableCategory, "en")} <span className="opacity-75 ml-1">({getCategoryLabel(activeCampaign.reward?.applicableCategory, "th")})</span>
            </Badge>

            <Badge variant="outline" className="font-bold text-[10px] text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30">
              {activeCampaign.reward?.discountType === "PERCENTAGE" 
                ? `${activeCampaign.reward?.discountValue}% OFF (ลด ${activeCampaign.reward?.discountValue}%)` 
                : activeCampaign.reward?.discountType === "FREE_DELIVERY"
                  ? "Free Delivery (ส่งฟรี)"
                  : `฿${activeCampaign.reward?.discountValue} OFF (ลด ฿${activeCampaign.reward?.discountValue})`}
            </Badge>
            {activeCampaign.conditions?.excludeMember && (
              <Badge variant="outline" className="font-bold text-[10px] text-rose-600 border-rose-200 bg-rose-50/50">
                Excl. Member (ยกเว้นสมาชิก)
              </Badge>
            )}
            {activeCampaign.conditions?.excludeVIP && (
              <Badge variant="outline" className="font-bold text-[10px] text-rose-600 border-rose-200 bg-rose-50/50">
                Excl. VIP (ยกเว้น VIP)
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* 2. Key Metric KPI Cards (6 Cards) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Issued */}
        <div className="bg-card border rounded-2xl p-3.5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider block">Total Issued</span>
              <span className="text-[9px] text-muted-foreground font-normal">แจกไปทั้งหมด</span>
            </div>
            <Ticket size={16} className="text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-foreground pt-0.5">
            {reportData.stats.totalIssued}
            <span className="text-xs font-medium text-muted-foreground ml-1">Vouchers (ใบ)</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Issued to <strong className="text-foreground">{reportData.stats.totalCustomers}</strong> customers <span className="opacity-80">({reportData.stats.totalCustomers} ท่าน)</span>
          </p>
        </div>

        {/* Total Redeemed */}
        <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-3.5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider block">Redeemed</span>
              <span className="text-[9px] text-emerald-600/80 font-normal">นำมาใช้แล้ว</span>
            </div>
            <CheckCircle2 size={16} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 pt-0.5">
            {reportData.stats.totalRedeemed}
            <span className="text-xs font-medium text-emerald-600/70 ml-1">Vouchers (ใบ)</span>
          </div>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
            Returned customers (ลูกค้ากลับมาใช้จริง)
          </p>
        </div>

        {/* Conversion Rate */}
        <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-2xl p-3.5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-blue-700 dark:text-blue-400">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider block">Conversion Rate</span>
              <span className="text-[9px] text-blue-600/80 font-normal">อัตราการใช้</span>
            </div>
            <TrendingUp size={16} className="text-blue-500" />
          </div>
          <div className="text-2xl font-black text-blue-700 dark:text-blue-400 pt-0.5">
            {reportData.stats.redemptionRate.toFixed(1)}%
          </div>
          <p className="text-[10px] text-blue-600/80">
            Redemption rate (อัตราการนำมาใช้จริง)
          </p>
        </div>

        {/* Active Remaining */}
        <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-3.5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-amber-700 dark:text-amber-400">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider block">Outstanding</span>
              <span className="text-[9px] text-amber-600/80 font-normal">คงเหลือยังไม่ใช้</span>
            </div>
            <Clock size={16} className="text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-700 dark:text-amber-400 pt-0.5">
            {reportData.stats.activeRemaining}
            <span className="text-xs font-medium text-amber-600/70 ml-1">Vouchers (ใบ)</span>
          </div>
          <p className="text-[10px] text-amber-600/80">
            Valid until {activeCampaign?.rewardCouponExpiryDate ? activeCampaign.rewardCouponExpiryDate.slice(0, 10) : "31 Dec 2026"} (ใช้ได้ถึง)
          </p>
        </div>

        {/* Total Discount Given */}
        <div className="bg-card border rounded-2xl p-3.5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider block">Total Discount Given</span>
              <span className="text-[9px] text-muted-foreground font-normal">ส่วนลดที่ให้ไป</span>
            </div>
            <Tag size={16} className="text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 pt-0.5">
            ฿{reportData.stats.totalDiscountGiven.toLocaleString()}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Budget spent (งบส่วนลดที่ใช้จริง)
          </p>
        </div>

        {/* Total Sales Generated */}
        <div className="bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50 rounded-2xl p-3.5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-purple-700 dark:text-purple-400">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider block">Voucher Revenue</span>
              <span className="text-[9px] text-purple-600/80 font-normal">ยอดขายจากวอยเชอร์</span>
            </div>
            <DollarSign size={16} className="text-purple-500" />
          </div>
          <div className="text-2xl font-black text-purple-700 dark:text-purple-400 pt-0.5">
            ฿{reportData.stats.totalSalesGenerated.toLocaleString()}
          </div>
          <p className="text-[10px] text-purple-600/80">
            Total sales generated (รายได้รวมจากบิล)
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
              Redeemed Vouchers ({reportData.redeemedList.length}) <span className="font-normal text-[10px] opacity-80">• นำมาใช้แล้ว</span>
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
              All Issued Vouchers ({reportData.issuedList.length}) <span className="font-normal text-[10px] opacity-80">• แจกทั้งหมด</span>
            </button>
          </div>

          {/* Search bar & status filter */}
          <div className="flex items-center gap-2 flex-1 sm:max-w-md">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search voucher code, customer, phone, bill no... (ค้นหา)"
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
                <option value="all">All Statuses (สถานะทั้งหมด)</option>
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
                  <TableHead className="text-[11px] font-bold">
                    <span>Used Date</span>
                    <span className="block text-[9px] text-muted-foreground font-normal">วันที่ใช้งาน</span>
                  </TableHead>
                  <TableHead className="text-[11px] font-bold">
                    <span>Voucher Code</span>
                    <span className="block text-[9px] text-muted-foreground font-normal">รหัสวอยเชอร์</span>
                  </TableHead>
                  <TableHead className="text-[11px] font-bold">
                    <span>Customer</span>
                    <span className="block text-[9px] text-muted-foreground font-normal">ลูกค้า</span>
                  </TableHead>
                  <TableHead className="text-[11px] font-bold">
                    <span>Bill No.</span>
                    <span className="block text-[9px] text-muted-foreground font-normal">เลขที่บิล</span>
                  </TableHead>
                  <TableHead className="text-[11px] font-bold">
                    <span>Service Items</span>
                    <span className="block text-[9px] text-muted-foreground font-normal">รายการบริการ</span>
                  </TableHead>
                  <TableHead className="text-[11px] font-bold text-right">
                    <span>Order Total</span>
                    <span className="block text-[9px] text-muted-foreground font-normal">ยอดรวมบิล</span>
                  </TableHead>
                  <TableHead className="text-[11px] font-bold text-right">
                    <span>Discount</span>
                    <span className="block text-[9px] text-muted-foreground font-normal">ส่วนลด</span>
                  </TableHead>
                  <TableHead className="text-[11px] font-bold">
                    <span>Branch</span>
                    <span className="block text-[9px] text-muted-foreground font-normal">สาขา</span>
                  </TableHead>
                  <TableHead className="text-[11px] font-bold">
                    <span>Cashier</span>
                    <span className="block text-[9px] text-muted-foreground font-normal">แคชเชียร์</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRedeemed.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground text-xs">
                      {isLoading ? "Loading report data... (กำลังโหลดข้อมูล)" : "No redeemed vouchers found (ยังไม่มีรายการนำวอยเชอร์มาใช้)"}
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
                  <TableHead className="text-[11px] font-bold">
                    <span>Issued Date</span>
                    <span className="block text-[9px] text-muted-foreground font-normal">วันที่แจก</span>
                  </TableHead>
                  <TableHead className="text-[11px] font-bold">
                    <span>Voucher Code</span>
                    <span className="block text-[9px] text-muted-foreground font-normal">รหัสวอยเชอร์</span>
                  </TableHead>
                  <TableHead className="text-[11px] font-bold">
                    <span>Customer</span>
                    <span className="block text-[9px] text-muted-foreground font-normal">ลูกค้า</span>
                  </TableHead>
                  <TableHead className="text-[11px] font-bold">
                    <span>Source Bill</span>
                    <span className="block text-[9px] text-muted-foreground font-normal">บิลต้นทางที่ได้สิทธิ์</span>
                  </TableHead>
                  <TableHead className="text-[11px] font-bold">
                    <span>Expiry Date</span>
                    <span className="block text-[9px] text-muted-foreground font-normal">วันหมดอายุ</span>
                  </TableHead>
                  <TableHead className="text-[11px] font-bold">
                    <span>Status</span>
                    <span className="block text-[9px] text-muted-foreground font-normal">สถานะ</span>
                  </TableHead>
                  <TableHead className="text-[11px] font-bold">
                    <span>Usage</span>
                    <span className="block text-[9px] text-muted-foreground font-normal">การนำไปใช้</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIssued.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-xs">
                      {isLoading ? "Loading report data... (กำลังโหลดข้อมูล)" : "No vouchers matching your search (ไม่พบวอยเชอร์ที่ตรงกับเงื่อนไขการค้นหา)"}
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
                              Used (ใช้แล้ว)
                            </Badge>
                          ) : isExpired ? (
                            <Badge variant="outline" className="text-muted-foreground border-border text-[10px]">
                              Expired (หมดอายุ)
                            </Badge>
                          ) : isVoid ? (
                            <Badge variant="outline" className="text-rose-600 border-rose-300 text-[10px]">
                              Void (ยกเลิก)
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                              Active (พร้อมใช้)
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {isUsed ? (
                            <div className="text-[11px]">
                              <span className="text-muted-foreground">Used in </span>
                              <strong className="text-indigo-600 dark:text-indigo-400 font-mono">#{c.usedBillNo}</strong>
                              <span className="text-rose-600 font-bold ml-1">(-฿{c.discountAmountUsed ?? c.discountValue})</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">Not used yet (ยังไม่ได้ใช้)</span>
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
    </div>
  );
}

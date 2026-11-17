"use client";

import React, { useState, useEffect, useMemo, useSyncExternalStore } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart3,
  Download,
  Search,
  Users,
  ShoppingBag,
  Banknote,
  CheckCircle2,
  Clock,
  X,
} from "lucide-react";
import { jobStore, shopStore } from "@/lib/store";
import { getPromotionCampaignsAction } from "@/actions/db";
import {
  type PromotionCampaign,
  DEFAULT_PROMOTION_CAMPAIGNS,
  cartHasWinterBeddingPromo,
  WINTER_BEDDING_CAMPAIGN_ID,
  WINTER_BEDDING_PROMO_CODE,
} from "@/lib/promotions";

interface AdminPromoReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PromoOrderRow {
  jobId: string;
  billNo: string;
  createdAt: string;
  dateBkk: string;
  customerKey: string;
  customerName: string;
  customerPhone: string;
  branchId: string;
  branchName: string;
  promoTags: string[];
  promoLabel: string;
  paymentChannel: string;
  isPaid: boolean;
  totalAmount: number;
  createdBy: string;
}

export function AdminPromoReportModal({
  open,
  onOpenChange,
}: AdminPromoReportModalProps) {
  const jobs = useSyncExternalStore(jobStore.subscribe, jobStore.getSnapshot, jobStore.getSnapshot);
  const branches = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);

  const [campaigns, setCampaigns] = useState<PromotionCampaign[]>(DEFAULT_PROMOTION_CAMPAIGNS);
  const [selectedFilter, setSelectedFilter] = useState<string>(WINTER_BEDDING_CAMPAIGN_ID);
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    getPromotionCampaignsAction()
      .then((res) => {
        if (res.success && Array.isArray(res.campaigns) && res.campaigns.length > 0) {
          setCampaigns(res.campaigns);
        }
      })
      .catch(() => {});
  }, [open]);

  const branchNameMap = useMemo(() => {
    const map = new Map<string, string>();
    branches.forEach((b) => map.set(b.id, b.name));
    return map;
  }, [branches]);

  const promoRows = useMemo<PromoOrderRow[]>(() => {
    const rows: PromoOrderRow[] = [];
    for (const job of jobs) {
      if (!job || job.status === "cancel") continue;

      let jobItems: any[] = [];
      if (Array.isArray(job.items)) {
        jobItems = job.items;
      } else if (job.itemsJson) {
        try {
          const parsed = JSON.parse(job.itemsJson);
          if (Array.isArray(parsed)) jobItems = parsed;
        } catch {}
      }

      const hasWinterBedding = cartHasWinterBeddingPromo(jobItems);
      const promoMatch = job.remark?.match(/Promo:\s*([^\s(|]+)/i);
      const promoCode = promoMatch ? promoMatch[1].trim().toUpperCase() : "";

      if (!hasWinterBedding && !promoCode) continue;

      const tags: string[] = [];
      const labels: string[] = [];

      if (hasWinterBedding) {
        tags.push(WINTER_BEDDING_CAMPAIGN_ID, WINTER_BEDDING_PROMO_CODE);
        labels.push("Winter Bedding Set (฿899)");
      }
      if (promoCode) {
        tags.push(promoCode);
        const matchedCamp = campaigns.find(
          (c) => (c.instantRule?.promoCode || c.reward?.codePrefix || "").toUpperCase() === promoCode
        );
        if (matchedCamp) {
          tags.push(matchedCamp.id);
          labels.push(`${matchedCamp.name} (${promoCode})`);
        } else {
          tags.push("COUPON_CODE");
          labels.push(`Code: ${promoCode}`);
        }
      }

      const createdDate = new Date(job.createdAt);
      const dateBkk = isNaN(createdDate.getTime())
        ? ""
        : createdDate.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

      const cleanPhone = String(job.customerPhone || "").replace(/\D/g, "");
      const customerKey =
        job.customerId ||
        (cleanPhone.length >= 8 ? cleanPhone : (job.customerName || "").trim().toLowerCase()) ||
        job.id;

      rows.push({
        jobId: job.id,
        billNo: job.billNo || "-",
        createdAt: isNaN(createdDate.getTime()) ? "" : format(createdDate, "dd/MM/yyyy HH:mm"),
        dateBkk,
        customerKey,
        customerName: job.customerName || "ไม่ระบุชื่อ",
        customerPhone: job.customerPhone || "-",
        branchId: job.branchId || "",
        branchName: branchNameMap.get(job.branchId || "") || job.branchId || "-",
        promoTags: tags,
        promoLabel: labels.join(" + "),
        paymentChannel: job.paymentChannel || "-",
        isPaid: Boolean(job.isShopPaid || job.isPaid),
        totalAmount: Number(job.totalAmount) || 0,
        createdBy: job.createdBy || "-",
      });
    }
    return rows.sort((a, b) => b.jobId.localeCompare(a.jobId));
  }, [jobs, campaigns, branchNameMap]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return promoRows.filter((row) => {
      if (selectedFilter !== "ALL") {
        if (selectedFilter === "COUPON_CODE") {
          if (!row.promoTags.includes("COUPON_CODE")) return false;
        } else if (!row.promoTags.includes(selectedFilter)) {
          return false;
        }
      }
      if (branchFilter !== "all" && row.branchId !== branchFilter) return false;
      if (startDate && row.dateBkk && row.dateBkk < startDate) return false;
      if (endDate && row.dateBkk && row.dateBkk > endDate) return false;
      if (q) {
        const hay = `${row.jobId} ${row.billNo} ${row.customerName} ${row.customerPhone} ${row.promoLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [promoRows, selectedFilter, branchFilter, startDate, endDate, searchQuery]);

  const stats = useMemo(() => {
    const uniqueCusts = new Set<string>();
    let totalRevenue = 0;
    let paidCount = 0;
    let unpaidCount = 0;

    for (const r of filteredRows) {
      uniqueCusts.add(r.customerKey);
      totalRevenue += r.totalAmount;
      if (r.isPaid) paidCount++;
      else unpaidCount++;
    }

    return {
      totalOrders: filteredRows.length,
      uniqueCustomers: uniqueCusts.size,
      totalRevenue,
      paidCount,
      unpaidCount,
    };
  }, [filteredRows]);

  const handleExportCsv = () => {
    const headers = [
      "Job ID",
      "Bill No",
      "Created At",
      "Customer Name",
      "Customer Phone",
      "Branch",
      "Promotion",
      "Payment Channel",
      "Payment Status",
      "Total Amount (THB)",
      "Created By",
    ];
    const escapeCell = (val: any) => `"${String(val ?? "").replace(/"/g, '""')}"`;
    const lines = [
      headers.map(escapeCell).join(","),
      ...filteredRows.map((r) =>
        [
          r.jobId,
          r.billNo,
          r.createdAt,
          r.customerName,
          r.customerPhone,
          r.branchName,
          r.promoLabel,
          r.paymentChannel,
          r.isPaid ? "Paid" : "Unpaid",
          r.totalAmount.toFixed(2),
          r.createdBy,
        ]
          .map(escapeCell)
          .join(",")
      ),
    ];

    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `promo-report-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[92vw] lg:max-w-6xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-6 py-4 border-b border-border bg-gradient-to-r from-indigo-50/60 via-white to-purple-50/50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center border border-indigo-200 dark:border-indigo-800">
                <BarChart3 size={20} />
              </div>
              <div>
                <DialogTitle className="text-lg font-black tracking-tight">
                  Promotion Campaign Report (รายงานการใช้สิทธิ์โปรโมชั่น)
                </DialogTitle>
                <DialogDescription className="text-xs">
                  ติดตามยอดใช้สิทธิ์ จำนวนลูกค้า และรายได้จากแต่ละแคมเปญโปรโมชั่นแบบเรียลไทม์
                </DialogDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={filteredRows.length === 0}
              className="h-9 px-3.5 text-xs font-bold rounded-xl gap-1.5 border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
            >
              <Download size={14} />
              <span>Export CSV ({filteredRows.length})</span>
            </Button>
          </div>
        </DialogHeader>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl border border-indigo-200/70 bg-indigo-50/40 dark:bg-indigo-950/20 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-indigo-600 uppercase">Redemptions (จำนวนสิทธิ์)</p>
                <h3 className="text-2xl font-black text-indigo-900 dark:text-indigo-200 mt-0.5">{stats.totalOrders}</h3>
              </div>
              <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 flex items-center justify-center">
                <ShoppingBag size={18} />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl border border-purple-200/70 bg-purple-50/40 dark:bg-purple-950/20 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-purple-600 uppercase">Unique Customers (ลูกค้า)</p>
                <h3 className="text-2xl font-black text-purple-900 dark:text-purple-200 mt-0.5">{stats.uniqueCustomers}</h3>
              </div>
              <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/50 text-purple-600 flex items-center justify-center">
                <Users size={18} />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl border border-emerald-200/70 bg-emerald-50/40 dark:bg-emerald-950/20 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-emerald-600 uppercase">Total Revenue (ยอดขายรวม)</p>
                <h3 className="text-2xl font-black text-emerald-800 dark:text-emerald-200 mt-0.5">
                  ฿{stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 flex items-center justify-center">
                <Banknote size={18} />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 dark:bg-slate-900 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase">Payment Status (ชำระเงิน)</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm font-black text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 size={14} /> {stats.paidCount} Paid
                  </span>
                  <span className="text-slate-300">/</span>
                  <span className="text-sm font-black text-amber-600 flex items-center gap-1">
                    <Clock size={14} /> {stats.unpaidCount} Unpaid
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-2.5 bg-muted/40 p-3 rounded-xl border border-border">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="ค้นหา Job ID, เลขบิล, ชื่อลูกค้า, เบอร์โทร..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-xs bg-background rounded-xl"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <select
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value)}
              className="h-9 px-3 text-xs font-bold rounded-xl border border-border bg-background text-foreground cursor-pointer"
            >
              <option value="ALL">All Promotions (ทุกโปรโมชั่น)</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="COUPON_CODE">Other Coupons / Vouchers (คูปองอื่นๆ)</option>
            </select>

            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="h-9 px-3 text-xs font-bold rounded-xl border border-border bg-background text-foreground cursor-pointer"
            >
              <option value="all">All Branches (ทุกสาขา)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 w-[135px] text-xs bg-background rounded-xl"
                title="Start Date"
              />
              <span className="text-xs text-muted-foreground">-</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 w-[135px] text-xs bg-background rounded-xl"
                title="End Date"
              />
            </div>
          </div>

          {/* Orders Table */}
          <div className="border border-border rounded-2xl overflow-hidden bg-card">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-[11px] font-black uppercase">Order / Bill No.</TableHead>
                  <TableHead className="text-[11px] font-black uppercase">Date</TableHead>
                  <TableHead className="text-[11px] font-black uppercase">Customer</TableHead>
                  <TableHead className="text-[11px] font-black uppercase">Promotion</TableHead>
                  <TableHead className="text-[11px] font-black uppercase">Branch</TableHead>
                  <TableHead className="text-[11px] font-black uppercase">Payment</TableHead>
                  <TableHead className="text-[11px] font-black uppercase text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-xs text-muted-foreground">
                      ยังไม่มีออเดอร์ที่ใช้สิทธิ์โปรโมชั่นตามเงื่อนไขที่เลือก
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={row.jobId} className="text-xs">
                      <TableCell className="font-mono font-bold">
                        <div>#{row.jobId}</div>
                        {row.billNo !== "-" && (
                          <div className="text-[10px] text-muted-foreground">{row.billNo}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{row.createdAt}</TableCell>
                      <TableCell>
                        <div className="font-bold">{row.customerName}</div>
                        <div className="text-[10px] text-muted-foreground">{row.customerPhone}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-bold border-purple-300 text-purple-700 bg-purple-50/50">
                          {row.promoLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[11px]">{row.branchName}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant={row.isPaid ? "default" : "secondary"}
                            className={`text-[10px] font-bold ${row.isPaid ? "bg-emerald-600" : "bg-amber-100 text-amber-800"}`}
                          >
                            {row.isPaid ? "Paid" : "Unpaid"}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{row.paymentChannel}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-black font-mono">
                        ฿{row.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t border-border bg-muted/20 shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl text-xs font-bold cursor-pointer">
            ปิดหน้าต่าง (Close)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

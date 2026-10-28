"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useCustomerAuth } from "@/providers/customer-auth-provider";
import {
  Wallet,
  Package,
  Ticket,
  CalendarPlus,
  ChevronRight,
  Clock,
  CheckCircle2,
  Truck,
  Sparkles,
  FileText,
  MapPin,
  RefreshCw,
  Crown,
  AlertCircle,
} from "lucide-react";

const STEP_LABELS_EN = [
  "Scheduled",
  "Picked Up",
  "Cleaning",
  "Billed / QC",
  "Delivering",
  "Delivered",
];

const STEP_LABELS_TH = [
  "นัดรับผ้า",
  "รับผ้าแล้ว",
  "กำลังซัก",
  "ออกบิล/QC",
  "กำลังส่งคืน",
  "ส่งสำเร็จ",
];

export default function PortalDashboardPage() {
  const { customer, lang, portalFetch } = useCustomerAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await portalFetch("/api/portal/dashboard", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [portalFetch]
  );

  useEffect(() => {
    if (customer) {
      loadDashboard();
    }
  }, [customer, loadDashboard]);

  if (loading && !data) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-36 rounded-3xl bg-slate-200/70" />
        <div className="grid grid-cols-3 gap-3">
          <div className="h-24 rounded-2xl bg-slate-200/70" />
          <div className="h-24 rounded-2xl bg-slate-200/70" />
          <div className="h-24 rounded-2xl bg-slate-200/70" />
        </div>
        <div className="h-56 rounded-3xl bg-slate-200/70" />
      </div>
    );
  }

  const profile = data?.customer || customer;
  const activeOrders: any[] = data?.activeOrders || [];
  const recentOrders: any[] = data?.recentOrders || [];
  const activeVouchers: any[] = data?.activeVouchers || [];
  const creditBalance = Number(profile?.creditBalance || 0);

  return (
    <div className="space-y-6">
      {/* Hero Member Greeting Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white p-6 sm:p-7 shadow-xl">
        <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-sky-500/15 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-xs text-xs font-semibold text-sky-300 mb-2.5">
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {profile?.isVIP
                  ? "VIP Concierge Member"
                  : profile?.isMember
                  ? `${profile?.tier || "Member"} Tier`
                  : "Valued Customer"}
              </span>
              {profile?.memberId && (
                <span className="text-white/60">• #{profile.memberId}</span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              {lang === "en"
                ? `Hello, ${profile?.nickName || profile?.name || "Guest"}`
                : `สวัสดีคุณ ${profile?.nickName || profile?.name || ""}`}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate max-w-md">
                {profile?.defaultAddress
                  ? `${profile.defaultAddress}${
                      profile.roomNo ? ` (Room ${profile.roomNo})` : ""
                    }`
                  : lang === "en"
                  ? "Bangkok Laundry & Dry Cleaning Concierge"
                  : "บริการรับ-ส่งซักรีดถึงคอนโดของคุณ"}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => loadDashboard(true)}
              disabled={refreshing}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Refresh Status"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <Link
              href="/portal/book"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 text-white font-bold text-xs sm:text-sm shadow-lg shadow-sky-500/25 transition-all"
            >
              <CalendarPlus className="w-4 h-4" />
              <span>{lang === "en" ? "Book a Pickup" : "เรียกรถรับผ้า"}</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 3 Quick Summary Cards: Wallet, Active Orders, Vouchers */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Link
          href="/portal/wallet"
          className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:border-sky-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-sky-600 transition-colors" />
          </div>
          <div className="text-[11px] font-semibold text-slate-500">
            {lang === "en" ? "Wallet Credit" : "เงินในกระเป๋า"}
          </div>
          <div className="text-lg sm:text-xl font-extrabold text-slate-900 mt-0.5">
            ฿{creditBalance.toLocaleString("en-US", { minimumFractionDigits: 0 })}
          </div>
        </Link>

        <Link
          href="/portal/orders"
          className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:border-sky-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-sky-600 transition-colors" />
          </div>
          <div className="text-[11px] font-semibold text-slate-500">
            {lang === "en" ? "Active Orders" : "กำลังดำเนินการ"}
          </div>
          <div className="text-lg sm:text-xl font-extrabold text-slate-900 mt-0.5">
            {activeOrders.length}
          </div>
        </Link>

        <Link
          href="/portal/wallet?tab=vouchers"
          className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:border-sky-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Ticket className="w-4 h-4" />
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-sky-600 transition-colors" />
          </div>
          <div className="text-[11px] font-semibold text-slate-500">
            {lang === "en" ? "My Vouchers" : "คูปองส่วนลด"}
          </div>
          <div className="text-lg sm:text-xl font-extrabold text-slate-900 mt-0.5">
            {activeVouchers.length}
          </div>
        </Link>
      </div>

      {/* LIVE ACTIVE ORDERS SECTION */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-ping" />
            <span>
              {lang === "en" ? "Live Order Tracking" : "ติดตามสถานะผ้าปัจจุบัน"}
            </span>
          </h2>
          <Link
            href="/portal/orders"
            className="text-xs font-bold text-sky-600 hover:underline flex items-center gap-0.5"
          >
            <span>{lang === "en" ? "All Orders" : "ดูทั้งหมด"}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {activeOrders.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm">
              {lang === "en"
                ? "No active laundry orders right now"
                : "ไม่มีรายการผ้าที่กำลังซักในขณะนี้"}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {lang === "en"
                ? "Schedule a pickup whenever your laundry bag is ready. Our rider will collect it right from your condo."
                : "สามารถกดนัดหมายให้ไรเดอร์เข้ารับผ้าที่คอนโดของคุณได้ทันที"}
            </p>
            <Link
              href="/portal/book"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-sm transition-colors"
            >
              <CalendarPlus className="w-4 h-4" />
              <span>{lang === "en" ? "Schedule a Pickup" : "นัดรับผ้าเลย"}</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {activeOrders.map((order) => {
              const step = order.tracking?.currentStep || 1;
              const stepLabels = lang === "en" ? STEP_LABELS_EN : STEP_LABELS_TH;

              return (
                <Link
                  key={order.id}
                  href={`/portal/orders/${order.id}`}
                  className="block bg-white rounded-3xl border border-sky-200/90 shadow-md shadow-sky-100/50 p-5 hover:border-sky-400 transition-all"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900 text-base">
                          {order.billNo}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                          {lang === "en"
                            ? order.tracking.stageLabelEn
                            : order.tracking.stageLabelTh}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {lang === "en"
                          ? order.tracking.stageDescEn
                          : order.tracking.stageDescTh}
                      </p>
                    </div>

                    <div className="text-right">
                      {order.totalAmount > 0 ? (
                        <>
                          <div className="font-extrabold text-slate-900 text-base">
                            ฿{order.totalAmount.toLocaleString()}
                          </div>
                          <span
                            className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              order.isPaid
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {order.isPaid
                              ? lang === "en"
                                ? "PAID"
                                : "ชำระแล้ว"
                              : lang === "en"
                              ? "BILL READY"
                              : "รอชำระเงิน"}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">
                          {lang === "en" ? "Pending Inspection" : "รอประเมินรายการผ้า"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 6-Step Progress Bar */}
                  <div className="grid grid-cols-6 gap-1.5 mb-2">
                    {stepLabels.map((lbl, idx) => {
                      const stepNum = idx + 1;
                      const done = stepNum <= step;
                      const current = stepNum === step;
                      return (
                        <div key={lbl} className="flex flex-col items-center">
                          <div
                            className={`w-full h-2 rounded-full transition-all ${
                              current
                                ? "bg-gradient-to-r from-sky-500 to-indigo-600"
                                : done
                                ? "bg-sky-500"
                                : "bg-slate-100"
                            }`}
                          />
                          <span
                            className={`text-[10px] mt-1.5 font-semibold text-center leading-tight ${
                              current
                                ? "text-sky-700 font-bold"
                                : done
                                ? "text-slate-600"
                                : "text-slate-400"
                            }`}
                          >
                            {lbl}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(order.scheduledAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                      {order.itemsCount > 0 && (
                        <span>
                          • {order.itemsCount}{" "}
                          {lang === "en" ? "items" : "ชิ้น"}
                        </span>
                      )}
                      {order.proformaUrls?.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-indigo-600 font-semibold">
                          <FileText className="w-3.5 h-3.5" />
                          {lang === "en" ? "Invoice Ready" : "มีใบแจ้งหนี้"}
                        </span>
                      )}
                    </div>
                    <span className="font-bold text-sky-600 inline-flex items-center gap-1">
                      <span>{lang === "en" ? "View Details & Bill" : "ดูรายละเอียด"}</span>
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* RECENT ORDERS & RECEIPTS */}
      {recentOrders.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-extrabold text-slate-900">
              {lang === "en" ? "Recent Orders & Receipts" : "ประวัติการใช้บริการและใบเสร็จ"}
            </h2>
            <Link
              href="/portal/orders"
              className="text-xs font-bold text-sky-600 hover:underline"
            >
              {lang === "en" ? "See All" : "ดูทั้งหมด"}
            </Link>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden shadow-xs">
            {recentOrders.map((order) => (
              <Link
                key={order.id}
                href={`/portal/orders/${order.id}`}
                className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      order.tracking.stageKey === "delivered"
                        ? "bg-emerald-50 text-emerald-600"
                        : order.tracking.stageKey === "cancelled"
                        ? "bg-rose-50 text-rose-500"
                        : "bg-sky-50 text-sky-600"
                    }`}
                  >
                    {order.tracking.stageKey === "delivered" ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : order.tracking.stageKey === "cancelled" ? (
                      <AlertCircle className="w-5 h-5" />
                    ) : (
                      <Truck className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">
                        {order.billNo}
                      </span>
                      <span className="text-[11px] font-medium text-slate-400">
                        {new Date(order.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 truncate mt-0.5">
                      {lang === "en"
                        ? order.tracking.stageLabelEn
                        : order.tracking.stageLabelTh}{" "}
                      {order.itemsCount > 0 ? `• ${order.itemsCount} items` : ""}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="font-bold text-slate-900 text-sm">
                      {order.totalAmount > 0
                        ? `฿${order.totalAmount.toLocaleString()}`
                        : "-"}
                    </div>
                    <div
                      className={`text-[10px] font-bold ${
                        order.isPaid ? "text-emerald-600" : "text-amber-600"
                      }`}
                    >
                      {order.isPaid
                        ? lang === "en"
                          ? "Paid • Receipt"
                          : "ชำระแล้ว • มีใบเสร็จ"
                        : order.totalAmount > 0
                        ? lang === "en"
                          ? "Proforma Bill"
                          : "ใบแจ้งหนี้"
                        : ""}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

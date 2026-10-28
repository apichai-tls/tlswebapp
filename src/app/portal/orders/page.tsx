"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useCustomerAuth } from "@/providers/customer-auth-provider";
import {
  Package,
  Search,
  ChevronRight,
  Clock,
  CheckCircle2,
  Truck,
  FileText,
  CalendarPlus,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

type FilterType = "all" | "active" | "completed";

export default function PortalOrdersPage() {
  const { customer, lang, portalFetch } = useCustomerAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await portalFetch("/api/portal/orders", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
    } catch (err) {
      console.error("Failed to load orders:", err);
    } finally {
      setLoading(false);
    }
  }, [portalFetch]);

  useEffect(() => {
    if (customer) {
      loadOrders();
    }
  }, [customer, loadOrders]);

  const filteredOrders = orders.filter((o) => {
    if (filter === "active" && !o.isActive) return false;
    if (filter === "completed" && o.isActive) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        o.billNo?.toLowerCase().includes(q) ||
        o.proformaNumber?.toLowerCase().includes(q) ||
        o.serviceType?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">
            {lang === "en" ? "My Laundry Orders & Bills" : "รายการซักผ้าและใบเสร็จ"}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {lang === "en"
              ? "Track ongoing laundry and download past invoices & receipts"
              : "ติดตามสถานะผ้าปัจจุบันและดูบิลย้อนหลังทั้งหมด"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadOrders}
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/portal/book"
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-xs"
          >
            <CalendarPlus className="w-4 h-4" />
            <span>{lang === "en" ? "New Pickup" : "นัดรับผ้า"}</span>
          </Link>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="inline-flex bg-slate-200/70 p-1 rounded-xl shrink-0">
          {(
            [
              { key: "all", labelEn: "All Orders", labelTh: "ทั้งหมด" },
              { key: "active", labelEn: "In Progress", labelTh: "กำลังซัก/ส่ง" },
              { key: "completed", labelEn: "Completed", labelTh: "เสร็จสิ้น" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filter === tab.key
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {lang === "en" ? tab.labelEn : tab.labelTh}
            </button>
          ))}
        </div>

        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              lang === "en"
                ? "Search by Bill No. (e.g. TLS-00120)..."
                : "ค้นหาด้วยเลขที่บิล..."
            }
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-28 rounded-2xl bg-slate-200/70" />
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-10 text-center">
          <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <div className="font-bold text-slate-800 text-sm">
            {lang === "en" ? "No orders found" : "ไม่พบรายการซักผ้า"}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {lang === "en"
              ? "When you place an order via WhatsApp, walk-in, or online, it will appear here."
              : "เมื่อคุณส่งซักผ้า รายการและบิลทั้งหมดจะแสดงที่หน้านี้"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const isDelivered = order.tracking?.stageKey === "delivered";
            const isCancelled = order.tracking?.stageKey === "cancelled";

            return (
              <Link
                key={order.id}
                href={`/portal/orders/${order.id}`}
                className="block bg-white rounded-2xl border border-slate-200/90 hover:border-sky-400 p-4 sm:p-5 shadow-2xs hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 mt-0.5 ${
                        isDelivered
                          ? "bg-emerald-50 text-emerald-600"
                          : isCancelled
                          ? "bg-rose-50 text-rose-500"
                          : "bg-sky-50 text-sky-600"
                      }`}
                    >
                      {isDelivered ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : isCancelled ? (
                        <AlertCircle className="w-5 h-5" />
                      ) : (
                        <Truck className="w-5 h-5" />
                      )}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-slate-900 text-base">
                          {order.billNo}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            isDelivered
                              ? "bg-emerald-50 text-emerald-700"
                              : isCancelled
                              ? "bg-rose-50 text-rose-700"
                              : "bg-sky-50 text-sky-700"
                          }`}
                        >
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

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 font-medium mt-2.5">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(order.createdAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        {order.itemsCount > 0 && (
                          <span>
                            • {order.itemsCount}{" "}
                            {lang === "en" ? "garments/items" : "รายการ"}
                          </span>
                        )}
                        {(order.proformaUrls?.length > 0 ||
                          order.receiptUrls?.length > 0) && (
                          <span className="inline-flex items-center gap-1 text-indigo-600 font-semibold">
                            <FileText className="w-3.5 h-3.5" />
                            {order.isPaid
                              ? lang === "en"
                                ? "Official Receipt"
                                : "ใบเสร็จรับเงิน"
                              : lang === "en"
                              ? "Proforma Invoice"
                              : "ใบแจ้งหนี้"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <div className="font-extrabold text-slate-900 text-base">
                        {order.totalAmount > 0
                          ? `฿${order.totalAmount.toLocaleString()}`
                          : "-"}
                      </div>
                      <span
                        className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 ${
                          order.isPaid
                            ? "bg-emerald-50 text-emerald-700"
                            : order.totalAmount > 0
                            ? "bg-amber-50 text-amber-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {order.isPaid
                          ? lang === "en"
                            ? "PAID"
                            : "ชำระแล้ว"
                          : order.totalAmount > 0
                          ? lang === "en"
                            ? "UNPAID"
                            : "รอชำระ"
                          : lang === "en"
                          ? "PENDING"
                          : "รอสรุปยอด"}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

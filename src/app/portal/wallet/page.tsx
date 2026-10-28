"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useCustomerAuth } from "@/providers/customer-auth-provider";
import { toast } from "sonner";
import {
  Wallet,
  Ticket,
  ArrowUpRight,
  ArrowDownLeft,
  Crown,
  Copy,
  Check,
  MessageCircle,
  RefreshCw,
  Calendar,
  Sparkles,
} from "lucide-react";

export default function PortalWalletPage() {
  const { customer, lang, portalFetch } = useCustomerAuth();
  const [walletData, setWalletData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"history" | "vouchers">("history");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadWallet = useCallback(async () => {
    setLoading(true);
    try {
      const res = await portalFetch("/api/portal/wallet", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setWalletData(data);
      }
    } catch (err) {
      console.error("Wallet fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [portalFetch]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "vouchers") {
        setActiveTab("vouchers");
      }
    }
    if (customer) {
      loadWallet();
    }
  }, [customer, loadWallet]);

  const copyVoucherCode = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedCode(code);
    toast.success(
      lang === "en" ? `Copied code: ${code}` : `คัดลอกรหัสคูปอง ${code} แล้ว`
    );
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const balance = Number(
    walletData?.wallet?.creditBalance ?? customer?.creditBalance ?? 0
  );
  const transactions: any[] = walletData?.transactions || [];
  const vouchers: any[] = walletData?.vouchers || [];

  return (
    <div className="space-y-6">
      {/* Digital Member & Wallet Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-900 via-teal-900 to-slate-900 text-white p-6 sm:p-7 shadow-xl">
        <div className="absolute -right-10 -bottom-10 w-52 h-52 rounded-full bg-emerald-400/15 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-emerald-300 text-xs font-bold mb-3">
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {walletData?.wallet?.isVIP
                  ? "VIP Prepaid Member"
                  : `${walletData?.wallet?.tier || customer?.tier || "Regular"} Member`}
              </span>
            </div>

            <div className="text-xs text-emerald-200/80 uppercase font-semibold tracking-wider">
              {lang === "en" ? "Available Credit Balance" : "ยอดเงินคงเหลือในกระเป๋า"}
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-1">
              ฿{balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>

            {walletData?.wallet?.memberExpiryDate && (
              <div className="text-xs text-emerald-200/80 mt-2 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>
                  {lang === "en" ? "Valid until " : "วันหมดอายุสมาชิก "}
                  {new Date(walletData.wallet.memberExpiryDate).toLocaleDateString(
                    "en-GB",
                    {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }
                  )}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadWallet}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Refresh Balance"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <a
              href={`https://wa.me/66614122245?text=${encodeURIComponent(
                `Hi That Laundry Shop, I would like to top up my laundry wallet (${
                  customer?.name || ""
                } - ${customer?.phone || ""})`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg transition-all"
            >
              <MessageCircle className="w-4 h-4" />
              <span>
                {lang === "en" ? "Top Up Package via Concierge" : "เติมแพ็กเกจกระเป๋าเงิน"}
              </span>
            </a>
          </div>
        </div>
      </div>

      {/* Tabs: Wallet Ledger vs Vouchers */}
      <div className="flex bg-slate-200/70 p-1 rounded-2xl max-w-md">
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
            activeTab === "history"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Wallet className="w-4 h-4 text-emerald-600" />
          <span>
            {lang === "en" ? "Credit History" : "ประวัติการใช้เงิน"} ({transactions.length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("vouchers")}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
            activeTab === "vouchers"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Ticket className="w-4 h-4 text-amber-600" />
          <span>
            {lang === "en" ? "My Vouchers" : "คูปองส่วนลด"} ({vouchers.length})
          </span>
        </button>
      </div>

      {/* TAB 1: TRANSACTION LEDGER */}
      {activeTab === "history" ? (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-3 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-10 text-center">
              <Wallet className="w-10 h-10 text-slate-300 mx-auto mb-2.5" />
              <div className="font-bold text-slate-800 text-sm">
                {lang === "en"
                  ? "No wallet transactions yet"
                  : "ยังไม่มีประวัติรายการกระเป๋าเงิน"}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {lang === "en"
                  ? "Top-ups and laundry bill deductions will appear here."
                  : "เมื่อคุณเติมเงินหรือตัดยอดค่าซักผ้า ประวัติจะแสดงที่นี่"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {transactions.map((tx) => {
                const isCredit = tx.direction === "CREDIT";
                return (
                  <div
                    key={tx.id}
                    className="p-4 sm:px-5 flex items-center justify-between gap-3 hover:bg-slate-50/70"
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          isCredit
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-sky-50 text-sky-600"
                        }`}
                      >
                        {isCredit ? (
                          <ArrowDownLeft className="w-5 h-5" />
                        ) : (
                          <ArrowUpRight className="w-5 h-5" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">
                            {tx.packageName ||
                              (tx.type === "TOPUP"
                                ? lang === "en"
                                  ? "Wallet Top-Up"
                                  : "เติมเงินเข้ากระเป๋า"
                                : tx.type === "DEDUCT"
                                ? lang === "en"
                                  ? "Laundry Bill Payment"
                                  : "ชำระค่าซักรีด"
                                : tx.type === "REFUND"
                                ? lang === "en"
                                  ? "Credit Refund"
                                  : "คืนเงินเข้ากระเป๋า"
                                : tx.type)}
                          </span>
                          {tx.approvalStatus === "PENDING" && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold">
                              {lang === "en" ? "Pending Verification" : "รอตรวจสอบ"}
                            </span>
                          )}
                        </div>
                        {tx.reason && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {tx.reason}
                          </p>
                        )}
                        <div className="text-[11px] text-slate-400 mt-1">
                          {new Date(tx.createdAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className={`font-extrabold text-sm sm:text-base ${
                          isCredit ? "text-emerald-600" : "text-slate-900"
                        }`}
                      >
                        {isCredit ? "+" : "-"}฿
                        {Number(tx.amount || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {lang === "en" ? "Bal: " : "คงเหลือ "}฿
                        {Number(tx.balanceAfter || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* TAB 2: VOUCHERS & COUPONS */
        <div className="space-y-3">
          {vouchers.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200/90 p-10 text-center">
              <Sparkles className="w-10 h-10 text-amber-400 mx-auto mb-2.5" />
              <div className="font-bold text-slate-800 text-sm">
                {lang === "en" ? "No vouchers yet" : "ยังไม่มีคูปองส่วนลด"}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {lang === "en"
                  ? "Special seasonal promotions and member vouchers will appear here."
                  : "คูปองส่วนลดพิเศษสำหรับสมาชิกจะแสดงที่หน้านี้"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {vouchers.map((v) => {
                const isActive = v.status === "ACTIVE";
                return (
                  <div
                    key={v.id}
                    className={`rounded-2xl border p-4 sm:p-5 bg-white flex flex-col justify-between gap-3 ${
                      isActive
                        ? "border-amber-200 shadow-xs"
                        : "border-slate-200 opacity-60"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                          {v.discountType === "PERCENTAGE"
                            ? `${v.discountValue}% OFF`
                            : v.discountType === "FREE_DELIVERY"
                            ? "FREE DELIVERY"
                            : `฿${v.discountValue} OFF`}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase ${
                            isActive ? "text-emerald-600" : "text-slate-400"
                          }`}
                        >
                          {v.status}
                        </span>
                      </div>

                      <h3 className="font-extrabold text-slate-900 text-sm mt-2">
                        {v.name}
                      </h3>
                      {v.description && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {v.description}
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-dashed border-slate-200 flex items-center justify-between">
                      <div className="text-[11px] text-slate-400">
                        {v.expiryDate
                          ? `${lang === "en" ? "Exp: " : "หมดอายุ "}${new Date(
                              v.expiryDate
                            ).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}`
                          : lang === "en"
                          ? "No Expiry"
                          : "ไม่มีวันหมดอายุ"}
                      </div>

                      <button
                        type="button"
                        onClick={() => copyVoucherCode(v.code)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-mono text-xs font-bold transition-colors"
                      >
                        <span>{v.code}</span>
                        {copiedCode === v.code ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useRef, useState, useMemo } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  FileDown,
  Printer,
  Image as ImageIcon,
  ArrowUpDown,
  X,
  Wallet,
  Crown,
  CheckCircle2,
  Loader2,
  Phone,
  MapPin,
  Calendar,
} from "lucide-react";
import { type Customer } from "@/lib/store";
import { formatBaht } from "@/lib/utils";
import { toast } from "sonner";

interface ShopInfo {
  id?: string;
  name: string;
  address?: string | null;
  addressFull?: string | null;
  phone?: string | null;
  taxId?: string | null;
  logoUrl?: string | null;
}

interface WalletStatementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer;
  custCode: string;
  ledger: any[];
  activeShop?: ShopInfo | null;
  displayPhone?: string | null;
}

function getCustomerFriendlyTypeLabel(type: string): {
  en: string;
  th: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
} {
  switch (type) {
    case "TOPUP":
      return {
        en: "TOP-UP CREDIT",
        th: "เติมเงินสมาชิก",
        badgeBg: "#ecfdf5",
        badgeText: "#065f46",
        badgeBorder: "#a7f3d0",
      };
    case "OPENING_BALANCE":
      return {
        en: "OPENING BALANCE",
        th: "ยอดยกมา",
        badgeBg: "#f0fdf4",
        badgeText: "#166534",
        badgeBorder: "#bbf7d0",
      };
    case "ADJUST_ADD":
      return {
        en: "CREDIT ADDED",
        th: "ปรับเพิ่มยอดเครดิต",
        badgeBg: "#ecfdf5",
        badgeText: "#065f46",
        badgeBorder: "#a7f3d0",
      };
    case "REFUND":
      return {
        en: "SERVICE REFUND",
        th: "คืนเงินเข้ากระเป๋า",
        badgeBg: "#eff6ff",
        badgeText: "#1e40af",
        badgeBorder: "#bfdbfe",
      };
    case "ADJUST_DEDUCT":
      return {
        en: "CREDIT DEDUCTED",
        th: "ปรับลดยอดเครดิต",
        badgeBg: "#fff1f2",
        badgeText: "#9f1239",
        badgeBorder: "#fecdd3",
      };
    case "DEDUCT":
    default:
      return {
        en: "ORDER PAYMENT",
        th: "ชำระค่าซักรีด",
        badgeBg: "#fff1f2",
        badgeText: "#9f1239",
        badgeBorder: "#fecdd3",
      };
  }
}

export function WalletStatementDialog({
  open,
  onOpenChange,
  customer,
  custCode,
  ledger,
  activeShop,
  displayPhone,
}: WalletStatementDialogProps) {
  const statementRef = useRef<HTMLDivElement>(null);
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);

  // Filter out internal REJECTED rows (and their explicit reversal/unlock counterparts) so the customer statement only shows valid transactions
  const validLedger = useMemo(() => {
    const raw = ledger || [];
    const rejectedItems = raw.filter((tx) => tx.approvalStatus === "REJECTED");
    const usedRejectedIds = new Set<string>();

    const filtered = raw.filter((tx) => {
      if (tx.approvalStatus === "REJECTED") return false;
      const pkg = String(tx.packageName || tx.reason || "");
      const isReversalOrUnlock =
        /reversal for rejected/i.test(pkg) ||
        /unlock paid/i.test(pkg);
      if (isReversalOrUnlock && rejectedItems.length > 0) {
        const oppDir = tx.direction === "CREDIT" ? "DEBIT" : "CREDIT";
        const matchedRej = rejectedItems.find(
          (r) =>
            !usedRejectedIds.has(r.id) &&
            r.direction === oppDir &&
            Math.abs(Number(r.amount || 0) - Number(tx.amount || 0)) < 0.01
        );
        if (matchedRej) {
          usedRejectedIds.add(matchedRej.id);
          return false;
        }
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      const tA = new Date(a.createdAt).getTime();
      const tB = new Date(b.createdAt).getTime();
      return sortOrder === "desc" ? tB - tA : tA - tB;
    });
  }, [ledger, sortOrder]);

  // Calculate summary totals
  const summary = useMemo(() => {
    let totalCredited = 0;
    let totalDeducted = 0;
    let topUpCount = 0;
    let orderPaymentCount = 0;

    for (const tx of validLedger) {
      const amt = Number(tx.amount || 0);
      if (tx.direction === "CREDIT") {
        totalCredited += amt;
        if (tx.type === "TOPUP" || tx.type === "OPENING_BALANCE") topUpCount++;
      } else {
        totalDeducted += amt;
        if (tx.type === "DEDUCT") orderPaymentCount++;
      }
    }

    return {
      totalCredited: Math.round(totalCredited * 100) / 100,
      totalDeducted: Math.round(totalDeducted * 100) / 100,
      currentBalance: Number(customer.creditBalance || 0),
      topUpCount,
      orderPaymentCount,
      totalCount: validLedger.length,
    };
  }, [validLedger, customer.creditBalance]);

  const statementDateStr = useMemo(
    () => format(new Date(), "dd MMM yyyy, HH:mm"),
    []
  );
  const statementFileDate = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const statementRefNo = useMemo(
    () => `STM-${custCode}-${format(new Date(), "yyyyMMdd")}`,
    [custCode]
  );

  const safeCustNameForFile = (customer.name || "Customer")
    .trim()
    .replace(/[^a-zA-Z0-9ก-๙_-]/g, "_");
  const baseFilename = `Wallet_Statement_${safeCustNameForFile}_${custCode}_${statementFileDate}`;

  const isNoNameBrand = customer.brand === "noname_laundry";
  const brandName = isNoNameBrand
    ? "NoName Laundry"
    : activeShop?.name || "That Laundry Shop";
  const brandAddress = isNoNameBrand
    ? "Online Laundry & Dry Clean Service • nonamelaundry.com"
    : activeShop?.addressFull ||
      activeShop?.address ||
      "15 Sukhumvit Residences, Sukhumvit Soi 15, Bangkok";
  const brandPhone = activeShop?.phone || "02-000-0000";

  const tierLabel = customer.isVIP
    ? "VIP MEMBER"
    : customer.isCorporate
    ? "CORPORATE"
    : customer.isMember
    ? "MEMBER"
    : "STANDARD";

  // 1. Native Vector PDF Export via isolated Print Iframe
  const handleExportPdf = () => {
    if (!statementRef.current) return;
    setIsExportingPdf(true);

    try {
      const contentHtml = statementRef.current.outerHTML;
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-9999px";
      iframe.style.top = "-9999px";
      iframe.style.width = "1024px";
      iframe.style.height = "1448px";
      iframe.style.opacity = "0";
      iframe.style.pointerEvents = "none";
      iframe.style.border = "0";
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) {
        document.body.removeChild(iframe);
        setIsExportingPdf(false);
        toast.error("ไม่สามารถเปิดหน้าต่างสร้าง PDF ได้");
        return;
      }

      // Copy current page stylesheets (Tailwind + Fonts) into the print iframe
      const styleTags = Array.from(
        document.querySelectorAll('style, link[rel="stylesheet"]')
      )
        .map((el) => el.outerHTML)
        .join("\n");

      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html lang="th">
          <head>
            <meta charset="utf-8" />
            <title>${baseFilename}</title>
            ${styleTags}
            <style>
              @page {
                size: A4 portrait;
                margin: 10mm 12mm;
              }
              * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
                box-sizing: border-box;
              }
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                font-family: 'Inter', 'Prompt', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              }
              #wallet-statement-print-root {
                width: 100% !important;
                max-width: 100% !important;
                box-shadow: none !important;
                border: none !important;
                margin: 0 !important;
              }
              table {
                page-break-inside: auto;
              }
              tr {
                page-break-inside: avoid;
                page-break-after: auto;
              }
              thead {
                display: table-header-group;
              }
              tfoot {
                display: table-footer-group;
              }
            </style>
          </head>
          <body>
            ${contentHtml}
          </body>
        </html>
      `);
      doc.close();

      const triggerPrint = () => {
        try {
          const origTitle = document.title;
          document.title = baseFilename;
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            document.title = origTitle;
            setIsExportingPdf(false);
          }, 800);
        } catch (err) {
          console.error("Print error:", err);
          setIsExportingPdf(false);
        } finally {
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 60000);
        }
      };

      const images = Array.from(doc.images || []);
      if (images.length === 0) {
        setTimeout(triggerPrint, 250);
      } else {
        let loaded = 0;
        const checkDone = () => {
          loaded++;
          if (loaded >= images.length) {
            setTimeout(triggerPrint, 200);
          }
        };
        images.forEach((img) => {
          if (img.complete) checkDone();
          else {
            img.onload = checkDone;
            img.onerror = checkDone;
          }
        });
      }
    } catch (error) {
      console.error("Failed to export PDF:", error);
      toast.error("เกิดข้อผิดพลาดในการสร้างไฟล์ PDF");
      setIsExportingPdf(false);
    }
  };

  // 2. High-Resolution PNG Image Export (for sending directly in LINE / WhatsApp)
  const handleDownloadImage = async () => {
    if (!statementRef.current) return;
    setIsExportingPng(true);
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const targetEl = statementRef.current;
      const canvas = await html2canvas(targetEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        ignoreElements: (el) => {
          if (el.tagName === "HEAD" || el.tagName === "STYLE" || el.tagName === "LINK" || el.closest?.("head")) return false;
          if (targetEl.contains(el) || el.contains(targetEl)) return false;
          return true;
        },
      });
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `${baseFilename}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("ดาวน์โหลดรูปใบแจ้งยอดเรียบร้อยแล้ว (พร้อมส่งให้ลูกค้า)");
    } catch (err) {
      console.error("Failed to export PNG:", err);
      toast.error("ไม่สามารถบันทึกรูปภาพได้");
    } finally {
      setIsExportingPng(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[920px] w-[96vw] max-h-[94vh] p-0 gap-0 overflow-hidden bg-slate-100 border-slate-300 rounded-3xl shadow-2xl flex flex-col">
        <DialogTitle className="sr-only">
          Credit Wallet Statement — {customer.name}
        </DialogTitle>

        {/* Top Control Toolbar */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Wallet size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight text-white flex items-center gap-2">
                <span>Customer Credit Wallet Statement</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {custCode}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                ตัวอย่างใบสรุปวงเงินสมาชิกสำหรับส่งให้ลูกค้า (PDF / รูปภาพความละเอียดสูง)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sort Toggle */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))
              }
              className="h-8 px-3 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 rounded-xl gap-1.5 cursor-pointer"
            >
              <ArrowUpDown size={13} />
              {sortOrder === "desc"
                ? "เรียง: ล่าสุดขึ้นก่อน (Newest)"
                : "เรียง: ตามลำดับเวลา (Oldest)"}
            </Button>

            {/* Download PNG for LINE / WhatsApp */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isExportingPng || isExportingPdf}
              onClick={handleDownloadImage}
              className="h-8 px-3 text-xs font-bold bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 border-indigo-500/40 rounded-xl gap-1.5 cursor-pointer"
            >
              {isExportingPng ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <ImageIcon size={13} />
              )}
              <span>Download Image (.PNG)</span>
            </Button>

            {/* Primary Export PDF Button */}
            <Button
              type="button"
              size="sm"
              disabled={isExportingPdf || isExportingPng}
              onClick={handleExportPdf}
              className="h-8 px-4 text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl gap-1.5 cursor-pointer shadow-sm"
            >
              {isExportingPdf ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileDown size={14} />
              )}
              <span>Export PDF / Print (บันทึกเป็น PDF)</span>
            </Button>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 flex items-center justify-center transition-colors cursor-pointer ml-1"
              title="Close (ปิดหน้าต่าง)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable Preview Viewport */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex justify-center custom-scrollbar">
          {/* Printable Statement Sheet (A4 Proportion) */}
          <div
            id="wallet-statement-print-root"
            ref={statementRef}
            className="w-full max-w-[820px] bg-white rounded-2xl shadow-md border border-slate-200/90 overflow-hidden text-slate-800 flex flex-col justify-between"
            style={{
              fontFamily:
                "'Inter', 'Prompt', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            }}
          >
            <div>
              {/* Top Decorative Brand Bar */}
              <div
                className="h-2.5 w-full"
                style={{
                  background:
                    "linear-gradient(90deg, #059669 0%, #0d9488 50%, #0f172a 100%)",
                }}
              />

              <div className="p-6 sm:p-8 space-y-6">
                {/* 1. STATEMENT HEADER */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-200">
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center p-1.5 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={activeShop?.logoUrl || "/logo.png"}
                        alt={brandName}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <div>
                      <h1 className="text-lg font-black uppercase tracking-tight text-slate-900 leading-tight">
                        {brandName}
                      </h1>
                      <p className="text-xs text-slate-500 mt-0.5 max-w-[360px] leading-relaxed">
                        {brandAddress}
                      </p>
                      {brandPhone && (
                        <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                          Tel: {brandPhone}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="sm:text-right space-y-1">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-black uppercase tracking-wider">
                      <Wallet size={12} />
                      <span>MEMBER WALLET STATEMENT</span>
                    </div>
                    <p className="text-xs font-bold text-slate-700">
                      ใบแจ้งรายการเคลื่อนไหววงเงินสมาชิก
                    </p>
                    <div className="text-[11px] text-slate-500 space-y-0.5 pt-0.5">
                      <div>
                        <span className="font-semibold text-slate-400">
                          Statement Date:{" "}
                        </span>
                        <span className="font-bold text-slate-700">
                          {statementDateStr}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-400">
                          Reference No.:{" "}
                        </span>
                        <span className="font-mono font-bold text-slate-700">
                          {statementRefNo}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. CUSTOMER INFORMATION CARD */}
                <div className="rounded-2xl bg-slate-50/90 border border-slate-200/90 p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                  <div className="sm:col-span-7 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                        ACCOUNT HOLDER (ชื่อสมาชิก)
                      </span>
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase"
                        style={{
                          backgroundColor: customer.isVIP
                            ? "#f3e8ff"
                            : "#e0f2fe",
                          color: customer.isVIP ? "#6b21a8" : "#0369a1",
                          border: customer.isVIP
                            ? "1px solid #d8b4fe"
                            : "1px solid #bae6fd",
                        }}
                      >
                        <Crown size={10} />
                        {tierLabel}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-baseline gap-2.5">
                      <h2 className="text-xl font-black text-slate-900 tracking-tight">
                        {customer.name}
                      </h2>
                      <span className="text-xs font-mono font-bold text-slate-600 bg-white px-2.5 py-0.5 rounded-md border border-slate-200">
                        ID: {custCode}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 pt-0.5">
                      {(displayPhone || customer.phone) && (
                        <span className="inline-flex items-center gap-1.5 font-semibold">
                          <Phone size={12} className="text-slate-400" />
                          {displayPhone || customer.phone}
                        </span>
                      )}
                      {customer.defaultAddress &&
                        customer.defaultAddress !== "-" &&
                        customer.defaultAddress !== "--" && (
                          <span className="inline-flex items-center gap-1.5 text-slate-500">
                            <MapPin
                              size={12}
                              className="text-slate-400 shrink-0"
                            />
                            <span className="line-clamp-1">
                              {customer.defaultAddress}
                              {customer.roomNo
                                ? ` (Room ${customer.roomNo})`
                                : ""}
                            </span>
                          </span>
                        )}
                    </div>
                  </div>

                  <div className="sm:col-span-5 sm:border-l sm:border-slate-200 sm:pl-5 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-semibold">
                        Account Status:
                      </span>
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                        <CheckCircle2 size={12} />
                        Active (ปกติ)
                      </span>
                    </div>
                    {customer.memberStartDate && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-semibold">
                          Member Since:
                        </span>
                        <span className="font-bold text-slate-700">
                          {format(
                            new Date(customer.memberStartDate),
                            "dd MMM yyyy"
                          )}
                        </span>
                      </div>
                    )}
                    {customer.memberExpiryDate && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-semibold">
                          Valid Until:
                        </span>
                        <span className="font-bold text-slate-700">
                          {format(
                            new Date(customer.memberExpiryDate),
                            "dd MMM yyyy"
                          )}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-semibold">
                        Total Records:
                      </span>
                      <span className="font-bold text-slate-800">
                        {summary.totalCount} รายการ (Transactions)
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. EXECUTIVE SUMMARY KPI CARDS */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  {/* Card 1: Total Credited */}
                  <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/50 p-4 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                        TOTAL CREDITED (ยอดเติมเงินรวม)
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        +{summary.topUpCount} Top-ups
                      </span>
                    </div>
                    <div className="mt-2">
                      <div className="text-xl font-black text-emerald-700 font-mono">
                        +{formatBaht(summary.totalCredited)}
                      </div>
                      <p className="text-[11px] text-emerald-700/80 font-medium mt-0.5">
                        รวมยอดยกมา เติมเงิน และโบนัสสมาชิก
                      </p>
                    </div>
                  </div>

                  {/* Card 2: Total Used */}
                  <div className="rounded-2xl border border-rose-200/90 bg-rose-50/40 p-4 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-rose-800">
                        TOTAL USED (ยอดใช้บริการรวม)
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                        {summary.orderPaymentCount} Orders
                      </span>
                    </div>
                    <div className="mt-2">
                      <div className="text-xl font-black text-rose-600 font-mono">
                        -{formatBaht(summary.totalDeducted)}
                      </div>
                      <p className="text-[11px] text-rose-700/80 font-medium mt-0.5">
                        หักชำระค่าบริการซักรีดสะสมทั้งหมด
                      </p>
                    </div>
                  </div>

                  {/* Card 3: Current Available Balance */}
                  <div
                    className="rounded-2xl p-4 flex flex-col justify-between text-white shadow-xs"
                    style={{
                      background:
                        summary.currentBalance < 0
                          ? "linear-gradient(135deg, #be123c 0%, #881337 100%)"
                          : "linear-gradient(135deg, #047857 0%, #0f172a 100%)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-200">
                        AVAILABLE CREDIT (คงเหลือสุทธิ)
                      </span>
                      <Wallet size={14} className="text-emerald-300" />
                    </div>
                    <div className="mt-2">
                      <div className="text-2xl font-black text-white font-mono tracking-tight">
                        {formatBaht(summary.currentBalance)}
                      </div>
                      <p className="text-[11px] text-emerald-100/90 font-medium mt-0.5">
                        ยอดวงเงินคงเหลือพร้อมใช้งานปัจจุบัน
                      </p>
                    </div>
                  </div>
                </div>

                {/* 4. LEDGER TRANSACTION TABLE */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                      <Calendar size={13} className="text-emerald-600" />
                      <span>
                        Transaction History / รายการเคลื่อนไหววงเงินสมาชิก (
                        {validLedger.length})
                      </span>
                    </h3>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {sortOrder === "desc"
                        ? "Sorted by Newest First (เรียงจากรายการล่าสุด)"
                        : "Sorted Chronologically (เรียงตามลำดับวันที่)"}
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr
                          style={{
                            backgroundColor: "#f8fafc",
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          <th className="py-2.5 pl-4 pr-2 text-[10px] font-black uppercase tracking-wider text-slate-500 w-[42px]">
                            #
                          </th>
                          <th className="py-2.5 px-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500 w-[130px]">
                            Date & Time
                            <div className="text-[9px] font-semibold text-slate-400 normal-case">
                              วัน-เวลา
                            </div>
                          </th>
                          <th className="py-2.5 px-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500 w-[155px]">
                            Transaction Type
                            <div className="text-[9px] font-semibold text-slate-400 normal-case">
                              ประเภทธุรกรรม
                            </div>
                          </th>
                          <th className="py-2.5 px-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
                            Description & Reference
                            <div className="text-[9px] font-semibold text-slate-400 normal-case">
                              รายละเอียด / เลขที่บิลอ้างอิง
                            </div>
                          </th>
                          <th className="py-2.5 px-2.5 text-right text-[10px] font-black uppercase tracking-wider text-slate-500 w-[125px]">
                            Amount (฿)
                            <div className="text-[9px] font-semibold text-slate-400 normal-case">
                              จำนวนเงิน
                            </div>
                          </th>
                          <th className="py-2.5 pl-2.5 pr-4 text-right text-[10px] font-black uppercase tracking-wider text-slate-500 w-[125px]">
                            Balance (฿)
                            <div className="text-[9px] font-semibold text-slate-400 normal-case">
                              คงเหลือ
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {validLedger.length > 0 ? (
                          validLedger.map((tx: any, idx: number) => {
                            const isCredit = tx.direction === "CREDIT";
                            const typeMeta = getCustomerFriendlyTypeLabel(
                              tx.type
                            );
                            const rowNum =
                              sortOrder === "asc"
                                ? idx + 1
                                : validLedger.length - idx;

                            return (
                              <tr
                                key={tx.id || idx}
                                style={{
                                  backgroundColor:
                                    idx % 2 === 0 ? "#ffffff" : "#fcfcfd",
                                }}
                              >
                                <td className="py-2.5 pl-4 pr-2 text-[11px] font-mono font-bold text-slate-400">
                                  {rowNum}
                                </td>
                                <td className="py-2.5 px-2.5 text-[11px] font-semibold text-slate-600 whitespace-nowrap font-mono">
                                  {format(
                                    new Date(tx.createdAt),
                                    "dd/MM/yyyy HH:mm"
                                  )}
                                </td>
                                <td className="py-2.5 px-2.5">
                                  <div className="inline-flex flex-col">
                                    <span
                                      className="inline-block text-[9.5px] font-black uppercase px-2 py-0.5 rounded-md w-fit"
                                      style={{
                                        backgroundColor: typeMeta.badgeBg,
                                        color: typeMeta.badgeText,
                                        border: `1px solid ${typeMeta.badgeBorder}`,
                                      }}
                                    >
                                      {typeMeta.en}
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-medium mt-0.5">
                                      {typeMeta.th}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-2.5">
                                  <div className="font-bold text-slate-800 text-xs leading-snug">
                                    {tx.packageName ||
                                      tx.reason ||
                                      "Wallet Transaction"}
                                  </div>
                                  {tx.paymentChannel && (
                                    <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                                      Channel: {tx.paymentChannel}
                                    </div>
                                  )}
                                </td>
                                <td
                                  className="py-2.5 px-2.5 text-right font-mono font-black text-xs whitespace-nowrap"
                                  style={{
                                    color: isCredit ? "#059669" : "#e11d48",
                                  }}
                                >
                                  {isCredit ? "+" : "-"}฿
                                  {Number(tx.amount || 0).toLocaleString(
                                    undefined,
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    }
                                  )}
                                </td>
                                <td
                                  className="py-2.5 pl-2.5 pr-4 text-right font-mono font-bold text-xs whitespace-nowrap"
                                  style={{
                                    color:
                                      tx.displayBalance == null
                                        ? "#94a3b8"
                                        : Number(tx.displayBalance) < 0
                                        ? "#e11d48"
                                        : "#1e293b",
                                  }}
                                >
                                  {tx.displayBalance != null
                                    ? formatBaht(Number(tx.displayBalance))
                                    : "—"}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td
                              colSpan={6}
                              className="py-10 text-center text-slate-400 text-xs font-semibold"
                            >
                              ไม่มีประวัติธุรกรรมในระบบ (No wallet transactions
                              found)
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. STATEMENT FOOTER */}
            <div className="px-6 sm:px-8 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
              <div>
                <p className="font-bold text-slate-700">
                  Thank you for trusting {brandName} • ขอบคุณที่ใช้บริการ
                </p>
                <p className="text-[10px] text-slate-400">
                  เอกสารฉบับนี้จัดทำโดยระบบสมาชิกอัตโนมัติ หากมีข้อสงสัยกรุณาติดต่อฝ่ายบริการลูกค้า
                </p>
              </div>
              <div className="sm:text-right font-mono text-[10px] text-slate-400">
                <div>Generated on {statementDateStr}</div>
                <div>Ref: {statementRefNo}</div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

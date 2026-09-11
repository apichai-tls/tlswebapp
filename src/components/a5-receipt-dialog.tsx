import React, { useState, useEffect, useSyncExternalStore } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X, Loader2, Wallet } from "lucide-react";
import { ReceiptData } from "@/components/thermal-receipt-dialog";
import { createPortal } from "react-dom";
import { printImageUrl } from "@/components/ui/multi-image-uploader";
import { getTransportFeeBreakdown, safeCeil, findMatchingCustomer } from "@/lib/utils";

import { customerStore } from "@/lib/store";

interface ShopInfo {
  id?: string;
  name: string;
  address?: string | null;
  addressFull?: string | null;
  proformaQrUrl?: string | null;
  phone?: string | null;
  taxId?: string | null;
  logoUrl?: string | null;
}

interface PaymentLog {
  timestamp: string | Date;
  amount: number;
  method: string;
  channel?: string;
  received?: number;
  change?: number;
}

interface A5ReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiptData: ReceiptData | null;
  activeShop: ShopInfo | null | undefined;
  currentLanguage?: string;
  onCloseComplete?: () => void;
  onBillImageUploaded?: (url: string) => void;
}

const cleanRemarkForDisplay = (rawRemark: string | null | undefined) => {
  if (!rawRemark) return "";
  return rawRemark
    .split(" | ")
    .filter(part => !part.startsWith("VAT:") && !part.startsWith("Express") && !part.startsWith("Proforma:") && !part.startsWith("Revision:"))
    .join(" | ")
    .trim();
};
export function A5ReceiptDialog({
  open,
  onOpenChange,
  receiptData,
  activeShop,
  currentLanguage = "en",
  onCloseComplete,
  onBillImageUploaded,
}: A5ReceiptDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const capturedKeysRef = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Background Auto-Capture using headless a5-canvas-generator (Fixed 559px x 793px)
  useEffect(() => {
    if (!receiptData || !open) return;
    const snapshotData = JSON.parse(JSON.stringify(receiptData));

    const rawJobId =
      snapshotData.jobId && snapshotData.jobId !== "DRAFT" ? snapshotData.jobId : null;
    const targetJobId =
      rawJobId ||
      (snapshotData.proformaId && snapshotData.proformaId !== "DRAFT"
        ? snapshotData.proformaId
        : null) ||
      (snapshotData.id && snapshotData.id !== "DRAFT" ? snapshotData.id : null) ||
      "DRAFT";

    const captureKey =
      targetJobId === "DRAFT"
        ? `DRAFT_draft_rev${snapshotData.proformaRevision || 0}_${Date.now()}`
        : `${targetJobId}_${snapshotData.isDraft ? "draft" : "paid"}_rev${
            snapshotData.proformaRevision || 0
          }`;

    if (snapshotData.autoCapture || snapshotData.isDraft) {
      if (capturedKeysRef.current.has(captureKey)) return;
      capturedKeysRef.current.add(captureKey);
    }

    const filename = snapshotData.isDraft
      ? `proforma-${
          snapshotData.proformaId && snapshotData.proformaId !== "DRAFT"
            ? snapshotData.proformaId
            : targetJobId
        }-rev${snapshotData.proformaRevision || 0}.png`
      : `receipt-${targetJobId}.png`;

    const uploadAndSave = async (blob: Blob) => {
      const { jobStore } = await import("@/lib/store");

      let uploadResult: { success: boolean; publicUrl?: string } = { success: false };
      try {
        const signRes = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entityType: "job",
            entityId: rawJobId || targetJobId || "unknown",
            subType: "proofs",
            contentType: "image/png",
            filename,
          }),
        });
        if (!signRes.ok) throw new Error("Failed to get signed upload URL");
        const signData = await signRes.json();
        if (signData.uploadUrl && signData.publicUrl) {
          const putRes = await fetch(signData.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": "image/png" },
            body: blob,
          });
          if (putRes.ok) {
            uploadResult = { success: true, publicUrl: signData.publicUrl };
          } else {
            throw new Error(`GCS PUT failed: ${putRes.status}`);
          }
        }
      } catch (gcsErr) {
        console.warn("GCS upload failed, falling back to local:", gcsErr);
        const file = new File([blob], filename, { type: "image/png" });
        const formData = new FormData();
        formData.append("file", file);
        formData.append("entityType", "jobs");
        formData.append("entityId", rawJobId || targetJobId || "unknown");
        formData.append("subType", "proofs");
        const res = await fetch("/api/upload-local", { method: "POST", body: formData });
        uploadResult = await res.json();
      }

      if (uploadResult.success && uploadResult.publicUrl) {
        capturedKeysRef.current.add(captureKey);
        if (onBillImageUploaded) onBillImageUploaded(uploadResult.publicUrl);

        const targetId = rawJobId || targetJobId;
        const targetJob =
          targetId && targetId !== "DRAFT"
            ? jobStore.getSnapshot().find((j: any) => j.id === targetId)
            : null;
        if (targetJob) {
          let existingBills: string[] = [];
          try {
            if (targetJob.billImageUrl) {
              const parsed = JSON.parse(targetJob.billImageUrl);
              if (Array.isArray(parsed)) existingBills = parsed;
              else if (typeof parsed === "string") existingBills = [parsed];
            }
          } catch {}
          if (!existingBills.includes(uploadResult.publicUrl)) {
            const newBills = [...existingBills, uploadResult.publicUrl];
            await jobStore.updateJobDetails(targetJob.id, {
              billImageUrl: JSON.stringify(newBills),
            });
          }
        }
      }
    };

    const runCapture = async () => {
      try {
        const { generateA5ReceiptImage } = await import("@/lib/a5-canvas-generator");
        const blob = await generateA5ReceiptImage(snapshotData, activeShop);
        if (blob && open && (snapshotData.autoCapture || snapshotData.isDraft)) {
          uploadAndSave(blob).catch((err) =>
            console.error("Background receipt upload failed:", err)
          );
        }
      } catch (err) {
        console.error("Failed to capture and upload receipt image:", err);
      }
    };

    if (snapshotData.autoCapture || snapshotData.isDraft) {
      setTimeout(() => {
        runCapture();
      }, 50);
    }
  }, [open, receiptData, activeShop, onBillImageUploaded]);

  // Reset captured keys on close
  useEffect(() => {
    if (!open) {
      capturedKeysRef.current.clear();
    }
  }, [open]);

  if (!receiptData) return null;

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      const { generateA5ReceiptImage } = await import("@/lib/a5-canvas-generator");
      const blob = await generateA5ReceiptImage(receiptData, activeShop);
      if (blob) {
        const objectUrl = URL.createObjectURL(blob);
        printImageUrl(objectUrl);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      } else {
        window.print();
      }
    } catch {
      window.print();
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen && onCloseComplete) {
            setTimeout(() => {
              onCloseComplete();
            }, 150);
          }
          onOpenChange(isOpen);
        }}
      >
        <DialogContent className="max-w-[590px] max-h-[92vh] overflow-y-auto rounded-2xl p-0 border-none shadow-2xl bg-neutral-900 print:hidden overflow-x-hidden">
          <div className="flex flex-col items-center bg-neutral-800 min-h-full pb-6">
            <div className="w-full bg-neutral-900 p-4 border-b border-neutral-700 flex justify-between items-center sticky top-0 z-20 shadow-md">
              <h2 className="text-white font-bold text-sm">
                {receiptData.isDraft
                  ? currentLanguage === "en"
                    ? "A5 Proforma Invoice Preview"
                    : "ตัวอย่างใบแจ้งหนี้ Proforma A5"
                  : currentLanguage === "en"
                  ? "A5 Receipt Preview"
                  : "ตัวอย่างใบเสร็จ A5"}
              </h2>
              <div className="flex gap-2">
                <Button
                  onClick={handlePrint}
                  disabled={isPrinting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-8 px-3.5 rounded-lg text-xs border-none shadow-md flex items-center gap-1.5 disabled:opacity-70 cursor-pointer"
                >
                  {isPrinting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Printer size={14} />
                  )}
                  {isPrinting
                    ? currentLanguage === "en"
                      ? "Preparing..."
                      : "กำลังเตรียม..."
                    : currentLanguage === "en"
                    ? "Print A5"
                    : "พิมพ์ A5"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="bg-white/10 hover:bg-white/20 border-white/20 text-white h-8 px-3 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <X size={14} />
                  {currentLanguage === "en" ? "Close" : "ปิด"}
                </Button>
              </div>
            </div>

            {/* Receipt Preview Area — renders exactly 559px x 793px scaled to fit dialog (458px x 650px, ratio 1.414) */}
            <div className="w-full flex justify-center py-4 bg-neutral-800 shrink-0">
              <div
                style={{
                  width: 458,
                  height: 650,
                }}
                className="relative shrink-0 shadow-2xl rounded-sm border border-neutral-300 bg-white overflow-hidden"
              >
                <div
                  style={{
                    width: 559,
                    height: 793,
                    transform: "scale(0.82)",
                    transformOrigin: "top left",
                  }}
                >
                  <A5ReceiptContent
                    receiptData={receiptData}
                    activeShop={activeShop}
                    currentLanguage={currentLanguage}
                  />
                </div>
              </div>
            </div>

            {/* Bottom Close Button */}
            <div className="w-full max-w-[559px] px-6 mt-1">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="w-full bg-neutral-900 border border-neutral-700 hover:bg-neutral-950 text-white font-bold h-10 rounded-xl text-xs cursor-pointer shadow-sm"
              >
                {receiptData.isDraft
                  ? currentLanguage === "en"
                    ? "Close Preview"
                    : "ปิดหน้าต่าง"
                  : currentLanguage === "en"
                  ? "Done"
                  : "เสร็จสิ้น"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print-only layout portalled directly to document.body */}
      {mounted &&
        createPortal(
          <div className="hidden print:block print-root print-root-a5">
            <A5ReceiptContent
              receiptData={receiptData}
              activeShop={activeShop}
              currentLanguage={currentLanguage}
            />
          </div>,
          document.body
        )}
    </>
  );
}

export interface A5ReceiptContentProps {
  receiptData: ReceiptData;
  activeShop?: ShopInfo | null;
  currentLanguage?: string;
}

export function A5ReceiptContent({
  receiptData,
  activeShop,
  currentLanguage = "en",
}: A5ReceiptContentProps) {
  const customers = useSyncExternalStore(
    customerStore.subscribe,
    customerStore.getSnapshot,
    customerStore.getSnapshot
  );

  const formatCurrency = (val: number) =>
    val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Match customer for Member Wallet info
  const targetCustomer = findMatchingCustomer(customers, {
    customerId: receiptData.customerId,
    customerName: receiptData.customerName,
    customerPhone: receiptData.customerPhone,
  });


  const isMember =
    receiptData.isMember !== undefined ? receiptData.isMember : Boolean(targetCustomer?.isMember);
  const walletBalance =
    receiptData.walletBalance !== undefined
      ? receiptData.walletBalance
      : targetCustomer?.creditBalance || 0;
  const isWalletSufficient = isMember && walletBalance >= (receiptData.total || 0);

  // Extract Payments History
  const payments: PaymentLog[] = (() => {
    try {
      if (receiptData.adminNotesJson) {
        const parsed = JSON.parse(receiptData.adminNotesJson);
        if (parsed && Array.isArray(parsed.payments) && parsed.payments.length > 0) {
          return parsed.payments as PaymentLog[];
        }
      }
    } catch {
      /* ignore */
    }
    if (receiptData.isPaid && (receiptData.total || 0) > 0) {
      return [
        {
          amount: receiptData.total,
          method: (receiptData.paymentChannel || "TRANSFER").toLowerCase(),
          timestamp: (receiptData.createdAt instanceof Date
            ? receiptData.createdAt
            : new Date(receiptData.createdAt || Date.now())
          ).toISOString(),
        },
      ];
    }
    return [];
  })();

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const isPaidEffective = Boolean(
    receiptData.isPaid || (totalPaid >= (receiptData.total || 0) && (receiptData.total || 0) > 0)
  );

  const safeDate = receiptData.createdAt
    ? receiptData.createdAt instanceof Date
      ? receiptData.createdAt
      : new Date(receiptData.createdAt)
    : new Date();
  const validDate = isNaN(safeDate.getTime()) ? new Date() : safeDate;

  const proformaDisplayId = receiptData.isDraft
    ? receiptData.proformaRevision && receiptData.proformaRevision > 0
      ? `${receiptData.proformaId || "DRAFT"}-R${receiptData.proformaRevision}`
      : receiptData.proformaId || "DRAFT"
    : null;

  const transportFeeItems = getTransportFeeBreakdown(receiptData.deliveryFee, receiptData.jobType);

  // ── Dynamic Density & Auto-Compaction ─────────────────────────────────────────
  const itemCount = receiptData.items.length;
  const extraTotalsLines =
    transportFeeItems.length +
    (receiptData.expressSurcharge > 0 ? 1 : 0) +
    (receiptData.discount > 0 ? 1 : 0) +
    ((receiptData.promoDiscount && receiptData.promoDiscount > 0) ? 1 : 0) +
    (receiptData.vatRate > 0 ? 1 : 0);
  const paymentLines = payments.length > 0 ? payments.length + 1 : 0;
  // ── Dynamic Adaptive Density / Compaction Calculation ───────────────────────
  // Step 1: Calculate total estimated height under 100% standard (Normal) styling
  const normalHeaderHeight = 125;
  const normalCustomerHeight = receiptData.deliveryScheduledAt ? 58 : 48;
  const normalTableHeaderHeight = 26;
  const normalItemRowHeight = 25; // py-1 (8px) + line-height (16px) + border (1px)
  const normalItemsHeight = receiptData.items.length * normalItemRowHeight;
  const normalTotalsRowHeight = 20;
  const normalTotalsBaseHeight =
    56 +
    transportFeeItems.length * normalTotalsRowHeight +
    (receiptData.expressSurcharge > 0 ? normalTotalsRowHeight : 0) +
    (receiptData.discount > 0 ? normalTotalsRowHeight : 0) +
    ((receiptData.promoDiscount && receiptData.promoDiscount > 0) ? normalTotalsRowHeight : 0) +
    (receiptData.vatRate > 0 ? normalTotalsRowHeight : 0);
  const normalPaymentsHeight =
    payments.length > 0
      ? payments.length * normalTotalsRowHeight + 38
      : !isPaidEffective && !receiptData.isDraft && (receiptData.total || 0) > 0
      ? 20
      : 0;
  const normalQrOrWalletHeight = (receiptData.isDraft && !isPaidEffective)
    ? isMember
      ? isWalletSufficient
        ? 62
        : 88
      : activeShop?.proformaQrUrl
      ? 88
      : 0
    : (receiptData.isDraft && isPaidEffective ? 26 : 0);
  const normalVoidHeight = receiptData.status === "cancel" ? 35 : 0;
  const normalFooterHeight = 28;
  const normalContentPadding = 48; // 24px top + 24px bottom

  const estimatedNormalHeight =
    normalHeaderHeight +
    normalCustomerHeight +
    normalTableHeaderHeight +
    normalItemsHeight +
    normalTotalsBaseHeight +
    normalPaymentsHeight +
    normalQrOrWalletHeight +
    normalVoidHeight +
    normalFooterHeight +
    normalContentPadding;

  const A5_MAX_HEIGHT = 793;

  // Only reduce font size / padding when the content actually starts to exceed A5 page capacity!
  // Compact mode: triggers when normal height exceeds 745px (starting to overflow A5)
  // UltraCompact mode: triggers when normal height exceeds 860px (very long orders)
  const isCompact = estimatedNormalHeight > 745 && estimatedNormalHeight <= 860;
  const isUltraCompact = estimatedNormalHeight > 860;

  // Dynamic styling tokens based on compaction mode
  const outerPadding = isUltraCompact ? "12px 18px" : isCompact ? "16px 22px" : "24px 28px";
  const headerMargin = isUltraCompact ? "mb-1" : isCompact ? "mb-1.5" : "mb-3";
  const logoClass = isUltraCompact ? "h-6" : isCompact ? "h-7" : "h-9";
  const customerMargin = isUltraCompact ? "mb-1" : isCompact ? "mb-1.5" : "mb-3";
  const tableMargin = isUltraCompact ? "mb-1" : isCompact ? "mb-1.5" : "mb-3";
  const tableHeaderClass = isUltraCompact ? "py-0.5 px-1 text-[9px]" : isCompact ? "py-0.5 px-1 text-[9.5px]" : "py-1.5 px-1 text-[10px]";
  const tableRowClass = isUltraCompact ? "py-0.5 px-1 text-[9.5px]" : isCompact ? "py-0.5 px-1 text-[10.5px]" : "py-1 px-1 text-xs";
  const totalsMargin = isUltraCompact ? "mb-1" : isCompact ? "mb-1.5" : "mb-3";
  const totalsRowClass = isUltraCompact ? "py-0 text-[9.5px]" : isCompact ? "py-0.5 text-[10.5px]" : "py-0.5 text-xs";
  const grandTotalClass = isUltraCompact ? "py-0.5 text-xs font-black" : isCompact ? "py-0.5 text-[13px] font-black" : "py-1 text-sm font-black";
  const paymentsRowClass = isUltraCompact ? "py-0 text-[9px]" : isCompact ? "py-0.5 text-[10px]" : "py-0.5 text-xs";
  const qrBoxClass = isUltraCompact ? "p-1 mb-1 gap-2 rounded-lg" : isCompact ? "p-1.5 mb-1.5 gap-2.5 rounded-xl" : "p-2 mb-2 gap-3 rounded-xl";
  const qrImageClass = isUltraCompact ? "h-11 w-11" : isCompact ? "h-14 w-14" : "h-18 w-18";
  const qrTitleClass = `font-bold text-neutral-400 uppercase tracking-widest ${isUltraCompact ? "text-[8px]" : "text-[9px]"}`;
  const qrAmountClass = `font-black text-neutral-900 ${isUltraCompact ? "text-xs" : isCompact ? "text-[13px]" : "text-sm"}`;
  const qrSubtextClass = `leading-tight text-neutral-400 ${isUltraCompact ? "text-[8px]" : "text-[9px]"}`;

  // Step 2: Accurate height calculation based on chosen compaction mode
  const headerHeight = isUltraCompact ? 95 : isCompact ? 110 : normalHeaderHeight;
  const customerHeight = receiptData.deliveryScheduledAt
    ? (isUltraCompact ? 46 : isCompact ? 52 : normalCustomerHeight)
    : (isUltraCompact ? 38 : isCompact ? 44 : normalCustomerHeight);
  const tableHeaderHeight = isUltraCompact ? 18 : isCompact ? 22 : normalTableHeaderHeight;
  const itemRowHeight = isUltraCompact ? 16 : isCompact ? 19 : normalItemRowHeight;
  const itemsHeight = receiptData.items.length * itemRowHeight;
  const totalsRowHeight = isUltraCompact ? 14 : isCompact ? 17 : normalTotalsRowHeight;
  const totalsBaseHeight =
    (isUltraCompact ? 40 : isCompact ? 48 : 56) +
    transportFeeItems.length * totalsRowHeight +
    (receiptData.expressSurcharge > 0 ? totalsRowHeight : 0) +
    (receiptData.discount > 0 ? totalsRowHeight : 0) +
    ((receiptData.promoDiscount && receiptData.promoDiscount > 0) ? totalsRowHeight : 0) +
    (receiptData.vatRate > 0 ? totalsRowHeight : 0);
  const paymentsHeight =
    payments.length > 0
      ? payments.length * totalsRowHeight + (isUltraCompact ? 28 : isCompact ? 32 : 38)
      : !isPaidEffective && !receiptData.isDraft && (receiptData.total || 0) > 0
      ? (isUltraCompact ? 16 : 20)
      : 0;
  const qrOrWalletHeight = (receiptData.isDraft && !isPaidEffective)
    ? isMember
      ? isWalletSufficient
        ? (isUltraCompact ? 42 : isCompact ? 50 : 62)
        : (isUltraCompact ? 54 : isCompact ? 68 : 88)
      : activeShop?.proformaQrUrl
      ? (isUltraCompact ? 54 : isCompact ? 68 : 88)
      : 0
    : (receiptData.isDraft && isPaidEffective ? (isUltraCompact ? 20 : 26) : 0);
  const voidHeight = receiptData.status === "cancel" ? (isUltraCompact ? 26 : 35) : 0;
  const footerHeight = isUltraCompact ? 22 : normalFooterHeight;
  const contentPadding = isUltraCompact ? 24 : isCompact ? 32 : normalContentPadding;

  const estimatedTotalHeight =
    headerHeight +
    customerHeight +
    tableHeaderHeight +
    itemsHeight +
    totalsBaseHeight +
    paymentsHeight +
    qrOrWalletHeight +
    voidHeight +
    footerHeight +
    contentPadding;

  const scale =
    estimatedTotalHeight > A5_MAX_HEIGHT
      ? Math.max(0.5, (A5_MAX_HEIGHT - 6) / estimatedTotalHeight)
      : 1;

  const remainingBalance = Math.max(0, (receiptData.total || 0) - totalPaid);

  return (
    <div
      style={{
        width: 559,
        height: A5_MAX_HEIGHT,
        overflow: "hidden",
        position: "relative",
        backgroundColor: "#ffffff",
        boxSizing: "border-box",
      }}
      className="bg-white text-zinc-800 font-sans select-none"
    >
      <div
        style={{
          width: scale < 1 ? `${Math.round(559 / scale)}px` : "559px",
          minHeight: scale < 1 ? `${Math.round(A5_MAX_HEIGHT / scale)}px` : `${A5_MAX_HEIGHT}px`,
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: "top left",
          padding: outerPadding,
          boxSizing: "border-box",
        }}
        className="flex flex-col h-full bg-white relative justify-between"
      >
        {/* PAID Watermark Stamp in center */}
        {isPaidEffective && !receiptData.isDraft && receiptData.status !== "cancel" && (
          <div
            className="absolute top-1/2 left-1/2 pointer-events-none select-none z-10"
            style={{ transform: "translate(-50%, -50%) rotate(-18deg)" }}
          >
            <div className="border-[3.5px] border-emerald-600/35 rounded-2xl px-6 py-2 text-center shadow-xs">
              <div className="border-2 border-dashed border-emerald-600/30 rounded-lg px-6 py-1">
                <span className="text-4xl font-black tracking-[0.25em] text-emerald-600/35 uppercase font-mono block">
                  PAID
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Top & Middle Section Wrapper (natural flow without min-h-0 overlap) */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className={`flex justify-between items-start ${headerMargin}`}>
            <div className="flex-1">
              <div className={isUltraCompact ? "mb-0.5" : "mb-1.5"}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeShop?.logoUrl || "/logo.png"}
                  alt="Shop Logo"
                  className={`${logoClass} object-contain filter grayscale contrast-125`}
                />
              </div>
              <h1 className={`${isUltraCompact ? "text-xs" : "text-sm"} font-black text-neutral-900 uppercase tracking-tight leading-tight`}>
                {activeShop?.name || "That Laundry Shop"}
              </h1>
              <p className="text-[10px] text-neutral-600 max-w-[260px] mt-0.5 whitespace-pre-line leading-tight">
                {activeShop?.addressFull || activeShop?.address || "123 Sukhumvit Road, Bangkok"}
              </p>
              <p className="text-[10px] text-neutral-600 mt-0.5">
                Tel: {activeShop?.phone || "081-111-2222"}
                {activeShop?.taxId && (
                  <span className="ml-2">
                    <span className="font-bold">TAX ID:</span> {activeShop.taxId}
                  </span>
                )}
              </p>
            </div>
            <div className="text-right">
              <h2 className={`${isUltraCompact ? "text-base mb-0.5" : "text-lg mb-1.5"} font-black text-neutral-900 uppercase tracking-wider`}>
                {receiptData.isDraft
                  ? currentLanguage === "en"
                    ? "PROFORMA INVOICE"
                    : "ใบแจ้งหนี้ชั่วคราว"
                  : receiptData.status === "cancel"
                  ? currentLanguage === "en"
                    ? "VOID RECEIPT"
                    : "ใบเสร็จยกเลิก"
                  : currentLanguage === "en"
                  ? "RECEIPT"
                  : "ใบเสร็จรับเงิน"}
              </h2>
              {receiptData.isDraft ? (
                <div className="text-[11px] mb-0.5">
                  <span className="font-bold text-neutral-700 mr-1">PROFORMA NO:</span>
                  <span className="font-mono font-medium text-neutral-900">{proformaDisplayId}</span>
                </div>
              ) : (
                <>
                  {!receiptData.status?.includes("cancel") && (
                    <div className="text-[11px] mb-0.5">
                      <span className="font-bold text-neutral-700 mr-1">RECEIPT NO:</span>
                      <span className="font-mono font-medium text-neutral-900">
                        {receiptData.receiptNumber || `RE-${receiptData.id}`}
                      </span>
                    </div>
                  )}
                  {receiptData.proformaId && (
                    <div className="text-[11px] mb-0.5">
                      <span className="font-bold text-neutral-700 mr-1">PROFORMA NO:</span>
                      <span className="font-mono font-medium text-neutral-900">
                        {receiptData.proformaRevision && receiptData.proformaRevision > 0
                          ? `${receiptData.proformaId}-R${receiptData.proformaRevision}`
                          : receiptData.proformaId}
                      </span>
                    </div>
                  )}
                </>
              )}
              <div className="text-[11px]">
                <span className="font-bold text-neutral-700 mr-1">DATE:</span>
                <span className="font-medium text-neutral-900">
                  {format(validDate, "dd/MM/yyyy HH:mm")}
                </span>
              </div>
            </div>
          </div>

          <hr className={`border-neutral-300 ${customerMargin}`} />

          {/* Customer + Collection Date */}
          <div className={`flex justify-between ${customerMargin}`}>
            <div className="flex-1">
              <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-0.5">
                {currentLanguage === "en" ? "BILLED TO" : "ลูกค้า"}
              </h3>
              <p className={`${isUltraCompact ? "text-xs" : "text-sm"} font-bold text-neutral-900 leading-tight`}>
                {receiptData.customerName}
              </p>
              <p className="text-xs text-neutral-600 font-mono mt-0.5">{receiptData.customerPhone}</p>
            </div>
            {receiptData.deliveryScheduledAt && (
              <div className="flex-1 text-right">
                <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-0.5">
                  {currentLanguage === "en" ? "COLLECTION DATE" : "วันรับผ้าคืน"}
                </h3>
                <p className={`${isUltraCompact ? "text-xs" : "text-sm"} font-bold text-neutral-900 leading-tight`}>
                  {format(new Date(receiptData.deliveryScheduledAt), "dd/MM/yyyy")}
                </p>
                <p className="text-xs text-neutral-600">
                  {format(new Date(receiptData.deliveryScheduledAt), "HH:mm")}
                </p>
              </div>
            )}
          </div>

          {/* Items Table */}
          <table className={`w-full text-left border-collapse ${tableMargin}`}>
            <thead>
              <tr className="border-b-2 border-neutral-800 font-bold text-neutral-900">
                <th className={`${tableHeaderClass} w-[50%]`}>
                  {currentLanguage === "en" ? "DESCRIPTION" : "รายการ"}
                </th>
                <th className={`${tableHeaderClass} text-center`}>
                  {currentLanguage === "en" ? "QTY" : "จำนวน"}
                </th>
                <th className={`${tableHeaderClass} text-right`}>
                  {currentLanguage === "en" ? "UNIT PRICE" : "ราคาต่อหน่วย"}
                </th>
                <th className={`${tableHeaderClass} text-right`}>
                  {currentLanguage === "en" ? "TOTAL" : "รวม"}
                </th>
              </tr>
            </thead>
            <tbody className="text-neutral-800 font-medium">
              {receiptData.items.map((item, idx) => (
                <tr key={idx} className="border-b border-neutral-200">
                  <td className={tableRowClass}>
                    {currentLanguage === "en" ? item.nameEn || item.name : item.name}
                  </td>
                  <td className={`${tableRowClass} text-center font-mono`}>{item.quantity}</td>
                  <td className={`${tableRowClass} text-right font-mono`}>{formatCurrency(item.price)}</td>
                  <td className={`${tableRowClass} text-right font-mono`}>
                    {formatCurrency(safeCeil((item.price || 0) * (item.quantity || 0)))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals Section */}
          <div className={`flex justify-end ${totalsMargin}`}>
            <div className="w-[55%]">
              <div className={`flex justify-between ${totalsRowClass} text-neutral-700 border-b border-neutral-300 pb-0.5 mb-0.5`}>
                <span>{currentLanguage === "en" ? "SUBTOTAL" : "ยอดรวม"}</span>
                <span className="font-mono">
                  ฿
                  {formatCurrency(
                    receiptData.subtotal != null ? receiptData.subtotal : receiptData.total || 0
                  )}
                </span>
              </div>
              {transportFeeItems.map((feeItem, idx) => (
                <div
                  key={`fee-${idx}`}
                  className={`flex justify-between ${totalsRowClass} text-neutral-700`}
                >
                  <span>{currentLanguage === "en" ? feeItem.name : feeItem.nameTh}</span>
                  <span className="font-mono">฿{formatCurrency(feeItem.total)}</span>
                </div>
              ))}
              {receiptData.expressSurcharge > 0 && (
                <div className={`flex justify-between ${totalsRowClass} text-rose-700`}>
                  <span>
                    {currentLanguage === "en" ? "Express Surcharge" : "ค่าบริการด่วนพิเศษ"}
                    {receiptData.serviceSpeed === "express_50" ? " (+50%)" : " (+100%)"}
                  </span>
                  <span className="font-mono">+฿{formatCurrency(receiptData.expressSurcharge)}</span>
                </div>
              )}
              {receiptData.discount > 0 && (
                <div className={`flex justify-between ${totalsRowClass} text-emerald-600`}>
                  <span>
                    {currentLanguage === "en" ? "Discount" : "ส่วนลด"}
                    {receiptData.discountPercent && receiptData.discountPercent > 0
                      ? ` (${receiptData.discountPercent}%)`
                      : ""}
                  </span>
                  <span className="font-mono">-{formatCurrency(receiptData.discount)}</span>
                </div>
              )}
              {receiptData.promoDiscount && receiptData.promoDiscount > 0 && (
                <div className={`flex justify-between ${totalsRowClass} text-amber-600`}>
                  <span>
                    {currentLanguage === "en"
                      ? (receiptData.promoTarget === "DELIVERY" ? "Delivery Discount" : "Promo Code")
                      : (receiptData.promoTarget === "DELIVERY" ? "ส่วนลดค่าจัดส่ง" : "โค้ดส่วนลด")}
                    {receiptData.promoCode ? ` (${receiptData.promoCode})` : ""}
                  </span>
                  <span className="font-mono">-{formatCurrency(receiptData.promoDiscount)}</span>
                </div>
              )}
              {receiptData.vatType === "exclusive" && receiptData.vatRate > 0 && (
                <div className={`flex justify-between ${totalsRowClass} text-neutral-700 border-b border-neutral-200`}>
                  <span>
                    {currentLanguage === "en"
                      ? `VAT (${receiptData.vatRate}%)`
                      : `ภาษีมูลค่าเพิ่ม (${receiptData.vatRate}%)`}
                  </span>
                  <span className="font-mono">฿{formatCurrency(receiptData.vatAmount)}</span>
                </div>
              )}
              <div className={`flex justify-between items-center border-t-2 border-neutral-900 whitespace-nowrap gap-2 ${grandTotalClass}`}>
                <span className="shrink-0">{currentLanguage === "en" ? "GRAND TOTAL" : "ยอดสุทธิ"}</span>
                <span className="font-mono shrink-0">฿{formatCurrency(receiptData.total)}</span>
              </div>
              {receiptData.vatType === "inclusive" && receiptData.vatRate > 0 && (
                <div className="flex justify-between py-0.5 text-[9.5px] text-neutral-500">
                  <span>
                    {currentLanguage === "en"
                      ? `Includes VAT ${receiptData.vatRate}%`
                      : `รวมภาษีมูลค่าเพิ่ม ${receiptData.vatRate}%`}
                  </span>
                  <span className="font-mono">฿{formatCurrency(receiptData.vatAmount)}</span>
                </div>
              )}

              {/* Payments breakdown */}
              {payments.length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-dashed border-neutral-300">
                  {payments.map((p, pIdx) => (
                    <div
                      key={pIdx}
                      className={`flex justify-between ${paymentsRowClass} text-neutral-800`}
                    >
                      <span className="uppercase text-[9px] font-bold">
                        {format(new Date(p.timestamp), "dd/MM/yyyy")} - PAID (
                        {p.method === "credit" ? "MEMBER" : p.method})
                      </span>
                      <span className="font-mono font-bold">฿{formatCurrency(p.amount)}</span>
                    </div>
                  ))}
                  <div className={`flex justify-between mt-0.5 text-neutral-900 border-t border-neutral-200 ${paymentsRowClass} font-black`}>
                    <span>{currentLanguage === "en" ? "TOTAL PAID" : "ชำระแล้ว"}</span>
                    <span className="font-mono">฿{formatCurrency(totalPaid)}</span>
                  </div>
                  {!isPaidEffective && remainingBalance > 0.01 && (
                    <div className={`flex justify-between py-0.5 text-rose-600 font-black ${isUltraCompact ? "text-[9.5px]" : "text-xs"}`}>
                      <span>{currentLanguage === "en" ? "BALANCE DUE" : "ยอดคงค้าง"}</span>
                      <span className="font-mono">
                        ฿{formatCurrency(remainingBalance)}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {!isPaidEffective &&
                payments.length === 0 &&
                !receiptData.isDraft &&
                (receiptData.total || 0) > 0 && (
                  <div className="mt-1.5 pt-1.5 border-t border-dashed border-neutral-300">
                    <div className={`flex justify-between py-0.5 text-rose-600 font-black ${isUltraCompact ? "text-[9.5px]" : "text-xs"}`}>
                      <span>
                        {currentLanguage === "en" ? "BALANCE DUE (UNPAID)" : "ยอดรอชำระ"}
                      </span>
                      <span className="font-mono">฿{formatCurrency(receiptData.total)}</span>
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>

        {/* Footer — anchored cleanly at bottom */}
        <div className="shrink-0 mt-auto pt-1.5 border-t border-neutral-200">
          {/* If Proforma is already paid in full, show clean paid badge instead of duplicate SCAN TO PAY */}
          {receiptData.isDraft && isPaidEffective && (
            <div className={`flex items-center justify-between border border-emerald-200 rounded-lg bg-emerald-50/70 text-emerald-800 shrink-0 ${isUltraCompact ? "p-1 mb-1 text-[9px]" : "p-1.5 mb-1 text-[10px]"}`}>
              <span className="font-bold uppercase tracking-wider flex items-center gap-1">
                ✓ {currentLanguage === "en" ? "Payment Completed" : "ชำระเงินเรียบร้อยแล้ว"}
              </span>
              <span className="font-mono font-black text-emerald-900">
                ฿{formatCurrency(totalPaid || receiptData.total || 0)}
              </span>
            </div>
          )}

          {/* QR / Payment Section — only on Proforma when NOT yet paid */}
          {receiptData.isDraft && !isPaidEffective && (
            <>
              {isMember ? (
                isWalletSufficient ? (
                  /* Member + Sufficient Wallet Balance: No QR Code */
                  <div className={`flex items-center border border-indigo-200/80 bg-indigo-50/40 shrink-0 ${qrBoxClass}`}>
                    <div className={`bg-indigo-100 text-indigo-600 rounded-lg shrink-0 ${isUltraCompact ? "p-1" : "p-1.5"}`}>
                      <Wallet size={isUltraCompact ? 14 : 18} />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <p className="text-[9px] font-bold text-indigo-800 uppercase tracking-widest">
                        Member Wallet Payment
                      </p>
                      <p className={`${isUltraCompact ? "text-[10px]" : "text-xs"} font-bold text-neutral-800`}>
                        Your wallet balance is{" "}
                        <span className="font-mono text-emerald-700 font-black">
                          ฿{formatCurrency(walletBalance)}
                        </span>
                        .
                      </p>
                      <p className="text-[8.5px] text-neutral-500 font-medium leading-tight">
                        Payment will be automatically deducted from your member wallet.
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Member + Insufficient Wallet Balance: Shows QR Code */
                  activeShop?.proformaQrUrl && (
                    <div className={`flex items-center border border-amber-200/80 bg-amber-50/60 shrink-0 ${qrBoxClass}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={activeShop.proformaQrUrl}
                        alt="Payment QR Code"
                        className={`${qrImageClass} object-contain shrink-0`}
                        crossOrigin="anonymous"
                      />
                      <div className="flex flex-col gap-0.5">
                        <p className="text-[9px] font-bold text-amber-800 uppercase tracking-widest">
                          Scan to Pay & Top Up
                        </p>
                        <p className={qrAmountClass}>
                          Your wallet balance is{" "}
                          <span className="font-mono text-rose-600 font-black">
                            ฿{formatCurrency(walletBalance)}
                          </span>
                          .
                        </p>
                        <p className="text-[8.5px] text-neutral-600 leading-tight font-medium">
                          Please top up your wallet or scan QR code to proceed.
                        </p>
                      </div>
                    </div>
                  )
                )
              ) : (
                /* Non-Member Retail Customer: PromptPay QR Code */
                activeShop?.proformaQrUrl && (
                  <div className={`flex items-center border border-neutral-200 bg-neutral-50 shrink-0 ${qrBoxClass}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeShop.proformaQrUrl}
                      alt="Payment QR Code"
                      className={`${qrImageClass} object-contain shrink-0`}
                      crossOrigin="anonymous"
                    />
                    <div className="flex flex-col gap-0.5">
                      <p className={qrTitleClass}>
                        Scan to Pay
                      </p>
                      <p className={qrAmountClass}>
                        ฿{formatCurrency(remainingBalance > 0 ? remainingBalance : receiptData.total || 0)}
                      </p>
                      <p className={qrSubtextClass}>
                        Scan QR code to complete
                        <br />
                        your payment via PromptPay
                      </p>
                    </div>
                  </div>
                )
              )}
            </>
          )}

          <div className="flex items-center justify-end">
            {receiptData.status === "cancel" && (
              <div className="text-base text-rose-600 font-black uppercase border-3 border-rose-600 px-3 py-1.5 inline-block transform -rotate-6 rounded-md opacity-80 mb-1">
                {currentLanguage === "en" ? "VOIDED" : "ยกเลิกแล้ว"}
              </div>
            )}
          </div>

          <div className="text-center pt-1.5 border-t border-neutral-200">
            <p className="text-[11px] text-neutral-500 font-medium">
              {receiptData.isDraft
                ? currentLanguage === "en"
                  ? "This is a proforma invoice, not an official tax receipt."
                  : "เอกสารใบแจ้งหนี้ชั่วคราว ไม่ใช่ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างเป็นทางการ"
                : receiptData.status === "cancel"
                ? currentLanguage === "en"
                  ? "This order has been cancelled"
                  : "รายการสั่งซื้อนี้ถูกยกเลิกแล้ว"
                : currentLanguage === "en"
                ? "Thank you for your business!"
                : "ขอบคุณที่ใช้บริการ!"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

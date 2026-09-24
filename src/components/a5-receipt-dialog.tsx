"use client";

import React, { useState, useEffect, useSyncExternalStore } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X, Loader2, Wallet } from "lucide-react";
import { ReceiptData, ReceiptItem, getCategoryDisplayName, resolveItemCategory, CATEGORY_ORDER } from "@/components/thermal-receipt-dialog";
import { createPortal } from "react-dom";
import { printImageUrl } from "@/components/ui/multi-image-uploader";
import { getTransportFeeBreakdown, safeCeil, findMatchingCustomer, formatJobDisplayId, generateReceiptNumber } from "@/lib/utils";

import { customerStore, serviceStore } from "@/lib/store";

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

    const filename = snapshotData.isDraft
      ? `proforma-${
          snapshotData.proformaId && snapshotData.proformaId !== "DRAFT"
            ? snapshotData.proformaId
            : targetJobId
        }-rev${snapshotData.proformaRevision || 0}.png`
      : `receipt-${targetJobId}.png`;

    const shouldCapture =
      snapshotData.isDraft ||
      snapshotData.autoCapture ||
      (!snapshotData.isDraft && snapshotData.isPaid);

    if (!shouldCapture) return;

    if (capturedKeysRef.current.has(captureKey)) return;

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
            try {
              const { api } = await import("@/lib/api");
              await api.updateJob(targetJob.id, {
                billImageUrl: JSON.stringify(newBills),
              } as any);
            } catch {}
          }
        }
      }
    };

    const runCapture = async () => {
      // Avoid duplicate capture if current job in store already has this exact filename
      const { jobStore } = await import("@/lib/store");
      const currentJob = jobStore.getSnapshot().find((j: any) => j.id === targetJobId || (rawJobId && j.id === rawJobId));
      if (currentJob && currentJob.billImageUrl) {
        try {
          const parsed = JSON.parse(currentJob.billImageUrl);
          const existingBills = Array.isArray(parsed) ? parsed : [parsed];
          if (existingBills.some((url: string) => url.includes(filename))) {
            capturedKeysRef.current.add(captureKey);
            return;
          }
        } catch {}
      }

      capturedKeysRef.current.add(captureKey);

      try {
        const { generateA5ReceiptImage } = await import("@/lib/a5-canvas-generator");
        const blob = await generateA5ReceiptImage(snapshotData, activeShop);
        if (blob) {
          uploadAndSave(blob).catch((err) =>
            console.error("Background receipt upload failed:", err)
          );
        }
      } catch (err) {
        console.error("Failed to capture and upload receipt image:", err);
      }
    };

    setTimeout(() => {
      runCapture();
    }, 50);
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
    if (!receiptData.isDraft && receiptData.isPaid && (receiptData.total || 0) > 0) {
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
  const isPaidEffective = receiptData.isDraft
    ? Boolean(payments.length > 0 && totalPaid >= (receiptData.total || 0) && (receiptData.total || 0) > 0)
    : Boolean(receiptData.isPaid || (totalPaid >= (receiptData.total || 0) && (receiptData.total || 0) > 0));

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

  const services = useSyncExternalStore(serviceStore.subscribe, serviceStore.getSnapshot, serviceStore.getSnapshot);

  const groupedItems = React.useMemo(() => {
    if (!receiptData?.items || receiptData.items.length === 0) return [];
    const groupMap = new Map<string, ReceiptItem[]>();
    for (const item of receiptData.items) {
      const cat = resolveItemCategory(item, services);
      if (!groupMap.has(cat)) groupMap.set(cat, []);
      groupMap.get(cat)!.push(item);
    }
    const sortedCategories = Array.from(groupMap.keys()).sort((a, b) => {
      const idxA = CATEGORY_ORDER.indexOf(a);
      const idxB = CATEGORY_ORDER.indexOf(b);
      const rankA = idxA === -1 ? 999 : idxA;
      const rankB = idxB === -1 ? 999 : idxB;
      return rankA - rankB;
    });
    return sortedCategories.map(cat => ({
      category: cat,
      displayName: getCategoryDisplayName(cat, currentLanguage),
      items: groupMap.get(cat)!
    }));
  }, [receiptData?.items, currentLanguage, services]);

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
  const normalContentPadding = 48; // 24px top + 24px bottom
  const normalHeaderMargin = 12; // mb-3
  const normalDividerMargin = 13; // 1px border + mb-3
  const normalCustomerMargin = 12; // mb-3
  const normalTableMargin = 12; // mb-3
  const normalTotalsMargin = 12; // mb-3
  const normalFooterBorder = 7; // pt-1.5 + border-t

  const normalHeaderHeight = 125 + normalHeaderMargin + normalDividerMargin;
  const normalCustomerHeight =
    50 +
    (receiptData.deliveryAddress ? (receiptData.deliveryAddress.length > 35 ? 32 : 18) : 0) +
    normalCustomerMargin;
  const normalTableHeaderHeight = 28;
  const normalItemRowHeight = 26; // py-1 (8px) + line-height (17px) + border (1px)
  const normalCategoryHeaderHeight = 26; // py-1 (8px) + line-height (16px) + borders (2px)
  const normalItemsHeight =
    receiptData.items.length * normalItemRowHeight +
    groupedItems.length * normalCategoryHeaderHeight +
    normalTableMargin;

  const normalTotalsRowHeight = 20;
  const normalTotalsBaseHeight =
    50 +
    extraTotalsLines * normalTotalsRowHeight +
    normalTotalsMargin;

  const normalPaymentsHeight =
    payments.length > 0
      ? payments.length * normalTotalsRowHeight + 38
      : !isPaidEffective && !receiptData.isDraft && (receiptData.total || 0) > 0
      ? 26
      : 0;

  const normalQrOrWalletHeight = (receiptData.isDraft && !isPaidEffective)
    ? isMember
      ? isWalletSufficient
        ? 68
        : 98 // QR box: 72px image + 16px padding + 2px border + 8px margin
      : activeShop?.proformaQrUrl
      ? 98
      : 0
    : (receiptData.isDraft && isPaidEffective ? 32 : 0);

  const normalMemberBalanceHeight = (!receiptData.isDraft && isMember) ? 38 : 0;
  const normalVoidHeight = receiptData.status === "cancel" ? 35 : 0;
  const normalFooterHeight = 25 + normalFooterBorder;

  const estimatedNormalHeight =
    normalContentPadding +
    normalHeaderHeight +
    normalCustomerHeight +
    normalTableHeaderHeight +
    normalItemsHeight +
    normalTotalsBaseHeight +
    normalPaymentsHeight +
    normalQrOrWalletHeight +
    normalMemberBalanceHeight +
    normalVoidHeight +
    normalFooterHeight;

  const A5_MAX_HEIGHT = 793;

  // Only reduce font size / padding when the content actually starts to exceed A5 page capacity!
  // Compact mode: triggers when normal height exceeds 620px (prevents any bottom overflow on medium/categorized orders)
  // UltraCompact mode: triggers when normal height exceeds 750px (very long orders, 10+ items)
  const isCompact = estimatedNormalHeight > 620 && estimatedNormalHeight <= 750;
  const isUltraCompact = estimatedNormalHeight > 750;

  // Dynamic styling tokens based on compaction mode
  const outerPadding = isUltraCompact ? "10px 16px" : isCompact ? "14px 20px" : "24px 28px";
  const headerMargin = isUltraCompact ? "mb-1" : isCompact ? "mb-1.5" : "mb-3";
  const logoClass = isUltraCompact ? "h-6" : isCompact ? "h-7" : "h-9";
  const customerMargin = isUltraCompact ? "mb-1" : isCompact ? "mb-1.5" : "mb-3";
  const tableMargin = isUltraCompact ? "mb-1" : isCompact ? "mb-1.5" : "mb-3";
  const tableHeaderClass = isUltraCompact ? "py-0.5 px-1 text-[9px]" : isCompact ? "py-0.5 px-1 text-[9.5px]" : "py-1.5 px-1 text-[10px]";
  const categoryHeaderClass = isUltraCompact ? "py-0.5 px-1.5 text-[8.5px]" : isCompact ? "py-0.5 px-2 text-[9px]" : "py-1 px-2.5 text-[9.5px]";
  const tableRowClass = isUltraCompact ? "py-0.5 px-1 text-[9.5px]" : isCompact ? "py-0.5 px-1 text-[10.5px]" : "py-1 px-1 text-xs";
  const totalsMargin = isUltraCompact ? "mb-1" : isCompact ? "mb-1.5" : "mb-3";
  const totalsRowClass = isUltraCompact ? "py-0 text-[9.5px]" : isCompact ? "py-0.5 text-[10.5px]" : "py-0.5 text-xs";
  const grandTotalClass = isUltraCompact ? "py-0.5 text-xs font-black" : isCompact ? "py-0.5 text-[13px] font-black" : "py-1 text-sm font-black";
  const paymentsRowClass = isUltraCompact ? "py-0 text-[9px]" : isCompact ? "py-0.5 text-[10px]" : "py-0.5 text-xs";
  const qrBoxClass = isUltraCompact ? "p-1 mb-1 gap-2 rounded-lg" : isCompact ? "p-1.5 mb-1.5 gap-2.5 rounded-lg" : "p-2 mb-2 gap-3 rounded-xl";
  const qrImageClass = isUltraCompact ? "h-11 w-11" : isCompact ? "h-13 w-13" : "h-18 w-18";
  const qrTitleClass = `font-bold text-neutral-400 uppercase tracking-widest ${isUltraCompact ? "text-[8px]" : "text-[9px]"}`;
  const qrAmountClass = `font-black text-neutral-900 ${isUltraCompact ? "text-xs" : isCompact ? "text-[13px]" : "text-sm"}`;
  const qrSubtextClass = `leading-tight text-neutral-400 ${isUltraCompact ? "text-[8px]" : "text-[9px]"}`;

  // Step 2: Accurate height calculation based on chosen compaction mode
  const contentPadding = isUltraCompact ? 20 : isCompact ? 28 : normalContentPadding;
  const headerHeight = isUltraCompact ? 105 : isCompact ? 122 : normalHeaderHeight;
  const customerHeight =
    (isUltraCompact ? 40 : isCompact ? 46 : 50) +
    (receiptData.deliveryAddress ? (isUltraCompact ? 14 : isCompact ? 16 : 20) : 0) +
    (isUltraCompact ? 4 : isCompact ? 6 : 12);
  const tableHeaderHeight = isUltraCompact ? 18 : isCompact ? 22 : normalTableHeaderHeight;
  const categoryHeaderHeight = isUltraCompact ? 16 : isCompact ? 19 : normalCategoryHeaderHeight;
  const itemRowHeight = isUltraCompact ? 17 : isCompact ? 20 : normalItemRowHeight;
  const itemsHeight =
    receiptData.items.length * itemRowHeight +
    groupedItems.length * categoryHeaderHeight +
    (isUltraCompact ? 4 : isCompact ? 6 : 12);
  const totalsRowHeight = isUltraCompact ? 14 : isCompact ? 17 : normalTotalsRowHeight;
  const totalsBaseHeight =
    (isUltraCompact ? 35 : isCompact ? 42 : 50) +
    extraTotalsLines * totalsRowHeight +
    (isUltraCompact ? 4 : isCompact ? 6 : 12);
  const paymentsHeight =
    payments.length > 0
      ? payments.length * totalsRowHeight + (isUltraCompact ? 26 : isCompact ? 30 : 38)
      : !isPaidEffective && !receiptData.isDraft && (receiptData.total || 0) > 0
      ? (isUltraCompact ? 16 : isCompact ? 20 : 26)
      : 0;
  const qrOrWalletHeight = (receiptData.isDraft && !isPaidEffective)
    ? isMember
      ? isWalletSufficient
        ? (isUltraCompact ? 44 : isCompact ? 54 : 68)
        : (isUltraCompact ? 58 : isCompact ? 76 : 98)
      : activeShop?.proformaQrUrl
      ? (isUltraCompact ? 58 : isCompact ? 76 : 98)
      : 0
    : (receiptData.isDraft && isPaidEffective ? (isUltraCompact ? 22 : isCompact ? 28 : 32) : 0);
  const memberBalanceHeight = (!receiptData.isDraft && isMember)
    ? (isUltraCompact ? 24 : isCompact ? 30 : 38)
    : 0;
  const voidHeight = receiptData.status === "cancel" ? (isUltraCompact ? 26 : 35) : 0;
  const footerHeight = (isUltraCompact ? 20 : isCompact ? 22 : 25) + (isUltraCompact ? 4 : isCompact ? 5 : 7);

  const estimatedTotalHeight =
    contentPadding +
    headerHeight +
    customerHeight +
    tableHeaderHeight +
    itemsHeight +
    totalsBaseHeight +
    paymentsHeight +
    qrOrWalletHeight +
    memberBalanceHeight +
    voidHeight +
    footerHeight;

  const scale =
    estimatedTotalHeight > (A5_MAX_HEIGHT - 6)
      ? Math.max(0.45, (A5_MAX_HEIGHT - 6) / estimatedTotalHeight)
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
          height: scale < 1 ? `${Math.round(A5_MAX_HEIGHT / scale)}px` : `${A5_MAX_HEIGHT}px`,
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: "top left",
          padding: outerPadding,
          boxSizing: "border-box",
        }}
        className="flex flex-col bg-white relative justify-between"
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
                {receiptData.brand === "noname_laundry"
                  ? "Noname Laundry"
                  : (activeShop?.name || "That Laundry Shop")}
              </h1>
              <p className="text-[10px] text-neutral-600 max-w-[260px] mt-0.5 whitespace-pre-line leading-tight">
                {receiptData.brand === "noname_laundry"
                  ? "Online Laundry & Dry Clean Service\nWeb: nonamelaundry.com"
                  : (activeShop?.addressFull || activeShop?.address || "123 Sukhumvit Road, Bangkok")}
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
                  : (receiptData as any).isCreditNote || receiptData.id?.startsWith("CN-") || receiptData.receiptNumber?.startsWith("CN-")
                  ? currentLanguage === "en"
                    ? "CREDIT NOTE"
                    : "ใบลดหนี้ (CREDIT NOTE)"
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
                      <span className="font-bold text-neutral-700 mr-1">
                        {receiptData.id?.startsWith("CN-") || receiptData.receiptNumber?.startsWith("CN-") || (receiptData as any).isCreditNote
                          ? "CREDIT NOTE NO:"
                          : "RECEIPT NO:"}
                      </span>
                      <span className="font-mono font-medium text-neutral-900">
                        {receiptData.receiptNumber || generateReceiptNumber(formatJobDisplayId(receiptData.id))}
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

          {/* Customer + Delivery Date */}
          <div className={`flex justify-between ${customerMargin}`}>
            <div className="flex-1 pr-4">
              <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-0.5">
                {currentLanguage === "en" ? "BILLED TO" : "ลูกค้า"}
              </h3>
              <p className={`${isUltraCompact ? "text-xs" : "text-sm"} font-bold text-neutral-900 leading-tight`}>
                {receiptData.customerName}
              </p>
              <p className="text-xs text-neutral-600 font-mono mt-0.5">{receiptData.customerPhone}</p>
              {receiptData.deliveryAddress && (
                <p className={`${isUltraCompact ? "text-[10px]" : "text-[11px]"} text-neutral-600 mt-0.5 leading-snug break-words`}>
                  {receiptData.deliveryAddress}
                </p>
              )}
            </div>
            {receiptData.deliveryScheduledAt && (
              <div className="flex-1 text-right">
                <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-0.5">
                  {currentLanguage === "en" ? "DELIVERY DATE" : "วันรับผ้าคืน"}
                </h3>
                <p className={`${isUltraCompact ? "text-xs" : "text-sm"} font-bold text-neutral-900 leading-tight`}>
                  {format(new Date(receiptData.deliveryScheduledAt), "dd/MM/yyyy")}
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
              {groupedItems.map((group, gIdx) => (
                <React.Fragment key={group.category || gIdx}>
                  <tr className="bg-neutral-100/90 border-t border-b border-neutral-300">
                    <td
                      colSpan={4}
                      className={`${categoryHeaderClass} font-bold text-neutral-700 uppercase tracking-wider`}
                    >
                      {group.displayName}
                    </td>
                  </tr>
                  {group.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-neutral-200">
                      <td className={`${tableRowClass} pl-3.5`}>
                        {currentLanguage === "en" ? item.nameEn || item.name : item.name}
                      </td>
                      <td className={`${tableRowClass} text-center font-mono`}>{item.quantity}</td>
                      <td className={`${tableRowClass} text-right font-mono`}>{formatCurrency(item.price)}</td>
                      <td className={`${tableRowClass} text-right font-mono`}>
                        {formatCurrency(safeCeil((item.price || 0) * (item.quantity || 0)))}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
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
          {/* Member Remaining Balance — on Receipt when customer is a Member */}
          {!receiptData.isDraft && isMember && (
            <div
              className={`flex items-center justify-between border border-indigo-200 bg-indigo-50/70 shrink-0 ${
                isUltraCompact
                  ? "p-1 mb-1 gap-2 rounded-lg"
                  : isCompact
                  ? "p-1.5 mb-1.5 gap-2.5 rounded-lg"
                  : "p-2 mb-2 gap-3 rounded-xl"
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`bg-indigo-100 text-indigo-600 rounded-lg shrink-0 ${
                    isUltraCompact ? "p-1" : isCompact ? "p-1.5" : "p-1.5"
                  }`}
                >
                  <Wallet size={isUltraCompact ? 13 : isCompact ? 15 : 16} />
                </div>
                <div>
                  <p
                    className={`font-bold text-indigo-900 uppercase tracking-wider leading-tight ${
                      isUltraCompact ? "text-[8.5px]" : "text-[9.5px]"
                    }`}
                  >
                    {currentLanguage === "en" ? "Member Remaining Balance" : "ยอดเงินคงเหลือในกระเป๋าสมาชิก (Wallet)"}
                  </p>
                  <p
                    className={`text-neutral-500 font-medium leading-tight ${
                      isUltraCompact ? "text-[7.5px]" : "text-[8.5px]"
                    }`}
                  >
                    {currentLanguage === "en" ? "Available credit in wallet" : "ยอดเงินคงเหลือที่สามารถใช้ได้"}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span
                  className={`font-mono font-black text-indigo-950 ${
                    isUltraCompact ? "text-xs" : isCompact ? "text-[13px]" : "text-sm"
                  }`}
                >
                  ฿{formatCurrency(walletBalance)}
                </span>
              </div>
            </div>
          )}

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

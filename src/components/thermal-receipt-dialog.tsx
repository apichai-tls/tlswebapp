"use client";

import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { type Job } from "@/lib/store";
import { printImageUrl } from "@/components/ui/multi-image-uploader";
import { cleanProformaNumber, formatProformaNumber } from "@/lib/utils";

export interface ReceiptItem {
  name: string;
  nameEn?: string | null;
  price: number;
  quantity: number;
}

export interface ReceiptData {
  id: string;
  receiptNumber?: string;
  createdAt: Date;
  customerName: string;
  customerPhone: string;
  items: ReceiptItem[];
  subtotal: number;
  expressSurcharge: number;
  serviceSpeed?: string;
  discount: number;
  discountPercent?: number;
  total: number;
  isPaid: boolean;
  paymentChannel?: string | null;
  remark?: string | null;
  isDraft: boolean;
  vatType: string;
  vatRate: number;
  vatAmount: number;
  deliveryScheduledAt?: Date | string | null;
  status?: string | null;
  adminNotesJson?: string | null;
  deliveryFee?: number;
  proformaId?: string;
  jobId?: string;
  proformaRevision?: number;
  autoCapture?: boolean;
}

export interface ShopInfo {
  id?: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  taxId?: string | null;
  logoUrl?: string | null;
}

interface PaymentLog {
  timestamp: string;
  method: string;
  amount: number;
  received?: number;
  change?: number;
}

const cleanRemarkForDisplay = (rawRemark: string | null | undefined) => {
  if (!rawRemark) return "";
  return rawRemark
    .split(" | ")
    .filter(part => !part.startsWith("VAT:") && !part.startsWith("Express") && !part.startsWith("Proforma:") && !part.startsWith("Revision:"))
    .join(" | ")
    .trim();
};

const isCollectionDateEdited = (createdAt: Date | string, deliveryScheduledAt: Date | string | null | undefined) => {
  if (!deliveryScheduledAt) return false;
  const created = new Date(createdAt);
  const scheduled = new Date(deliveryScheduledAt);
  if (isNaN(created.getTime()) || isNaN(scheduled.getTime())) return false;

  const defaultUnrounded = new Date(created.getTime() + 86400000);
  const diffUnrounded = Math.abs(scheduled.getTime() - defaultUnrounded.getTime());
  if (diffUnrounded < 120000) return false;

  const defaultRounded = new Date(created.getTime() + 86400000);
  defaultRounded.setMinutes(0, 0, 0);
  const diffRounded = Math.abs(scheduled.getTime() - defaultRounded.getTime());
  if (diffRounded < 120000) return false;

  return true;
};

export function formatJobToReceiptData(job: Job): ReceiptData {
  const expressMatch = job.remark?.match(/Express\s*(\d+)%/i);
  const expressPercent = expressMatch ? parseInt(expressMatch[1], 10) : 0;
  const jobSpeed = expressPercent > 0 ? `express_${expressPercent}` : "standard";
  
  // Cast to access database fields that might not be in the strict Job type definition
  const rawJob = job as unknown as { 
    itemsJson?: string; 
    totalAmount?: number; 
    total?: number; 
    isPaid?: boolean; 
    paymentChannel?: string; 
    remark?: string; 
    deliveryScheduledAt?: Date | string | null; 
    status?: string | null; 
    adminNotesJson?: string;
    fee?: number;
  };

  const jobItems = Array.isArray(job.items) 
    ? job.items 
    : (rawJob.itemsJson ? JSON.parse(rawJob.itemsJson) : []);
  
  const jobSubtotal = jobItems.reduce((sum: number, item: { price: number; quantity: number }) => sum + (item.price * item.quantity), 0);
  const jobSurcharge = expressPercent > 0 ? Math.ceil(jobSubtotal * (expressPercent / 100)) : 0;

  const vatMatch = job.remark?.match(/VAT:\s*(\w+)\s*\((\d+(?:\.\d+)?)\%\)/i);
  let jobVatType = (job as any).vatType || (vatMatch ? vatMatch[1].toLowerCase() : "none");
  let jobVatRate = (job as any).vatRate !== undefined ? (job as any).vatRate : (vatMatch ? parseFloat(vatMatch[2]) : 0);
  
  if (jobVatType === "none" && !vatMatch && typeof window !== "undefined") {
    try {
      const { settingsStore } = require("@/lib/store");
      const sysSettings = settingsStore.getSnapshot();
      if (sysSettings?.vatType && sysSettings.vatType !== "none") {
        jobVatType = sysSettings.vatType.toLowerCase();
        jobVatRate = parseFloat(sysSettings.vatRate || "7") || 7;
      }
    } catch {}
  }

  const baseTotal = Math.max(0, jobSubtotal + jobSurcharge + (rawJob.fee !== undefined ? rawJob.fee : (job.fee || 0)) - (job.discount || 0));
  let jobVatAmount = 0;
  if (jobVatType === "inclusive" && jobVatRate > 0) {
    jobVatAmount = baseTotal * (jobVatRate / (100 + jobVatRate));
  } else if (jobVatType === "exclusive" && jobVatRate > 0) {
    jobVatAmount = baseTotal * (jobVatRate / 100);
  }

  const proformaMatch = job.remark?.match(/Proforma:\s*(PR-[^\s|]+)/i);
  const rawProformaId = (job as any).proformaReceiptNumber || (proformaMatch ? proformaMatch[1] : undefined);
  const cleanBaseProforma = cleanProformaNumber(rawProformaId);
  const revisionMatch = job.remark?.match(/Revision:\s*(\d+)/i);
  const proformaRevision = ((job as any).proformaRevision != null && (job as any).proformaRevision !== "")
    ? Number((job as any).proformaRevision)
    : (revisionMatch ? parseInt(revisionMatch[1], 10) : 0);

  const effectiveProformaNumber = cleanBaseProforma 
    ? formatProformaNumber(cleanBaseProforma, proformaRevision)
    : undefined;

  let displayId = job.id && job.id !== "DRAFT" ? job.id.split('-')[0].toUpperCase() : "";
  if (!displayId || displayId === "DRAFT") {
    displayId = effectiveProformaNumber || "DRAFT";
  }

  let paymentTime: Date | null = null;
  try {
    if (rawJob.adminNotesJson) {
      const parsed = JSON.parse(rawJob.adminNotesJson);
      if (parsed && Array.isArray(parsed.payments) && parsed.payments.length > 0) {
        const lastPay = parsed.payments[parsed.payments.length - 1];
        if (lastPay && lastPay.timestamp) {
          paymentTime = new Date(lastPay.timestamp);
        }
      }
    }
  } catch {}

  const receiptDate = (rawJob.isPaid && paymentTime && !isNaN(paymentTime.getTime()))
    ? paymentTime
    : (job.createdAt ? new Date(job.createdAt) : new Date());

  return {
    id: displayId,
    createdAt: receiptDate,
    customerName: job.customerName || "Walk-In",
    customerPhone: job.customerPhone || "-",
    items: jobItems.map((item: { name: string; nameEn?: string | null; quantity: number; price: number }) => ({
      name: item.name,
      nameEn: item.nameEn || item.name,
      quantity: item.quantity,
      price: item.price
    })),
    subtotal: jobSubtotal,
    expressSurcharge: jobSurcharge,
    serviceSpeed: jobSpeed,
    discount: job.discount || 0,
    discountPercent: job.discountPercent || 0,
    total: job.totalAmount !== undefined ? job.totalAmount : (rawJob.total || 0),
    isPaid: !!job.isPaid,
    paymentChannel: job.paymentChannel,
    remark: job.remark,
    isDraft: false,
    vatType: jobVatType,
    vatRate: jobVatRate,
    vatAmount: jobVatAmount,
    deliveryScheduledAt: job.deliveryScheduledAt,
    status: job.status,
    adminNotesJson: job.adminNotesJson,
    deliveryFee: rawJob.fee !== undefined ? rawJob.fee : (job.fee || 0),
    proformaId: cleanBaseProforma || rawProformaId,  // base number only — display layers append -R{n}
    proformaRevision: proformaRevision,
    jobId: job.id
  };
}

interface ThermalReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiptData: ReceiptData | null;
  activeShop: ShopInfo | null | undefined;
  receiptPaperSize?: string;
  currentLanguage?: string;
  onCloseComplete?: () => void;
  onBillImageUploaded?: (url: string) => void;
}

export function ThermalReceiptDialog({
  open,
  onOpenChange,
  receiptData,
  activeShop,
  receiptPaperSize = "80mm",
  currentLanguage = "th",
  onCloseComplete,
  onBillImageUploaded
}: ThermalReceiptDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const activeCaptureDataRef = useRef<ReceiptData | null>(null);
  const capturedKeysRef = useRef<Set<string>>(new Set());
  const receiptRef = useRef<HTMLDivElement | null>(null);

  if (receiptData) {
    activeCaptureDataRef.current = receiptData;
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!receiptData) return;
    const snapshotData = JSON.parse(JSON.stringify(receiptData));
    
    // For proforma drafts: prefer jobId (real job id) then proformaId, skip "DRAFT" string
    const rawJobId = snapshotData.jobId && snapshotData.jobId !== "DRAFT" ? snapshotData.jobId : null;
    const targetJobId = rawJobId || (snapshotData.proformaId && snapshotData.proformaId !== "DRAFT" ? snapshotData.proformaId : null) || (snapshotData.id && snapshotData.id !== "DRAFT" ? snapshotData.id : null);
    if (!targetJobId) return;

    const captureKey = `${targetJobId}_${snapshotData.isDraft ? "draft" : "paid"}_rev${snapshotData.proformaRevision || 0}`;
    if (capturedKeysRef.current.has(captureKey)) return;
    capturedKeysRef.current.add(captureKey); // Lock immediately to prevent duplicate runs on re-render

    const runCapture = async () => {
      const filename = snapshotData.isDraft 
        ? `proforma-${snapshotData.proformaId || targetJobId}-rev${snapshotData.proformaRevision || 0}.png`
        : `receipt-${targetJobId}.png`;

      const { jobStore } = await import("@/lib/store");
      const currentJob = jobStore.getSnapshot().find(j => j.id === targetJobId || (rawJobId && j.id === rawJobId));
      if (currentJob && currentJob.billImageUrl) {
        try {
          const parsed = JSON.parse(currentJob.billImageUrl);
          const existingBills = Array.isArray(parsed) ? parsed : [parsed];
          if (existingBills.some(url => url.includes(filename))) {
            capturedKeysRef.current.add(captureKey);
            return;
          }
        } catch {}
      }

      try {
        let blob: Blob | null = null;

        // PRIMARY: html2canvas capture of the actual dialog DOM.
        // Wait for document.fonts.ready so web fonts are fully loaded first.
        const captureEl = receiptRef.current || document.getElementById("thermal-receipt-capture-area") as HTMLElement | null;
        if (captureEl) {
          try {
            if (typeof document !== "undefined" && document.fonts?.ready) {
              await document.fonts.ready;
            }
            await new Promise(r => setTimeout(r, 50));

            const html2canvas = (await import("html2canvas-pro")).default;
            const canvas = await html2canvas(captureEl, {
              scale: 2,
              useCORS: true,
              allowTaint: true,
              backgroundColor: "#ffffff",
              logging: false,
              imageTimeout: 5000,
              onclone: (_clonedDoc: Document, clonedEl: HTMLElement) => {
                const all = clonedEl.querySelectorAll("*");
                all.forEach((el) => {
                  const s = (el as HTMLElement).style;
                  if (s) {
                    s.letterSpacing = "normal";
                    s.wordSpacing   = "normal";
                    s.textRendering = "auto";
                    s.fontKerning   = "auto";
                  }
                });
              }
            });
            blob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, "image/png")
            );
          } catch (e) {
            console.warn("html2canvas-pro capture failed, falling back to thermal canvas generator", e);
          }
        }

        // FALLBACK: thermal canvas generator (clean but uses system font)
        if (!blob) {
          try {
            const { generateThermalReceiptImage } = await import("@/lib/thermal-canvas-generator");
            blob = await generateThermalReceiptImage(snapshotData, activeShop);
          } catch (e) {
            console.warn("thermal-canvas-generator fallback also failed", e);
          }
        }

        if (!blob) return;

        // Upload to Google Cloud Storage asynchronously in background
        const uploadAndSave = async (b: Blob) => {
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
                filename
              })
            });
            const signData = await signRes.json();
            if (signData.uploadUrl && signData.publicUrl) {
              const putRes = await fetch(signData.uploadUrl, {
                method: "PUT",
                headers: { "Content-Type": "image/png" },
                body: b
              });
              if (putRes.ok) {
                uploadResult = { success: true, publicUrl: signData.publicUrl };
              }
            }
          } catch (gcsErr) {
            console.warn("GCS upload failed, falling back to local:", gcsErr);
            const file = new File([b], filename, { type: "image/png" });
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
            if (onBillImageUploaded) {
              onBillImageUploaded(uploadResult.publicUrl);
            }
            const targetJob = currentJob || jobStore.getSnapshot().find(j => j.id === rawJobId || j.id === targetJobId);
            if (targetJob) {
              let existingBills: string[] = [];
              try {
                if (targetJob.billImageUrl) {
                  const parsed = JSON.parse(targetJob.billImageUrl);
                  if (Array.isArray(parsed)) existingBills = parsed;
                  else if (typeof parsed === 'string') existingBills = [parsed];
                }
              } catch {}
              
              if (!existingBills.includes(uploadResult.publicUrl)) {
                const newBills = [...existingBills, uploadResult.publicUrl];
                await jobStore.updateJobDetails(targetJob.id, {
                  billImageUrl: JSON.stringify(newBills)
                });
              }
            }
          }
        };

        uploadAndSave(blob).catch(err => console.error("Thermal background upload error:", err));
      } catch (err) {
        console.error("Failed to capture and upload receipt image:", err);
      }
    };

    setTimeout(runCapture, 10);

  }, [receiptData, activeShop, onBillImageUploaded]);

  if (!receiptData) return null;

  const paperSize = receiptPaperSize;
  const isSmall = paperSize === "58mm";
  const isA5 = paperSize === "A5";

  // Parse payments list breakdown
  let payments: PaymentLog[] = [];
  try {
    if (receiptData.adminNotesJson) {
      const parsed = JSON.parse(receiptData.adminNotesJson);
      if (parsed && Array.isArray(parsed.payments)) {
        payments = parsed.payments;
      }
    }
  } catch {
    // Suppress error
  }

  const totalPaid = payments.reduce((s: number, p: PaymentLog) => s + p.amount, 0);

  const handlePrint = async () => {
    if (!receiptData) { window.print(); return; }
    setIsPrinting(true);
    try {
      const { generateThermalReceiptImage } = await import("@/lib/thermal-canvas-generator");
      const blob = await generateThermalReceiptImage(receiptData, activeShop);
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

  const formatCurrency = (val: number) => {
    const num = typeof val === "number" ? val : parseFloat(val) || 0;
    return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Receipt Content Render function
  const renderReceiptContent = (printMode: boolean = false, customId?: string) => {
    return (
      <div 
        ref={!printMode ? receiptRef : undefined}
        id={customId || (!printMode ? "thermal-receipt-capture-area" : undefined)}
        data-paper-size={paperSize} 
        className={
          printMode 
            ? `bg-white text-black font-mono leading-normal p-2 ${isA5 ? "w-[148mm] text-sm" : (isSmall ? "w-[58mm] text-[9px]" : "w-[80mm] text-[11px]")} space-y-4`
            : `printable-receipt ${isA5 ? "w-[420px]" : (isSmall ? "w-[220px]" : "w-[280px]")} bg-white text-zinc-800 ${isA5 ? "p-8 pt-10 pb-10 text-xs" : (isSmall ? "p-3.5 pt-5 pb-5 text-[8.5px]" : "p-5 pt-7 pb-7 text-[10px]")} shadow-2xl rounded-sm border border-neutral-300/60 space-y-4 relative overflow-hidden text-left`
        }
        style={printMode ? { width: isA5 ? "148mm" : (isSmall ? "58mm" : "80mm"), margin: "0 auto" } : undefined}
      >
        {/* Jagged tear effect top (only on screen) */}
        {!printMode && (
          <div className="absolute top-0 left-0 right-0 h-[6px] overflow-hidden select-none pointer-events-none print:hidden !mt-0">
            <svg className="w-full h-full text-neutral-900 dark:text-neutral-950 fill-current block" viewBox="0 0 100 10" preserveAspectRatio="none">
              <polygon points="0,0 2.5,10 5,0 7.5,10 10,0 12.5,10 15,0 17.5,10 20,0 22.5,10 25,0 27.5,10 30,0 32.5,10 35,0 37.5,10 40,0 42.5,10 45,0 47.5,10 50,0 52.5,10 55,0 57.5,10 60,0 62.5,10 65,0 67.5,10 70,0 72.5,10 75,0 77.5,10 80,0 82.5,10 85,0 87.5,10 90,0 92.5,10 95,0 97.5,10 100,0 100,0 0,0" />
            </svg>
          </div>
        )}

        {/* Jagged tear effect bottom (only on screen) */}
        {!printMode && (
          <div className="absolute bottom-0 left-0 right-0 h-[6px] overflow-hidden select-none pointer-events-none print:hidden !mt-0">
            <svg className="w-full h-full text-neutral-900 dark:text-neutral-950 fill-current block" viewBox="0 0 100 10" preserveAspectRatio="none">
              <polygon points="0,10 2.5,0 5,10 7.5,0 10,10 12.5,0 15,10 17.5,0 20,10 22.5,0 25,10 27.5,0 30,10 32.5,0 35,10 37.5,0 40,10 42.5,0 45,10 47.5,0 50,10 52.5,0 55,10 57.5,0 60,10 62.5,0 65,10 67.5,0 70,10 72.5,0 75,10 77.5,0 80,10 82.5,0 85,10 87.5,0 90,10 92.5,0 95,10 97.5,0 100,10 100,10 0,10" />
            </svg>
          </div>
        )}

        {/* Diagonal Void Stamp */}
        {receiptData.status === "cancel" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10">
            <div className="border-[5px] border-double border-black text-black font-sans font-black text-2xl px-3 py-1.5 rounded-lg uppercase tracking-widest -rotate-12 opacity-30">
              {currentLanguage === "en" ? "VOIDED" : "ยกเลิกแล้ว"}
            </div>
          </div>
        )}

        {/* Draft Preview Header Watermark */}
        {receiptData.isDraft && (
          <div className="absolute inset-x-0 top-3.5 flex justify-center print:hidden">
            <span className="bg-neutral-200 text-neutral-900 font-sans font-bold text-[8px] px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm border border-neutral-400">
              {currentLanguage === "en" ? "PROFORMA RECEIPT" : "ใบรับเงินชั่วคราว"}
            </span>
          </div>
        )}

        {/* Receipt Header */}
        <div className="text-center space-y-1 pt-3">
          {receiptData.status === "cancel" && (
            <div className="bg-black text-white font-sans font-black text-[9px] py-1 px-2 rounded uppercase tracking-wider mb-2 border border-black inline-block">
              {currentLanguage === "en" ? "VOID / CANCELLED SLIP" : "ใบยกเลิกรายการ / คืนเงิน"}
            </div>
          )}
          {(activeShop?.logoUrl || true) && (
            <div className="flex justify-center mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={activeShop?.logoUrl || "/logo.png"} 
                alt="Shop Logo" 
                className="h-10 max-w-[120px] object-contain filter grayscale contrast-125 block mx-auto" 
              />
            </div>
          )}
          <h3 className={`${isA5 ? "text-lg" : (isSmall ? "text-[10px]" : "text-xs")} font-black tracking-tight text-neutral-900 uppercase`}>
            {activeShop?.name || "That Laundry Shop"}
          </h3>
          <p className={`${isA5 ? "text-sm" : (isSmall ? "text-[8px]" : "text-[9px]")} text-neutral-600 font-medium`}>{activeShop?.address || "123 Sukhumvit Road, Bangkok"}</p>
          <p className={`${isA5 ? "text-sm" : (isSmall ? "text-[8px]" : "text-[9px]")} text-neutral-600 font-medium`}>Tel: {activeShop?.phone || "081-111-2222"}</p>
          {activeShop?.taxId && (
            <p className={`${isA5 ? "text-xs" : (isSmall ? "text-[7.5px]" : "text-[8.5px]")} text-neutral-600 font-bold uppercase tracking-tight`}>TAX ID: {activeShop.taxId}</p>
          )}
          <div className="border-t border-dashed border-neutral-400/50 my-2" />
        </div>

        {/* Order Info */}
        <div className="space-y-1 text-neutral-800">
          {receiptData.isDraft ? (
            <div className="flex justify-between font-bold text-neutral-900">
              <span>{currentLanguage === "en" ? "PROFORMA NO:" : "เลขที่ใบชั่วคราว:"}</span>
              <span data-proforma-number="true">{receiptData.proformaId || "DRAFT"}</span>
            </div>
          ) : (
            <>
              {!receiptData.status?.includes("cancel") && (
                <div className="flex justify-between font-bold text-neutral-900">
                  <span>{currentLanguage === "en" ? "RECEIPT NO:" : "เลขที่ใบเสร็จ:"}</span>
                  <span>{receiptData.receiptNumber || `RE-${receiptData.id}`}</span>
                </div>
              )}
              {receiptData.proformaId && (
                <div className="flex justify-between font-bold text-neutral-900">
                  <span>{currentLanguage === "en" ? "PROFORMA NO:" : "เลขที่ใบชั่วคราว:"}</span>
                  <span>
                    {receiptData.proformaRevision && receiptData.proformaRevision > 0
                      ? `${receiptData.proformaId}-R${receiptData.proformaRevision}`
                      : receiptData.proformaId}
                  </span>
                </div>
              )}
            </>
          )}

          <div className="flex justify-between">
            <span>DATE:</span>
            <span>
              {(() => {
                const safeDate = receiptData.createdAt ? (receiptData.createdAt instanceof Date ? receiptData.createdAt : new Date(receiptData.createdAt)) : new Date();
                const validDate = isNaN(safeDate.getTime()) ? new Date() : safeDate;
                return format(validDate, "dd/MM/yyyy HH:mm");
              })()}
            </span>
          </div>
          <div className="flex justify-between items-center gap-2">
            <span className="shrink-0">CUSTOMER:</span>
            <span className="truncate text-right font-bold text-neutral-900 flex-1 min-w-0">{receiptData.customerName}</span>
          </div>
          <div className="flex justify-between">
            <span>PHONE:</span>
            <span>{receiptData.customerPhone}</span>
          </div>
          {receiptData.deliveryScheduledAt && (() => {
            const isEdited = isCollectionDateEdited(receiptData.createdAt, receiptData.deliveryScheduledAt);
            return (
              <div className="flex justify-between">
                <span>DUE DATE{isEdited ? " (EDIT)" : ""}:</span>
                <span className="font-bold text-neutral-900 bg-neutral-100 border border-neutral-300 px-1 rounded">{format(new Date(receiptData.deliveryScheduledAt), "dd/MM/yyyy HH:mm")}</span>
              </div>
            );
          })()}
          <div className="border-t border-dashed border-neutral-400/50 my-2" />
        </div>

        {/* Items List */}
        <div className="space-y-2 text-neutral-800">
          <div className="flex font-bold text-neutral-900">
            <span className="flex-1 min-w-0 text-left">ITEM</span>
            <span className="w-12 text-center">QTY</span>
            <span className="w-20 text-right">TOTAL</span>
          </div>
          {receiptData.items.map((item: ReceiptItem, idx: number) => {
            const rawName = (currentLanguage === "en" && item.nameEn) ? item.nameEn : item.name;
            const maxLen = isA5 ? 60 : (isSmall ? 20 : 30);
            const displayItemName = rawName.length > maxLen ? rawName.slice(0, maxLen - 3) + "..." : rawName;
            return (
              <div key={idx} className={`flex ${isA5 ? "text-sm" : (isSmall ? "text-[8px]" : "text-[9px]")} leading-tight`}>
                <span className="flex-1 min-w-0 truncate pr-3 text-left">{displayItemName}</span>
                <span className="w-12 text-center">{item.quantity}</span>
                <span className="w-20 text-right">฿{formatCurrency(item.price * item.quantity)}</span>
              </div>
            );
          })}
          {receiptData.deliveryFee !== undefined && receiptData.deliveryFee > 0 && (
            <div className={`flex ${isA5 ? "text-sm" : (isSmall ? "text-[8px]" : "text-[9px]")} leading-tight text-neutral-900 font-medium`}>
              <span className="flex-1 min-w-0 truncate pr-3 text-left">
                {currentLanguage === "en" ? "Delivery Fee" : "ค่าบริการรับ-ส่ง"}
              </span>
              <span className="w-12 text-center">1</span>
              <span className="w-20 text-right">฿{formatCurrency(receiptData.deliveryFee)}</span>
            </div>
          )}
          <div className="border-t border-dashed border-neutral-400/50 my-2" />
        </div>

        {/* Totals Calculation */}
        <div className="space-y-1 text-neutral-800">
          {receiptData.expressSurcharge > 0 && (
            <div className="flex justify-between text-neutral-900 font-bold">
              <span>EXPRESS ({receiptData.serviceSpeed && receiptData.serviceSpeed.startsWith("express_") ? `${receiptData.serviceSpeed.split("_")[1]}%` : ""}):</span>
              <span>+฿{formatCurrency(receiptData.expressSurcharge)}</span>
            </div>
          )}
          {receiptData.vatType === "exclusive" && receiptData.vatRate > 0 && (
            <div className="flex justify-between text-neutral-900 font-bold">
              <span>VAT ({receiptData.vatRate}%)</span>
              <span>+฿{formatCurrency(receiptData.vatAmount)}</span>
            </div>
          )}
          {receiptData.discount > 0 && (
            <div className="flex justify-between text-neutral-900 font-bold">
              <span>
                {receiptData.discountPercent && receiptData.discountPercent > 0 
                  ? (currentLanguage === "en" ? `DISCOUNT (${receiptData.discountPercent}%):` : `ส่วนลด (${receiptData.discountPercent}%):`)
                  : (currentLanguage === "en" ? "MANUAL ADJUST:" : "ส่วนลดพิเศษ:")
                }
              </span>
              <span>-฿{formatCurrency(receiptData.discount)}</span>
            </div>
          )}
          <div className={`flex justify-between font-black text-neutral-900 ${isA5 ? "text-lg" : (isSmall ? "text-[11px]" : "text-xs")} pt-1 border-t border-neutral-450/40`}>
            <span>GRAND TOTAL:</span>
            <span>฿{formatCurrency(receiptData.total)}</span>
          </div>
          {receiptData.vatType === "inclusive" && receiptData.vatRate > 0 && (
            <div className={`flex justify-between text-neutral-600 ${isA5 ? "text-sm" : (isSmall ? "text-[8.5px]" : "text-[9.5px]")} font-medium`}>
              <span>{currentLanguage === "en" ? `Incl. VAT ${receiptData.vatRate}%` : `รวม VAT ${receiptData.vatRate}%`}</span>
              <span>฿{formatCurrency(receiptData.vatAmount)}</span>
            </div>
          )}

          {/* Payments List Breakdown on Receipt */}
          {payments.length > 0 && (
            <div className="space-y-1 pt-1.5 border-t border-dashed border-neutral-400/50 text-neutral-800">
              {payments.map((p: PaymentLog, pIdx: number) => (
                <div key={pIdx} className="space-y-0.5">
                  <div className={`flex ${isA5 ? "text-xs" : (isSmall ? "text-[7.5px]" : "text-[8.5px]")} leading-tight font-mono`}>
                    <span className="flex-1 truncate uppercase pr-2 text-left">
                      {format(new Date(p.timestamp), "dd/MM/yyyy")} - PAID ({p.method === "credit" ? "MEMBER" : p.method}):
                    </span>
                    <span className="font-bold">฿{formatCurrency(p.amount)}</span>
                  </div>
                  {p.method === "cash" && p.received !== undefined && p.received > 0 && (
                    <div className={`flex ${isA5 ? "text-[10px] pl-4 text-neutral-600" : (isSmall ? "text-[7px] pl-4 text-neutral-600" : "text-[8px] pl-4 text-neutral-600")} leading-tight font-mono`}>
                      <span className="flex-1 text-left">
                        {currentLanguage === "en" ? "- Cash Received:" : "- รับเงินสด:"}
                      </span>
                      <span>฿{formatCurrency(p.received)}</span>
                    </div>
                  )}
                  {p.method === "cash" && p.change !== undefined && p.change > 0 && (
                    <div className={`flex ${isA5 ? "text-[10px] pl-4 text-neutral-600" : (isSmall ? "text-[7px] pl-4 text-neutral-600" : "text-[8px] pl-4 text-neutral-600")} leading-tight font-mono`}>
                      <span className="flex-1 text-left">
                        {currentLanguage === "en" ? "- Change Returned:" : "- เงินทอน:"}
                      </span>
                      <span>฿{formatCurrency(p.change)}</span>
                    </div>
                  )}
                </div>
              ))}
              <div className={`flex justify-between font-black text-neutral-900 ${isA5 ? "text-sm" : (isSmall ? "text-[8.5px]" : "text-[9.5px]")} pt-0.5 border-t border-dashed border-neutral-400/30`}>
                <span>TOTAL PAID:</span>
                <span>฿{formatCurrency(totalPaid)}</span>
              </div>
              {!receiptData.isPaid && (
                <div className={`flex justify-between font-black text-black ${isA5 ? "text-[15px]" : (isSmall ? "text-[9px]" : "text-[10px]")}`}>
                  <span>BALANCE DUE:</span>
                  <span>฿{formatCurrency(receiptData.total - totalPaid)}</span>
                </div>
              )}
            </div>
          )}
          <div className="border-t border-dashed border-neutral-400/50 my-2" />
        </div>

        {/* Payment & Remarks */}
        <div className="space-y-1.5 text-center flex flex-col items-center">
          {receiptData.status === "cancel" ? (
            <div className={`${isA5 ? "text-base" : (isSmall ? "text-[10px]" : "text-[11px]")} text-black font-black uppercase`}>
              {currentLanguage === "en" ? "VOIDED / REFUNDED" : "ยกเลิกและคืนเงินแล้ว"}
            </div>
          ) : (() => {
            if (receiptData.isPaid) {
              return (
                <div className={`${isA5 ? "text-base" : (isSmall ? "text-[10px]" : "text-[11px]")} text-black font-black uppercase`}>
                  {currentLanguage === "en" ? `PAID (${receiptData.paymentChannel || "CASH"})` : `ชำระเงินแล้ว (${receiptData.paymentChannel || "CASH"})`}
                </div>
              );
            } else if (totalPaid > 0) {
              return (
                <div className={`${isA5 ? "text-base" : (isSmall ? "text-[10px]" : "text-[11px]")} text-black font-black uppercase`}>
                  {currentLanguage === "en" ? `PARTIAL PAID (฿${formatCurrency(totalPaid)})` : `จ่ายมัดจำแล้ว (฿${formatCurrency(totalPaid)})`}
                </div>
              );
            } else {
              return (
                <div className={`${isA5 ? "text-base" : (isSmall ? "text-[10px]" : "text-[11px]")} text-black font-black uppercase`}>
                  {currentLanguage === "en" ? "UNPAID - PAY ON PICKUP" : "ยังไม่ชำระ - จ่ายตอนรับผ้า"}
                </div>
              );
            }
          })()}
          {cleanRemarkForDisplay(receiptData.remark) && (
            <div className={`${isA5 ? "text-xs p-2" : (isSmall ? "text-[8px] p-1" : "text-[9px] p-1.5")} text-neutral-800 font-medium text-left mt-2 bg-neutral-100 rounded border border-neutral-400 w-full leading-tight`}>
              <span className="font-bold text-black">REMARK:</span> {cleanRemarkForDisplay(receiptData.remark)}
            </div>
          )}
        </div>

        {/* Barcode/Footer */}
        <div className="text-center pt-2 space-y-2">
          <div className="flex flex-col items-center justify-center">
            <div 
              className={`h-8 ${isA5 ? "w-64" : (isSmall ? "w-36" : "w-44")} my-1 opacity-90`}
              style={{
                backgroundImage: "repeating-linear-gradient(90deg, #000 0px, #000 2px, transparent 2px, transparent 3px, #000 3px, #000 4px, transparent 4px, transparent 6px, #000 6px, #000 8px, transparent 8px, transparent 9px)",
                WebkitPrintColorAdjust: "exact",
                printColorAdjust: "exact"
              }}
            />
            <span data-proforma-barcode-text="true" className={`${isA5 ? "text-[11px]" : "text-[8px]"} text-neutral-500 font-mono tracking-[4px] mt-1 uppercase`}>
              {receiptData.isDraft ? receiptData.id : (receiptData.status === "cancel" ? `${receiptData.id}-VOID` : receiptData.id)}
            </span>
          </div>
          <p className={`${isA5 ? "text-xs" : "text-[8px]"} text-neutral-500 font-bold uppercase tracking-wider`}>
            {receiptData.isDraft 
              ? (currentLanguage === "en" ? "Proforma Receipt only" : "เอกสารใบรับเงินชั่วคราวเท่านั้น")
              : (receiptData.status === "cancel" 
                  ? (currentLanguage === "en" ? "This order has been cancelled" : "รายการสั่งซื้อนี้ถูกยกเลิกแล้ว")
                  : "Thank you for using our service!")}
          </p>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* On-screen visual Dialog */}
      <Dialog 
        open={open} 
        onOpenChange={(isOpen) => {
          onOpenChange(isOpen);
          if (!isOpen && onCloseComplete) {
            setTimeout(() => {
              onCloseComplete();
            }, 150);
          }
        }}
      >
        <DialogContent className={`${isA5 ? "max-w-[460px]" : (isSmall ? "max-w-[260px]" : "max-w-[320px]")} max-h-[90vh] overflow-y-auto rounded-2xl p-0 border-none shadow-2xl bg-neutral-900 dark:bg-neutral-950 font-mono print:hidden`}>
          <div className="p-4 flex flex-col items-center">
            {renderReceiptContent(false)}

            {/* Print and Close buttons */}
            <div className="w-full flex gap-3 mt-4">
              <Button 
                onClick={handlePrint}
                disabled={isPrinting}
                className="flex-1 bg-neutral-800 text-white font-bold h-10 rounded-xl hover:bg-neutral-700 text-xs border-none cursor-pointer flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {isPrinting && <Loader2 size={14} className="animate-spin" />}
                {isPrinting ? "กำลังเตรียม..." : `Print ${receiptData.isDraft ? (currentLanguage === "en" ? "Proforma" : "ใบชั่วคราว") : (receiptData.status === "cancel" ? (currentLanguage === "en" ? "Void Slip" : "ใบยกเลิก") : "Receipt")}`}
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                }}
                className="flex-1 bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 text-white font-bold h-10 rounded-xl text-xs cursor-pointer"
              >
                {receiptData.isDraft ? "Close" : "Done"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print-only layout portalled directly to document.body */}
      {mounted && createPortal(
        <div className="hidden print:block print-root">
          {renderReceiptContent(true)}
        </div>,
        document.body
      )}

      {/* Persistent Off-Screen capture target container positioned inside viewport for html2canvas */}
      {(receiptData || activeCaptureDataRef.current) && (
        <div 
          id="thermal-receipt-capture-container-wrapper" 
          style={{ position: "fixed", left: 0, top: 0, zIndex: -9999, opacity: 0.01, pointerEvents: "none" }}
          className="print:hidden"
        >
          {renderReceiptContent(false, "thermal-receipt-capture-area-offscreen")}
        </div>
      )}
    </>
  );
}

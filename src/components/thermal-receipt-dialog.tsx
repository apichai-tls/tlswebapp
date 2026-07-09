"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { type Job } from "@/lib/store";

export interface ReceiptItem {
  name: string;
  nameEn?: string | null;
  price: number;
  quantity: number;
}

export interface ReceiptData {
  id: string;
  createdAt: Date;
  customerName: string;
  customerPhone: string;
  items: ReceiptItem[];
  subtotal: number;
  expressSurcharge: number;
  serviceSpeed?: string;
  discount: number;
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
    .filter(part => !part.startsWith("VAT:") && !part.startsWith("Express"))
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
  const jobVatType = vatMatch ? vatMatch[1].toLowerCase() : "none";
  const jobVatRate = vatMatch ? parseFloat(vatMatch[2]) : 0;
  
  const baseTotal = jobSubtotal + jobSurcharge;
  let jobVatAmount = 0;
  if (jobVatType === "inclusive") {
    jobVatAmount = baseTotal * (jobVatRate / (100 + jobVatRate));
  } else if (jobVatType === "exclusive") {
    jobVatAmount = baseTotal * (jobVatRate / 100);
  }

  const proformaMatch = job.remark?.match(/Proforma:\s*(PR-[\w\-]+)/i);
  const proformaId = proformaMatch ? proformaMatch[1] : undefined;

  return {
    id: job.id ? job.id.split('-')[0].toUpperCase() : "",
    createdAt: job.createdAt ? new Date(job.createdAt) : new Date(),
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
    proformaId: proformaId,
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
}

export function ThermalReceiptDialog({
  open,
  onOpenChange,
  receiptData,
  activeShop,
  receiptPaperSize = "80mm",
  currentLanguage = "th",
  onCloseComplete
}: ThermalReceiptDialogProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open || !receiptData || receiptData.isDraft || !receiptData.jobId) return;

    // Run a small timeout to make sure the DOM is fully painted
    const captureTimer = setTimeout(() => {
      const element = document.getElementById("thermal-receipt-capture-area");
      if (!element) return;

      import("html2canvas").then((html2canvasModule) => {
        const html2canvas = html2canvasModule.default;
        html2canvas(element, {
          backgroundColor: "#ffffff",
          scale: 2, // Capture at 2x scale for high resolution readability
          logging: false
        }).then(async (canvas) => {
          canvas.toBlob(async (blob) => {
            if (!blob) return;

            // Generate file payload
            const file = new File([blob], `receipt-${receiptData.jobId}.png`, { type: "image/png" });
            const formData = new FormData();
            formData.append("file", file);
            formData.append("entityType", "jobs");
            formData.append("entityId", receiptData.jobId || "unknown");
            formData.append("subType", "proofs");

            try {
              // Upload to local storage / Cloud storage
              const res = await fetch("/api/upload-local", {
                method: "POST",
                body: formData
              });
              const uploadResult = await res.json();
              if (uploadResult.success && uploadResult.publicUrl) {
                // Update the job details in db
                const { jobStore } = await import("@/lib/store");
                const currentJob = jobStore.getSnapshot().find(j => j.id === receiptData.jobId);
                if (currentJob) {
                  // Merge with existing bills
                  let existingBills: string[] = [];
                  try {
                    if (currentJob.billImageUrl) {
                      const parsed = JSON.parse(currentJob.billImageUrl);
                      if (Array.isArray(parsed)) existingBills = parsed;
                      else if (typeof parsed === 'string') existingBills = [parsed];
                    }
                  } catch {}
                  
                  if (!existingBills.includes(uploadResult.publicUrl)) {
                    const newBills = [...existingBills, uploadResult.publicUrl];
                    await jobStore.updateJobDetails(receiptData.jobId!, {
                      billImageUrl: JSON.stringify(newBills)
                    });
                    console.log("Successfully saved receipt image to Bill/Transfer field:", uploadResult.publicUrl);
                  }
                }
              }
            } catch (err) {
              console.error("Failed to capture and upload receipt image:", err);
            }
          }, "image/png");
        });
      }).catch(err => {
        console.error("Failed to load html2canvas module:", err);
      });
    }, 800); // 800ms delay to make sure rendering is complete

    return () => clearTimeout(captureTimer);
  }, [open, receiptData]);

  if (!receiptData) return null;

  const paperSize = receiptPaperSize;
  const isSmall = paperSize === "58mm";

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

  const handlePrint = () => {
    window.print();
  };

  // Receipt Content Render function
  const renderReceiptContent = (printMode: boolean = false) => {
    return (
      <div 
        id={!printMode ? "thermal-receipt-capture-area" : undefined}
        data-paper-size={paperSize} 
        className={
          printMode 
            ? `bg-white text-black font-mono leading-normal p-2 ${isSmall ? "w-[58mm] text-[9px]" : "w-[80mm] text-[11px]"} space-y-4`
            : `printable-receipt ${isSmall ? "w-[220px]" : "w-[280px]"} bg-white text-zinc-800 ${isSmall ? "p-3.5 pt-5 pb-5 text-[8.5px]" : "p-5 pt-7 pb-7 text-[10px]"} shadow-2xl rounded-sm border border-neutral-300/60 space-y-4 relative overflow-hidden text-left`
        }
        style={printMode ? { width: isSmall ? "58mm" : "80mm", margin: "0 auto" } : undefined}
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
            <div className="border-[5px] border-double border-red-500 text-red-500 font-sans font-black text-2xl px-3 py-1.5 rounded-lg uppercase tracking-widest -rotate-12 opacity-20">
              {currentLanguage === "en" ? "VOIDED" : "ยกเลิกแล้ว"}
            </div>
          </div>
        )}

        {/* Draft Preview Header Watermark */}
        {receiptData.isDraft && (
          <div className="absolute inset-x-0 top-3.5 flex justify-center print:hidden">
            <span className="bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 font-sans font-bold text-[8px] px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm border border-purple-200 dark:border-purple-900">
              {currentLanguage === "en" ? "PROFORMA RECEIPT" : "ใบรับเงินชั่วคราว"}
            </span>
          </div>
        )}

        {/* Receipt Header */}
        <div className="text-center space-y-1 pt-3">
          {receiptData.status === "cancel" && (
            <div className="bg-red-50 text-red-700 font-sans font-black text-[9px] py-1 px-2 rounded uppercase tracking-wider mb-2 border border-red-200 inline-block">
              {currentLanguage === "en" ? "VOID / CANCELLED SLIP" : "ใบยกเลิกรายการ / คืนเงิน"}
            </div>
          )}
          {activeShop?.logoUrl && (
            <div className="flex justify-center mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={activeShop.logoUrl} 
                alt="Shop Logo" 
                className="h-10 w-10 object-contain rounded-md filter contrast-125 mix-blend-multiply" 
              />
            </div>
          )}
          <h3 className={`${isSmall ? "text-[10px]" : "text-xs"} font-black tracking-tight text-neutral-900 uppercase`}>
            {activeShop?.name || "That Laundry Shop"}
          </h3>
          <p className={`${isSmall ? "text-[8px]" : "text-[9px]"} text-neutral-600 font-medium`}>{activeShop?.address || "123 Sukhumvit Road, Bangkok"}</p>
          <p className={`${isSmall ? "text-[8px]" : "text-[9px]"} text-neutral-600 font-medium`}>Tel: {activeShop?.phone || "081-111-2222"}</p>
          {activeShop?.taxId && (
            <p className={`${isSmall ? "text-[7.5px]" : "text-[8.5px]"} text-neutral-600 font-bold uppercase tracking-tight`}>TAX ID: {activeShop.taxId}</p>
          )}
          <div className="border-t border-dashed border-neutral-400/50 my-2" />
        </div>

        {/* Order Info */}
        <div className="space-y-1 text-neutral-700">
          <div className="flex justify-between font-bold text-neutral-900">
            <span>{receiptData.isDraft ? (currentLanguage === "en" ? "PROFORMA NO:" : "เลขที่ใบชั่วคราว:") : "RECEIPT NO:"}</span>
            <span>{receiptData.isDraft ? receiptData.id : `#${receiptData.id}`}</span>
          </div>
          {!receiptData.isDraft && receiptData.proformaId && (
            <div className="flex justify-between text-neutral-600 font-medium italic">
              <span>{currentLanguage === "en" ? "PROFORMA REF:" : "อ้างอิงใบชั่วคราว:"}</span>
              <span>{receiptData.proformaId}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>DATE:</span>
            <span>{format(receiptData.createdAt, "dd/MM/yyyy HH:mm")}</span>
          </div>
          <div className="flex justify-between">
            <span>CUSTOMER:</span>
            <span className="truncate max-w-[120px] font-bold text-neutral-900">{receiptData.customerName}</span>
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
                <span className="font-bold text-purple-700 bg-purple-50 px-1 rounded">{format(new Date(receiptData.deliveryScheduledAt), "dd/MM/yyyy HH:mm")}</span>
              </div>
            );
          })()}
          <div className="border-t border-dashed border-neutral-400/50 my-2" />
        </div>

        {/* Items List */}
        <div className="space-y-2 text-neutral-700">
          <div className="flex font-bold text-neutral-900">
            <span className="flex-1 min-w-0 text-left">ITEM</span>
            <span className="w-12 text-center">QTY</span>
            <span className="w-16 text-right">TOTAL</span>
          </div>
          {receiptData.items.map((item: ReceiptItem, idx: number) => {
            const rawName = (currentLanguage === "en" && item.nameEn) ? item.nameEn : item.name;
            const maxLen = isSmall ? 22 : 32;
            const displayItemName = rawName.length > maxLen ? rawName.slice(0, maxLen - 3) + "..." : rawName;
            return (
              <div key={idx} className={`flex ${isSmall ? "text-[8px]" : "text-[9px]"} leading-tight`}>
                <span className="flex-1 min-w-0 truncate pr-4 text-left">{displayItemName}</span>
                <span className="w-12 text-center">{item.quantity}</span>
                <span className="w-16 text-right">฿{(item.price * item.quantity).toFixed(2)}</span>
              </div>
            );
          })}
          <div className="border-t border-dashed border-neutral-400/50 my-2" />
        </div>

        {/* Totals Calculation */}
        <div className="space-y-1 text-neutral-700">
          <div className="flex justify-between">
            <span>SUBTOTAL:</span>
            <span>฿{receiptData.subtotal.toFixed(2)}</span>
          </div>
          {receiptData.expressSurcharge > 0 && (
            <div className="flex justify-between text-purple-700 font-bold">
              <span>EXPRESS ({receiptData.serviceSpeed && receiptData.serviceSpeed.startsWith("express_") ? `${receiptData.serviceSpeed.split("_")[1]}%` : ""}):</span>
              <span>+฿{receiptData.expressSurcharge.toFixed(2)}</span>
            </div>
          )}
          {receiptData.vatType === "exclusive" && receiptData.vatRate > 0 && (
            <div className="flex justify-between text-neutral-700 font-bold">
              <span>VAT ({receiptData.vatRate}%)</span>
              <span>+฿{receiptData.vatAmount.toFixed(2)}</span>
            </div>
          )}
          {receiptData.vatType === "inclusive" && receiptData.vatRate > 0 && (
            <div className="flex justify-between text-emerald-700 font-bold">
              <span>{currentLanguage === "en" ? `Incl. VAT ${receiptData.vatRate}%` : `รวม VAT ${receiptData.vatRate}%`}</span>
              <span>฿{receiptData.vatAmount.toFixed(2)}</span>
            </div>
          )}
          {receiptData.deliveryFee !== undefined && receiptData.deliveryFee > 0 && (
            <div className="flex justify-between text-neutral-700 font-bold">
              <span>{currentLanguage === "en" ? "DELIVERY FEE:" : "ค่ารับ-ส่ง:"}</span>
              <span>+฿{receiptData.deliveryFee.toFixed(2)}</span>
            </div>
          )}
          {receiptData.discount > 0 && (
            <div className="flex justify-between text-rose-700 font-bold">
              <span>MANUAL ADJUST:</span>
              <span>-฿{receiptData.discount.toFixed(2)}</span>
            </div>
          )}
          <div className={`flex justify-between font-black text-neutral-900 ${isSmall ? "text-[11px]" : "text-xs"} pt-1 border-t border-neutral-450/40`}>
            <span>GRAND TOTAL:</span>
            <span>฿{receiptData.total.toFixed(2)}</span>
          </div>

          {/* Payments List Breakdown on Receipt */}
          {payments.length > 0 && (
            <div className="space-y-1 pt-1.5 border-t border-dashed border-neutral-400/50 text-neutral-700">
              {payments.map((p: PaymentLog, pIdx: number) => (
                <div key={pIdx} className="space-y-0.5">
                  <div className={`flex ${isSmall ? "text-[7.5px]" : "text-[8.5px]"} leading-tight font-mono`}>
                    <span className="flex-1 truncate uppercase pr-2 text-left">
                      {format(new Date(p.timestamp), "dd/MM/yyyy")} - PAID ({p.method === "credit" ? "MEMBER" : p.method}):
                    </span>
                    <span className="font-bold">฿{p.amount.toFixed(2)}</span>
                  </div>
                  {p.method === "cash" && p.received !== undefined && p.received > 0 && (
                    <div className={`flex ${isSmall ? "text-[7px] pl-4 text-neutral-500" : "text-[8px] pl-4 text-neutral-500"} leading-tight font-mono`}>
                      <span className="flex-1 text-left">
                        {currentLanguage === "en" ? "- Cash Received:" : "- รับเงินสด:"}
                      </span>
                      <span>฿{p.received.toFixed(2)}</span>
                    </div>
                  )}
                  {p.method === "cash" && p.change !== undefined && p.change > 0 && (
                    <div className={`flex ${isSmall ? "text-[7px] pl-4 text-neutral-500" : "text-[8px] pl-4 text-neutral-500"} leading-tight font-mono`}>
                      <span className="flex-1 text-left">
                        {currentLanguage === "en" ? "- Change Returned:" : "- เงินทอน:"}
                      </span>
                      <span>฿{p.change.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              ))}
              <div className={`flex justify-between font-black text-neutral-900 ${isSmall ? "text-[8.5px]" : "text-[9.5px]"} pt-0.5 border-t border-dashed border-neutral-400/30`}>
                <span>TOTAL PAID:</span>
                <span>฿{totalPaid.toFixed(2)}</span>
              </div>
              {!receiptData.isPaid && (
                <div className={`flex justify-between font-black text-rose-700 ${isSmall ? "text-[9px]" : "text-[10px]"}`}>
                  <span>BALANCE DUE:</span>
                  <span>฿{(receiptData.total - totalPaid).toFixed(2)}</span>
                </div>
              )}
            </div>
          )}
          <div className="border-t border-dashed border-neutral-400/50 my-2" />
        </div>

        {/* Payment & Remarks */}
        <div className="space-y-1.5 text-center flex flex-col items-center">
          {receiptData.status === "cancel" ? (
            <div className={`${isSmall ? "text-[10px]" : "text-[11px]"} text-black font-black uppercase`}>
              {currentLanguage === "en" ? "VOIDED / REFUNDED" : "ยกเลิกและคืนเงินแล้ว"}
            </div>
          ) : (() => {
            if (receiptData.isPaid) {
              return (
                <div className={`${isSmall ? "text-[10px]" : "text-[11px]"} text-black font-black uppercase`}>
                  {currentLanguage === "en" ? `PAID (${receiptData.paymentChannel || "CASH"})` : `ชำระเงินแล้ว (${receiptData.paymentChannel || "CASH"})`}
                </div>
              );
            } else if (totalPaid > 0) {
              return (
                <div className={`${isSmall ? "text-[10px]" : "text-[11px]"} text-black font-black uppercase`}>
                  {currentLanguage === "en" ? `PARTIAL PAID (฿${totalPaid.toFixed(2)})` : `จ่ายมัดจำแล้ว (฿${totalPaid.toFixed(2)})`}
                </div>
              );
            } else {
              return (
                <div className={`${isSmall ? "text-[10px]" : "text-[11px]"} text-black font-black uppercase`}>
                  {currentLanguage === "en" ? "UNPAID - PAY ON PICKUP" : "ยังไม่ชำระ - จ่ายตอนรับผ้า"}
                </div>
              );
            }
          })()}
          {cleanRemarkForDisplay(receiptData.remark) && (
            <div className={`${isSmall ? "text-[8px] p-1" : "text-[9px] p-1.5"} text-neutral-600 font-medium text-left mt-2 bg-zinc-50 rounded border border-neutral-300 w-full leading-tight`}>
              <span className="font-bold text-neutral-800">REMARK:</span> {cleanRemarkForDisplay(receiptData.remark)}
            </div>
          )}
        </div>

        {/* Barcode/Footer */}
        <div className="text-center pt-2 space-y-2">
          <div className="flex flex-col items-center justify-center">
            <div className={`flex items-center justify-center h-8 ${isSmall ? "w-36" : "w-44"} bg-transparent opacity-85 my-1`}>
              {/* Simulated barcode lines */}
              {Array.from({ length: 32 }).map((_, idx) => {
                const isThick = (idx % 3 === 0 && idx % 2 === 0) || idx === 11 || idx === 17 || idx === 23;
                const spacing = idx % 4 === 0 ? "mr-[2px]" : "mr-[1px]";
                return (
                  <span 
                    key={idx} 
                    className={`h-full bg-black inline-block ${spacing}`} 
                    style={{
                      width: isThick ? "2px" : "0.8px",
                      backgroundColor: "black",
                      WebkitPrintColorAdjust: "exact",
                      printColorAdjust: "exact"
                    }}
                  />
                );
              })}
            </div>
            <span className="text-[8px] text-neutral-500 font-mono tracking-[4px] mt-1 uppercase">
              {receiptData.isDraft ? receiptData.id : (receiptData.status === "cancel" ? `${receiptData.id}-VOID` : receiptData.id)}
            </span>
          </div>
          <p className="text-[8px] text-neutral-500 font-bold uppercase tracking-wider">
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
            onCloseComplete();
          }
        }}
      >
        <DialogContent className={`${isSmall ? "max-w-[260px]" : "max-w-[320px]"} max-h-[90vh] overflow-y-auto rounded-2xl p-0 border-none shadow-2xl bg-neutral-900 dark:bg-neutral-950 font-mono print:hidden`}>
          <div className="p-4 flex flex-col items-center">
            {renderReceiptContent(false)}

            {/* Print and Close buttons */}
            <div className="w-full flex gap-3 mt-4">
              <Button 
                onClick={handlePrint}
                className="flex-1 bg-neutral-800 text-white font-bold h-10 rounded-xl hover:bg-neutral-700 text-xs border-none cursor-pointer"
              >
                Print {receiptData.isDraft ? (currentLanguage === "en" ? "Proforma" : "ใบชั่วคราว") : (receiptData.status === "cancel" ? (currentLanguage === "en" ? "Void Slip" : "ใบยกเลิก") : "Receipt")}
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  if (onCloseComplete) onCloseComplete();
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
    </>
  );
}

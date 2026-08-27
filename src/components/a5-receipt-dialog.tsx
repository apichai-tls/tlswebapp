import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X, Loader2 } from "lucide-react";
import { ReceiptData } from "@/components/thermal-receipt-dialog";
import { createPortal } from "react-dom";
import { printImageUrl } from "@/components/ui/multi-image-uploader";

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
  currentLanguage = "th",
  onCloseComplete,
  onBillImageUploaded
}: A5ReceiptDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  // capturedPreviewUrl: the blob URL of the generated image shown IN the dialog
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const activeCaptureDataRef = React.useRef<ReceiptData | null>(null);
  const capturedKeysRef = React.useRef<Set<string>>(new Set());
  const receiptRef = React.useRef<HTMLDivElement>(null);
  const captureRef = React.useRef<HTMLDivElement>(null);

  if (receiptData) {
    activeCaptureDataRef.current = receiptData;
  }

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!receiptData) return;
    const snapshotData = JSON.parse(JSON.stringify(receiptData));
    
    const rawJobId = snapshotData.jobId && snapshotData.jobId !== "DRAFT" ? snapshotData.jobId : null;
    const targetJobId = rawJobId || (snapshotData.proformaId && snapshotData.proformaId !== "DRAFT" ? snapshotData.proformaId : null) || (snapshotData.id && snapshotData.id !== "DRAFT" ? snapshotData.id : null);
    if (!targetJobId) return;

    const captureKey = `${targetJobId}_${snapshotData.isDraft ? "draft" : "paid"}_rev${snapshotData.proformaRevision || 0}`;

    // Reset preview when receipt data changes
    setCapturedPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    // Check duplication
    if (open && (snapshotData.autoCapture || snapshotData.isDraft)) {
      if (capturedKeysRef.current.has(captureKey)) return;
      capturedKeysRef.current.add(captureKey); // Lock immediately to prevent duplicate runs on re-render
    }

    const filename = snapshotData.isDraft 
      ? `proforma-${snapshotData.proformaId || targetJobId}-rev${snapshotData.proformaRevision || 0}.png`
      : `receipt-${targetJobId}.png`;

    // Upload the blob to GCS and update billImageUrl in DB
    const uploadAndSave = async (blob: Blob) => {
      const { jobStore } = await import("@/lib/store");
      const currentJob = jobStore.getSnapshot().find((j: any) => j.id === targetJobId || (rawJobId && j.id === rawJobId));

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
            body: blob
          });
          if (putRes.ok) uploadResult = { success: true, publicUrl: signData.publicUrl };
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

        if (currentJob) {
          let existingBills: string[] = [];
          try {
            if (currentJob.billImageUrl) {
              const parsed = JSON.parse(currentJob.billImageUrl);
              if (Array.isArray(parsed)) existingBills = parsed;
              else if (typeof parsed === "string") existingBills = [parsed];
            }
          } catch {}
          if (!existingBills.includes(uploadResult.publicUrl)) {
            const newBills = [...existingBills, uploadResult.publicUrl];
            await jobStore.updateJobDetails(currentJob.id, { billImageUrl: JSON.stringify(newBills) });
          }
        }
      }
    };

    const runCapture = async () => {
      try {
        // Capture from the off-screen captureRef (full-size, no Dialog CSS/scaling)
        const target = captureRef.current;
        if (!target) return;

        // Wait for fonts and layout
        if (typeof document !== "undefined" && document.fonts?.ready) {
          await document.fonts.ready;
        }
        await new Promise(r => setTimeout(r, 50));

        const html2canvas = (await import("html2canvas-pro")).default;
        const canvas = await html2canvas(target, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
          logging: false,
          imageTimeout: 5000,
        });

        const blob = await new Promise<Blob | null>(resolve =>
          canvas.toBlob(resolve, "image/png")
        );

        if (!blob) return;

        // Upload to GCS in the background (non-blocking)
        if (open && (snapshotData.autoCapture || snapshotData.isDraft)) {
          uploadAndSave(blob).catch(err => console.error("Background receipt upload failed:", err));
        }
      } catch (err) {
        console.error("Failed to capture and upload receipt image:", err);
      }
    };

    if (open) {
      if (!snapshotData.autoCapture && !snapshotData.isDraft) return;
      setTimeout(() => { runCapture(); }, 30);
    }
  }, [open, receiptData, activeShop, onBillImageUploaded]);


  // Cleanup blob URL and reset capture dedup set when dialog is closed
  useEffect(() => {
    if (!open) {
      setCapturedPreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      // Reset so the next open always captures fresh (new revision)
      capturedKeysRef.current.clear();
    }
  }, [open]);

  if (!receiptData) return null;

  let payments: PaymentLog[] = [];
  try {
    if (receiptData.adminNotesJson) {
      const parsed = JSON.parse(receiptData.adminNotesJson);
      if (parsed && Array.isArray(parsed.payments)) {
        payments = parsed.payments;
      }
    }
  } catch (e) {
    console.warn("Failed to parse payments from adminNotesJson");
  }

  const totalPaid = payments.reduce((s: number, p: PaymentLog) => s + p.amount, 0);

  const handlePrint = async () => {
    if (!receiptData) { window.print(); return; }
    setIsPrinting(true);
    try {
      // Capture from the hidden full-size DOM element to match preview exactly
      const target = captureRef.current;
      if (target) {
        const html2canvas = (await import("html2canvas-pro")).default;
        const canvas = await html2canvas(target, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
          logging: false,
          width: target.scrollWidth,
          height: target.scrollHeight,
        });
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (blob) {
          const objectUrl = URL.createObjectURL(blob);
          printImageUrl(objectUrl);
          setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
          return;
        }
      }
      // Fallback: use canvas generator
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

  const formatCurrency = (val: number) => {
    return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const renderReceiptContent = (printMode: boolean = false) => {
    const extraRows = (receiptData.deliveryFee && receiptData.deliveryFee > 0 ? 1 : 0)
      + (receiptData.expressSurcharge > 0 ? 1 : 0)
      + (receiptData.discount > 0 ? 1 : 0);
    const totalRows = receiptData.items.length + extraRows;

    // Granular responsive sizing for Items Table AND Totals Section:
    let tableFontSize = "text-sm";
    let rowPy = "py-2.5";
    let thPy = "py-2";
    let tableMb = "mb-4";
    let sectionGap = "mb-4";

    // Totals section responsive sizing:
    let totalSubtotalText = "text-sm";
    let totalGrandText = "text-lg font-black";
    let totalVatText = "text-xs";
    let totalPy = "py-1.5";
    let grandPy = "py-2.5";
    let totalsMb = "mb-6";
    let totalsWidth = "w-1/2";
    let footerMt = "mt-6 pt-3";

    if (totalRows > 20) {
      tableFontSize = "text-[8.5px] leading-tight";
      rowPy = "py-[1px]";
      thPy = "py-[1.5px]";
      tableMb = "mb-1";
      sectionGap = "mb-1.5";

      totalSubtotalText = "text-[9px]";
      totalGrandText = "text-xs font-black";
      totalVatText = "text-[8px]";
      totalPy = "py-[1px]";
      grandPy = "py-0.5";
      totalsMb = "mb-1.5";
      totalsWidth = "w-5/12";
      footerMt = "mt-1 pt-1";
    } else if (totalRows > 15) {
      // e.g. Job 2026002710 with 17 items
      tableFontSize = "text-[9px] leading-tight";
      rowPy = "py-[2px]";
      thPy = "py-1";
      tableMb = "mb-1.5";
      sectionGap = "mb-2";

      totalSubtotalText = "text-[10px]";
      totalGrandText = "text-sm font-black";
      totalVatText = "text-[8.5px]";
      totalPy = "py-0.5";
      grandPy = "py-1";
      totalsMb = "mb-2.5";
      totalsWidth = "w-5/12";
      footerMt = "mt-2 pt-2";
    } else if (totalRows > 11) {
      tableFontSize = "text-[10.5px] leading-snug";
      rowPy = "py-1";
      thPy = "py-1";
      tableMb = "mb-2";
      sectionGap = "mb-2.5";

      totalSubtotalText = "text-xs";
      totalGrandText = "text-base font-black";
      totalVatText = "text-[9.5px]";
      totalPy = "py-0.5";
      grandPy = "py-1.5";
      totalsMb = "mb-3.5";
      totalsWidth = "w-1/2";
      footerMt = "mt-3 pt-2";
    } else if (totalRows > 7) {
      tableFontSize = "text-xs";
      rowPy = "py-1.5";
      thPy = "py-1.5";
      tableMb = "mb-2.5";
      sectionGap = "mb-3";

      totalSubtotalText = "text-xs";
      totalGrandText = "text-base font-black";
      totalVatText = "text-[10px]";
      totalPy = "py-1";
      grandPy = "py-2";
      totalsMb = "mb-4";
      totalsWidth = "w-1/2";
      footerMt = "mt-4 pt-2";
    }

    return (
      <div 
        ref={printMode ? undefined : receiptRef}
        className={
          printMode 
            ? `bg-white text-black font-sans leading-relaxed w-[148mm] h-[210mm] p-[10mm] flex flex-col box-border overflow-hidden`
            : `w-[148mm] h-[210mm] bg-white text-zinc-800 px-8 pt-6 pb-4 shadow-2xl rounded-sm border border-neutral-300 flex flex-col mx-auto my-4 font-sans overflow-hidden`
        }
        style={printMode ? { margin: "0 auto" } : undefined}
      >
        {/* Header Section */}
        <div className={`flex justify-between items-start ${sectionGap}`}>
          <div className="flex-1">
            {(activeShop?.logoUrl || true) && (
              <div className="mb-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={activeShop?.logoUrl || "/logo.png"} 
                  alt="Shop Logo" 
                  className="h-10 object-contain filter grayscale contrast-125" 
                />
              </div>
            )}
            <h1 className="text-sm font-black text-neutral-900 uppercase tracking-tight leading-tight">{activeShop?.name || "That Laundry Shop"}</h1>
            <p className="text-xs text-neutral-600 max-w-[250px] mt-1 whitespace-pre-line">{activeShop?.addressFull || activeShop?.address || "123 Sukhumvit Road, Bangkok"}</p>
            <p className="text-xs text-neutral-600">
              Tel: {activeShop?.phone || "081-111-2222"}
              {activeShop?.taxId && <span className="ml-2"><span className="font-bold">TAX ID:</span> {activeShop.taxId}</span>}
            </p>
          </div>
          <div className="text-right">
            <h2 className="text-lg font-black text-neutral-900 uppercase tracking-wider mb-2">
              {receiptData.isDraft ? (currentLanguage === "en" ? "PROFORMA INVOICE" : "ใบแจ้งหนี้ชั่วคราว") : (currentLanguage === "en" ? "RECEIPT" : "ใบเสร็จรับเงิน")}
            </h2>
            {receiptData.isDraft ? (
              <div className="text-xs mb-1">
                <span className="font-bold text-neutral-700 mr-1">{currentLanguage === "en" ? "PROFORMA NO:" : "เลขที่ชั่วคราว:"}</span>
                <span className="font-mono font-medium text-neutral-900">
                  {receiptData.proformaRevision && receiptData.proformaRevision > 0
                    ? `${receiptData.proformaId || "DRAFT"}-R${receiptData.proformaRevision}`
                    : (receiptData.proformaId || "DRAFT")}
                </span>
              </div>
            ) : (
              <>
                {!receiptData.status?.includes("cancel") && (
                  <div className="text-xs mb-1">
                    <span className="font-bold text-neutral-700 mr-1">{currentLanguage === "en" ? "RECEIPT NO:" : "เลขที่ใบเสร็จ:"}</span>
                    <span className="font-mono font-medium text-neutral-900">#{receiptData.id}</span>
                  </div>
                )}
                {receiptData.proformaId && (
                  <div className="text-xs mb-1">
                    <span className="font-bold text-neutral-700 mr-1">{currentLanguage === "en" ? "PROFORMA NO:" : "เลขที่ชั่วคราว:"}</span>
                    <span className="font-mono font-medium text-neutral-900">
                      {receiptData.proformaRevision && receiptData.proformaRevision > 0
                        ? `${receiptData.proformaId}-R${receiptData.proformaRevision}`
                        : receiptData.proformaId}
                    </span>
                  </div>
                )}
              </>
            )}

            <div className="text-xs">
              <span className="font-bold text-neutral-700 mr-1">{currentLanguage === "en" ? "DATE:" : "วันที่:"}</span>
              <span className="font-medium text-neutral-900">
                {(() => {
                  const safeDate = receiptData.createdAt ? (receiptData.createdAt instanceof Date ? receiptData.createdAt : new Date(receiptData.createdAt)) : new Date();
                  const validDate = isNaN(safeDate.getTime()) ? new Date() : safeDate;
                  return format(validDate, "dd/MM/yyyy HH:mm");
                })()}
              </span>
            </div>
          </div>
        </div>

        <hr className={`border-neutral-300 ${sectionGap}`} />

        {/* Customer Section */}
        <div className={`flex justify-between ${sectionGap}`}>
          <div className="flex-1">
            <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">{currentLanguage === "en" ? "BILLED TO" : "ลูกค้า"}</h3>
            <p className="text-sm font-bold text-neutral-900 leading-tight">{receiptData.customerName}</p>
            <p className="text-xs text-neutral-600 font-mono">{receiptData.customerPhone}</p>
          </div>
          {receiptData.deliveryScheduledAt && (
            <div className="flex-1 text-right">
              <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">{currentLanguage === "en" ? "COLLECTION DATE" : "วันรับผ้าคืน"}</h3>
              <p className="text-sm font-bold text-neutral-900 leading-tight">{format(new Date(receiptData.deliveryScheduledAt), "dd/MM/yyyy")}</p>
              <p className="text-xs text-neutral-600">{format(new Date(receiptData.deliveryScheduledAt), "HH:mm")}</p>
            </div>
          )}
        </div>

        {/* Scrollable content area — items + totals, constrained to available space */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">

        {/* Items Table */}
        <table className={`w-full text-left ${tableMb} border-collapse ${tableFontSize}`}>
          <thead>
            <tr className="border-b-2 border-neutral-800 font-bold text-neutral-900">
              <th className={`${thPy} px-1 w-[50%]`}>{currentLanguage === "en" ? "DESCRIPTION" : "รายการ"}</th>
              <th className={`${thPy} px-1 text-center`}>{currentLanguage === "en" ? "QTY" : "จำนวน"}</th>
              <th className={`${thPy} px-1 text-right`}>{currentLanguage === "en" ? "UNIT PRICE" : "ราคาต่อหน่วย"}</th>
              <th className={`${thPy} px-1 text-right`}>{currentLanguage === "en" ? "TOTAL" : "รวม"}</th>
            </tr>
          </thead>
          <tbody className="text-neutral-800 font-medium">
            {receiptData.items.map((item, idx) => (
              <tr key={idx} className="border-b border-neutral-200">
                <td className={`${rowPy} px-1`}>
                  {currentLanguage === "en" ? (item.nameEn || item.name) : item.name}
                </td>
                <td className={`${rowPy} px-1 text-center font-mono`}>{item.quantity}</td>
                <td className={`${rowPy} px-1 text-right font-mono`}>{formatCurrency(item.price)}</td>
                <td className={`${rowPy} px-1 text-right font-mono`}>{formatCurrency(item.price * item.quantity)}</td>
              </tr>
            ))}
            {receiptData.deliveryFee !== undefined && receiptData.deliveryFee > 0 && (
              <tr className="border-b border-neutral-200">
                <td className={`${rowPy} px-1`}>{currentLanguage === "en" ? "Delivery Fee" : "ค่าจัดส่ง"}</td>
                <td className={`${rowPy} px-1 text-center font-mono`}>1</td>
                <td className={`${rowPy} px-1 text-right font-mono`}>{formatCurrency(receiptData.deliveryFee)}</td>
                <td className={`${rowPy} px-1 text-right font-mono`}>{formatCurrency(receiptData.deliveryFee)}</td>
              </tr>
            )}
            {receiptData.expressSurcharge > 0 && (
              <tr className="border-b border-neutral-200 text-rose-700">
                <td className={`${rowPy} px-1`}>
                  {currentLanguage === "en" ? "Express Surcharge" : "ค่าบริการด่วนพิเศษ"}
                  {receiptData.serviceSpeed === "express_50" ? " (+50%)" : " (+100%)"}
                </td>
                <td className={`${rowPy} px-1 text-center font-mono`}>1</td>
                <td className={`${rowPy} px-1 text-right font-mono`}>{formatCurrency(receiptData.expressSurcharge)}</td>
                <td className={`${rowPy} px-1 text-right font-mono`}>{formatCurrency(receiptData.expressSurcharge)}</td>
              </tr>
            )}
            {receiptData.discount > 0 && (
              <tr className="border-b border-neutral-200 text-emerald-600">
                <td className={`${rowPy} px-1`}>
                  {currentLanguage === "en" ? "Discount" : "ส่วนลด"}
                  {receiptData.discountPercent && receiptData.discountPercent > 0 ? ` (${receiptData.discountPercent}%)` : ""}
                </td>
                <td className={`${rowPy} px-1 text-center font-mono`}>1</td>
                <td className={`${rowPy} px-1 text-right font-mono`}>-{formatCurrency(receiptData.discount)}</td>
                <td className={`${rowPy} px-1 text-right font-mono`}>-{formatCurrency(receiptData.discount)}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Totals Section */}
        <div className={`flex justify-end ${totalsMb}`}>
          <div className={totalsWidth}>
            <div className={`flex justify-between ${totalPy} ${totalSubtotalText} text-neutral-700`}>
              <span>{currentLanguage === "en" ? "SUBTOTAL" : "ยอดรวม"}</span>
              <span className="font-mono">฿{formatCurrency(receiptData.subtotal + receiptData.expressSurcharge + (receiptData.deliveryFee || 0) - receiptData.discount)}</span>
            </div>
            {receiptData.vatType === "exclusive" && receiptData.vatRate > 0 && (
              <div className={`flex justify-between ${totalPy} ${totalSubtotalText} text-neutral-700 border-b border-neutral-200`}>
                <span>{currentLanguage === "en" ? `VAT (${receiptData.vatRate}%)` : `ภาษีมูลค่าเพิ่ม (${receiptData.vatRate}%)`}</span>
                <span className="font-mono">฿{formatCurrency(receiptData.vatAmount)}</span>
              </div>
            )}
            <div className={`flex justify-between ${grandPy} ${totalGrandText} text-neutral-900 border-t-2 border-neutral-900`}>
              <span>{currentLanguage === "en" ? "GRAND TOTAL" : "ยอดสุทธิ"}</span>
              <span className="font-mono">฿{formatCurrency(receiptData.total)}</span>
            </div>
            {receiptData.vatType === "inclusive" && receiptData.vatRate > 0 && (
              <div className={`flex justify-between ${totalPy} ${totalVatText} text-neutral-500`}>
                <span>{currentLanguage === "en" ? `Includes VAT ${receiptData.vatRate}%` : `รวมภาษีมูลค่าเพิ่ม ${receiptData.vatRate}%`}</span>
                <span className="font-mono">฿{formatCurrency(receiptData.vatAmount)}</span>
              </div>
            )}

            {/* Payments */}
            {payments.length > 0 && (
              <div className="mt-2 pt-2 border-t border-dashed border-neutral-300">
                {payments.map((p, pIdx) => (
                  <div key={pIdx} className={`flex justify-between ${totalPy} ${totalSubtotalText} text-neutral-800`}>
                    <span className="uppercase text-[9px] font-bold">
                      {format(new Date(p.timestamp), "dd/MM/yyyy")} - PAID ({p.method === "credit" ? "MEMBER" : p.method})
                    </span>
                    <span className="font-mono font-bold">฿{formatCurrency(p.amount)}</span>
                  </div>
                ))}
                <div className={`flex justify-between ${totalPy} mt-1 ${totalSubtotalText} font-black text-neutral-900 border-t border-neutral-200`}>
                  <span>TOTAL PAID</span>
                  <span className="font-mono">฿{formatCurrency(totalPaid)}</span>
                </div>
                {!receiptData.isPaid && (
                  <div className={`flex justify-between ${totalPy} ${totalSubtotalText} font-black text-rose-600`}>
                    <span>BALANCE DUE</span>
                    <span className="font-mono">฿{formatCurrency(receiptData.total - totalPaid)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        </div>
        {/* ↑ end of constrained content area */}

        {/* Footer — always visible at bottom, never overlapped */}
        <div className="shrink-0 mt-auto pt-2">
          {/* QR Payment Section — only on Proforma */}
          {receiptData.isDraft && activeShop?.proformaQrUrl && (
            <div className="flex items-center gap-4 mb-3 p-3 border border-neutral-200 rounded-xl bg-neutral-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeShop.proformaQrUrl}
                alt="Payment QR Code"
                className="h-24 w-24 object-contain shrink-0"
                crossOrigin="anonymous"
              />
              <div className="flex flex-col gap-0.5">
                <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Scan to Pay</p>
              <p className="text-sm font-black text-neutral-900">฿{receiptData.total?.toFixed(2) ?? "—"}</p>
                <p className="text-[9px] text-neutral-400 leading-tight mt-0.5">Scan QR code to complete<br/>your payment via PromptPay</p>
              </div>
            </div>
          )}
          <div className="flex items-center justify-end">
            {receiptData.status === "cancel" && (
              <div className="text-base text-rose-600 font-black uppercase border-3 border-rose-600 px-3 py-1.5 inline-block transform -rotate-6 rounded-md opacity-80">
                {currentLanguage === "en" ? "VOIDED" : "ยกเลิกแล้ว"}
              </div>
            )}
          </div>
          <div className={`text-center ${footerMt} border-t border-neutral-200`}>
            <p className="text-[11px] text-neutral-500 font-medium">
              {receiptData.isDraft 
                ? (currentLanguage === "en" ? "This is a proforma invoice, not an official tax receipt." : "เอกสารใบแจ้งหนี้ชั่วคราว ไม่ใช่ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างเป็นทางการ")
                : (receiptData.status === "cancel" 
                    ? (currentLanguage === "en" ? "This order has been cancelled" : "รายการสั่งซื้อนี้ถูกยกเลิกแล้ว")
                    : (currentLanguage === "en" ? "Thank you for your business!" : "ขอบคุณที่ใช้บริการ!"))}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Dialog 
        open={open && !printModeActive} 
        onOpenChange={(isOpen) => {
          if (!isOpen && onCloseComplete) {
            setTimeout(() => {
              onCloseComplete();
            }, 150);
          }
          onOpenChange(isOpen);
        }}
      >
        <DialogContent className="max-w-[148mm] max-h-[90vh] overflow-y-auto rounded-xl p-0 border-none shadow-2xl bg-neutral-900 print:hidden overflow-x-hidden">
          <div className="flex flex-col items-center bg-neutral-800 min-h-full pb-8">
            <div className="w-full bg-neutral-900 p-4 border-b border-neutral-700 flex justify-between items-center sticky top-0 z-10 shadow-md">
              <h2 className="text-white font-bold">{currentLanguage === "en" ? "A5 Receipt Preview" : "ตัวอย่างใบเสร็จ A5"}</h2>
              <div className="flex gap-2">
                <Button 
                  onClick={handlePrint}
                  disabled={isPrinting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-9 px-4 rounded-lg text-sm border-none shadow-md flex items-center gap-2 disabled:opacity-70"
                >
                  {isPrinting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                  {isPrinting ? (currentLanguage === "en" ? "Preparing..." : "กำลังเตรียม...") : (currentLanguage === "en" ? "Print A5" : "พิมพ์ A5")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="bg-white/10 hover:bg-white/20 border-white/20 text-white h-9 px-4 rounded-lg flex items-center gap-2"
                >
                  <X size={16} />
                  {currentLanguage === "en" ? "Close" : "ปิด"}
                </Button>
              </div>
            </div>
            
            {/* Receipt preview area — renders instantly in 0ms */}
            <div className="w-full flex justify-center pt-4 bg-neutral-800 overflow-hidden" style={{ height: 'calc(210mm * 0.8 + 1rem)' }}>
              <div className="transform scale-[0.8] origin-top">
                {renderReceiptContent(false)}
              </div>
            </div>
            
            {/* Bottom Close Button */}
            <div className="w-full max-w-[148mm] px-4 mt-2 mb-4">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="w-full bg-neutral-900 border border-neutral-700 hover:bg-neutral-950 text-white font-bold h-12 rounded-xl text-sm cursor-pointer shadow-sm"
              >
                {receiptData.isDraft ? (currentLanguage === "en" ? "Close" : "ปิด") : (currentLanguage === "en" ? "Done" : "เสร็จสิ้น")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print-only layout portalled directly to document.body */}
      {mounted && createPortal(
        <div className="hidden print:block print-root print-root-a5">
          {renderReceiptContent(true)}
        </div>,
        document.body
      )}

      {/* Hidden full-size capture target (matches dialog preview 1:1 for html2canvas) */}
      {mounted && createPortal(
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            zIndex: -9999,
            opacity: 0.01,
            pointerEvents: "none",
            width: "148mm",
          }}
          className="print:hidden"
        >
          <div ref={captureRef}>
            {renderReceiptContent(false)}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// Global variable just for internal print state toggling
let printModeActive = false;

// ─────────────────────────────────────────────────────────────────────────────
// Standalone exported component — identical to renderReceiptContent(false).
// Used by a5-canvas-generator.ts to render the exact same React DOM that the
// Dialog uses, so html2canvas-pro captures pixel-identical output.
// ─────────────────────────────────────────────────────────────────────────────
export interface A5ReceiptContentProps {
  receiptData: ReceiptData;
  activeShop?: ShopInfo | null;
  currentLanguage?: string;
}

export function A5ReceiptContent({ receiptData, activeShop, currentLanguage = "en" }: A5ReceiptContentProps) {
  const formatCurrency = (val: number) =>
    val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const cleanRemark = (rawRemark: string | null | undefined) => {
    if (!rawRemark) return "";
    return rawRemark
      .split(" | ")
      .filter(p => !p.startsWith("VAT:") && !p.startsWith("Express") && !p.startsWith("Proforma:") && !p.startsWith("Revision:"))
      .join(" | ")
      .trim();
  };

  const payments: PaymentLog[] = (() => {
    try {
      if (receiptData.adminNotesJson) {
        const parsed = JSON.parse(receiptData.adminNotesJson);
        if (parsed && Array.isArray(parsed.payments)) return parsed.payments as PaymentLog[];
      }
    } catch { /* ignore */ }
    return [];
  })();
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

  const safeDate = receiptData.createdAt
    ? (receiptData.createdAt instanceof Date ? receiptData.createdAt : new Date(receiptData.createdAt))
    : new Date();
  const validDate = isNaN(safeDate.getTime()) ? new Date() : safeDate;

  const proformaDisplayId = receiptData.isDraft
    ? (receiptData.proformaRevision && receiptData.proformaRevision > 0
        ? `${receiptData.proformaId || "DRAFT"}-R${receiptData.proformaRevision}`
        : (receiptData.proformaId || "DRAFT"))
    : null;

  // Auto-scale: estimate rows = items + optional rows (delivery fee, surcharge, discount, payments)
  const extraRows = (receiptData.deliveryFee && receiptData.deliveryFee > 0 ? 1 : 0)
    + (receiptData.expressSurcharge > 0 ? 1 : 0)
    + (receiptData.discount > 0 ? 1 : 0);
  const totalRows = receiptData.items.length + extraRows;

  // Granular responsive sizing for Items Table AND Totals Section:
  let tableFontSize = "text-sm";
  let rowPy = "py-2.5";
  let thPy = "py-2";
  let tableMb = "mb-4";
  let sectionGap = "mb-4";

  // Totals section responsive sizing:
  let totalSubtotalText = "text-sm";
  let totalGrandText = "text-lg font-black";
  let totalVatText = "text-xs";
  let totalPy = "py-1.5";
  let grandPy = "py-2.5";
  let totalsMb = "mb-6";
  let totalsWidth = "w-1/2";
  let footerMt = "mt-6 pt-3";
  let rowPx = 36;

  if (totalRows > 20) {
    tableFontSize = "text-[8.5px] leading-tight";
    rowPy = "py-[1px]";
    thPy = "py-[1.5px]";
    tableMb = "mb-1";
    sectionGap = "mb-1.5";

    totalSubtotalText = "text-[9px]";
    totalGrandText = "text-xs font-black";
    totalVatText = "text-[8px]";
    totalPy = "py-[1px]";
    grandPy = "py-0.5";
    totalsMb = "mb-1.5";
    totalsWidth = "w-5/12";
    footerMt = "mt-1 pt-1";
    rowPx = 15;
  } else if (totalRows > 15) {
    // e.g. Job 2026002710 with 17 items
    tableFontSize = "text-[9px] leading-tight";
    rowPy = "py-[2px]";
    thPy = "py-1";
    tableMb = "mb-1.5";
    sectionGap = "mb-2";

    totalSubtotalText = "text-[10px]";
    totalGrandText = "text-sm font-black";
    totalVatText = "text-[8.5px]";
    totalPy = "py-0.5";
    grandPy = "py-1";
    totalsMb = "mb-2.5";
    totalsWidth = "w-5/12";
    footerMt = "mt-2 pt-2";
    rowPx = 18;
  } else if (totalRows > 11) {
    tableFontSize = "text-[10.5px] leading-snug";
    rowPy = "py-1";
    thPy = "py-1";
    tableMb = "mb-2";
    sectionGap = "mb-2.5";

    totalSubtotalText = "text-xs";
    totalGrandText = "text-base font-black";
    totalVatText = "text-[9.5px]";
    totalPy = "py-0.5";
    grandPy = "py-1.5";
    totalsMb = "mb-3.5";
    totalsWidth = "w-1/2";
    footerMt = "mt-3 pt-2";
    rowPx = 22;
  } else if (totalRows > 7) {
    tableFontSize = "text-xs";
    rowPy = "py-1.5";
    thPy = "py-1.5";
    tableMb = "mb-2.5";
    sectionGap = "mb-3";

    totalSubtotalText = "text-xs";
    totalGrandText = "text-base font-black";
    totalVatText = "text-[10px]";
    totalPy = "py-1";
    grandPy = "py-2";
    totalsMb = "mb-4";
    totalsWidth = "w-1/2";
    footerMt = "mt-4 pt-2";
    rowPx = 26;
  }

  // Scale factor to ensure content fits within A5 page height (793px)
  const estimatedHeight = 64 + 110 + 50 + (totalRows * rowPx) + 80 + 70 + 35;
  const A5_HEIGHT = 793;
  const scale = estimatedHeight > A5_HEIGHT ? Math.max(0.60, A5_HEIGHT / estimatedHeight) : 1;

  return (
    <div style={{ width: 559, height: A5_HEIGHT, overflow: "hidden", position: "relative" }}>
      <div
        style={{
          width: 559,
          height: A5_HEIGHT,
          transformOrigin: "top left",
          transform: scale < 1 ? `scale(${scale})` : undefined,
        }}
        className="bg-white text-zinc-800 p-8 box-border font-sans flex flex-col overflow-hidden"
      >
      {/* Header */}
      <div className={`flex justify-between items-start ${sectionGap}`}>
        <div className="flex-1">
          <div className="mb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activeShop?.logoUrl || "/logo.png"} alt="Shop Logo" className="h-10 object-contain filter grayscale contrast-125" />
          </div>
          <h1 className="text-sm font-black text-neutral-900 uppercase tracking-tight leading-tight">{activeShop?.name || "That Laundry Shop"}</h1>
          <p className="text-xs text-neutral-600 max-w-[250px] mt-1 whitespace-pre-line">{activeShop?.addressFull || activeShop?.address || "123 Sukhumvit Road, Bangkok"}</p>
          <p className="text-xs text-neutral-600">
            Tel: {activeShop?.phone || "081-111-2222"}
            {activeShop?.taxId && <span className="ml-2"><span className="font-bold">TAX ID:</span> {activeShop.taxId}</span>}
          </p>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-black text-neutral-900 uppercase tracking-wider mb-2">
            {receiptData.isDraft ? "PROFORMA INVOICE" : (receiptData.status === "cancel" ? "VOID RECEIPT" : "RECEIPT")}
          </h2>
          {receiptData.isDraft ? (
            <div className="text-xs mb-1">
              <span className="font-bold text-neutral-700 mr-1">PROFORMA NO:</span>
              <span className="font-mono font-medium text-neutral-900">{proformaDisplayId}</span>
            </div>
          ) : (
            <>
              {!receiptData.status?.includes("cancel") && (
                <div className="text-xs mb-1">
                  <span className="font-bold text-neutral-700 mr-1">RECEIPT NO:</span>
                  <span className="font-mono font-medium text-neutral-900">#{receiptData.id}</span>
                </div>
              )}
              {receiptData.proformaId && (
                <div className="text-xs mb-1">
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
          <div className="text-xs">
            <span className="font-bold text-neutral-700 mr-1">DATE:</span>
            <span className="font-medium text-neutral-900">{format(validDate, "dd/MM/yyyy HH:mm")}</span>
          </div>
        </div>
      </div>

      <hr className={`border-neutral-300 ${sectionGap}`} />

      {/* Customer + Collection Date */}
      <div className={`flex justify-between ${sectionGap}`}>
        <div className="flex-1">
          <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">BILLED TO</h3>
          <p className="text-sm font-bold text-neutral-900 leading-tight">{receiptData.customerName}</p>
          <p className="text-xs text-neutral-600 font-mono">{receiptData.customerPhone}</p>
        </div>
        {receiptData.deliveryScheduledAt && (
          <div className="flex-1 text-right">
            <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">COLLECTION DATE</h3>
            <p className="text-sm font-bold text-neutral-900 leading-tight">{format(new Date(receiptData.deliveryScheduledAt), "dd/MM/yyyy")}</p>
            <p className="text-xs text-neutral-600">{format(new Date(receiptData.deliveryScheduledAt), "HH:mm")}</p>
          </div>
        )}
      </div>

      {/* Constrained content area */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">

      {/* Items Table */}
      <table className={`w-full text-left ${tableMb} border-collapse ${tableFontSize}`}>
        <thead>
          <tr className="border-b-2 border-neutral-800 font-bold text-neutral-900">
            <th className={`${thPy} px-1 w-[50%]`}>DESCRIPTION</th>
            <th className={`${thPy} px-1 text-center`}>QTY</th>
            <th className={`${thPy} px-1 text-right`}>UNIT PRICE</th>
            <th className={`${thPy} px-1 text-right`}>TOTAL</th>
          </tr>
        </thead>
        <tbody className="text-neutral-800 font-medium">
          {receiptData.items.map((item, idx) => (
            <tr key={idx} className="border-b border-neutral-200">
              <td className={`${rowPy} px-1`}>{item.nameEn || item.name}</td>
              <td className={`${rowPy} px-1 text-center font-mono`}>{item.quantity}</td>
              <td className={`${rowPy} px-1 text-right font-mono`}>{formatCurrency(item.price)}</td>
              <td className={`${rowPy} px-1 text-right font-mono`}>{formatCurrency(item.price * item.quantity)}</td>
            </tr>
          ))}
          {receiptData.deliveryFee !== undefined && receiptData.deliveryFee > 0 && (
            <tr className="border-b border-neutral-200">
              <td className={`${rowPy} px-1`}>Delivery Fee</td>
              <td className={`${rowPy} px-1 text-center font-mono`}>1</td>
              <td className={`${rowPy} px-1 text-right font-mono`}>{formatCurrency(receiptData.deliveryFee)}</td>
              <td className={`${rowPy} px-1 text-right font-mono`}>{formatCurrency(receiptData.deliveryFee)}</td>
            </tr>
          )}
          {receiptData.expressSurcharge > 0 && (
            <tr className="border-b border-neutral-200 text-rose-700">
              <td className={`${rowPy} px-1`}>Express Surcharge{receiptData.serviceSpeed === "express_50" ? " (+50%)" : " (+100%)"}</td>
              <td className={`${rowPy} px-1 text-center font-mono`}>1</td>
              <td className={`${rowPy} px-1 text-right font-mono`}>{formatCurrency(receiptData.expressSurcharge)}</td>
              <td className={`${rowPy} px-1 text-right font-mono`}>{formatCurrency(receiptData.expressSurcharge)}</td>
            </tr>
          )}
          {receiptData.discount > 0 && (
            <tr className="border-b border-neutral-200 text-emerald-600">
              <td className={`${rowPy} px-1`}>Discount{receiptData.discountPercent && receiptData.discountPercent > 0 ? ` (${receiptData.discountPercent}%)` : ""}</td>
              <td className={`${rowPy} px-1 text-center font-mono`}>1</td>
              <td className={`${rowPy} px-1 text-right font-mono`}>-{formatCurrency(receiptData.discount)}</td>
              <td className={`${rowPy} px-1 text-right font-mono`}>-{formatCurrency(receiptData.discount)}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Totals */}
      <div className={`flex justify-end ${totalsMb}`}>
        <div className={totalsWidth}>
          <div className={`flex justify-between ${totalPy} ${totalSubtotalText} text-neutral-700`}>
            <span>SUBTOTAL</span>
            <span className="font-mono">฿{formatCurrency(receiptData.subtotal + receiptData.expressSurcharge + (receiptData.deliveryFee || 0) - receiptData.discount)}</span>
          </div>
          {receiptData.vatType === "exclusive" && receiptData.vatRate > 0 && (
            <div className={`flex justify-between ${totalPy} ${totalSubtotalText} text-neutral-700 border-b border-neutral-200`}>
              <span>VAT ({receiptData.vatRate}%)</span>
              <span className="font-mono">฿{formatCurrency(receiptData.vatAmount)}</span>
            </div>
          )}
          <div className={`flex justify-between ${grandPy} ${totalGrandText} text-neutral-900 border-t-2 border-neutral-900`}>
            <span>GRAND TOTAL</span>
            <span className="font-mono">฿{formatCurrency(receiptData.total)}</span>
          </div>
          {receiptData.vatType === "inclusive" && receiptData.vatRate > 0 && (
            <div className={`flex justify-between ${totalPy} ${totalVatText} text-neutral-500`}>
              <span>Includes VAT {receiptData.vatRate}%</span>
              <span className="font-mono">฿{formatCurrency(receiptData.vatAmount)}</span>
            </div>
          )}
          {payments.length > 0 && (
            <div className="mt-2 pt-2 border-t border-dashed border-neutral-300">
              {payments.map((p, pIdx) => (
                <div key={pIdx} className={`flex justify-between ${totalPy} ${totalSubtotalText} text-neutral-800`}>
                  <span className="uppercase text-[9px] font-bold">{format(new Date(p.timestamp), "dd/MM/yyyy")} - PAID ({p.method === "credit" ? "MEMBER" : p.method})</span>
                  <span className="font-mono font-bold">฿{formatCurrency(p.amount)}</span>
                </div>
              ))}
              <div className={`flex justify-between ${totalPy} mt-1 ${totalSubtotalText} font-black text-neutral-900 border-t border-neutral-200`}>
                <span>TOTAL PAID</span>
                <span className="font-mono">฿{formatCurrency(totalPaid)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      </div>
      {/* ↑ end constrained content area */}

      {/* Footer — always at bottom, never overlapped */}
      <div className="shrink-0 mt-auto pt-2 border-t border-neutral-200">
        {/* QR Payment Section — only on Proforma */}
        {receiptData.isDraft && activeShop?.proformaQrUrl && (
          <div className="flex items-center gap-4 mb-3 p-3 border border-neutral-200 rounded-xl bg-neutral-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeShop.proformaQrUrl}
              alt="Payment QR Code"
              className="h-24 w-24 object-contain shrink-0"
              crossOrigin="anonymous"
            />
            <div className="flex flex-col gap-0.5">
              <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Scan to Pay</p>
              <p className="text-sm font-black text-neutral-900">฿{receiptData.total?.toFixed(2) ?? "—"}</p>
              <p className="text-[9px] text-neutral-400 leading-tight mt-0.5">Scan QR code to complete<br/>your payment via PromptPay</p>
            </div>
          </div>
        )}
        <div className="flex items-center justify-end">
          {receiptData.status === "cancel" && (
            <div className="text-lg text-rose-600 font-black uppercase border-4 border-rose-600 px-4 py-2 inline-block transform -rotate-6 rounded-md opacity-80">VOIDED</div>
          )}
        </div>
        <div className={`text-center ${footerMt} border-t border-neutral-200`}>
          <p className="text-[11px] text-neutral-500 font-medium">
            {receiptData.isDraft
              ? "This is a proforma invoice, not an official tax receipt."
              : (receiptData.status === "cancel" ? "This order has been cancelled" : "Thank you for your business!")}
          </p>
        </div>
      </div>
    </div>
    </div>
  );
}

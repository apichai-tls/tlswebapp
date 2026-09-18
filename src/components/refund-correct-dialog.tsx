/* eslint-disable */
"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  RotateCcw, 
  AlertTriangle, 
  CheckCircle2, 
  Wallet, 
  Banknote, 
  ArrowRight, 
  UploadCloud, 
  Image as ImageIcon, 
  Trash2, 
  Loader2,
  FileText,
  CopyPlus,
  Ban
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { jobStore, customerStore, type Job, type Customer } from "@/lib/store";
import { api } from "@/lib/api";

interface RefundCorrectDialogProps {
  open: boolean;
  onClose: () => void;
  job: Job | null;
  onSuccess?: (result: { duplicatedJobId: string; creditNoteNumber: string; jobRefund?: any }) => void;
}

function formatCurrency(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function RefundCorrectDialog({ open, onClose, job, onSuccess }: RefundCorrectDialogProps) {
  const { user } = useAuth();

  const [reason, setReason] = useState<string>("");
  const [refundChannel, setRefundChannel] = useState<"original" | "wallet" | "cash">("original");
  const [slipImageUrl, setSlipImageUrl] = useState<string | null>(null);
  const [isUploadingSlip, setIsUploadingSlip] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const slipInputRef = useRef<HTMLInputElement>(null);

  // Find associated customer if any
  const [customer, setCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    if (open && job) {
      setReason("");
      setRefundChannel("original");
      setSlipImageUrl(null);
      setIsSubmitting(false);

      if (job.customerId) {
        const customers = customerStore.getSnapshot();
        const found = customers.find(c => c.id === job.customerId);
        setCustomer(found || null);
      } else {
        setCustomer(null);
      }
    }
  }, [open, job]);

  const originalAmount = useMemo(() => {
    return Number(job?.totalAmount) || 0;
  }, [job]);

  const targetDuplicateId = useMemo(() => {
    if (!job) return "";
    const cleanId = job.id.replace(/^RF-/, "");
    return `RF-${cleanId}`;
  }, [job]);

  // Slip Upload Helper
  const handleSlipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
      return;
    }

    setIsUploadingSlip(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entityType", "job");
      formData.append("entityId", job?.id ? `refund-${job.id}` : `refund-${Date.now()}`);
      formData.append("subType", "proofs");

      const localRes = await fetch("/api/upload-local", {
        method: "POST",
        body: formData,
      });

      if (!localRes.ok) {
        throw new Error("Upload failed");
      }

      const localData = await localRes.json();
      setSlipImageUrl(localData.publicUrl);
      toast.success("แนบหลักฐานเรียบร้อยแล้ว");
    } catch (err: any) {
      toast.error("อัปโหลดหลักฐานไม่สำเร็จ: " + err.message);
    } finally {
      setIsUploadingSlip(false);
      if (slipInputRef.current) slipInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!job) return;

    const canRefund = Boolean(user?.role === 'admin' || user?.permissions?.includes('refund-job'));
    if (!canRefund) {
      toast.error("คุณไม่มีสิทธิ์ในการ Refund Job (ต้องได้รับสิทธิ์ refund-job หรือสิทธิ์ Admin)");
      return;
    }

    if (!reason.trim()) {
      toast.error("กรุณาระบุเหตุผลในการ Refund / แก้ไขบิล");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await api.processRefundAndCorrect({
        jobId: job.id,
        reason: reason.trim(),
        refundChannel,
        slipImageUrl,
        actorId: user?.id || null,
        actorName: user?.name || user?.email || "Staff",
        branchId: user?.branchId || job.branchId || null,
      });

      toast.success(
        `ยกเลิก Job #${job.id} และ Refund เต็มจำนวน ฿${formatCurrency(originalAmount)} (CN: ${result.creditNoteNumber}) สำเร็จ! สร้าง Job สำเนา #${result.duplicatedJobId} เรียบร้อย`
      );

      // Trigger store refresh
      if (job.createdAt) {
        const d = new Date(job.createdAt);
        jobStore.fetchHistoricalJobs(d, d).catch(() => {});
      }

      onSuccess?.({
        duplicatedJobId: result.duplicatedJobId,
        creditNoteNumber: result.creditNoteNumber,
        jobRefund: result.jobRefund,
      });
      onClose();
    } catch (err: any) {
      console.error("Refund failed:", err);
      toast.error("เกิดข้อผิดพลาดในการ Refund: " + (err.message || "Unknown error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isSubmitting) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-100 shrink-0 bg-slate-50/50">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-800">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white bg-rose-500 shadow-xs">
              <RotateCcw size={16} />
            </div>
            <span>Refund & Reissue (คืนเงินและออกใบงานใหม่)</span>
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-1">
            ยกเลิก Job เดิม คืนเงินเต็มจำนวน ออกใบลดหนี้ (Credit Note) และสร้าง Job สำเนาเพื่อแก้ไขรายการและชำระเงินใหม่
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Original Job Info Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Original Job</span>
                <p className="font-mono text-xs font-bold text-slate-800">
                  #{job.id} {job.billNo ? `(Bill: ${job.billNo})` : ""}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  ลูกค้า: <strong className="text-slate-800">{job.customerName || "ลูกค้าทั่วไป"}</strong>
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">ยอดชำระเดิม</span>
                <p className="text-base font-black text-rose-600">฿{formatCurrency(originalAmount)}</p>
                <Badge variant="outline" className="text-[9px] mt-0.5 font-bold">
                  {job.paymentChannel || "Unspecified"}
                </Badge>
              </div>
            </div>
          </div>

          {/* Workflow Steps Preview */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 space-y-2">
            <span className="text-[11px] font-bold text-blue-900 flex items-center gap-1.5">
              <CopyPlus size={14} className="text-blue-600" /> สิ่งที่ระบบจะดำเนินการอัตโนมัติ:
            </span>
            <div className="space-y-1.5 text-xs text-slate-700 pl-1">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-rose-100 text-rose-700 font-bold flex items-center justify-center text-[10px] shrink-0">1</span>
                <span>ยกเลิก Job เดิม <strong className="font-mono font-bold text-slate-800">#{job.id}</strong> (สถานะเปลี่ยนเป็น <strong className="text-rose-600">Cancel</strong>)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-700 font-bold flex items-center justify-center text-[10px] shrink-0">2</span>
                <span>บันทึกคืนเงินเต็มจำนวน <strong className="text-rose-600 font-bold">฿{formatCurrency(originalAmount)}</strong> และออกใบลดหนี้ (Credit Note)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-[10px] shrink-0">3</span>
                <span>สร้าง Job สำเนา <strong className="font-mono font-bold text-blue-700">#{targetDuplicateId}</strong> <span className="text-emerald-700 font-bold">(ปลด lock รายการและราคา พร้อมเปิดให้แก้ไขและคิดเงินใหม่ทันที)</span></span>
              </div>
            </div>
          </div>

          {/* Refund Channel Selection */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-700">
              ช่องทางการคืนเงินเต็มจำนวน (Refund Method) <span className="text-rose-500">*</span>
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setRefundChannel("original")}
                className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all ${
                  refundChannel === "original"
                    ? "border-rose-500 bg-rose-50/70 text-rose-950 ring-1 ring-rose-500"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <div className="text-xs font-bold">ช่องทางเดิม</div>
                <div className="text-[10px] text-slate-500 mt-0.5 truncate w-full">
                  {job.paymentChannel || "Original"}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRefundChannel("wallet")}
                disabled={!customer}
                className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all ${
                  !customer ? "opacity-50 cursor-not-allowed bg-slate-100 border-slate-200" : ""
                } ${
                  refundChannel === "wallet"
                    ? "border-emerald-500 bg-emerald-50/70 text-emerald-950 ring-1 ring-emerald-500"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <div className="flex items-center gap-1 text-xs font-bold">
                  <Wallet size={12} className="text-emerald-600" />
                  <span>Member Wallet</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {customer ? `คงเหลือ ฿${formatCurrency(customer.creditBalance || 0)}` : "ไม่ใช่ Member"}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRefundChannel("cash")}
                className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all ${
                  refundChannel === "cash"
                    ? "border-amber-500 bg-amber-50/70 text-amber-950 ring-1 ring-amber-500"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <div className="flex items-center gap-1 text-xs font-bold">
                  <Banknote size={12} className="text-amber-600" />
                  <span>เงินสด (Cash)</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  คืนเงินสดหน้าร้าน
                </div>
              </button>
            </div>

            {refundChannel === "wallet" && customer && (
              <p className="text-[11px] text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200">
                ✅ ระบบจะเพิ่มยอดเงินคืน <strong className="text-emerald-900">฿{formatCurrency(originalAmount)}</strong> กลับเข้า Member Wallet ของ <strong>{customer.name}</strong> ให้อัตโนมัติทันที
              </p>
            )}

            {refundChannel !== "wallet" && (
              <p className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                ⚠️ พนักงาน/แคชเชียร์ต้องดำเนินการคืนเงินสดหรือโอนเงินคืนลูกค้า <strong className="text-amber-950 font-bold">฿{formatCurrency(originalAmount)}</strong> ด้วยตนเอง
              </p>
            )}
          </div>

          {/* Reason (Mandatory) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">
              เหตุผลในการ Refund / ออกใบงานใหม่ <span className="text-rose-500">*</span>
            </Label>
            <textarea
              placeholder="ระบุเหตุผล เช่น ลูกค้าต้องการเปลี่ยนรายการบริการ, ชั่งน้ำหนักผิดต้องคิดเงินใหม่, สลับชนิดบริการ..."
              value={reason}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-xs shadow-2xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 outline-none resize-none"
            />
          </div>

          {/* Slip Attachment */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">
              หลักฐานการคืนเงิน / สลิปโอนคืน (ถ้ามี)
            </Label>
            {slipImageUrl ? (
              <div className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                <img src={slipImageUrl} alt="Proof" className="w-12 h-12 object-cover rounded border" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">แนบหลักฐานเรียบร้อยแล้ว</p>
                  <a href={slipImageUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline">
                    ดูภาพขนาดเต็ม
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => setSlipImageUrl(null)}
                  className="text-slate-400 hover:text-rose-600 p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ) : (
              <div>
                <input
                  ref={slipInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleSlipUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploadingSlip}
                  onClick={() => slipInputRef.current?.click()}
                  className="w-full text-xs h-9 border-dashed border-slate-300 hover:border-slate-400"
                >
                  {isUploadingSlip ? (
                    <>
                      <Loader2 size={13} className="mr-1.5 animate-spin" /> กำลังอัปโหลด...
                    </>
                  ) : (
                    <>
                      <UploadCloud size={14} className="mr-1.5 text-slate-500" /> แนบไฟล์รูปสลิป / หลักฐาน
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-between sm:justify-between items-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-xs"
          >
            ยกเลิก
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting || !reason.trim()}
            className="font-bold text-xs text-white bg-rose-600 hover:bg-rose-700 transition-colors gap-1.5 shadow-xs"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={13} className="animate-spin" /> กำลังบันทึก...
              </>
            ) : (
              <>
                <CheckCircle2 size={14} /> 
                ยืนยันยกเลิกและออก Job ใหม่
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

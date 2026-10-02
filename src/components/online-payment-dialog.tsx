"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  QrCode,
  Copy,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
  CreditCard,
  Smartphone,
  ShieldCheck,
  AlertCircle,
  Share2,
  Check,
} from "lucide-react";
import {
  createJobOnlinePaymentAction,
  checkJobOnlinePaymentStatusAction,
  type CreateOnlinePaymentResult,
} from "@/actions/online-payment";
import { formatBaht } from "@/lib/utils";

interface OnlinePaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  job: {
    id: string;
    billNo?: string | null;
    totalAmount?: number | null;
    customerName?: string | null;
    customerPhone?: string | null;
    isPaid?: boolean;
    paymentChannel?: string | null;
  } | null;
  customAmount?: number;
  onPaymentSuccess?: (paidInfo: {
    jobId: string;
    amount: number;
    channel: string;
  }) => void;
}

export function OnlinePaymentDialog({
  isOpen,
  onClose,
  job,
  customAmount,
  onPaymentSuccess,
}: OnlinePaymentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState<CreateOnlinePaymentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isPaidSuccess, setIsPaidSuccess] = useState(false);
  const [paidDetails, setPaidDetails] = useState<{ amount: number; channel: string } | null>(null);
  
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const amountToPay = customAmount !== undefined ? customAmount : (job?.totalAmount || 0);

  // Initialize payment link generation when dialog opens
  useEffect(() => {
    if (!isOpen || !job) {
      setPaymentData(null);
      setError(null);
      setIsPaidSuccess(false);
      setPaidDetails(null);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    if (job.isPaid) {
      setIsPaidSuccess(true);
      setPaidDetails({
        amount: job.totalAmount || 0,
        channel: job.paymentChannel || "Beam Checkout",
      });
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    createJobOnlinePaymentAction(job.id, amountToPay)
      .then((res) => {
        if (!isMounted) return;
        setLoading(false);
        if (res.isAlreadyPaid) {
          setIsPaidSuccess(true);
          setPaidDetails({
            amount: amountToPay,
            channel: "Beam Checkout",
          });
          if (onPaymentSuccess) {
            onPaymentSuccess({
              jobId: job.id,
              amount: amountToPay,
              channel: "Beam Checkout",
            });
          }
        } else if (res.success && res.paymentUrl) {
          setPaymentData(res);
        } else {
          setError(res.error || "ไม่สามารถสร้างลิงก์ชำระเงินออนไลน์ได้");
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setLoading(false);
        setError(err.message || "เกิดข้อผิดพลาดในการเชื่อมต่อระบบ Beam API");
      });

    return () => {
      isMounted = false;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isOpen, job?.id, amountToPay]);

  // Polling for payment status verification every 3.5 seconds
  useEffect(() => {
    if (!isOpen || !job || isPaidSuccess || !paymentData?.paymentUrl) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    const checkStatus = async () => {
      try {
        const res = await checkJobOnlinePaymentStatusAction(job.id);
        if (res.success && res.isPaid) {
          setIsPaidSuccess(true);
          const details = {
            amount: res.paidAmount || amountToPay,
            channel: res.paymentChannel || "Beam Checkout",
          };
          setPaidDetails(details);
          toast.success("🎉 ได้รับยอดชำระเงินออนไลน์เรียบร้อยแล้ว!");
          if (onPaymentSuccess) {
            onPaymentSuccess({
              jobId: job.id,
              amount: details.amount,
              channel: details.channel,
            });
          }
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        }
      } catch (e) {
        console.warn("[Beam Poller] Check status poll error:", e);
      }
    };

    pollTimerRef.current = setInterval(checkStatus, 3500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isOpen, job?.id, isPaidSuccess, paymentData, amountToPay, onPaymentSuccess]);

  const handleCopyLink = () => {
    if (!paymentData?.paymentUrl) return;
    navigator.clipboard.writeText(paymentData.paymentUrl);
    setIsCopied(true);
    toast.success("คัดลอกลิงก์ชำระเงินเรียบร้อยแล้ว");
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleOpenLink = () => {
    if (paymentData?.paymentUrl) {
      window.open(paymentData.paymentUrl, "_blank");
    }
  };

  if (!isOpen || !job) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[440px] p-0 overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl bg-white dark:bg-slate-900">
        
        {/* Header with Beam branding */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-800 text-white px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-md flex items-center justify-center font-black text-sm tracking-wider text-white border border-white/20">
                ⚡
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-white flex items-center gap-1.5">
                  Beam Online Checkout
                </DialogTitle>
                <DialogDescription className="text-xs text-blue-100/80">
                  รองรับ Thai QR PromptPay • Mobile Banking • บัตรเครดิต
                </DialogDescription>
              </div>
            </div>
            <Badge className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-[10px] font-bold px-2 py-0.5">
              Live Gateway
            </Badge>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Order Summary Info Card */}
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3.5 border border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                ออเดอร์ #{job.billNo || job.id}
              </div>
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                {job.customerName || "ลูกค้าทั่วไป"}
                {job.customerPhone && (
                  <span className="text-slate-400 font-normal ml-1">({job.customerPhone})</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                ยอดที่ต้องชำระ
              </div>
              <div className="text-xl font-black text-indigo-600 dark:text-indigo-400">
                ฿{amountToPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* SUCCESS STATE */}
          {isPaidSuccess ? (
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-3 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center border-2 border-emerald-500 shadow-lg shadow-emerald-500/20">
                <CheckCircle2 size={36} className="animate-bounce" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                  ชำระเงินสำเร็จแล้ว!
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  ระบบได้บันทึกการชำระเงินและอัปเดตสถานะบิลเรียบร้อยแล้ว
                </p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                ยอดชำระ: <b>฿{(paidDetails?.amount || amountToPay).toLocaleString()}</b> • ช่องทาง: <b>{paidDetails?.channel || "Beam Checkout"}</b>
              </div>
              <Button
                onClick={onClose}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 mt-2 rounded-xl"
              >
                เสร็จสิ้น / ปิดหน้าต่าง
              </Button>
            </div>
          ) : loading ? (
            /* LOADING STATE */
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <RefreshCw size={32} className="animate-spin text-indigo-600" />
              <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                กำลังสร้างลิงก์ชำระเงินและ QR Code กับ Beam API...
              </div>
              <p className="text-[11px] text-slate-400">กรุณารอสักครู่</p>
            </div>
          ) : error ? (
            /* ERROR STATE */
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                <AlertCircle size={28} />
              </div>
              <div className="text-sm font-bold text-rose-600">
                ไม่สามารถสร้างลิงก์ชำระเงินได้
              </div>
              <p className="text-xs text-slate-500 max-w-xs">{error}</p>
              <Button
                variant="outline"
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  createJobOnlinePaymentAction(job.id, amountToPay)
                    .then((res) => {
                      setLoading(false);
                      if (res.success && res.paymentUrl) setPaymentData(res);
                      else setError(res.error || "เกิดข้อผิดพลาด");
                    });
                }}
                className="text-xs font-bold h-8"
              >
                ลองใหม่อีกครั้ง
              </Button>
            </div>
          ) : (
            /* QR CODE DISPLAY STATE */
            <div className="space-y-4">
              {/* QR Code Container */}
              <div className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-950 border border-indigo-100 dark:border-indigo-950 rounded-2xl shadow-inner relative group">
                {paymentData?.qrCodeUrl ? (
                  <div className="relative">
                    <img
                      src={paymentData.qrCodeUrl}
                      alt="Beam Payment QR"
                      className="w-48 h-48 object-contain rounded-lg select-none"
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-black/10 rounded-lg">
                      <span className="bg-slate-900/90 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow">
                        สแกนเพื่อจ่ายเงิน
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-slate-400">
                    <QrCode size={48} />
                  </div>
                )}

                <div className="text-center mt-2.5 space-y-1">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5">
                    <Smartphone size={14} className="text-indigo-600" />
                    สแกน QR ด้วยกล้องมือถือ หรือแอปธนาคาร
                  </div>
                  <div className="text-[10.5px] text-slate-500 flex items-center justify-center gap-1">
                    <CreditCard size={12} />
                    เลือกระบบ PromptPay, Mobile Banking หรือบัตรเครดิตได้ในหน้าชำระเงิน
                  </div>
                </div>
              </div>

              {/* Status Polling Live Indicator */}
              <div className="flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                <RefreshCw size={12} className="animate-spin text-indigo-600" />
                <span>กำลังรอการชำระเงินจากลูกค้า (ตรวจจับอัตโนมัติ...)</span>
              </div>

              {/* Action Buttons: Copy Link & Open in Browser */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopyLink}
                  className="h-9 text-xs font-bold flex items-center justify-center gap-1.5 border-slate-300 hover:bg-slate-100 rounded-xl"
                >
                  {isCopied ? (
                    <>
                      <Check size={14} className="text-emerald-600" />
                      <span className="text-emerald-700">คัดลอกแล้ว</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>คัดลอกลิงก์ (ส่ง LINE)</span>
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  onClick={handleOpenLink}
                  className="h-9 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-1.5 rounded-xl shadow-sm"
                >
                  <ExternalLink size={14} />
                  <span>เปิดหน้าจ่ายเงิน</span>
                </Button>
              </div>
            </div>
          )}

          {/* Footer security note */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <ShieldCheck size={12} className="text-emerald-500" />
              Secured by Beam Checkout Gateway
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline font-medium"
            >
              ปิด
            </button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}

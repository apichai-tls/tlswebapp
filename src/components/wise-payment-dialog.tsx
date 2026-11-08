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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Copy,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
  Check,
  Edit3,
  Save,
} from "lucide-react";
import {
  checkWiseJobPaymentStatusAction,
  recordWiseJobPaymentAction,
} from "@/actions/wise";
import { settingsStore, jobStore } from "@/lib/store";

interface WisePaymentDialogProps {
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
    senderName?: string;
    job?: any;
  }) => void;
}

function sanitizeWiseDescription(raw: string): string {
  // Wise API strictly allows only numbers, letters, spaces, or hyphens (-) and max 40 chars
  return (raw || "")
    .replace(/\//g, "-")
    .replace(/[^a-zA-Z0-9 -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

function buildWisePayUrl(rawTagOrUrl: string, amount: number, orderRef: string): string {
  const trimmed = (rawTagOrUrl || "").trim();
  const safeDesc = sanitizeWiseDescription(orderRef);
  if (!trimmed) {
    return `https://wise.com/pay/business/thatlaundryshopcoltd?amount=${amount}&currency=THB&description=${encodeURIComponent(safeDesc)}`;
  }

  // If user pasted a full Wise link (e.g. https://wise.com/pay/business/... or https://wise.com/pay/me/... or https://wise.com/pay/r/...)
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("wise.com/")) {
    const baseUrl = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    try {
      const urlObj = new URL(baseUrl);
      urlObj.searchParams.set("amount", String(amount));
      urlObj.searchParams.set("currency", "THB");
      urlObj.searchParams.set("description", safeDesc);
      return urlObj.toString();
    } catch {
      return baseUrl;
    }
  }

  // Otherwise it's a Wise handle / tag (e.g. @thatlaundryshopcoltd)
  let cleanHandle = trimmed.replace(/^@/, "");
  if (cleanHandle.toLowerCase() === "thatlaundryshop") {
    cleanHandle = "thatlaundryshopcoltd";
  }
  return `https://wise.com/pay/business/${cleanHandle}?amount=${amount}&currency=THB&description=${encodeURIComponent(safeDesc)}`;
}

export function WisePaymentDialog({
  isOpen,
  onClose,
  job,
  customAmount,
  onPaymentSuccess,
}: WisePaymentDialogProps) {
  const settings = settingsStore.getSnapshot();
  const [isCopiedLink, setIsCopiedLink] = useState(false);
  const [isCopiedTag, setIsCopiedTag] = useState(false);
  const [isPaidSuccess, setIsPaidSuccess] = useState(false);
  const [verifiedSender, setVerifiedSender] = useState<string>("");
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [recentTransfers, setRecentTransfers] = useState<any[]>([]);
  const [showTransferList, setShowTransferList] = useState(false);

  // Allow editing Wise link / tag directly inside the popup
  const [isEditingTag, setIsEditingTag] = useState(false);
  const [tagInput, setTagInput] = useState(settings?.wiseTag || "@thatlaundryshopcoltd");
  const [isSavingTag, setIsSavingTag] = useState(false);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (settings?.wiseTag) {
      const normalized =
        settings.wiseTag.replace(/^@/, "").toLowerCase() === "thatlaundryshop"
          ? "@thatlaundryshopcoltd"
          : settings.wiseTag;
      setTagInput(normalized);
    }
  }, [settings?.wiseTag]);

  const amountToPay = customAmount !== undefined ? customAmount : (job?.totalAmount || 0);
  // Use Job ID as primary Wise reference so it aligns with INV/REC and avoids slashes '/' in billNo
  const orderRef = sanitizeWiseDescription((job?.id || job?.billNo || "TLS-ORDER").toUpperCase());

  const rawActiveTag = tagInput || settings?.wiseTag || "@thatlaundryshopcoltd";
  const activeWiseTagOrLink =
    rawActiveTag.replace(/^@/, "").toLowerCase() === "thatlaundryshop"
      ? "@thatlaundryshopcoltd"
      : rawActiveTag;
  const wisePaymentLink = buildWisePayUrl(activeWiseTagOrLink, amountToPay, orderRef);

  const qrCodeUrl =
    settings?.wiseQrUrl ||
    `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(wisePaymentLink)}`;

  const handleSaveTagInline = async () => {
    setIsSavingTag(true);
    try {
      await settingsStore.updateSetting("wiseTag", tagInput.trim());
      toast.success("บันทึกลิงก์ / Wise Tag สำเร็จแล้ว!");
      setIsEditingTag(false);
    } catch {
      toast.error("ไม่สามารถบันทึก Wise Tag ได้");
    } finally {
      setIsSavingTag(false);
    }
  };

  // Check recent incoming transfers from Wise API via server action (with deduplication & reference matching)
  const handleCheckWisePayment = async (isManual = false) => {
    if (!job || isPaidSuccess) return;
    if (isManual) setIsCheckingStatus(true);

    try {
      const res = await checkWiseJobPaymentStatusAction({
        jobId: job.id,
        expectedAmount: amountToPay,
      });

      if (res.activities) {
        setRecentTransfers(res.activities.filter((a) => a.isIncoming !== false));
      }

      if (res.success && res.isPaid) {
        const sender = res.matchedTransfer?.senderName || "Wise Customer";
        const paidAmt = res.matchedTransfer?.amount || amountToPay;
        setIsPaidSuccess(true);
        setVerifiedSender(sender);
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);

        toast.success(`🎉 ยืนยันการชำระเงิน Wise สำเร็จ! (${sender})`);
        if (onPaymentSuccess) {
          onPaymentSuccess({
            jobId: job.id,
            amount: paidAmt,
            channel: "Wise",
            senderName: sender,
            job: res.job,
          });
        }
      } else if (isManual) {
        const latest = res.activities?.[0];
        toast.info(
          `ยังไม่พบยอดโอนใหม่ ฿${amountToPay.toFixed(2)} สำหรับบิล ${orderRef}${
            latest ? ` (รายการล่าสุด: ${latest.senderName} ${latest.rawAmount})` : ""
          }`
        );
      }
    } catch (err: any) {
      if (isManual) {
        toast.error("Wise check error: " + (err instanceof Error ? err.message : "Failed"));
      }
    } finally {
      if (isManual) setIsCheckingStatus(false);
    }
  };

  // Manual link of a specific transfer from the list
  const confirmPaid = async (
    senderName: string,
    paidAmount: number,
    transferId?: string,
    reference?: string,
    sourceCurrency?: string,
    sourceValue?: number
  ) => {
    if (!job) return;
    setIsPaidSuccess(true);
    setVerifiedSender(senderName);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    try {
      const recRes = await recordWiseJobPaymentAction({
        jobId: job.id,
        paidAmount,
        senderName,
        transferId,
        reference: reference || orderRef,
        sourceCurrency,
        sourceValue,
      });

      toast.success(`🎉 ยืนยันการชำระเงิน Wise สำเร็จ! (รับเงินจาก ${senderName})`);
      if (onPaymentSuccess) {
        onPaymentSuccess({
          jobId: job.id,
          amount: paidAmount,
          channel: "Wise",
          senderName,
          job: recRes?.job,
        });
      }
    } catch {
      // Fallback to client store if server action fails
      await jobStore.updateJobDetails(job.id, {
        isPaid: true,
        isShopPaid: true,
        paymentChannel: "Wise",
        paymentMethod: "transfer",
      });
    }
  };

  const checkWiseFnRef = useRef(handleCheckWisePayment);
  checkWiseFnRef.current = handleCheckWisePayment;

  // Start polling when dialog opens
  useEffect(() => {
    if (!isOpen || !job) {
      setIsPaidSuccess(false);
      setVerifiedSender("");
      setIsCheckingStatus(false);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    if (job.isPaid) {
      setIsPaidSuccess(true);
      return;
    }

    checkWiseFnRef.current(false);

    pollTimerRef.current = setInterval(() => {
      checkWiseFnRef.current(false);
    }, 3000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isOpen, job?.id, amountToPay]);

  if (!isOpen || !job) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-[#9FE870]/30 shadow-2xl rounded-3xl">
        {/* Header */}
        <div className="bg-[#163300] text-white p-5 pb-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#9FE870]/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-[#9FE870] text-[#163300] flex items-center justify-center font-black text-sm shadow-sm">
                W
              </span>
              <div>
                <DialogTitle className="text-base font-black text-white flex items-center gap-2">
                  <span>Wise Payment</span>
                  <Badge className="bg-[#9FE870]/20 text-[#9FE870] border-none text-[9px] font-bold">
                    International
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-white/70">
                  THAT LAUNDRY SHOP CO., LTD
                </DialogDescription>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-bold text-[#9FE870] uppercase tracking-wider block">
                Total to Pay
              </span>
              <span className="text-xl font-black text-white font-mono">
                ฿{amountToPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {isPaidSuccess ? (
            <div className="text-center py-6 space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 size={36} className="text-emerald-600" />
              </div>
              <h3 className="text-lg font-black text-slate-900">ชำระเงินผ่าน Wise สำเร็จแล้ว! ✅</h3>
              <p className="text-xs text-slate-600">
                ได้รับยอดโอน <strong className="text-emerald-700">฿{amountToPay.toFixed(2)}</strong>{" "}
                {verifiedSender ? `จาก ${verifiedSender}` : ""} เรียบร้อยแล้ว
              </p>
              <div className="pt-3">
                <Button
                  type="button"
                  onClick={onClose}
                  className="w-full bg-[#163300] hover:bg-[#204a00] text-[#9FE870] font-bold text-xs h-10 rounded-xl cursor-pointer"
                >
                  เรียบร้อย / พิมพ์ใบเสร็จ
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* QR Code Scan Card */}
              <div className="flex flex-col items-center p-4 bg-slate-50 border border-slate-200/80 rounded-2xl shadow-2xs space-y-3">
                <div className="relative p-2 bg-white rounded-xl border border-slate-200 shadow-sm">
                  <img
                    src={qrCodeUrl}
                    alt="Wise QR Code"
                    className="w-44 h-44 object-contain"
                  />
                  <div className="absolute inset-x-0 -bottom-2.5 flex justify-center">
                    <span className="bg-[#163300] text-[#9FE870] text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs">
                      Scan to Pay ฿{amountToPay.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="text-center pt-1 space-y-1">
                  <p className="text-xs font-bold text-slate-800">
                    ให้ลูกค้าสแกนด้วยแอป Wise หรือกล้องมือถือ
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Job / Ref: <strong className="font-mono text-slate-700">{orderRef}</strong>
                  </p>
                </div>
              </div>

              {/* Action Buttons: Copy Link & Open Link */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(wisePaymentLink);
                    setIsCopiedLink(true);
                    toast.success("คัดลอกลิงก์ชำระเงิน Wise แล้ว!");
                    setTimeout(() => setIsCopiedLink(false), 2000);
                  }}
                  className="h-9 text-xs font-bold gap-1.5 rounded-xl border-slate-200 cursor-pointer"
                >
                  {isCopiedLink ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                  <span>{isCopiedLink ? "Copied Link!" : "Copy Pay Link"}</span>
                </Button>

                <a
                  href={wisePaymentLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 h-9 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 cursor-pointer"
                >
                  <ExternalLink size={13} />
                  <span>Open Pay Page</span>
                </a>
              </div>

              {/* Quick Wise Details & Inline Link Setup */}
              <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-[11px] font-semibold">Wise Tag / Pay Link:</span>
                  {!isEditingTag ? (
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 truncate max-w-[180px]">
                        {activeWiseTagOrLink}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsEditingTag(true)}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 size={10} />
                        <span>ตั้งค่าลิงก์</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditingTag(false)}
                      className="text-[10px] text-slate-400 hover:text-slate-600"
                    >
                      ยกเลิก
                    </button>
                  )}
                </div>

                {isEditingTag && (
                  <div className="pt-1 space-y-1.5">
                    <div className="flex gap-1.5">
                      <Input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        placeholder="วางลิงก์จาก Wise เช่น https://wise.com/pay/business/... หรือ @wisetag"
                        className="h-8 text-xs font-mono"
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={isSavingTag}
                        onClick={handleSaveTagInline}
                        className="h-8 px-3 bg-[#163300] hover:bg-[#204a00] text-[#9FE870] text-xs font-bold shrink-0 cursor-pointer"
                      >
                        <Save size={12} className="mr-1" />
                        บันทึก
                      </Button>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      💡 ไปที่หน้า Wise ของคุณ → กดเมนู <strong>Payment links</strong> หรือ <strong>Get paid → Share your Wisetag</strong> แล้วคัดลอกลิงก์มาวางที่นี่
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <span className="text-slate-500 text-[11px]">Wise Email:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-900">{settings?.wiseEmail || "justin.sirias@gmail.com"}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(settings?.wiseEmail || "justin.sirias@gmail.com");
                        setIsCopiedTag(true);
                        toast.success("Copied Email!");
                        setTimeout(() => setIsCopiedTag(false), 2000);
                      }}
                      className="text-[10px] text-[#163300] font-bold hover:underline cursor-pointer"
                    >
                      {isCopiedTag ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-[11px]">Account Name:</span>
                  <span className="font-bold text-slate-900">THAT LAUNDRY SHOP CO., LTD</span>
                </div>
              </div>

              {/* Live Status Checking Bar */}
              <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    <span className="text-xs font-bold text-emerald-950">
                      ระบบกำลังรอการตรวจจับยอดเงินจาก Wise...
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isCheckingStatus}
                    onClick={() => handleCheckWisePayment(true)}
                    className="h-7 text-[10px] font-bold gap-1 rounded-lg border-emerald-300 text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                  >
                    <RefreshCw size={10} className={isCheckingStatus ? "animate-spin" : ""} />
                    <span>ตรวจยอดทันที</span>
                  </Button>
                </div>

                <p className="text-[10px] text-emerald-800/80 leading-tight">
                  เมื่อลูกค้าโอนเงินผ่าน Wise แล้ว ระบบจะตรวจจับยอด ฿{amountToPay.toFixed(2)} (Ref: {orderRef}) และปิดบิลอัตโนมัติ
                </p>
              </div>

              {/* Recent inbound transfers to manually match if needed */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowTransferList(!showTransferList)}
                  className="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center justify-between w-full p-1 cursor-pointer"
                >
                  <span>ดูยอดโอนล่าสุดใน Wise ({recentTransfers.length} รายการ)</span>
                  <span className="text-xs">{showTransferList ? "▲" : "▼"}</span>
                </button>

                {showTransferList && (
                  <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-44 overflow-y-auto bg-white text-xs">
                    {recentTransfers.length === 0 ? (
                      <p className="p-3 text-center text-slate-400 text-xs">กำลังโหลดรายการล่าสุด...</p>
                    ) : (
                      recentTransfers.map((act) => (
                        <div key={act.id} className="p-2 flex items-center justify-between hover:bg-slate-50">
                          <div className="min-w-0 pr-2">
                            <p className="font-bold text-slate-800 truncate text-[11px]">{act.senderName}</p>
                            <div className="flex items-center gap-1.5 text-[9px] text-slate-400 flex-wrap">
                              <span>
                                {new Date(act.createdOn).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}{" "}
                                {new Date(act.createdOn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              {act.reference && (
                                <span className="px-1 py-0.2 rounded bg-slate-100 text-slate-600 font-mono">
                                  Ref: {act.reference}
                                </span>
                              )}
                              {act.sourceCurrency && act.sourceValue && (
                                <span className="text-emerald-700 font-semibold">
                                  ({act.sourceValue} {act.sourceCurrency})
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-black font-mono text-[11px] text-emerald-700">{act.rawAmount}</span>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                confirmPaid(
                                  act.senderName,
                                  act.amount,
                                  act.resourceId || act.id,
                                  act.reference,
                                  act.sourceCurrency,
                                  act.sourceValue
                                )
                              }
                              className="h-6 px-2 text-[9px] font-bold bg-[#163300] hover:bg-[#204a00] text-[#9FE870] rounded cursor-pointer"
                            >
                              ตรงกับบิลนี้
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

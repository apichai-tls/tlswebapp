"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import { 
  CreditCard, 
  Banknote, 
  Wallet, 
  Trash2, 
  Plus, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2,
  Clock,
  Sparkles,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Job, Customer } from "@/lib/store";
import { formatBaht, getJobPaymentBreakdown, JobPaymentEntry } from "@/lib/utils";
import { recordJobPaymentAction, voidJobPaymentAction } from "@/actions/db";

interface PaymentChannel {
  id: string;
  name: string;
  type?: string;
  enabled?: boolean;
}

interface JobPaymentPanelProps {
  job: Job | null;
  totalAmount: number;
  customer: Customer | null;
  activePaymentChannels: PaymentChannel[];
  user: any;
  activeShift?: any;
  onPaymentSuccess?: (updatedJob: Job, newBalance?: number) => void;
  onPaymentVoided?: (updatedJob: Job, refundedAmount?: number, newBalance?: number) => void;
  onOpenBeamPayment?: () => void;
  disabled?: boolean;
  currentLanguage?: string;
}

export function JobPaymentPanel({
  job,
  totalAmount,
  customer,
  activePaymentChannels,
  user,
  activeShift,
  onPaymentSuccess,
  onPaymentVoided,
  onOpenBeamPayment,
  disabled = false,
  currentLanguage = "th",
}: JobPaymentPanelProps) {
  const breakdown = getJobPaymentBreakdown(job ? { ...job, totalAmount } : { totalAmount });
  const remaining = breakdown.remaining;
  const isFullyPaid = breakdown.isFullyPaid;

  // Form state for adding payment
  const [payAmount, setPayAmount] = useState<string>("");
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [payNote, setPayNote] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Void confirmation dialog state
  const [voidingPayment, setVoidingPayment] = useState<JobPaymentEntry | null>(null);
  const [voidReason, setVoidReason] = useState<string>("");
  const [isVoiding, setIsVoiding] = useState<boolean>(false);

  // Auto-fill channel if empty
  const defaultChannel = React.useMemo(() => {
    if (customer?.isMember && (customer.creditBalance || 0) > 0) {
      return "Deduct Member";
    }
    return activePaymentChannels[0]?.name || "Cash / COD";
  }, [customer, activePaymentChannels]);

  const activeChannelName = selectedChannel || defaultChannel;

  // Current amount to pay (defaults to remaining balance if input is empty)
  const effectiveAmount = payAmount !== "" ? parseFloat(payAmount) : remaining;

  // Check Member wallet constraints
  const isSelectedMemberWallet = activeChannelName.toLowerCase().includes("member") || activeChannelName.toLowerCase().includes("wallet");
  const customerWalletBalance = customer?.creditBalance || 0;
  const isWalletExpired = Boolean(
    customer?.memberExpiryDate && new Date(customer.memberExpiryDate).getTime() < Date.now()
  );
  const isWalletInsufficient = isSelectedMemberWallet && customerWalletBalance < effectiveAmount;

  // Check permissions for voiding
  const canVoid = React.useMemo(() => {
    const role = (user?.role || "").toLowerCase();
    const perms = user?.permissions || [];
    return role === "admin" || role === "superadmin" || role === "accounting" || role === "cso" || perms.includes("jobs") || perms.includes("accounting");
  }, [user]);

  // Handler: Add new sub-payment
  const handleRecordPayment = async () => {
    if (!job?.id) {
      toast.error("กรุณาบันทึกสร้างงานก่อนบันทึกการชำระเงิน");
      return;
    }

    const amt = parseFloat(payAmount !== "" ? payAmount : remaining.toString());
    if (isNaN(amt) || amt <= 0) {
      toast.error("กรุณาระบุจำนวนเงินที่ถูกต้อง");
      return;
    }

    if (totalAmount > 0 && amt > remaining + 0.01) {
      toast.error(`จำนวนเงิน (฿${amt.toLocaleString()}) เกินยอดคงเหลือที่ต้องชำระ (฿${remaining.toLocaleString()})`);
      return;
    }

    if (isSelectedMemberWallet) {
      if (!customer?.isMember) {
        toast.error("ลูกค้าไม่ได้เป็นสมาชิก ไม่สามารถตัดยอดผ่านกระเป๋าเงินสมาชิกได้");
        return;
      }
      if (isWalletExpired) {
        toast.error("กระเป๋าเงินสมาชิกหมดอายุแล้ว กรุณาเติมเงินต่ออายุก่อนใช้งาน");
        return;
      }
      if (customerWalletBalance < amt) {
        toast.error(`ยอดเงินใน Wallet ไม่เพียงพอ (มี ฿${customerWalletBalance.toLocaleString()}, ต้องการหัก ฿${amt.toLocaleString()})`);
        return;
      }
    }

    setIsProcessing(true);
    try {
      const res = await recordJobPaymentAction({
        jobId: job.id,
        amount: amt,
        channel: activeChannelName,
        actorId: user?.id,
        actorName: user?.name || user?.email || "Staff",
        actorRole: user?.role,
        shiftId: activeShift?.id || job.shiftId || null,
        note: payNote.trim() || undefined,
      });

      if (!res.success) {
        toast.error(res.error || "บันทึกการชำระเงินไม่สำเร็จ");
        return;
      }

      toast.success(`บันทึกรับชำระ ฿${amt.toLocaleString()} (${activeChannelName}) เรียบร้อยแล้ว`);
      setPayAmount("");
      setPayNote("");

      if (onPaymentSuccess && res.updatedJob) {
        onPaymentSuccess(res.updatedJob, res.newBalance);
      }
    } catch (err: any) {
      toast.error(`เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handler: Confirm Void sub-payment
  const handleConfirmVoid = async () => {
    if (!job?.id || !voidingPayment?.id || !voidReason.trim()) {
      toast.error("กรุณาระบุเหตุผลในการยกเลิกรายการ");
      return;
    }

    setIsVoiding(true);
    try {
      const res = await voidJobPaymentAction({
        jobId: job.id,
        paymentId: voidingPayment.id,
        reason: voidReason.trim(),
        actorId: user?.id,
        actorName: user?.name || user?.email || "Staff",
        actorRole: user?.role,
      });

      if (!res.success) {
        toast.error(res.error || "ไม่สามารถยกเลิกรายการชำระได้");
        return;
      }

      toast.success(
        res.refundedAmount && res.refundedAmount > 0
          ? `ยกเลิกรายการและคืนเงิน ฿${res.refundedAmount.toLocaleString()} เข้า Wallet สำเร็จ`
          : "ยกเลิกรายการชำระเงินเรียบร้อยแล้ว"
      );

      setVoidingPayment(null);
      setVoidReason("");

      if (onPaymentVoided && res.updatedJob) {
        onPaymentVoided(res.updatedJob, res.refundedAmount, res.newBalance);
      }
    } catch (err: any) {
      toast.error(`เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setIsVoiding(false);
    }
  };

  return (
    <div className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-900/90 p-3 shadow-md text-white">
      {/* ── 1. SUMMARY BAR ────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <CreditCard size={12} className="text-indigo-400" />
            การชำระเงิน (Payments)
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-slate-300">
              ยอดรวม: <strong className="text-white">฿{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </span>
            <span className="text-xs text-slate-400">|</span>
            <span className="text-xs text-slate-300">
              ชำระแล้ว: <strong className={breakdown.totalPaid > 0 ? "text-emerald-400" : "text-slate-400"}>฿{breakdown.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </span>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[9px] uppercase font-bold text-slate-400">คงเหลือที่ต้องชำระ</span>
          <div className={`text-base font-black font-mono leading-none ${isFullyPaid ? "text-emerald-400" : "text-amber-400"}`}>
            {isFullyPaid ? (
              <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold">
                <CheckCircle2 size={13} className="text-emerald-400" /> ชำระครบแล้ว
              </span>
            ) : (
              `฿${remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            )}
          </div>
        </div>
      </div>

      {/* ── 2. RECORDED PAYMENTS LIST (Breakdown) ──────────────── */}
      {breakdown.payments.length > 0 && (
        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-slate-400">
            <span>ประวัติการรับชำระ ({breakdown.payments.length} รายการ)</span>
            {breakdown.isSplit && (
              <Badge className="bg-indigo-900/80 text-indigo-300 border-indigo-700 text-[8px] px-1.5 py-0">
                Split Payment
              </Badge>
            )}
          </div>

          <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5 select-none">
            {breakdown.payments.map((p, pIdx) => {
              const isCredit = (p.method || "").toLowerCase() === "credit" || (p.channel || "").toLowerCase().includes("member");
              const isCash = (p.method || "").toLowerCase() === "cash";
              return (
                <div 
                  key={p.id || pIdx}
                  className="flex items-center justify-between p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/70 text-[10px] hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 bg-slate-700 text-indigo-300">
                      {isCredit ? <Wallet size={11} className="text-emerald-400" /> : isCash ? <Banknote size={11} className="text-amber-400" /> : <CreditCard size={11} className="text-indigo-400" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-200 truncate">{p.channel || p.method}</span>
                        <span className="text-[9px] text-slate-400 flex items-center gap-0.5">
                          <Clock size={8} /> {p.timestamp ? format(new Date(p.timestamp), "dd/MM HH:mm") : "-"}
                        </span>
                      </div>
                      {p.paidBy && (
                        <div className="text-[8.5px] text-slate-400 truncate">
                          โดย: {p.paidBy} {p.note ? `• ${p.note}` : ""}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold font-mono text-emerald-400 text-xs">
                      ฿{p.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>

                    {/* Void button (if allowed and has ID) */}
                    {p.id && canVoid && (
                      <button
                        type="button"
                        onClick={() => setVoidingPayment(p)}
                        className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/60 transition-colors cursor-pointer"
                        title="ยกเลิกรายการรับเงินนี้ (Void Payment)"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 3. RECORD PAYMENT FORM (When Remaining > 0) ────────── */}
      {!isFullyPaid && (
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1">
            <Plus size={12} className="text-emerald-400" />
            บันทึกรับเงิน {breakdown.payments.length > 0 ? "เพิ่มเติม (Split)" : ""}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Amount input */}
            <div className="space-y-1">
              <Label className="text-[9px] text-slate-400 uppercase font-medium">จำนวนเงิน (฿)</Label>
              <div className="relative">
                <Input
                  type="number"
                  step="any"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder={remaining.toFixed(2)}
                  className="h-7 text-xs bg-slate-800 border-slate-700 text-white font-mono font-bold focus-visible:ring-emerald-500 pl-2 pr-6"
                />
                <span className="absolute right-2 top-1.5 text-[9px] font-bold text-slate-400 select-none">฿</span>
              </div>
            </div>

            {/* Channel select */}
            <div className="space-y-1">
              <Label className="text-[9px] text-slate-400 uppercase font-medium">ช่องทางการชำระ</Label>
              <select
                value={activeChannelName}
                onChange={(e) => {
                  const newCh = e.target.value;
                  setSelectedChannel(newCh);
                  // Quick suggestion: if member wallet selected and wallet balance < remaining, suggest using wallet balance
                  if (newCh.toLowerCase().includes("member") && customer?.isMember && customerWalletBalance > 0 && customerWalletBalance < remaining) {
                    setPayAmount(customerWalletBalance.toString());
                  }
                }}
                className="h-7 w-full rounded border border-slate-700 bg-slate-800 text-white px-2 py-0 text-[10px] font-bold focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none cursor-pointer"
              >
                {activePaymentChannels.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Member Wallet info & Quick-Action Pill */}
          {isSelectedMemberWallet && customer?.isMember && (
            <div className="p-1.5 rounded-lg bg-slate-800/90 border border-slate-700 text-[10px] space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 flex items-center gap-1 font-medium">
                  <Wallet size={11} className={customerWalletBalance > 0 ? "text-emerald-400" : "text-amber-400"} />
                  กระเป๋าเงินสมาชิก (Wallet):
                </span>
                <span className={`font-bold font-mono ${customerWalletBalance < effectiveAmount ? "text-rose-400" : "text-emerald-400"}`}>
                  {formatBaht(customerWalletBalance)}
                </span>
              </div>

              {isWalletExpired ? (
                <div className="text-[9px] text-rose-400 font-bold flex items-center gap-1">
                  <AlertTriangle size={10} /> Wallet หมดอายุแล้ว กรุณาเติมเงินต่ออายุ
                </div>
              ) : isWalletInsufficient ? (
                <div className="flex items-center justify-between gap-1 pt-0.5">
                  <span className="text-[9px] text-rose-300">
                    ขาดอีก ฿{(effectiveAmount - customerWalletBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  {customerWalletBalance > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setPayAmount(customerWalletBalance.toString())}
                      className="h-5 px-1.5 text-[8.5px] bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold shadow-xs cursor-pointer"
                    >
                      <Sparkles size={9} /> หักเท่าที่มี ฿{customerWalletBalance.toLocaleString()}
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* Quick Amount Suggestion Buttons */}
          <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
            <button
              type="button"
              onClick={() => setPayAmount(remaining.toString())}
              className={`text-[8.5px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                effectiveAmount === remaining 
                  ? "bg-emerald-950/80 text-emerald-300 border-emerald-700 font-bold" 
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600"
              }`}
            >
              เต็มจำนวน (฿{remaining.toLocaleString()})
            </button>

            {customer?.isMember && customerWalletBalance > 0 && customerWalletBalance < remaining && (
              <button
                type="button"
                onClick={() => {
                  setSelectedChannel("Deduct Member");
                  setPayAmount(customerWalletBalance.toString());
                }}
                className="text-[8.5px] px-2 py-0.5 rounded border border-indigo-700/80 bg-indigo-950/80 text-indigo-300 hover:bg-indigo-900 transition-colors font-bold cursor-pointer"
              >
                หัก Wallet ฿{customerWalletBalance.toLocaleString()} (เหลือ ฿{(remaining - customerWalletBalance).toLocaleString()})
              </button>
            )}

            {/* Beam Gateway Trigger */}
            {onOpenBeamPayment && (activeChannelName.toLowerCase().includes("beam") || activeChannelName.toLowerCase().includes("gateway")) && (
              <button
                type="button"
                onClick={onOpenBeamPayment}
                className="text-[8.5px] px-2 py-0.5 rounded border border-indigo-600 bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors cursor-pointer flex items-center gap-1"
              >
                <Zap size={9} /> สร้าง QR Beam
              </button>
            )}
          </div>

          {/* Note Input (Optional) */}
          <div className="space-y-0.5">
            <Input
              type="text"
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="หมายเหตุการรับเงิน เช่น โอนรอบ 1, จ่ายหน้าร้าน (ไม่บังคับ)"
              className="h-6 text-[9.5px] bg-slate-800/80 border-slate-700 text-slate-200 placeholder:text-slate-500"
            />
          </div>

          {/* Submit Record Payment Button */}
          <Button
            type="button"
            disabled={
              disabled ||
              isProcessing ||
              !job?.id ||
              effectiveAmount <= 0 ||
              isWalletExpired ||
              (isSelectedMemberWallet && isWalletInsufficient)
            }
            onClick={handleRecordPayment}
            className="w-full h-7 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {isProcessing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Plus size={12} />
            )}
            <span>
              บันทึกรับเงิน ฿{effectiveAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({activeChannelName})
            </span>
          </Button>
        </div>
      )}

      {/* ── 4. VOID CONFIRMATION MODAL ────────────────────────── */}
      <Dialog open={!!voidingPayment} onOpenChange={(open) => { if (!open) setVoidingPayment(null); }}>
        <DialogContent className="max-w-md bg-neutral-900 border border-neutral-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-1.5 text-rose-400">
              <AlertTriangle size={16} />
              ยืนยันการยกเลิกรายการรับเงิน (Void Payment)
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-400">
              รายการนี้จะถูกตัดออกจากประวัติการชำระเงินของงาน #{job?.id}
            </DialogDescription>
          </DialogHeader>

          {voidingPayment && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-2.5 rounded-lg bg-neutral-800 border border-neutral-700 space-y-1">
                <div className="flex justify-between">
                  <span className="text-neutral-400">ช่องทางการชำระ:</span>
                  <span className="font-bold text-white">{voidingPayment.channel || voidingPayment.method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">ยอดเงิน:</span>
                  <span className="font-bold text-emerald-400 font-mono">฿{voidingPayment.amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">วันเวลา:</span>
                  <span className="text-neutral-300">{voidingPayment.timestamp ? format(new Date(voidingPayment.timestamp), "dd/MM/yyyy HH:mm") : "-"}</span>
                </div>
              </div>

              {((voidingPayment.method || "").toLowerCase() === "credit" || (voidingPayment.channel || "").toLowerCase().includes("member")) && (
                <div className="p-2 rounded bg-amber-950/80 border border-amber-700 text-amber-200 text-[11px] flex items-center gap-1.5">
                  <Wallet size={13} className="text-amber-400 shrink-0" />
                  <span>ระบบจะคืนเงิน <strong>฿{voidingPayment.amount.toLocaleString()}</strong> กลับเข้ากระเป๋าเงินสมาชิกให้โดยอัตโนมัติ</span>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-neutral-300">
                  ระบุเหตุผลในการยกเลิก <span className="text-rose-400">*</span>
                </Label>
                <Input
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="เช่น คีย์จำนวนเงินผิด, สลิปซ้ำ, ลูกค้าเปลี่ยนช่องทาง"
                  className="bg-neutral-800 border-neutral-700 text-white text-xs h-8"
                  autoFocus
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setVoidingPayment(null)}
              className="bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700 text-xs h-8"
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              disabled={isVoiding || !voidReason.trim()}
              onClick={handleConfirmVoid}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-8 font-bold"
            >
              {isVoiding ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              ยืนยันลบรายการ (Void)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

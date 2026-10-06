"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter, 
  DialogDescription 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  CreditCard, 
  Wallet, 
  Banknote, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  Sparkles,
  ArrowRight
} from "lucide-react";
import { Customer } from "@/lib/store";
import { formatBaht } from "@/lib/utils";

export interface SplitPaymentLine {
  id: string;
  channel: string;
  amount: number;
  note?: string;
}

interface SplitPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalAmount: number;
  customer: Customer | null;
  activePaymentChannels: { id: string; name: string }[];
  initialSplits?: SplitPaymentLine[];
  onConfirm: (splits: SplitPaymentLine[]) => void;
  currentLanguage?: string;
}

export function SplitPaymentDialog({
  open,
  onOpenChange,
  totalAmount,
  customer,
  activePaymentChannels,
  initialSplits = [],
  onConfirm,
  currentLanguage = "th",
}: SplitPaymentDialogProps) {
  // Filter out online gateway / beam from split payment options (as per rule: Beam is single full pay only)
  const allowedChannels = useMemo(() => {
    return activePaymentChannels.filter(
      (c) =>
        !c.name.toLowerCase().includes("beam") &&
        !c.name.toLowerCase().includes("gateway") &&
        !c.name.toLowerCase().includes("split")
    );
  }, [activePaymentChannels]);

  const defaultFirstChannel = useMemo(() => {
    if (customer?.isMember && (customer.creditBalance || 0) > 0) {
      return "Deduct Member";
    }
    return allowedChannels[0]?.name || "Cash / COD";
  }, [customer, allowedChannels]);

  const defaultSecondChannel = useMemo(() => {
    const remainingChannels = allowedChannels.filter((c) => c.name !== defaultFirstChannel);
    return remainingChannels[0]?.name || "Transfer / QR";
  }, [allowedChannels, defaultFirstChannel]);

  const [lines, setLines] = useState<SplitPaymentLine[]>([]);

  // Initialize lines when dialog opens
  useEffect(() => {
    if (open) {
      if (initialSplits.length >= 2) {
        setLines(initialSplits.map((s) => ({ ...s, id: s.id || `split-${Math.random()}` })));
      } else {
        // Smart auto-fill:
        // If customer is member and has partial wallet balance:
        const walletBal = customer?.isMember ? customer.creditBalance || 0 : 0;
        if (walletBal > 0 && walletBal < totalAmount) {
          setLines([
            {
              id: `split-1`,
              channel: "Deduct Member",
              amount: walletBal,
              note: "",
            },
            {
              id: `split-2`,
              channel: defaultSecondChannel,
              amount: Math.max(0, Math.round((totalAmount - walletBal) * 100) / 100),
              note: "",
            },
          ]);
        } else {
          // Half-half or default 2 lines
          const half = Math.round((totalAmount / 2) * 100) / 100;
          const otherHalf = Math.max(0, Math.round((totalAmount - half) * 100) / 100);
          setLines([
            {
              id: `split-1`,
              channel: defaultFirstChannel,
              amount: half,
              note: "",
            },
            {
              id: `split-2`,
              channel: defaultSecondChannel,
              amount: otherHalf,
              note: "",
            },
          ]);
        }
      }
    }
  }, [open, totalAmount, customer, initialSplits, defaultFirstChannel, defaultSecondChannel]);

  const totalAssigned = useMemo(() => {
    return Math.round(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0) * 100) / 100;
  }, [lines]);

  const diff = useMemo(() => {
    return Math.round((totalAmount - totalAssigned) * 100) / 100;
  }, [totalAmount, totalAssigned]);

  const isBalanced = Math.abs(diff) <= 0.01 && lines.length >= 2;

  // Wallet validation
  const walletLine = lines.find((l) => l.channel === "Deduct Member");
  const walletAmount = walletLine ? Number(walletLine.amount) || 0 : 0;
  const customerWalletBalance = customer?.creditBalance || 0;
  const isWalletExpired = Boolean(
    customer?.memberExpiryDate && new Date(customer.memberExpiryDate).getTime() < Date.now()
  );
  const isWalletOverdrawn = walletAmount > 0 && (walletAmount > customerWalletBalance || isWalletExpired);

  const canSubmit = isBalanced && !isWalletOverdrawn && lines.every((l) => Number(l.amount) > 0);

  // Update line channel
  const handleChannelChange = (index: number, newChannel: string) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], channel: newChannel };
      return updated;
    });
  };

  // Update line amount
  const handleAmountChange = (index: number, valStr: string) => {
    const val = parseFloat(valStr) || 0;
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], amount: Math.max(0, val) };

      // If user edits the first line and there are exactly 2 lines, auto-fill the second line!
      if (index === 0 && updated.length === 2) {
        const remainingForSecond = Math.max(0, Math.round((totalAmount - val) * 100) / 100);
        updated[1] = { ...updated[1], amount: remainingForSecond };
      }
      return updated;
    });
  };

  // Add line
  const handleAddLine = () => {
    const usedChannels = new Set(lines.map((l) => l.channel));
    const nextChannel = allowedChannels.find((c) => !usedChannels.has(c.name))?.name || allowedChannels[0]?.name || "Cash / COD";
    const remainingToAssign = Math.max(0, diff);

    setLines((prev) => [
      ...prev,
      {
        id: `split-${Date.now()}`,
        channel: nextChannel,
        amount: remainingToAssign,
        note: "",
      },
    ]);
  };

  // Remove line
  const handleRemoveLine = (index: number) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  // Quick action: Fill wallet balance into Deduct Member line
  const handleFillWallet = (index: number) => {
    if (!customer?.isMember) return;
    const maxWallet = Math.min(customerWalletBalance, totalAmount);
    handleAmountChange(index, maxWallet.toString());
  };

  // Quick action: Auto-fill remainder into specific line
  const handleFillRemainder = (index: number) => {
    const otherLinesSum = lines.reduce((s, l, i) => (i === index ? s : s + (Number(l.amount) || 0)), 0);
    const needed = Math.max(0, Math.round((totalAmount - otherLinesSum) * 100) / 100);
    handleAmountChange(index, needed.toString());
  };

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm(lines);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-slate-900 border border-slate-700 text-white shadow-2xl p-5">
        <DialogHeader className="pb-2 border-b border-slate-800">
          <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
            <CreditCard size={18} className="text-indigo-400" />
            <span>Split Payment</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Divide the grand total into 2 or more payment channels for this job.
          </DialogDescription>
        </DialogHeader>

        {/* ── TOTAL SUMMARY BAR ────────────────────────────────────── */}
        <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/80 flex items-center justify-between my-2">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Grand Total
            </span>
            <div className="text-lg font-black font-mono text-white">
              ฿{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Status
            </span>
            <div className="mt-0.5">
              {isBalanced ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-700/80 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={12} /> Fully Allocated 100%
                </span>
              ) : diff > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-950/60 border border-amber-700/80 px-2 py-0.5 rounded-full">
                  <AlertTriangle size={12} /> Remaining ฿{diff.toFixed(2)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-400 bg-rose-950/60 border border-rose-700/80 px-2 py-0.5 rounded-full">
                  <AlertTriangle size={12} /> Over by ฿{Math.abs(diff).toFixed(2)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── SPLIT PAYMENT ROWS ──────────────────────────────────── */}
        <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
          {lines.map((line, idx) => {
            const isMemberWallet = line.channel === "Deduct Member";
            const lineAmt = Number(line.amount) || 0;
            const isWalletExceeded = isMemberWallet && customer?.isMember && lineAmt > customerWalletBalance;

            return (
              <div
                key={line.id || idx}
                className={`p-2.5 rounded-xl border transition-all ${
                  isWalletExceeded
                    ? "bg-rose-950/40 border-rose-700/80"
                    : "bg-slate-800/60 border-slate-700/70 hover:border-slate-600"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-slate-700 text-slate-300 text-[10px] font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-[11px] font-bold text-slate-300">
                      Channel #{idx + 1}
                    </span>
                  </div>

                  {lines.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(idx)}
                      className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                      title="Remove channel"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-12 gap-2">
                  {/* Channel select (col 7) */}
                  <div className="col-span-7">
                    <Label className="text-[9px] text-slate-400 uppercase font-medium">Payment Channel</Label>
                    <select
                      value={line.channel}
                      onChange={(e) => handleChannelChange(idx, e.target.value)}
                      className="h-8 w-full rounded-lg border border-slate-600 bg-slate-800 text-white px-2 py-0 text-xs font-bold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer mt-0.5"
                    >
                      {allowedChannels.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Amount input (col 5) */}
                  <div className="col-span-5">
                    <Label className="text-[9px] text-slate-400 uppercase font-medium">Amount (฿)</Label>
                    <div className="relative mt-0.5">
                      <Input
                        type="number"
                        step="any"
                        value={line.amount === 0 ? "" : line.amount}
                        onChange={(e) => handleAmountChange(idx, e.target.value)}
                        placeholder="0.00"
                        className={`h-8 text-xs font-mono font-bold bg-slate-900 border text-white pl-2 pr-5 text-right ${
                          isWalletExceeded ? "border-rose-500 focus-visible:ring-rose-500" : "border-slate-600 focus-visible:ring-indigo-500"
                        }`}
                      />
                      <span className="absolute right-2 top-2 text-[10px] font-bold text-slate-400 select-none">฿</span>
                    </div>
                  </div>
                </div>

                {/* Helper info & Quick-action pills for this line */}
                <div className="flex items-center justify-between gap-1 mt-1.5 pt-1 border-t border-slate-700/50 text-[10px]">
                  {isMemberWallet && customer?.isMember ? (
                    <div className="flex items-center gap-1">
                      <Wallet size={11} className={customerWalletBalance > 0 ? "text-emerald-400" : "text-amber-400"} />
                      <span className="text-slate-400">Wallet:</span>
                      <span className={`font-bold font-mono ${isWalletExceeded ? "text-rose-400" : "text-emerald-400"}`}>
                        {formatBaht(customerWalletBalance)}
                      </span>
                      {customerWalletBalance > 0 && lineAmt !== customerWalletBalance && (
                        <button
                          type="button"
                          onClick={() => handleFillWallet(idx)}
                          className="ml-1 px-1.5 py-0.2 rounded bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 text-[9px] font-bold transition-colors cursor-pointer"
                        >
                          <Sparkles size={8} className="inline mr-0.5" /> Use Full ฿{customerWalletBalance.toLocaleString()}
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-500 text-[9px]">
                      {line.channel}
                    </span>
                  )}

                  {/* Fill remainder button if this row has gap */}
                  {diff !== 0 && (
                    <button
                      type="button"
                      onClick={() => handleFillRemainder(idx)}
                      className="text-[9px] text-amber-300 hover:text-amber-200 underline cursor-pointer ml-auto"
                    >
                      Auto-fill remainder
                    </button>
                  )}
                </div>

                {/* Overdraw warning */}
                {isWalletExceeded && (
                  <div className="mt-1 text-[9.5px] font-bold text-rose-300 flex items-center gap-1 bg-rose-950/80 px-2 py-0.5 rounded">
                    <AlertTriangle size={11} className="shrink-0" />
                    <span>Deduction (฿{lineAmt.toLocaleString()}) exceeds available wallet balance</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add more channel button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddLine}
            disabled={lines.length >= allowedChannels.length}
            className="w-full h-7 border-dashed border-slate-700 hover:border-slate-500 bg-slate-800/40 text-slate-300 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 cursor-pointer"
          >
            <Plus size={12} />
            <span>+ Add Another Channel (3+ Channels)</span>
          </Button>
        </div>

        {/* ── FOOTER ACTIONS ──────────────────────────────────────── */}
        <DialogFooter className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-8 text-xs border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
          >
            Cancel
          </Button>

          <Button
            type="button"
            disabled={!canSubmit}
            onClick={handleConfirm}
            className="h-8 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer px-4"
          >
            <span>Apply Split Payment</span>
            <ArrowRight size={13} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

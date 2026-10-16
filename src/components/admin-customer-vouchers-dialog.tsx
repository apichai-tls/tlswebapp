"use client";

import React, { useState } from "react";
import { 
  Ticket, 
  Sparkles, 
  Check, 
  Copy, 
  Calendar, 
  Tag, 
  AlertCircle,
  X,
  CheckCircle2,
  Clock
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { type Customer, type CustomerCoupon } from "@/lib/store";
import { getCategoryLabel, getCategoryIcon, isItemMatchingCategory, resolveEffectiveCategory } from "@/lib/promotions";

interface AdminCustomerVouchersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  coupons: CustomerCoupon[];
  appliedPromoCode?: string | null;
  cartItems?: any[];
  currentLanguage?: string;
  onApplyCoupon: (code: string) => void;
  onRemoveCoupon: () => void;
  isLoading?: boolean;
}

export function AdminCustomerVouchersDialog({
  open,
  onOpenChange,
  customer,
  coupons,
  appliedPromoCode,
  cartItems = [],
  currentLanguage = "th",
  onApplyCoupon,
  onRemoveCoupon,
  isLoading = false,
}: AdminCustomerVouchersDialogProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(currentLanguage === "en" ? `Copied code: ${code}` : `คัดลอกโค้ด: ${code}`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[95vw] sm:w-full bg-slate-950 border border-slate-800 text-slate-100 p-0 overflow-hidden shadow-2xl">
        <DialogHeader className="p-4 sm:p-5 border-b border-slate-800/80 bg-slate-900/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Ticket size={18} />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <span>{currentLanguage === "en" ? "Customer Vouchers" : "วอยเชอร์และคูปองของลูกค้า"}</span>
                  <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px] font-bold">
                    {coupons.length} {currentLanguage === "en" ? "available" : "ใบที่ใช้ได้"}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400 mt-0.5">
                  {customer ? (
                    <span>
                      {customer.name} {customer.phone ? `(${customer.phone})` : ""}
                    </span>
                  ) : (
                    currentLanguage === "en" ? "Available vouchers for current customer" : "คูปองส่วนลดที่ลูกค้าคนนี้สามารถใช้งานได้"
                  )}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="p-4 sm:p-5 max-h-[60vh] overflow-y-auto space-y-3">
          {coupons.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
              <Ticket size={40} className="stroke-[1.5] text-slate-600 opacity-60" />
              <p className="text-sm font-medium text-slate-400">
                {currentLanguage === "en" ? "No active vouchers found for this customer" : "ลูกค้ารายนี้ยังไม่มีวอยเชอร์หรือคูปองที่ใช้งานได้"}
              </p>
              <p className="text-xs text-slate-500">
                {currentLanguage === "en" ? "Vouchers will appear here when issued or earned from campaigns." : "เมื่อลูกค้าได้รับวอยเชอร์จากโปรโมชั่นหรือแจกพิเศษ จะแสดงที่นี่"}
              </p>
            </div>
          ) : (
            coupons.map((coupon) => {
              const isApplied = appliedPromoCode?.toUpperCase() === coupon.code.toUpperCase();
              const discountLabel = coupon.discountType === "PERCENTAGE" 
                ? `ลด ${coupon.discountValue}%` 
                : coupon.discountType === "FREE_DELIVERY"
                ? (currentLanguage === "en" ? "Free Delivery" : "ฟรีค่าจัดส่ง")
                : `ลด ฿${coupon.discountValue.toLocaleString()}`;

              const effectiveCategory = resolveEffectiveCategory(coupon);
              const hasCategoryRequirement = Boolean(effectiveCategory);
              const hasMatchingCategoryInCart = !hasCategoryRequirement || cartItems.some(it => isItemMatchingCategory(it, effectiveCategory));
              const catLabel = getCategoryLabel(effectiveCategory, currentLanguage);
              const catIcon = getCategoryIcon(effectiveCategory);

              return (
                <div 
                  key={coupon.id}
                  className={`p-3 sm:p-3.5 rounded-xl border transition-all ${
                    isApplied 
                      ? "bg-emerald-950/40 border-emerald-500/50 shadow-md shadow-emerald-950/50" 
                      : "bg-slate-900/70 border-slate-800 hover:border-amber-500/40 hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      {/* Code & Discount Header */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-sm tracking-wider text-white bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/80 flex items-center gap-1.5">
                          {coupon.code}
                          <button
                            type="button"
                            onClick={() => handleCopy(coupon.code)}
                            className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                            title="Copy Code"
                          >
                            {copiedCode === coupon.code ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                          </button>
                        </span>

                        <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold text-xs py-0.5">
                          {discountLabel}
                        </Badge>

                        {hasCategoryRequirement && (
                          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40 font-bold text-[10px] py-0.5 flex items-center gap-1">
                            <span>{catIcon}</span>
                            <span>{catLabel}</span>
                          </Badge>
                        )}

                        {isApplied && (
                          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold text-[10px] py-0.5 flex items-center gap-1">
                            <CheckCircle2 size={11} />
                            <span>{currentLanguage === "en" ? "Applied" : "กำลังใช้งาน"}</span>
                          </Badge>
                        )}
                      </div>

                      {/* Name / Description */}
                      <p className="text-xs font-medium text-slate-200">
                        {coupon.name}
                      </p>

                      {/* Criteria Badges & Expiry */}
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 flex-wrap pt-0.5">
                        {coupon.minOrderAmount ? (
                          <span className="flex items-center gap-1 bg-slate-800/50 px-1.5 py-0.5 rounded text-slate-300 border border-slate-700/50">
                            <Tag size={10} className="text-amber-400" />
                            {currentLanguage === "en" ? `Min spend ฿${coupon.minOrderAmount.toLocaleString()}` : `ขั้นต่ำ ฿${coupon.minOrderAmount.toLocaleString()}`}
                          </span>
                        ) : null}

                        {coupon.expiryDate ? (
                          <span className="flex items-center gap-1 text-slate-400">
                            <Calendar size={10} />
                            {currentLanguage === "en" ? "Expires: " : "หมดอายุ: "}
                            {format(new Date(coupon.expiryDate), "dd/MM/yyyy")}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-slate-400">
                            <Clock size={10} />
                            {currentLanguage === "en" ? "No expiration" : "ไม่มีวันหมดอายุ"}
                          </span>
                        )}
                      </div>

                      {/* Cart Category Compatibility Hint */}
                      {cartItems.length > 0 && hasCategoryRequirement && (
                        <div className="pt-1">
                          {hasMatchingCategoryInCart ? (
                            <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                              <Check size={11} />
                              {currentLanguage === "en" ? "Eligible items found in cart" : `มีบริการหมวด ${catLabel} ในบิลนี้แล้ว`}
                            </span>
                          ) : (
                            <span className="text-[10px] text-rose-400 font-semibold flex items-center gap-1">
                              <AlertCircle size={11} />
                              {currentLanguage === "en" ? `No ${catLabel} in current cart` : `ในบิลยังไม่มีบริการหมวด ${catLabel}`}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action Button */}
                    <div className="shrink-0 pt-0.5">
                      {isApplied ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onRemoveCoupon();
                            onOpenChange(false);
                          }}
                          className="h-8 px-3 text-xs font-bold text-rose-400 border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 hover:text-rose-300"
                        >
                          {currentLanguage === "en" ? "Remove" : "ยกเลิก Voucher"}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          disabled={isLoading}
                          onClick={() => {
                            if (hasCategoryRequirement && !hasMatchingCategoryInCart) {
                              toast.warning(currentLanguage === "en" ? `This voucher is only valid for "${catLabel}". Please add items from this category.` : `วอยเชอร์นี้ใช้ได้เฉพาะบริการหมวด "${catLabel}" เท่านั้น กรุณาเพิ่มรายการในหมวดนี้ในบิลก่อน`);
                              return;
                            }
                            onApplyCoupon(coupon.code);
                            onOpenChange(false);
                          }}
                          className="h-8 px-3 text-xs font-black bg-amber-500 hover:bg-amber-400 text-black shadow-md cursor-pointer transition-colors"
                        >
                          <Sparkles size={12} className="mr-1" />
                          {currentLanguage === "en" ? "Apply" : "ใช้ Voucher นี้"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="p-3 sm:p-4 border-t border-slate-800/80 bg-slate-900/40 flex items-center justify-between sm:justify-between">
          <span className="text-[11px] text-slate-500 pl-1">
            {appliedPromoCode ? (
              <span className="text-emerald-400 font-semibold">
                ✓ {currentLanguage === "en" ? `Active promo: ${appliedPromoCode}` : `กำลังใช้รหัส: ${appliedPromoCode}`}
              </span>
            ) : (
              currentLanguage === "en" ? "Select a voucher to apply discount" : "คลิก 'ใช้ Voucher นี้' เพื่อดึงมาคำนวณส่วนลดในบิล"
            )}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-slate-400 hover:text-white"
          >
            {currentLanguage === "en" ? "Close" : "ปิด"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

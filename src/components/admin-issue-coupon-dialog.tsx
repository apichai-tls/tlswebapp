"use client";

import React, { useState, useMemo, useEffect } from "react";
import { 
  Ticket, 
  Gift, 
  Search, 
  Sparkles, 
  Calendar, 
  X, 
  Check, 
  User, 
  Percent, 
  DollarSign, 
  Truck, 
  Coins, 
  AlertCircle,
  Shuffle,
  Settings,
  BookmarkPlus,
  Layers,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { useAuth } from "@/providers/auth-provider";
import { useCustomers } from "@/lib/use-customers";
import { matchCustomerSearch, formatBaht } from "@/lib/utils";
import { createCustomerCouponAction, getCouponTemplatesAction, saveCouponTemplateAction } from "@/actions/db";
import { type Customer, type CustomerCoupon, type CouponTemplate } from "@/lib/store";
import { AdminCouponTemplateModal } from "./admin-coupon-template-modal";

interface AdminIssueCouponDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedCustomer?: Customer | null;
  onSuccess?: (coupon: CustomerCoupon) => void;
}

const PRESET_TEMPLATES = [
  {
    label: "🎁 ต้อนรับสมาชิก (ลด ฿100)",
    codePrefix: "WELCOME100",
    name: "คูปองต้อนรับสมาชิกใหม่ ลด ฿100",
    discountType: "FIXED" as const,
    discountValue: 100,
    minOrderAmount: 300,
    maxDiscount: null,
    days: 30,
    reason: "ต้อนรับสมาชิกใหม่ (Welcome Member)",
  },
  {
    label: "🎂 วันเกิด (ลด 20%)",
    codePrefix: "BDAY20",
    name: "คูปองวันเกิดพิเศษ ลด 20%",
    discountType: "PERCENTAGE" as const,
    discountValue: 20,
    minOrderAmount: 200,
    maxDiscount: 200,
    days: 30,
    reason: "สิทธิพิเศษเดือนเกิดลูกค้า (Birthday Perk)",
  },
  {
    label: "🚚 ฟรีค่าส่ง Delivery",
    codePrefix: "FREEDELIVERY",
    name: "คูปองฟรีค่าจัดส่ง Delivery",
    discountType: "FREE_DELIVERY" as const,
    discountValue: 0,
    minOrderAmount: 150,
    maxDiscount: null,
    days: 14,
    reason: "โปรโมชั่นฟรีค่าจัดส่ง",
  },
  {
    label: "🛠️ ชดเชยบริการ (ลด ฿200)",
    codePrefix: "SRV200",
    name: "คูปองชดเชยบริการ Service Recovery ฿200",
    discountType: "FIXED" as const,
    discountValue: 200,
    minOrderAmount: 0,
    maxDiscount: null,
    days: 60,
    reason: "ชดเชยบริการล่าช้า / ปัญหาการจัดส่ง",
  },
  {
    label: "💖 ส่วนลดแทนใจ (ลด ฿50)",
    codePrefix: "TLS50",
    name: "คูปองส่วนลดพิเศษ ฿50",
    discountType: "FIXED" as const,
    discountValue: 50,
    minOrderAmount: 200,
    maxDiscount: null,
    days: 30,
    reason: "สมนาคุณลูกค้าประจำ",
  },
];

export function AdminIssueCouponDialog({
  open,
  onOpenChange,
  preselectedCustomer,
  onSuccess,
}: AdminIssueCouponDialogProps) {
  const { user } = useAuth();
  const allCustomers = useCustomers();

  // Customer Selection State (if not preselected)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(preselectedCustomer || null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Form State
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"FIXED" | "PERCENTAGE" | "FREE_DELIVERY" | "CASH_VOUCHER">("FIXED");
  const [discountValue, setDiscountValue] = useState<number | string>(100);
  const [minOrderAmount, setMinOrderAmount] = useState<number | string>("");
  const [maxDiscount, setMaxDiscount] = useState<number | string>("");
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [issuedReason, setIssuedReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dynamic Templates State
  const [templates, setTemplates] = useState<CouponTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  // Load templates on open
  useEffect(() => {
    if (open) {
      setIsLoadingTemplates(true);
      getCouponTemplatesAction()
        .then((res) => {
          if (res.success && res.templates) {
            setTemplates(res.templates);
          }
        })
        .catch((err) => {
          console.error("Failed to load coupon templates:", err);
        })
        .finally(() => {
          setIsLoadingTemplates(false);
        });
    }
  }, [open]);

  // Sync preselectedCustomer
  useEffect(() => {
    if (open) {
      if (preselectedCustomer) {
        setSelectedCustomer(preselectedCustomer);
      } else {
        setSelectedCustomer(null);
      }
      setCustomerSearch("");
      setShowCustomerDropdown(false);
      
      // Default expiry date: 30 days from today
      const defaultExp = addDays(new Date(), 30).toISOString().split("T")[0];
      setExpiryDate(defaultExp);
      
      // Reset other fields if opening fresh
      if (!code) {
        generateRandomCode("TLS");
      }
    }
  }, [open, preselectedCustomer]);

  const generateRandomCode = (prefix: string = "TLS") => {
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    setCode(`${prefix}-${randomSuffix}`);
  };

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return [];
    return allCustomers
      .filter(c => matchCustomerSearch(c, customerSearch))
      .slice(0, 8);
  }, [allCustomers, customerSearch]);

  const handleApplyTemplate = (tpl: CouponTemplate | typeof PRESET_TEMPLATES[0]) => {
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    setCode(`${tpl.codePrefix || "COUPON"}-${randomSuffix}`);
    setName(tpl.name);
    if ("description" in tpl && tpl.description) {
      setDescription(tpl.description);
    }
    setDiscountType(tpl.discountType);
    setDiscountValue(tpl.discountValue);
    setMinOrderAmount(tpl.minOrderAmount != null ? tpl.minOrderAmount : "");
    setMaxDiscount(tpl.maxDiscount != null ? tpl.maxDiscount : "");
    setIssuedReason(tpl.reason || "");
    if (tpl.days) {
      setExpiryDate(addDays(new Date(), tpl.days).toISOString().split("T")[0]);
    } else {
      setExpiryDate("");
    }
    toast.success(`Applied template "${tpl.label}" (ใช้งานแม่แบบแล้ว)`);
  };

  const handleSaveAsTemplate = async () => {
    if (!name.trim()) {
      toast.error("Please enter a Coupon Name first (กรุณาระบุชื่อคูปองก่อน)");
      return;
    }
    const label = prompt("Enter a label for this template (ระบุชื่อป้ายกำกับแม่แบบ):", name.trim());
    if (!label || !label.trim()) return;

    try {
      const res = await saveCouponTemplateAction({
        label: label.trim(),
        codePrefix: (code.split("-")[0] || "TLS").toUpperCase(),
        name: name.trim(),
        description: description.trim() || undefined,
        discountType,
        discountValue: Number(discountValue) || 0,
        minOrderAmount: minOrderAmount !== "" ? Number(minOrderAmount) : null,
        maxDiscount: maxDiscount !== "" ? Number(maxDiscount) : null,
        days: expiryDate ? Math.max(1, Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 30,
        reason: issuedReason.trim() || undefined,
        brand: selectedCustomer?.brand || "all",
      });
      if (res.success && res.templates) {
        setTemplates(res.templates);
        toast.success("Saved as new template! (บันทึกเป็นแม่แบบใหม่เรียบร้อย)");
      } else {
        toast.error(res.error || "Failed to save template");
      }
    } catch (e: any) {
      toast.error(`Error saving template: ${e.message}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) {
      toast.error("กรุณาเลือกลูกค้าที่จะมอบคูปองให้");
      return;
    }
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      toast.error("กรุณาระบุรหัสคูปอง (Coupon Code)");
      return;
    }
    if (!name.trim()) {
      toast.error("กรุณาระบุชื่อคูปอง");
      return;
    }

    const numValue = Number(discountValue) || 0;
    if (discountType !== "FREE_DELIVERY" && numValue <= 0) {
      toast.error("มูลค่าส่วนลดต้องมากกว่า 0");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createCustomerCouponAction({
        customerId: selectedCustomer.id,
        code: cleanCode,
        name: name.trim(),
        description: description.trim() || undefined,
        discountType,
        discountValue: numValue,
        minOrderAmount: minOrderAmount ? Number(minOrderAmount) : null,
        maxDiscount: maxDiscount ? Number(maxDiscount) : null,
        expiryDate: expiryDate ? new Date(`${expiryDate}T23:59:59`) : null,
        issuedReason: issuedReason.trim() || undefined,
        issuedById: user?.id,
        issuedByName: user?.name || user?.email || "Admin",
        brand: selectedCustomer.brand || "that_laundry_shop",
      });

      if (!res.success || !res.coupon) {
        throw new Error(res.error || "Failed to create coupon");
      }

      toast.success(`มอบคูปอง "${cleanCode}" ให้คุณ ${selectedCustomer.name} เรียบร้อยแล้ว! 🎉`);
      onSuccess?.(res.coupon as unknown as CustomerCoupon);
      onOpenChange(false);

      // Reset form
      setCode("");
      setName("");
      setDescription("");
      setIssuedReason("");
      setMinOrderAmount("");
      setMaxDiscount("");
    } catch (err: any) {
      toast.error(err?.message || "เกิดข้อผิดพลาดในการมอบคูปอง");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 bg-white overflow-hidden rounded-2xl border-none shadow-2xl z-[75]">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <DialogHeader className="p-5 pb-4 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border-b border-indigo-100/60">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
                <Ticket size={20} />
              </div>
              <div>
                <DialogTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                  Issue Customer Coupon (มอบคูปองให้ลูกค้า)
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Directly issue discount coupons to customer wallet (สร้างและผูกคูปองส่วนลดเข้ากระเป๋าของลูกค้าโดยตรง)
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Scrollable Body */}
          <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
            {/* Customer Selector */}
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700 flex items-center justify-between">
                <span>Select Customer (เลือกลูกค้าที่จะมอบคูปองให้) <span className="text-rose-500">*</span></span>
                {selectedCustomer && (
                  <span className="text-[10px] text-indigo-600 font-bold">
                    {selectedCustomer.brand === "noname_laundry" ? "NONAME LAUNDRY" : "THAT LAUNDRY SHOP"}
                  </span>
                )}
              </Label>

              {selectedCustomer ? (
                <div className="flex items-center justify-between p-3 rounded-xl border border-indigo-200 bg-indigo-50/50">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                      {selectedCustomer.name ? selectedCustomer.name[0].toUpperCase() : "U"}
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-slate-900 text-xs truncate">{selectedCustomer.name}</p>
                      <p className="text-[11px] text-slate-500 font-mono">{selectedCustomer.phone || "-"}</p>
                    </div>
                  </div>
                  {!preselectedCustomer && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedCustomer(null)}
                      className="h-7 text-xs text-slate-400 hover:text-rose-600 px-2 rounded-lg cursor-pointer"
                    >
                      Change (เปลี่ยน)
                    </Button>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="Search customer name, phone, or Member ID (พิมพ์ชื่อ เบอร์โทร หรือ Member ID)..."
                      value={customerSearch}
                      onChange={e => {
                        setCustomerSearch(e.target.value);
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      className="h-10 pl-9 text-xs rounded-xl border-slate-200"
                    />
                  </div>

                  {showCustomerDropdown && filteredCustomers.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto divide-y divide-slate-100">
                      {filteredCustomers.map(c => (
                        <div
                          key={c.id}
                          onClick={() => {
                            setSelectedCustomer(c);
                            setShowCustomerDropdown(false);
                            setCustomerSearch("");
                          }}
                          className="p-2.5 hover:bg-indigo-50/70 cursor-pointer flex items-center justify-between text-xs transition-colors"
                        >
                          <div>
                            <span className="font-bold text-slate-900">{c.name}</span>
                            <span className="text-[11px] text-slate-500 font-mono ml-2">{c.phone}</span>
                          </div>
                          {c.isMember && (
                            <Badge variant="outline" className="text-[9px] border-indigo-200 text-indigo-700 bg-indigo-50">
                              MEMBER
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Preset Templates */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <Label className="font-bold text-slate-500 text-[11px] uppercase tracking-wider flex items-center gap-1">
                  <Sparkles size={12} className="text-amber-500" />
                  <span>Quick Templates (เลือกเทมเพลตด่วน):</span>
                </Label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveAsTemplate}
                    disabled={!name.trim()}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 disabled:text-slate-300 flex items-center gap-1 cursor-pointer transition-colors"
                    title="Save current coupon configuration as reusable template (บันทึกคูปองนี้เป็นแม่แบบ)"
                  >
                    <BookmarkPlus size={12} />
                    <span>Save as Template (บันทึกเป็นแม่แบบ)</span>
                  </button>
                  <span className="text-slate-200">|</span>
                  <button
                    type="button"
                    onClick={() => setIsTemplateModalOpen(true)}
                    className="text-[11px] font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1 cursor-pointer transition-colors"
                    title="Manage Templates (จัดการแม่แบบทั้งหมด)"
                  >
                    <Settings size={12} />
                    <span>Manage (จัดการ)</span>
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {(templates.length > 0 ? templates : PRESET_TEMPLATES).map((tpl: any, i) => (
                  <button
                    key={tpl.id || i}
                    type="button"
                    onClick={() => handleApplyTemplate(tpl)}
                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 bg-white hover:border-indigo-400 hover:bg-indigo-50/60 hover:text-indigo-900 transition-all shadow-2xs cursor-pointer text-slate-700"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Code & Random Button */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="font-bold text-slate-700">Coupon Code (รหัสคูปอง) <span className="text-rose-500">*</span></Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    placeholder="e.g. WELCOME100"
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase())}
                    className="h-9 text-xs font-mono font-black uppercase tracking-wider rounded-xl border-slate-200 text-indigo-950"
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => generateRandomCode("TLS")}
                    className="h-9 px-2 text-[11px] font-bold border-slate-200 text-slate-600 hover:text-indigo-600 rounded-xl shrink-0"
                    title="Random Code (สุ่มรหัสคูปองใหม่)"
                  >
                    <Shuffle size={12} />
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="font-bold text-slate-700">Coupon Name (ชื่อคูปอง) <span className="text-rose-500">*</span></Label>
                <Input
                  placeholder="e.g. Special Discount for New Members"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="h-9 text-xs font-bold rounded-xl border-slate-200"
                  required
                />
              </div>
            </div>

            {/* Discount Type Buttons */}
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">Discount Type (ประเภทส่วนลด)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setDiscountType("FIXED")}
                  className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                    discountType === "FIXED"
                      ? "border-indigo-600 bg-indigo-50 text-indigo-900 font-black shadow-xs ring-1 ring-indigo-600"
                      : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold"
                  }`}
                >
                  <DollarSign size={14} className="text-indigo-600" />
                  <span className="text-[11px]">Fixed ฿ (ลดบาท)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDiscountType("PERCENTAGE")}
                  className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                    discountType === "PERCENTAGE"
                      ? "border-indigo-600 bg-indigo-50 text-indigo-900 font-black shadow-xs ring-1 ring-indigo-600"
                      : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold"
                  }`}
                >
                  <Percent size={14} className="text-indigo-600" />
                  <span className="text-[11px]">Percentage % (ลด %)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDiscountType("FREE_DELIVERY")}
                  className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                    discountType === "FREE_DELIVERY"
                      ? "border-emerald-600 bg-emerald-50 text-emerald-900 font-black shadow-xs ring-1 ring-emerald-600"
                      : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold"
                  }`}
                >
                  <Truck size={14} className="text-emerald-600" />
                  <span className="text-[11px]">Free Delivery (ฟรีค่าส่ง)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDiscountType("CASH_VOUCHER")}
                  className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                    discountType === "CASH_VOUCHER"
                      ? "border-amber-600 bg-amber-50 text-amber-900 font-black shadow-xs ring-1 ring-amber-600"
                      : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold"
                  }`}
                >
                  <Coins size={14} className="text-amber-600" />
                  <span className="text-[11px]">Cash Voucher (วอยเชอร์)</span>
                </button>
              </div>
            </div>

            {/* Discount Value & Constraints */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {discountType !== "FREE_DELIVERY" && (
                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">
                    {discountType === "PERCENTAGE" ? "Discount Percentage % (เปอร์เซ็นต์ส่วนลด)" : "Discount Value ฿ (มูลค่าส่วนลด)"} <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={discountValue}
                    onChange={e => setDiscountValue(e.target.value)}
                    className="h-9 text-xs font-black rounded-xl border-slate-200 text-indigo-950"
                    required
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label className="font-bold text-slate-700">Min. Order Amount ฿ (ยอดบิลขั้นต่ำ)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0 = No Minimum (ไม่มียอดขั้นต่ำ)"
                  value={minOrderAmount}
                  onChange={e => setMinOrderAmount(e.target.value)}
                  className="h-9 text-xs rounded-xl border-slate-200"
                />
              </div>

              {discountType === "PERCENTAGE" && (
                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">Max Discount ฿ (ลดได้สูงสุด)</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Leave blank for no limit (ไม่จำกัด)"
                    value={maxDiscount}
                    onChange={e => setMaxDiscount(e.target.value)}
                    className="h-9 text-xs rounded-xl border-slate-200"
                  />
                </div>
              )}
            </div>

            {/* Expiry Date & Reason */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="font-bold text-slate-700 flex items-center justify-between">
                  <span>Expiry Date (วันหมดอายุ)</span>
                  {expiryDate && (
                    <button
                      type="button"
                      onClick={() => setExpiryDate("")}
                      className="text-[10px] text-slate-400 hover:text-rose-500 cursor-pointer"
                    >
                      No Expiry (ไม่จำกัดวัน)
                    </button>
                  )}
                </Label>
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={e => setExpiryDate(e.target.value)}
                  className="h-9 text-xs rounded-xl border-slate-200 bg-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="font-bold text-slate-700">Reason / Note (เหตุผลในการแจก)</Label>
                <Input
                  placeholder="e.g. Service delay compensation (ชดเชยผ้าล่าช้า)"
                  value={issuedReason}
                  onChange={e => setIssuedReason(e.target.value)}
                  className="h-9 text-xs rounded-xl border-slate-200"
                />
              </div>
            </div>

            {/* Live Voucher Preview Card */}
            <div className="p-3.5 rounded-2xl border border-dashed border-indigo-300 bg-gradient-to-r from-indigo-50/70 via-white to-purple-50/70 flex items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black shrink-0 shadow-xs">
                  {discountType === "PERCENTAGE" ? (
                    <span className="text-sm font-black">{discountValue || 0}%</span>
                  ) : discountType === "FREE_DELIVERY" ? (
                    <Truck size={18} />
                  ) : (
                    <span className="text-xs font-black">฿{discountValue || 0}</span>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-black text-xs text-indigo-950 uppercase">{code || "CODE"}</span>
                    <Badge className="bg-emerald-100 text-emerald-800 text-[9px] py-0 px-1.5">Active (พร้อมใช้งาน)</Badge>
                  </div>
                  <p className="text-[11px] font-bold text-slate-800 mt-0.5">{name || "Coupon Name (ชื่อคูปองส่วนลด)"}</p>
                  <p className="text-[10px] text-slate-500">
                    {minOrderAmount ? `Min ฿${Number(minOrderAmount).toLocaleString()} (ขั้นต่ำ) • ` : ""}
                    {expiryDate ? `Expires ${format(new Date(`${expiryDate}T23:59:59`), "dd/MM/yyyy")} (ใช้ได้ถึง)` : "No Expiry (ไม่มีวันหมดอายุ)"}
                  </p>
                </div>
              </div>
              {selectedCustomer && (
                <div className="text-right text-[10px] text-slate-500 shrink-0 border-l border-indigo-100 pl-3">
                  <p className="text-slate-400">For Customer (สำหรับลูกค้า)</p>
                  <p className="font-bold text-slate-800 truncate max-w-[100px]">{selectedCustomer.name}</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="rounded-xl text-xs cursor-pointer"
            >
              Cancel (ยกเลิก)
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !selectedCustomer || !code.trim() || !name.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl px-5 shadow-xs cursor-pointer gap-1.5"
            >
              {isSubmitting ? "Saving..." : "Issue Coupon (ยืนยันมอบคูปอง)"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      {/* Template Management Modal */}
      {isTemplateModalOpen && (
        <AdminCouponTemplateModal
          open={isTemplateModalOpen}
          onOpenChange={setIsTemplateModalOpen}
          onSelectTemplate={(tpl) => handleApplyTemplate(tpl)}
          onTemplatesUpdated={(newTemplates) => setTemplates(newTemplates)}
        />
      )}
    </Dialog>
  );
}

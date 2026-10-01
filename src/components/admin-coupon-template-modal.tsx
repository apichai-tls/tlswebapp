"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Ticket,
  Plus,
  Trash2,
  Edit2,
  Sparkles,
  DollarSign,
  Percent,
  Truck,
  Coins,
  RotateCcw,
  Check,
  X,
  Layers,
  ArrowRight,
} from "lucide-react";
import {
  getCouponTemplatesAction,
  saveCouponTemplateAction,
  deleteCouponTemplateAction,
  resetCouponTemplatesAction,
} from "@/actions/db";
import { type CouponTemplate } from "@/lib/store";

interface AdminCouponTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate?: (template: CouponTemplate) => void;
  onTemplatesUpdated?: (templates: CouponTemplate[]) => void;
}

export function AdminCouponTemplateModal({
  open,
  onOpenChange,
  onSelectTemplate,
  onTemplatesUpdated,
}: AdminCouponTemplateModalProps) {
  const [templates, setTemplates] = useState<CouponTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CouponTemplate | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Form State
  const [label, setLabel] = useState("");
  const [codePrefix, setCodePrefix] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<CouponTemplate["discountType"]>("FIXED");
  const [discountValue, setDiscountValue] = useState<number | string>(100);
  const [minOrderAmount, setMinOrderAmount] = useState<number | string>("");
  const [maxDiscount, setMaxDiscount] = useState<number | string>("");
  const [days, setDays] = useState<number | string>(30);
  const [reason, setReason] = useState("");
  const [brand, setBrand] = useState("all");

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const res = await getCouponTemplatesAction();
      if (res.success && res.templates) {
        setTemplates(res.templates);
        onTemplatesUpdated?.(res.templates);
      }
    } catch (e: any) {
      toast.error(`Failed to load templates: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadTemplates();
      resetForm();
    }
  }, [open]);

  const resetForm = () => {
    setEditingTemplate(null);
    setIsCreatingNew(false);
    setLabel("");
    setCodePrefix("");
    setName("");
    setDescription("");
    setDiscountType("FIXED");
    setDiscountValue(100);
    setMinOrderAmount("");
    setMaxDiscount("");
    setDays(30);
    setReason("");
    setBrand("all");
  };

  const handleStartEdit = (tpl: CouponTemplate) => {
    setEditingTemplate(tpl);
    setIsCreatingNew(false);
    setLabel(tpl.label);
    setCodePrefix(tpl.codePrefix);
    setName(tpl.name);
    setDescription(tpl.description || "");
    setDiscountType(tpl.discountType);
    setDiscountValue(tpl.discountValue);
    setMinOrderAmount(tpl.minOrderAmount != null ? tpl.minOrderAmount : "");
    setMaxDiscount(tpl.maxDiscount != null ? tpl.maxDiscount : "");
    setDays(tpl.days);
    setReason(tpl.reason || "");
    setBrand(tpl.brand || "all");
  };

  const handleStartCreate = () => {
    resetForm();
    setIsCreatingNew(true);
    setLabel("🎁 New Template (แม่แบบใหม่)");
    setCodePrefix("PROMO");
    setName("คูปองส่วนลดพิเศษ");
    setDiscountType("FIXED");
    setDiscountValue(100);
    setDays(30);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !name.trim()) {
      toast.error("Please enter Template Label and Coupon Name");
      return;
    }

    setIsSaving(true);
    try {
      const res = await saveCouponTemplateAction({
        id: editingTemplate ? editingTemplate.id : undefined,
        label: label.trim(),
        codePrefix: (codePrefix || "COUPON").trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || undefined,
        discountType,
        discountValue: Number(discountValue) || 0,
        minOrderAmount: minOrderAmount !== "" ? Number(minOrderAmount) : null,
        maxDiscount: maxDiscount !== "" ? Number(maxDiscount) : null,
        days: days !== "" ? Number(days) : 30,
        reason: reason.trim() || undefined,
        brand,
      });

      if (res.success && res.templates) {
        setTemplates(res.templates);
        onTemplatesUpdated?.(res.templates);
        toast.success(editingTemplate ? "Template updated (อัปเดตแม่แบบสำเร็จ)" : "Template created (สร้างแม่แบบสำเร็จ)");
        resetForm();
      } else {
        toast.error(res.error || "Failed to save template");
      }
    } catch (e: any) {
      toast.error(`Error saving template: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string, tplLabel: string) => {
    if (!confirm(`Are you sure you want to delete template "${tplLabel}"? (ยืนยันลบแม่แบบนี้หรือไม่?)`)) {
      return;
    }

    try {
      const res = await deleteCouponTemplateAction(id);
      if (res.success && res.templates) {
        setTemplates(res.templates);
        onTemplatesUpdated?.(res.templates);
        toast.success("Template deleted (ลบแม่แบบเรียบร้อย)");
        if (editingTemplate?.id === id) {
          resetForm();
        }
      }
    } catch (e: any) {
      toast.error(`Error deleting template: ${e.message}`);
    }
  };

  const handleResetDefaults = async () => {
    if (!confirm("Reset all templates back to system default presets? (รีเซ็ตแม่แบบทั้งหมดกลับเป็นค่าเริ่มต้นหรือไม่?)")) {
      return;
    }
    try {
      const res = await resetCouponTemplatesAction();
      if (res.success && res.templates) {
        setTemplates(res.templates);
        onTemplatesUpdated?.(res.templates);
        toast.success("Reset to defaults successful (รีเซ็ตค่าเริ่มต้นสำเร็จ)");
        resetForm();
      }
    } catch (e: any) {
      toast.error(`Error resetting templates: ${e.message}`);
    }
  };

  const renderDiscountTypeIcon = (type: CouponTemplate["discountType"]) => {
    switch (type) {
      case "PERCENTAGE":
        return <Percent size={13} className="text-indigo-600" />;
      case "FREE_DELIVERY":
        return <Truck size={13} className="text-emerald-600" />;
      case "CASH_VOUCHER":
        return <Coins size={13} className="text-amber-600" />;
      default:
        return <DollarSign size={13} className="text-indigo-600" />;
    }
  };

  const renderDiscountValueText = (tpl: CouponTemplate) => {
    switch (tpl.discountType) {
      case "PERCENTAGE":
        return `${tpl.discountValue}% OFF`;
      case "FREE_DELIVERY":
        return "Free Delivery";
      case "CASH_VOUCHER":
        return `฿${tpl.discountValue} Voucher`;
      default:
        return `฿${tpl.discountValue} OFF`;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0 bg-white overflow-hidden rounded-2xl border-none shadow-2xl z-[80]">
        {/* Header */}
        <DialogHeader className="p-5 pb-4 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border-b border-indigo-100/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
                <Layers size={20} />
              </div>
              <div>
                <DialogTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                  Coupon Templates (แม่แบบคูปอง)
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Manage reusable coupon presets for quick issuance (จัดการแม่แบบคูปองที่ใช้แจกลูกค้าบ่อย ๆ)
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetDefaults}
                className="h-8 text-[11px] font-bold border-slate-200 text-slate-600 hover:text-indigo-600 rounded-xl cursor-pointer gap-1"
                title="Reset to default presets (รีเซ็ตเป็นค่าเริ่มต้น)"
              >
                <RotateCcw size={12} />
                <span>Reset Defaults</span>
              </Button>
              {!isCreatingNew && !editingTemplate && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleStartCreate}
                  className="h-8 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl gap-1.5 shadow-xs cursor-pointer"
                >
                  <Plus size={14} />
                  <span>+ Create Template (สร้างแม่แบบ)</span>
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="p-5 max-h-[75vh] overflow-y-auto space-y-5 text-xs">
          {/* CREATE OR EDIT FORM */}
          {(isCreatingNew || editingTemplate) && (
            <form onSubmit={handleSaveTemplate} className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-200/80 space-y-4">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-indigo-600" />
                  <span className="font-black text-indigo-950 text-sm">
                    {editingTemplate ? "Edit Template (แก้ไขแม่แบบ)" : "New Coupon Template (สร้างแม่แบบใหม่)"}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetForm}
                  className="h-7 text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X size={14} className="mr-1" />
                  <span>Cancel (ยกเลิก)</span>
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">Template Label (ชื่อปุ่ม/แม่แบบ) <span className="text-rose-500">*</span></Label>
                  <Input
                    placeholder="e.g. 🎁 Welcome Member (ลด ฿100)"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    className="h-9 text-xs font-bold rounded-xl border-slate-200 bg-white"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">Code Prefix (คำนำหน้ารหัส) <span className="text-rose-500">*</span></Label>
                  <Input
                    placeholder="e.g. WELCOME"
                    value={codePrefix}
                    onChange={e => setCodePrefix(e.target.value.toUpperCase())}
                    className="h-9 text-xs font-mono font-black uppercase rounded-xl border-slate-200 bg-white text-indigo-950"
                    required
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label className="font-bold text-slate-700">Coupon Name for Customer (ชื่อคูปองที่จะแสดงให้ลูกค้า) <span className="text-rose-500">*</span></Label>
                  <Input
                    placeholder="e.g. คูปองต้อนรับสมาชิกใหม่ ลดทันที ฿100"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="h-9 text-xs font-bold rounded-xl border-slate-200 bg-white"
                    required
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label className="font-bold text-slate-700">Description (คำอธิบายสิทธิประโยชน์)</Label>
                  <Input
                    placeholder="e.g. สำหรับการสั่งซื้อครั้งแรก ขั้นต่ำ ฿300"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className="h-9 text-xs rounded-xl border-slate-200 bg-white"
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
                    className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      discountType === "FIXED"
                        ? "border-indigo-600 bg-indigo-600 text-white font-black shadow-xs"
                        : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold"
                    }`}
                  >
                    <DollarSign size={14} />
                    <span className="text-[11px]">Fixed ฿ (ลดบาท)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDiscountType("PERCENTAGE")}
                    className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      discountType === "PERCENTAGE"
                        ? "border-indigo-600 bg-indigo-600 text-white font-black shadow-xs"
                        : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold"
                    }`}
                  >
                    <Percent size={14} />
                    <span className="text-[11px]">Percentage % (ลด %)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDiscountType("FREE_DELIVERY")}
                    className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      discountType === "FREE_DELIVERY"
                        ? "border-emerald-600 bg-emerald-600 text-white font-black shadow-xs"
                        : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold"
                    }`}
                  >
                    <Truck size={14} />
                    <span className="text-[11px]">Free Delivery (ฟรีค่าส่ง)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDiscountType("CASH_VOUCHER")}
                    className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      discountType === "CASH_VOUCHER"
                        ? "border-amber-600 bg-amber-600 text-white font-black shadow-xs"
                        : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold"
                    }`}
                  >
                    <Coins size={14} />
                    <span className="text-[11px]">Cash Voucher (วอยเชอร์)</span>
                  </button>
                </div>
              </div>

              {/* Discount Value, Min Order, Max Discount, Days */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {discountType !== "FREE_DELIVERY" ? (
                  <div className="space-y-1">
                    <Label className="font-bold text-slate-700">
                      {discountType === "PERCENTAGE" ? "Discount % (ลด %)" : "Discount Value ฿ (มูลค่า) *"}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      value={discountValue}
                      onChange={e => setDiscountValue(e.target.value)}
                      className="h-9 text-xs font-black rounded-xl border-slate-200 bg-white text-indigo-950"
                      required
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="font-bold text-slate-400">Discount Value</Label>
                    <div className="h-9 flex items-center px-3 bg-slate-100 rounded-xl text-xs text-slate-500 font-bold">
                      100% Delivery
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">Min Order ฿ (ยอดขั้นต่ำ)</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0 = No Min"
                    value={minOrderAmount}
                    onChange={e => setMinOrderAmount(e.target.value)}
                    className="h-9 text-xs rounded-xl border-slate-200 bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">Max Discount ฿ (ลดสูงสุด)</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="No limit"
                    value={maxDiscount}
                    onChange={e => setMaxDiscount(e.target.value)}
                    className="h-9 text-xs rounded-xl border-slate-200 bg-white"
                    disabled={discountType !== "PERCENTAGE"}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">Validity Days (อายุคูปองวัน)</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="e.g. 30"
                    value={days}
                    onChange={e => setDays(e.target.value)}
                    className="h-9 text-xs rounded-xl border-slate-200 bg-white font-bold"
                  />
                </div>
              </div>

              {/* Reason & Brand */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">Default Reason / Note (เหตุผลในการแจก)</Label>
                  <Input
                    placeholder="e.g. ต้อนรับสมาชิกใหม่, ชดเชยบริการ"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    className="h-9 text-xs rounded-xl border-slate-200 bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">Brand (แบรนด์ที่ใช้ได้)</Label>
                  <select
                    value={brand}
                    onChange={e => setBrand(e.target.value)}
                    className="w-full h-9 px-3 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 shadow-2xs cursor-pointer"
                  >
                    <option value="all">All Brands (ทุกแบรนด์)</option>
                    <option value="that_laundry_shop">That Laundry Shop (TLS)</option>
                    <option value="noname_laundry">Noname Laundry</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-indigo-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetForm}
                  className="rounded-xl text-xs cursor-pointer"
                >
                  Cancel (ยกเลิก)
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSaving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl px-5 shadow-xs cursor-pointer gap-1.5"
                >
                  <Check size={14} />
                  <span>{isSaving ? "Saving..." : (editingTemplate ? "Update Template (บันทึกแก้ไข)" : "Save Template (สร้างแม่แบบ)")}</span>
                </Button>
              </div>
            </form>
          )}

          {/* TEMPLATE CARDS LIST */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 text-xs uppercase tracking-wider">
                Available Templates ({templates.length} แม่แบบที่มีอยู่ในระบบ)
              </span>
            </div>

            {templates.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {templates.map(tpl => {
                  const isEditingThis = editingTemplate?.id === tpl.id;

                  return (
                    <div
                      key={tpl.id}
                      className={`relative p-4 rounded-2xl border transition-all ${
                        isEditingThis
                          ? "border-indigo-500 bg-indigo-50/40 ring-2 ring-indigo-200"
                          : "border-slate-200 hover:border-indigo-300 hover:shadow-2xs bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-black text-slate-800 text-xs truncate">{tpl.label}</span>
                            <Badge variant="outline" className="text-[10px] font-bold py-0 h-4 border-indigo-200 bg-indigo-50 text-indigo-700">
                              {renderDiscountTypeIcon(tpl.discountType)}
                              <span className="ml-1">{renderDiscountValueText(tpl)}</span>
                            </Badge>
                          </div>
                          <p className="text-[11px] font-bold text-slate-600">{tpl.name}</p>
                          {tpl.description && (
                            <p className="text-[10px] text-slate-400 line-clamp-1">{tpl.description}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleStartEdit(tpl)}
                            className="h-7 w-7 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                            title="Edit Template (แก้ไข)"
                          >
                            <Edit2 size={13} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteTemplate(tpl.id, tpl.label)}
                            className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                            title="Delete Template (ลบ)"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                            Prefix: {tpl.codePrefix}
                          </span>
                          <span>
                            {tpl.minOrderAmount ? `Min ฿${tpl.minOrderAmount.toLocaleString()}` : "No Min"}
                          </span>
                          {tpl.maxDiscount && (
                            <span>Max ฿{tpl.maxDiscount.toLocaleString()}</span>
                          )}
                          <span>
                            {tpl.days > 0 ? `${tpl.days} days validity` : "No Expiry"}
                          </span>
                        </div>

                        {onSelectTemplate && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              onSelectTemplate(tpl);
                              onOpenChange(false);
                            }}
                            className="h-6 px-2.5 text-[10px] font-bold bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-lg transition-colors cursor-pointer border border-indigo-200"
                          >
                            <span>Use Template</span>
                            <ArrowRight size={10} className="ml-1" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400">
                <Ticket size={24} className="mx-auto mb-2 opacity-50" />
                <p className="font-bold">No templates created yet (ยังไม่มีแม่แบบคูปอง)</p>
                <p className="text-[11px] mt-1">Click "Create Template" to add one or Reset Defaults.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="rounded-xl text-xs cursor-pointer px-4"
          >
            Close (ปิด)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

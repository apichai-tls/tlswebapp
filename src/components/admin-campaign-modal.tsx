"use client";

import React, { useState, useEffect } from "react";
import { format, addDays } from "date-fns";
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
  Megaphone,
  Plus,
  Trash2,
  Edit2,
  Sparkles,
  Power,
  Calendar,
  Layers,
  Check,
  X,
  Tag,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Users,
  Ticket,
  Clock
} from "lucide-react";
import {
  getPromotionCampaignsAction,
  savePromotionCampaignAction,
  deletePromotionCampaignAction,
  getCouponTemplatesAction
} from "@/actions/db";
import {
  type PromotionCampaign,
  PROMO_SERVICE_CATEGORIES,
  getCategoryLabel,
  getCategoryIcon
} from "@/lib/promotions";
import { type CouponTemplate } from "@/lib/store";
import { AdminCouponTemplateModal } from "@/components/admin-coupon-template-modal";

interface AdminCampaignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCampaignsUpdated?: (campaigns: PromotionCampaign[]) => void;
}

export function AdminCampaignModal({
  open,
  onOpenChange,
  onCampaignsUpdated
}: AdminCampaignModalProps) {
  const [campaigns, setCampaigns] = useState<PromotionCampaign[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<PromotionCampaign | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rewardCouponExpiryDate, setRewardCouponExpiryDate] = useState("");
  const [expiryMode, setExpiryMode] = useState<"RELATIVE_DAYS" | "FIXED_DATE">("RELATIVE_DAYS");
  const [validityDays, setValidityDays] = useState<number | string>(30);
  const [minOrderSubtotal, setMinOrderSubtotal] = useState<number | string>(1000);
  const [excludeDeliveryFee, setExcludeDeliveryFee] = useState(true);
  const [excludeCorporate, setExcludeCorporate] = useState(true);
  const [allowGeneral, setAllowGeneral] = useState(true);
  const [allowMember, setAllowMember] = useState(true);
  const [allowVIP, setAllowVIP] = useState(true);
  const [limitPerCustomer, setLimitPerCustomer] = useState<number | string>(1);
  const [couponName, setCouponName] = useState("วอยเชอร์ส่วนลด 100 บาท");
  const [codePrefix, setCodePrefix] = useState("PROMO");
  const [discountType, setDiscountType] = useState<PromotionCampaign["reward"]["discountType"]>("FIXED");
  const [discountValue, setDiscountValue] = useState<number | string>(100);
  const [applicableCategory, setApplicableCategory] = useState("ALL");
  const [minOrderAmount, setMinOrderAmount] = useState<number | string>("");
  const [maxDiscount, setMaxDiscount] = useState<number | string>("");

  // Voucher Templates for Reward selection
  const [templates, setTemplates] = useState<CouponTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [showCustomizeFields, setShowCustomizeFields] = useState(false);

  const fetchTemplates = async () => {
    try {
      const res = await getCouponTemplatesAction();
      if (res.success && res.templates) {
        setTemplates(res.templates);
        return res.templates;
      }
    } catch (e) {
      console.error("Failed to load templates:", e);
    }
    return [];
  };

  const handleSelectTemplate = (templateId: string, currentTemplates = templates) => {
    setSelectedTemplateId(templateId);
    if (!templateId || templateId === "CUSTOM") {
      setShowCustomizeFields(true);
      return;
    }
    const tpl = currentTemplates.find(t => t.id === templateId);
    if (tpl) {
      setCouponName(tpl.name);
      setCodePrefix(tpl.codePrefix || "PROMO");
      setDiscountType(tpl.discountType === "CASH_VOUCHER" ? "FIXED" : tpl.discountType);
      setDiscountValue(tpl.discountValue);
      setApplicableCategory(tpl.applicableCategory || "ALL");
      setMinOrderAmount(tpl.minOrderAmount != null ? tpl.minOrderAmount : "");
      setMaxDiscount(tpl.maxDiscount != null ? tpl.maxDiscount : "");

      if (tpl.days && Number(tpl.days) > 0) {
        setValidityDays(tpl.days);
        setExpiryMode("RELATIVE_DAYS");
        setRewardCouponExpiryDate(format(addDays(new Date(), Number(tpl.days)), "yyyy-MM-dd"));
      }
      setShowCustomizeFields(false);
    }
  };

  const fetchCampaigns = async () => {
    setIsLoading(true);
    try {
      const res = await getPromotionCampaignsAction();
      if (res.success && res.campaigns) {
        setCampaigns(res.campaigns);
        onCampaignsUpdated?.(res.campaigns);
      }
    } catch (e: any) {
      toast.error(e?.message || "ไม่สามารถโหลดแคมเปญได้");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchCampaigns();
      fetchTemplates();
      setEditingCampaign(null);
      setIsCreatingNew(false);
    }
  }, [open]);

  const handleOpenCreate = () => {
    const today = format(new Date(), "yyyy-MM-dd");
    const end = format(addDays(new Date(), 30), "yyyy-MM-dd");
    const exp = format(addDays(new Date(), 60), "yyyy-MM-dd");

    setName("แคมเปญโปรโมชั่นใหม่");
    setDescription("เมื่อใช้บริการครบตามเงื่อนไข รับวอยเชอร์ส่วนลดอัตโนมัติ");
    setEnabled(true);
    setStartDate(today);
    setEndDate(end);
    setExpiryMode("RELATIVE_DAYS");
    setValidityDays(30);
    setRewardCouponExpiryDate("");
    setMinOrderSubtotal(1000);
    setExcludeDeliveryFee(true);
    setExcludeCorporate(true);
    setAllowGeneral(true);
    setAllowMember(true);
    setAllowVIP(true);
    setLimitPerCustomer(1);
    setCouponName("วอยเชอร์ส่วนลด 100 บาท");
    setCodePrefix("PROMO");
    setDiscountType("FIXED");
    setDiscountValue(100);
    setApplicableCategory("ALL");
    setMinOrderAmount("");
    setMaxDiscount("");
    setSelectedTemplateId("");
    setShowCustomizeFields(false);

    setEditingCampaign(null);
    setIsCreatingNew(true);
  };

  const handleOpenEdit = (c: PromotionCampaign) => {
    setName(c.name);
    setDescription(c.description || "");
    setEnabled(c.enabled ?? true);
    setStartDate(c.startDate ? c.startDate.slice(0, 10) : "");
    setEndDate(c.endDate ? c.endDate.slice(0, 10) : "");
    
    const isFixed = c.rewardCouponExpiryType === "FIXED_DATE";
    setExpiryMode(isFixed ? "FIXED_DATE" : "RELATIVE_DAYS");
    setValidityDays(c.rewardCouponValidityDays || 30);
    setRewardCouponExpiryDate(c.rewardCouponExpiryDate ? c.rewardCouponExpiryDate.slice(0, 10) : "");
    setMinOrderSubtotal(c.conditions?.minOrderSubtotal ?? 1000);
    setExcludeDeliveryFee(c.conditions?.excludeDeliveryFee ?? true);
    
    const corpExcluded = c.conditions?.excludeCorporate ?? (c.conditions?.allowCorporate != null ? !c.conditions.allowCorporate : true);
    const memberAllowed = c.conditions?.allowMember ?? (c.conditions?.excludeMember != null ? !c.conditions.excludeMember : true);
    const vipAllowed = c.conditions?.allowVIP ?? (c.conditions?.excludeVIP != null ? !c.conditions.excludeVIP : true);
    const generalAllowed = c.conditions?.allowGeneral ?? true;

    setExcludeCorporate(corpExcluded);
    setAllowMember(memberAllowed);
    setAllowVIP(vipAllowed);
    setAllowGeneral(generalAllowed);
    setLimitPerCustomer(c.conditions?.limitPerCustomer ?? 1);
    setCouponName(c.reward?.couponName || "วอยเชอร์ส่วนลด");
    setCodePrefix(c.reward?.codePrefix || "PROMO");
    setDiscountType(c.reward?.discountType || "FIXED");
    setDiscountValue(c.reward?.discountValue ?? 100);
    setApplicableCategory(c.reward?.applicableCategory || "ALL");
    setMinOrderAmount(c.reward?.minOrderAmount != null ? c.reward.minOrderAmount : "");
    setMaxDiscount(c.reward?.maxDiscount != null ? c.reward.maxDiscount : "");

    const matchedTpl = templates.find(t => t.id === c.reward?.templateId) ||
                       templates.find(t => t.codePrefix === c.reward?.codePrefix && t.name === c.reward?.couponName);
    setSelectedTemplateId(matchedTpl ? matchedTpl.id : (c.reward?.templateId || (c.reward ? "CUSTOM" : "")));
    setShowCustomizeFields(!matchedTpl);

    setIsCreatingNew(false);
    setEditingCampaign(c);
  };

  const handleToggleEnable = async (campaign: PromotionCampaign) => {
    try {
      const updated = { ...campaign, enabled: !campaign.enabled };
      const res = await savePromotionCampaignAction(updated);
      if (res.success && res.campaigns) {
        setCampaigns(res.campaigns);
        onCampaignsUpdated?.(res.campaigns);
        toast.success(`เปลี่ยนสถานะแคมเปญ "${campaign.name}" เป็น ${updated.enabled ? "เปิดใช้งาน" : "ปิดใช้งาน"} เรียบร้อย`);
      } else {
        toast.error(res.error || "ไม่สามารถเปลี่ยนสถานะแคมเปญได้");
      }
    } catch (e: any) {
      toast.error(e?.message || "เกิดข้อผิดพลาด");
    }
  };

  const handleDelete = async (campaign: PromotionCampaign) => {
    if (!confirm(`คุณต้องการลบแคมเปญ "${campaign.name}" ใช่หรือไม่?`)) return;
    try {
      const res = await deletePromotionCampaignAction(campaign.id);
      if (res.success && res.campaigns) {
        setCampaigns(res.campaigns);
        onCampaignsUpdated?.(res.campaigns);
        toast.success("ลบแคมเปญเรียบร้อยแล้ว");
      } else {
        toast.error(res.error || "ไม่สามารถลบแคมเปญได้");
      }
    } catch (e: any) {
      toast.error(e?.message || "เกิดข้อผิดพลาด");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("กรุณาระบุชื่อแคมเปญ");
      return;
    }

    setIsSaving(true);
    try {
      const targetCategory = applicableCategory && applicableCategory !== "ALL" ? applicableCategory : null;
      const campaignData: PromotionCampaign = {
        id: editingCampaign?.id || `promo_${Date.now().toString(36)}`,
        name: name.trim(),
        description: description.trim(),
        enabled,
        startDate: startDate ? startDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
        endDate: endDate ? endDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
        rewardCouponExpiryType: expiryMode,
        rewardCouponValidityDays: Number(validityDays) || 30,
        rewardCouponExpiryDate: expiryMode === "FIXED_DATE" && rewardCouponExpiryDate 
          ? rewardCouponExpiryDate.slice(0, 10) 
          : undefined,
        conditions: {
          minOrderSubtotal: Number(minOrderSubtotal) || 0,
          excludeDeliveryFee: Boolean(excludeDeliveryFee),
          excludeCorporate: Boolean(excludeCorporate),
          excludeMember: !allowMember,
          excludeVIP: !allowVIP,
          allowGeneral: Boolean(allowGeneral),
          allowMember: Boolean(allowMember),
          allowVIP: Boolean(allowVIP),
          allowCorporate: !excludeCorporate,
          limitPerCustomer: Number(limitPerCustomer) || 0,
          eligibleBrands: editingCampaign?.conditions?.eligibleBrands || ["that_laundry_shop", "noname_laundry"],
        },
        reward: {
          templateId: selectedTemplateId && selectedTemplateId !== "CUSTOM" ? selectedTemplateId : undefined,
          couponName: couponName.trim() || "วอยเชอร์ส่วนลด",
          codePrefix: (codePrefix || "PROMO").toUpperCase().trim(),
          discountType,
          discountValue: Number(discountValue) || 0,
          applicableCategory: targetCategory,
          minOrderAmount: minOrderAmount !== "" ? Number(minOrderAmount) : null,
          maxDiscount: maxDiscount !== "" ? Number(maxDiscount) : null,
        },
      };

      const res = await savePromotionCampaignAction(campaignData);
      if (res.success && res.campaigns) {
        setCampaigns(res.campaigns);
        onCampaignsUpdated?.(res.campaigns);
        toast.success(isCreatingNew ? "สร้างแคมเปญใหม่เรียบร้อยแล้ว" : "บันทึกแคมเปญเรียบร้อยแล้ว");
        setIsCreatingNew(false);
        setEditingCampaign(null);
      } else {
        toast.error(res.error || "ไม่สามารถบันทึกแคมเปญได้");
      }
    } catch (e: any) {
      toast.error(e?.message || "เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 bg-card border-border shadow-2xl rounded-2xl z-[9999]">
        <div className="p-6 border-b border-border/80 bg-muted/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20">
              <Megaphone size={20} />
            </div>
            <div>
              <DialogTitle className="text-lg font-black text-foreground flex items-center gap-2">
                Promotion Campaigns (จัดการแคมเปญโปรโมชั่น)
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Set conditions for automatic voucher issuance based on spending criteria (POS & CRM)
              </DialogDescription>
            </div>
          </div>

          {!isCreatingNew && !editingCampaign && (
            <Button
              type="button"
              onClick={handleOpenCreate}
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl gap-1.5 shadow-sm cursor-pointer"
            >
              <Plus size={15} />
              <span>Create Campaign (สร้างแคมเปญ)</span>
            </Button>
          )}
        </div>

        <div className="p-6 space-y-6">
          {/* VIEW 1: CAMPAIGN LIST */}
          {!isCreatingNew && !editingCampaign && (
            <div className="space-y-4">
              {isLoading ? (
                <div className="py-12 text-center text-xs font-bold text-muted-foreground">
                  Loading campaigns... (กำลังโหลดข้อมูลแคมเปญ...)
                </div>
              ) : campaigns.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground border border-dashed rounded-2xl">
                  <Megaphone size={32} className="mx-auto mb-2 opacity-40 text-amber-500" />
                  <p className="text-sm font-bold text-foreground">No Promotion Campaigns (ยังไม่มีแคมเปญโปรโมชั่นในระบบ)</p>
                  <p className="text-xs text-muted-foreground mt-1">Click "Create Campaign" to configure promo rules (กดปุ่มสร้างแคมเปญเพื่อเริ่มต้น)</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {campaigns.map((c) => (
                    <div
                      key={c.id}
                      className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                        c.enabled
                          ? "bg-card border-border shadow-2xs hover:border-indigo-300"
                          : "bg-muted/40 border-dashed border-border opacity-70"
                      }`}
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-sm text-foreground">{c.name}</span>
                              <Badge
                                variant={c.enabled ? "default" : "secondary"}
                                className={`text-[10px] font-bold ${c.enabled ? "bg-emerald-600" : ""}`}
                              >
                                {c.enabled ? "Active (เปิดใช้งาน)" : "Inactive (ปิดใช้งาน)"}
                              </Badge>
                            </div>
                            {c.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.description}</p>
                            )}
                          </div>
                        </div>

                        {/* Conditions Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                          <span className="px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800">
                            Spent ≥ ฿{c.conditions?.minOrderSubtotal?.toLocaleString()} {c.conditions?.excludeDeliveryFee ? "(ไม่รวมค่าส่ง)" : ""}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800">
                            Get {c.reward?.couponName} ({c.reward?.discountType === "PERCENTAGE" ? `-${c.reward.discountValue}%` : c.reward?.discountType === "FREE_DELIVERY" ? "Free Delivery" : `-฿${c.reward?.discountValue}`})
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-800">
                            {getCategoryIcon(c.reward?.applicableCategory)} {getCategoryLabel(c.reward?.applicableCategory)}
                          </span>
                          {c.conditions?.limitPerCustomer > 0 && (
                            <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                              Limit {c.conditions.limitPerCustomer} / customer (คนละ {c.conditions.limitPerCustomer} สิทธิ์)
                            </span>
                          )}

                          {/* Eligibility Badges */}
                          {c.conditions?.allowMember === false || c.conditions?.excludeMember ? (
                            <span className="px-2 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold border border-rose-200 dark:border-rose-800 text-[10px]">
                              Exclude Member (ยกเว้น)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800 text-[10px]">
                              Member Eligible (ได้รับ)
                            </span>
                          )}

                          {c.conditions?.allowVIP === false || c.conditions?.excludeVIP ? (
                            <span className="px-2 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold border border-rose-200 dark:border-rose-800 text-[10px]">
                              Exclude VIP (ยกเว้น)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-bold border border-purple-200 dark:border-purple-800 text-[10px]">
                              VIP Eligible (ได้รับ)
                            </span>
                          )}

                          {c.conditions?.excludeCorporate !== false && (
                            <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-[10px]">
                              Exclude Corporate (ยกเว้น)
                            </span>
                          )}
                        </div>

                        {/* Date Range */}
                        <div className="text-[11px] text-muted-foreground flex items-center gap-2 pt-1 border-t border-border/60">
                          <Calendar size={12} className="text-slate-400" />
                          <span>Period (ช่วงแจก): {c.startDate?.slice(0, 10)} to {c.endDate?.slice(0, 10)}</span>
                          <span>•</span>
                          <span className="font-semibold text-amber-600 dark:text-amber-400">
                            {c.rewardCouponExpiryType === "FIXED_DATE" && c.rewardCouponExpiryDate
                              ? `Fixed Expiry (หมดอายุพร้อมกัน): ${c.rewardCouponExpiryDate.slice(0, 10)}`
                              : `Validity (อายุวอยเชอร์): ${c.rewardCouponValidityDays || 30} Days (วัน)`}
                          </span>
                        </div>
                      </div>

                      {/* Card Actions */}
                      <div className="flex items-center justify-between pt-3 mt-3 border-t border-border/80">
                        <button
                          type="button"
                          onClick={() => handleToggleEnable(c)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            c.enabled
                              ? "text-slate-600 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              : "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                          }`}
                        >
                          <Power size={13} />
                          <span>{c.enabled ? "Disable (ปิดชั่วคราว)" : "Enable (เปิดใช้งาน)"}</span>
                        </button>

                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenEdit(c)}
                            className="h-8 px-3 text-xs font-bold gap-1 cursor-pointer"
                          >
                            <Edit2 size={12} />
                            <span>Edit (แก้ไข)</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(c)}
                            className="h-8 px-2 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* VIEW 2: CREATE / EDIT CAMPAIGN FORM */}
          {(isCreatingNew || editingCampaign) && (
            <form onSubmit={handleSave} className="space-y-6">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="font-black text-sm text-foreground">
                    {isCreatingNew ? "Create Campaign (สร้างแคมเปญโปรโมชั่นใหม่)" : `Edit Campaign (แก้ไขแคมเปญ): ${editingCampaign?.name}`}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsCreatingNew(false);
                    setEditingCampaign(null);
                  }}
                  className="h-8 text-xs font-bold cursor-pointer"
                >
                  <X size={14} className="mr-1" /> Cancel (ยกเลิก)
                </Button>
              </div>

              {/* SECTION 1: General & Period */}
              <div className="space-y-3 p-4 rounded-2xl border border-border bg-muted/10">
                <div className="flex items-center gap-1.5 font-bold text-foreground text-xs pb-1 border-b border-border/60">
                  <Megaphone size={14} className="text-amber-500" />
                  <span>General & Period (ข้อมูลทั่วไป & ระยะเวลาแคมเปญ)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] font-bold mb-1 block">Campaign Name (ชื่อแคมเปญ)</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. ซักครบ 1,000 รับวอยเชอร์ซักรองเท้า 100.-"
                      className="h-9 text-xs font-bold"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-bold mb-1 block">Description (คำอธิบายรายละเอียด)</Label>
                    <Input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="เงื่อนไขและรายละเอียดโปรโมชั่นสำหรับสื่อสารลูกค้า"
                      className="h-9 text-xs font-medium"
                    />
                  </div>
                </div>

                {/* Campaign Period */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div>
                    <Label className="text-[11px] font-bold mb-1 block">📅 Start Date (วันเริ่มแจกวอยเชอร์)</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="h-9 text-xs font-bold"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-bold mb-1 block">📅 End Date (วันสิ้นสุดการแจก)</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="h-9 text-xs font-bold"
                      required
                    />
                  </div>
                </div>

                {/* Expiry Mode Options */}
                <div className="pt-2 border-t border-border/40">
                  <Label className="text-[11px] font-bold mb-2 flex items-center gap-1.5 text-foreground">
                    <Clock size={13} className="text-amber-500" />
                    <span>Voucher Expiry Setting (กำหนดวันหมดอายุของวอยเชอร์ที่ลูกค้าจะได้รับ)</span>
                  </Label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {/* Mode 1: RELATIVE_DAYS */}
                    <div
                      onClick={() => setExpiryMode("RELATIVE_DAYS")}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                        expiryMode === "RELATIVE_DAYS"
                          ? "border-amber-500 bg-amber-50/60 dark:bg-amber-950/20 ring-1 ring-amber-500"
                          : "border-border bg-card/50 hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-foreground">
                        <input
                          type="radio"
                          name="expiryMode"
                          checked={expiryMode === "RELATIVE_DAYS"}
                          onChange={() => setExpiryMode("RELATIVE_DAYS")}
                          className="accent-amber-500 cursor-pointer"
                        />
                        <span>Relative Days - Recommended (นับตามจำนวนวันหลังได้รับ - แนะนำ)</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 ml-5">
                        ยุติธรรมกับลูกค้าที่มาใช้บริการช่วงท้ายแคมเปญ มีเวลาใช้วอยเชอร์เต็มจำนวนวัน (e.g. 30 วันหลังได้รับ)
                      </p>
                      {expiryMode === "RELATIVE_DAYS" && (
                        <div className="mt-2.5 ml-5 flex items-center gap-2">
                          <span className="text-[11px] font-medium text-muted-foreground">Valid for (มีอายุใช้งาน):</span>
                          <Input
                            type="number"
                            value={validityDays}
                            onChange={(e) => setValidityDays(e.target.value)}
                            className="h-7 w-20 text-xs font-black text-center"
                            min={1}
                            required={expiryMode === "RELATIVE_DAYS"}
                          />
                          <span className="text-[11px] font-bold text-foreground">Days after issue (วันนับจากวันที่ออกบิล)</span>
                        </div>
                      )}
                    </div>

                    {/* Mode 2: FIXED_DATE */}
                    <div
                      onClick={() => setExpiryMode("FIXED_DATE")}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                        expiryMode === "FIXED_DATE"
                          ? "border-amber-500 bg-amber-50/60 dark:bg-amber-950/20 ring-1 ring-amber-500"
                          : "border-border bg-card/50 hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-foreground">
                        <input
                          type="radio"
                          name="expiryMode"
                          checked={expiryMode === "FIXED_DATE"}
                          onChange={() => setExpiryMode("FIXED_DATE")}
                          className="accent-amber-500 cursor-pointer"
                        />
                        <span>Fixed Expiry Date (หมดอายุพร้อมกันตามวันที่กำหนด)</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 ml-5">
                        วอยเชอร์ทุกใบจะหมดอายุในวันเดียวกัน เหมาะกับโปรโมชั่นที่ต้องปิดรอบบัญชีตามไตรมาสหรือสิ้นปี
                      </p>
                      {expiryMode === "FIXED_DATE" && (
                        <div className="mt-2.5 ml-5 flex items-center gap-2">
                          <span className="text-[11px] font-medium text-muted-foreground">Expiry Date (หมดอายุวันที่):</span>
                          <Input
                            type="date"
                            value={rewardCouponExpiryDate}
                            onChange={(e) => setRewardCouponExpiryDate(e.target.value)}
                            className="h-7 text-xs font-bold w-auto"
                            required={expiryMode === "FIXED_DATE"}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Issuance Conditions */}
              <div className="space-y-3 p-4 rounded-2xl border border-border bg-muted/10">
                <div className="flex items-center gap-1.5 font-bold text-foreground text-xs pb-1 border-b border-border/60">
                  <ShieldCheck size={14} className="text-emerald-500" />
                  <span>Issuance Conditions (เงื่อนไขยอดบิล & การได้รับสิทธิ์)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] font-bold mb-1 block">💰 Min Spending Subtotal (ยอดบริการขั้นต่ำ ฿)</Label>
                    <Input
                      type="number"
                      value={minOrderSubtotal}
                      onChange={(e) => setMinOrderSubtotal(e.target.value)}
                      className="h-9 text-xs font-bold"
                      min={0}
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">ยอดบิลที่ลูกค้าต้องใช้บริการถึงจึงจะได้รับวอยเชอร์</p>
                  </div>
                  <div>
                    <Label className="text-[11px] font-bold mb-1 block">👤 Limit Per Customer (จำกัดสิทธิ์ต่อลูกค้า)</Label>
                    <Input
                      type="number"
                      value={limitPerCustomer}
                      onChange={(e) => setLimitPerCustomer(e.target.value)}
                      className="h-9 text-xs font-bold"
                      min={0}
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">1 = คนละ 1 สิทธิ์ตลอดแคมเปญ (0 = ไม่จำกัดจำนวนสิทธิ์)</p>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={excludeDeliveryFee}
                      onChange={(e) => setExcludeDeliveryFee(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-semibold text-foreground">
                      Exclude Delivery Fee from Min Spending (ไม่นับรวมค่าจัดส่งในยอดขั้นต่ำ - คำนวณเฉพาะยอดค่าบริการซัก)
                    </span>
                  </label>

                  <div className="pt-2 border-t border-border/60">
                    <Label className="text-[11px] font-bold mb-1.5 block text-foreground flex items-center gap-1.5">
                      <Users size={13} className="text-indigo-600" />
                      <span>Customer Eligibility (กลุ่มลูกค้าที่มีสิทธิ์ได้รับวอยเชอร์)</span>
                    </Label>
                    <p className="text-[10px] text-muted-foreground mb-2.5">
                      กำหนดว่าลูกค้ากลุ่มใดบ้างที่จะได้รับวอยเชอร์เมื่อใช้บริการถึงเกณฑ์ขั้นต่ำ
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-background/60 p-3 rounded-xl border">
                      {/* 1. Member */}
                      <label className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/50 cursor-pointer select-none transition-colors border border-border/50">
                        <input
                          type="checkbox"
                          checked={allowMember}
                          onChange={(e) => setAllowMember(e.target.checked)}
                          className="w-4 h-4 mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <div className="text-xs">
                          <span className="font-bold text-foreground flex items-center gap-1">
                            <span>Member Customers (ลูกค้าสมาชิก)</span>
                            {allowMember && <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-bold">Eligible (ได้รับ)</span>}
                          </span>
                          <span className="block text-[10px] text-muted-foreground mt-0.5">
                            {allowMember ? "Auto-rewarded upon min spending (ได้รับวอยเชอร์อัตโนมัติเมื่อยอดถึง)" : "❌ Excluded (ยกเว้น - สมาชิกไม่ได้รับวอยเชอร์นี้)"}
                          </span>
                        </div>
                      </label>

                      {/* 2. VIP */}
                      <label className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/50 cursor-pointer select-none transition-colors border border-border/50">
                        <input
                          type="checkbox"
                          checked={allowVIP}
                          onChange={(e) => setAllowVIP(e.target.checked)}
                          className="w-4 h-4 mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <div className="text-xs">
                          <span className="font-bold text-foreground flex items-center gap-1">
                            <span>VIP Customers (ลูกค้า VIP)</span>
                            {allowVIP && <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-800 font-bold">Eligible (ได้รับ)</span>}
                          </span>
                          <span className="block text-[10px] text-muted-foreground mt-0.5">
                            {allowVIP ? "Auto-rewarded upon min spending (ได้รับวอยเชอร์อัตโนมัติเมื่อยอดถึง)" : "❌ Excluded (ยกเว้น - VIP ไม่ได้รับวอยเชอร์นี้)"}
                          </span>
                        </div>
                      </label>

                      {/* 3. General */}
                      <label className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/50 cursor-pointer select-none transition-colors border border-border/50">
                        <input
                          type="checkbox"
                          checked={allowGeneral}
                          onChange={(e) => setAllowGeneral(e.target.checked)}
                          className="w-4 h-4 mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <div className="text-xs">
                          <span className="font-bold text-foreground flex items-center gap-1">
                            <span>General Customers (ลูกค้าทั่วไป / Walk-in)</span>
                            {allowGeneral && <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 font-bold">Eligible (ได้รับ)</span>}
                          </span>
                          <span className="block text-[10px] text-muted-foreground mt-0.5">
                            {allowGeneral ? "Auto-rewarded upon min spending (ได้รับวอยเชอร์อัตโนมัติเมื่อยอดถึง)" : "❌ Excluded (ยกเว้น - เฉพาะกลุ่มพิเศษ)"}
                          </span>
                        </div>
                      </label>

                      {/* 4. Corporate */}
                      <label className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/50 cursor-pointer select-none transition-colors border border-border/50">
                        <input
                          type="checkbox"
                          checked={!excludeCorporate}
                          onChange={(e) => setExcludeCorporate(!e.target.checked)}
                          className="w-4 h-4 mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <div className="text-xs">
                          <span className="font-bold text-foreground flex items-center gap-1">
                            <span>Corporate Customers (ลูกค้านิติบุคคล)</span>
                            {!excludeCorporate && <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-bold">Eligible (ได้รับ)</span>}
                          </span>
                          <span className="block text-[10px] text-muted-foreground mt-0.5">
                            {!excludeCorporate ? "Auto-rewarded upon min spending (ได้รับวอยเชอร์อัตโนมัติเมื่อยอดถึง)" : "❌ Excluded (ยกเว้น - ราคาองค์กรไม่ได้รับ)"}
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Reward Voucher */}
              <div className="space-y-3.5 p-4 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/30 dark:bg-indigo-950/20">
                <div className="flex items-center justify-between pb-2 border-b border-indigo-200/80 dark:border-indigo-900/50">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-900 dark:text-indigo-300 text-xs">
                    <Tag size={14} className="text-indigo-600" />
                    <span>Reward Voucher (วอยเชอร์ที่จะได้รับเป็นรางวัล)</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTemplateModalOpen(true)}
                    className="h-7 text-[11px] font-bold text-indigo-700 hover:text-indigo-800 bg-white hover:bg-indigo-50 border-indigo-200 gap-1.5 px-2.5 rounded-lg shadow-2xs cursor-pointer"
                  >
                    <Layers size={13} className="text-indigo-600" />
                    <span>Voucher Templates (จัดการแม่แบบวอยเชอร์)</span>
                  </Button>
                </div>

                {/* Dropdown เลือก Voucher Template */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Ticket size={14} className="text-indigo-600" />
                      Select Reward Voucher from Templates (เลือกวอยเชอร์ที่จะแจก) <span className="text-rose-500">*</span>
                    </span>
                    {selectedTemplateId && selectedTemplateId !== "CUSTOM" && (
                      <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                        <Check size={11} /> Linked to Template (ผูกกับ Template แล้ว)
                      </span>
                    )}
                  </Label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => handleSelectTemplate(e.target.value)}
                    className="h-10 w-full px-3 text-xs font-bold rounded-xl border border-indigo-300 bg-white text-slate-800 cursor-pointer shadow-2xs focus:ring-2 focus:ring-indigo-500"
                    required={!selectedTemplateId}
                  >
                    <option value="">-- Please select a Voucher Template (กรุณาเลือก Voucher Template ที่จะมอบเป็นรางวัล) --</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>
                        [{t.codePrefix}] {t.name} — {t.discountType === "PERCENTAGE" ? `ลด ${t.discountValue}%` : t.discountType === "FREE_DELIVERY" ? "ฟรีค่าส่ง" : `ลด ฿${t.discountValue}`} ({t.applicableCategory && t.applicableCategory !== "ALL" ? t.applicableCategory : "ทุกบริการ"})
                      </option>
                    ))}
                    <option value="CUSTOM">✏️ Custom Voucher (กำหนดเอง / ไม่อิงเทมเพลต)</option>
                  </select>
                  <p className="text-[10px] text-slate-500">
                    เลือก Voucher Template ที่สร้างไว้ในคลัง เพื่อให้ระบบนำไปแจกให้ลูกค้าอัตโนมัติเมื่อทำยอดครบตามเงื่อนไข
                  </p>
                </div>

                {/* Selected Voucher Preview Card */}
                {selectedTemplateId && selectedTemplateId !== "CUSTOM" && (
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-indigo-200/90 shadow-2xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                        <Ticket size={20} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">{couponName}</span>
                          <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 font-mono text-[9px] px-1.5 py-0 h-4">
                            {codePrefix}-XXXX
                          </Badge>
                          {applicableCategory && applicableCategory !== "ALL" && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-indigo-300 text-indigo-700 bg-indigo-50/50">
                              {getCategoryIcon(applicableCategory)} {getCategoryLabel(applicableCategory)}
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-semibold mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="font-black text-emerald-600">
                            {discountType === "PERCENTAGE" ? `ลด ${discountValue}%` : discountType === "FREE_DELIVERY" ? "ฟรีค่าจัดส่ง" : `ลด ฿${discountValue}`}
                          </span>
                          {minOrderAmount ? <span>• ขั้นต่ำ ฿{Number(minOrderAmount).toLocaleString()}</span> : <span>• ไม่มีขั้นต่ำ</span>}
                          {maxDiscount ? <span>• ลดสูงสุด ฿{Number(maxDiscount).toLocaleString()}</span> : null}
                        </div>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCustomizeFields(!showCustomizeFields)}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 h-7 px-2 font-bold cursor-pointer shrink-0"
                    >
                      {showCustomizeFields ? "Hide Customization (ซ่อนการปรับแต่ง)" : "✏️ Customize Details (ปรับแต่งเพิ่มเติม)"}
                    </Button>
                  </div>
                )}

                {/* Customizable Fields (shown when Custom is picked or toggled) */}
                {(showCustomizeFields || selectedTemplateId === "CUSTOM" || !selectedTemplateId) && (
                  <div className="pt-2 space-y-3 border-t border-indigo-200/50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-[11px] font-bold mb-1 block">Voucher Name (ชื่อวอยเชอร์ที่ลูกค้าได้รับ)</Label>
                        <Input
                          value={couponName}
                          onChange={(e) => setCouponName(e.target.value)}
                          placeholder="e.g. วอยเชอร์ซักรองเท้า 100.-"
                          className="h-9 text-xs font-bold"
                          required
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] font-bold mb-1 block">Code Prefix (คำนำหน้ารหัส)</Label>
                        <Input
                          value={codePrefix}
                          onChange={(e) => setCodePrefix(e.target.value.toUpperCase())}
                          placeholder="e.g. SHOE100"
                          className="h-9 text-xs font-bold"
                          required
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] font-bold mb-1 block">🎯 Applicable Service Category (หมวดบริการที่ใช้ได้)</Label>
                        <select
                          value={applicableCategory}
                          onChange={(e) => setApplicableCategory(e.target.value)}
                          className="h-9 w-full px-3 text-xs font-bold rounded-xl border border-border bg-background cursor-pointer"
                        >
                          {PROMO_SERVICE_CATEGORIES.map(cat => (
                            <option key={cat.id} value={cat.id}>
                              {cat.icon} {cat.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                      <div>
                        <Label className="text-[11px] font-bold mb-1 block">Discount Type (ประเภทส่วนลด)</Label>
                        <select
                          value={discountType}
                          onChange={(e) => setDiscountType(e.target.value as any)}
                          className="h-9 w-full px-3 text-xs font-bold rounded-xl border border-border bg-background cursor-pointer"
                        >
                          <option value="FIXED">Fixed Amount ฿ (ลดเป็นจำนวนเงินบาท)</option>
                          <option value="PERCENTAGE">Percentage % (ลดเป็นเปอร์เซ็นต์)</option>
                          <option value="FREE_DELIVERY">Free Delivery (ฟรีค่าจัดส่ง)</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-[11px] font-bold mb-1 block">Discount Value (มูลค่าส่วนลด)</Label>
                        <Input
                          type="number"
                          value={discountValue}
                          onChange={(e) => setDiscountValue(e.target.value)}
                          className="h-9 text-xs font-bold"
                          min={0}
                          required
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] font-bold mb-1 block">Min Spending to Redeem ฿ (ยอดขั้นต่ำเมื่อนำมาใช้ ถ้ามี)</Label>
                        <Input
                          type="number"
                          value={minOrderAmount}
                          onChange={(e) => setMinOrderAmount(e.target.value)}
                          placeholder="ไม่จำกัดขั้นต่ำ"
                          className="h-9 text-xs font-medium"
                          min={0}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsCreatingNew(false);
                    setEditingCampaign(null);
                  }}
                  className="h-9 px-4 text-xs font-bold cursor-pointer"
                >
                  Cancel (ยกเลิก)
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  size="sm"
                  className="h-9 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm cursor-pointer"
                >
                  {isSaving ? "Saving... (กำลังบันทึก...)" : isCreatingNew ? "Create Campaign (สร้างแคมเปญ)" : "Save Changes (บันทึกการแก้ไข)"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Template Management Modal nested */}
    <AdminCouponTemplateModal
      open={templateModalOpen}
      onOpenChange={setTemplateModalOpen}
      onTemplatesUpdated={(newTpls) => {
        setTemplates(newTpls);
      }}
      onSelectTemplate={(tpl) => {
        handleSelectTemplate(tpl.id, [...templates.filter(t => t.id !== tpl.id), tpl]);
        setTemplateModalOpen(false);
      }}
    />
    </>
  );
}

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
  type CampaignMode,
  type InstantDiscountMode,
  PROMO_SERVICE_CATEGORIES,
  getCategoryLabel,
  getCategoryIcon
} from "@/lib/promotions";
import { type CouponTemplate, type ServiceItem, serviceStore } from "@/lib/store";
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
  const [campaignMode, setCampaignMode] = useState<CampaignMode>("ISSUE_COUPON");
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
  const [disallowMemberWallet, setDisallowMemberWallet] = useState(false);
  const [limitPerCustomer, setLimitPerCustomer] = useState<number | string>(1);
  const [couponName, setCouponName] = useState("วอยเชอร์ส่วนลด 100 บาท");
  const [codePrefix, setCodePrefix] = useState("PROMO");
  const [discountType, setDiscountType] = useState<PromotionCampaign["reward"]["discountType"]>("FIXED");
  const [discountValue, setDiscountValue] = useState<number | string>(100);
  const [applicableCategory, setApplicableCategory] = useState("ALL");
  const [minOrderAmount, setMinOrderAmount] = useState<number | string>("");
  const [maxDiscount, setMaxDiscount] = useState<number | string>("");

  // Instant Service Discount Mode State
  const [instantPromoCode, setInstantPromoCode] = useState("WIF120");
  const [instantAutoApply, setInstantAutoApply] = useState(true);
  const [instantTargetServiceId, setInstantTargetServiceId] = useState<string>("KIL-WIR-002");
  const [instantTargetServiceName, setInstantTargetServiceName] = useState<string>("WASH/IRON");
  const [instantTargetCategory, setInstantTargetCategory] = useState<string>("KILO");
  const [instantMinQuantity, setInstantMinQuantity] = useState<number | string>(4);
  const [instantMaxQuantity, setInstantMaxQuantity] = useState<number | string>("");
  const [instantDiscountMode, setInstantDiscountMode] = useState<InstantDiscountMode>("SPECIAL_UNIT_PRICE");
  const [instantPromoUnitPrice, setInstantPromoUnitPrice] = useState<number | string>(120);
  const [instantDiscountValue, setInstantDiscountValue] = useState<number | string>(39);
  const [availableServices, setAvailableServices] = useState<ServiceItem[]>([]);

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
      const svcs = serviceStore.getSnapshot() || [];
      setAvailableServices(svcs);
      setEditingCampaign(null);
      setIsCreatingNew(false);
    }
  }, [open]);

  const handleOpenCreate = () => {
    const today = format(new Date(), "yyyy-MM-dd");
    const end = format(addDays(new Date(), 30), "yyyy-MM-dd");

    setCampaignMode("INSTANT_DISCOUNT");
    setName("แคมเปญโปรโมชั่นใหม่");
    setDescription("ส่วนลดบริการพิเศษอัตโนมัติเมื่อใช้บริการครบจำนวนที่กำหนด");
    setEnabled(true);
    setStartDate(today);
    setEndDate(end);
    setExpiryMode("RELATIVE_DAYS");
    setValidityDays(30);
    setRewardCouponExpiryDate("");
    setMinOrderSubtotal(0);
    setExcludeDeliveryFee(true);
    setExcludeCorporate(true);
    setAllowGeneral(true);
    setAllowMember(true);
    setAllowVIP(true);
    setDisallowMemberWallet(true);
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

    setInstantPromoCode("WIF120");
    setInstantAutoApply(true);
    setInstantTargetServiceId("KIL-WIR-002");
    setInstantTargetServiceName("WASH/IRON");
    setInstantTargetCategory("KILO");
    setInstantMinQuantity(4);
    setInstantMaxQuantity("");
    setInstantDiscountMode("SPECIAL_UNIT_PRICE");
    setInstantPromoUnitPrice(120);
    setInstantDiscountValue(39);

    setEditingCampaign(null);
    setIsCreatingNew(true);
  };

  const handleOpenEdit = (c: PromotionCampaign) => {
    setCampaignMode(c.campaignMode || "ISSUE_COUPON");
    setName(c.name);
    setDescription(c.description || "");
    setEnabled(c.enabled ?? true);
    setStartDate(c.startDate ? c.startDate.slice(0, 10) : "");
    setEndDate(c.endDate ? c.endDate.slice(0, 10) : "");
    
    const isFixed = c.rewardCouponExpiryType === "FIXED_DATE";
    setExpiryMode(isFixed ? "FIXED_DATE" : "RELATIVE_DAYS");
    setValidityDays(c.rewardCouponValidityDays || 30);
    setRewardCouponExpiryDate(c.rewardCouponExpiryDate ? c.rewardCouponExpiryDate.slice(0, 10) : "");
    setMinOrderSubtotal(c.conditions?.minOrderSubtotal ?? (c.campaignMode === "INSTANT_DISCOUNT" ? 0 : 1000));
    setExcludeDeliveryFee(c.conditions?.excludeDeliveryFee ?? true);
    
    const corpExcluded = c.conditions?.excludeCorporate ?? (c.conditions?.allowCorporate != null ? !c.conditions.allowCorporate : true);
    const memberAllowed = c.conditions?.allowMember ?? (c.conditions?.excludeMember != null ? !c.conditions.excludeMember : true);
    const vipAllowed = c.conditions?.allowVIP ?? (c.conditions?.excludeVIP != null ? !c.conditions.excludeVIP : true);
    const generalAllowed = c.conditions?.allowGeneral ?? true;
    const noMemberWallet = Boolean(c.conditions?.disallowMemberWallet || c.instantRule?.disallowMemberWallet);

    setExcludeCorporate(corpExcluded);
    setAllowMember(memberAllowed);
    setAllowVIP(vipAllowed);
    setAllowGeneral(generalAllowed);
    setDisallowMemberWallet(noMemberWallet);
    setLimitPerCustomer(c.conditions?.limitPerCustomer ?? 1);
    setCouponName(c.reward?.couponName || "วอยเชอร์ส่วนลด");
    setCodePrefix(c.reward?.codePrefix || "PROMO");
    setDiscountType(c.reward?.discountType || "FIXED");
    setDiscountValue(c.reward?.discountValue ?? 100);
    setApplicableCategory(c.reward?.applicableCategory || "ALL");
    setMinOrderAmount(c.reward?.minOrderAmount != null ? c.reward.minOrderAmount : "");
    setMaxDiscount(c.reward?.maxDiscount != null ? c.reward.maxDiscount : "");

    if (c.instantRule) {
      setInstantPromoCode(c.instantRule.promoCode || c.reward?.codePrefix || "PROMO");
      setInstantAutoApply(c.instantRule.autoApply ?? true);
      setInstantTargetServiceId(c.instantRule.targetServiceId || "ALL_CATEGORY");
      setInstantTargetServiceName(c.instantRule.targetServiceName || "");
      setInstantTargetCategory(c.instantRule.targetCategory || "KILO");
      setInstantMinQuantity(c.instantRule.minQuantity ?? 1);
      setInstantMaxQuantity(c.instantRule.maxQuantity != null ? c.instantRule.maxQuantity : "");
      setInstantDiscountMode(c.instantRule.discountMode || "SPECIAL_UNIT_PRICE");
      setInstantPromoUnitPrice(c.instantRule.promoUnitPrice ?? 120);
      setInstantDiscountValue(c.instantRule.discountValue ?? 0);
    } else {
      setInstantPromoCode(c.reward?.codePrefix || "WIF120");
      setInstantAutoApply(true);
      setInstantTargetServiceId("KIL-WIR-002");
      setInstantTargetServiceName("WASH/IRON");
      setInstantTargetCategory("KILO");
      setInstantMinQuantity(4);
      setInstantMaxQuantity("");
      setInstantDiscountMode("SPECIAL_UNIT_PRICE");
      setInstantPromoUnitPrice(120);
      setInstantDiscountValue(39);
    }

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
      const isInstant = campaignMode === "INSTANT_DISCOUNT";
      const normalizedInstantCode = (instantPromoCode || codePrefix || "PROMO").toUpperCase().trim();
      const matchedSvc = availableServices.find(s => s.id === instantTargetServiceId);
      const effectiveTargetSvcName = matchedSvc
        ? matchedSvc.name
        : (instantTargetServiceId === "ALL_CATEGORY" ? null : (instantTargetServiceName.trim() || null));
      const effectiveTargetCat = matchedSvc
        ? matchedSvc.category
        : (instantTargetCategory && instantTargetCategory !== "ALL" ? instantTargetCategory : null);

      const campaignData: PromotionCampaign = {
        id: editingCampaign?.id || `promo_${Date.now().toString(36)}`,
        name: name.trim(),
        description: description.trim(),
        enabled,
        campaignMode,
        startDate: startDate ? startDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
        endDate: endDate ? endDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
        rewardCouponExpiryType: expiryMode,
        rewardCouponValidityDays: Number(validityDays) || 30,
        rewardCouponExpiryDate: expiryMode === "FIXED_DATE" && rewardCouponExpiryDate 
          ? rewardCouponExpiryDate.slice(0, 10) 
          : undefined,
        conditions: {
          minOrderSubtotal: isInstant ? (Number(minOrderSubtotal) || 0) : (Number(minOrderSubtotal) || 0),
          excludeDeliveryFee: Boolean(excludeDeliveryFee),
          excludeCorporate: Boolean(excludeCorporate),
          excludeMember: !allowMember,
          excludeVIP: !allowVIP,
          allowGeneral: Boolean(allowGeneral),
          allowMember: Boolean(allowMember),
          allowVIP: Boolean(allowVIP),
          allowCorporate: !excludeCorporate,
          disallowMemberWallet: isInstant ? Boolean(disallowMemberWallet) : false,
          limitPerCustomer: Number(limitPerCustomer) || 0,
          eligibleBrands: editingCampaign?.conditions?.eligibleBrands || ["that_laundry_shop", "noname_laundry"],
        },
        instantRule: isInstant
          ? {
              promoCode: normalizedInstantCode,
              autoApply: Boolean(instantAutoApply),
              targetServiceId: instantTargetServiceId === "ALL_CATEGORY" ? null : (instantTargetServiceId || null),
              targetServiceName: effectiveTargetSvcName,
              targetCategory: effectiveTargetCat,
              minQuantity: Number(instantMinQuantity) || 1,
              maxQuantity: instantMaxQuantity !== "" ? Number(instantMaxQuantity) : null,
              discountMode: instantDiscountMode,
              promoUnitPrice: instantDiscountMode === "SPECIAL_UNIT_PRICE" ? (Number(instantPromoUnitPrice) || 0) : null,
              discountValue: Number(instantDiscountValue) || 0,
              disallowMemberWallet: Boolean(disallowMemberWallet),
            }
          : undefined,
        reward: isInstant
          ? {
              couponName: name.trim(),
              codePrefix: normalizedInstantCode,
              discountType: instantDiscountMode === "PERCENTAGE" ? "PERCENTAGE" : "FIXED",
              discountValue: Number(instantDiscountValue) || 0,
              applicableCategory: effectiveTargetCat,
              minOrderAmount: null,
              maxDiscount: null,
            }
          : {
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
                Configure Instant Auto-Promo Discounts & Spend-to-Get Voucher Campaigns (POS & All Jobs)
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
                  {campaigns.map((c) => {
                    const isInstant = c.campaignMode === "INSTANT_DISCOUNT" || Boolean(c.instantRule);
                    return (
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
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-sm text-foreground">{c.name}</span>
                              <Badge
                                variant={c.enabled ? "default" : "secondary"}
                                className={`text-[10px] font-bold ${c.enabled ? "bg-emerald-600" : ""}`}
                              >
                                {c.enabled ? "Active (เปิดใช้งาน)" : "Inactive (ปิดใช้งาน)"}
                              </Badge>
                              {isInstant ? (
                                <Badge className="bg-amber-500 text-white text-[10px] font-bold">
                                  ⚡ Instant Promo (ลดทันที)
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] font-bold border-indigo-300 text-indigo-700">
                                  🎟️ Issue Voucher (แจกวอยเชอร์)
                                </Badge>
                              )}
                            </div>
                            {c.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.description}</p>
                            )}
                          </div>
                        </div>

                        {/* Conditions Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                          {isInstant && c.instantRule ? (
                            <>
                              <span className="px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-black border border-amber-300 dark:border-amber-800 font-mono">
                                🏷️ Code: {c.instantRule.promoCode} {c.instantRule.autoApply ? "(Auto-Apply)" : "(Manual)"}
                              </span>
                              <span className="px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800">
                                🎯 {c.instantRule.targetServiceName || c.instantRule.targetCategory || "All Services"} ≥ {c.instantRule.minQuantity} {c.instantRule.targetCategory === "KILO" ? "Kg" : "Units"}
                              </span>
                              <span className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800">
                                {c.instantRule.discountMode === "SPECIAL_UNIT_PRICE"
                                  ? `Special Price ฿${c.instantRule.promoUnitPrice}/${c.instantRule.targetCategory === "KILO" ? "Kg" : "Unit"}`
                                  : c.instantRule.discountMode === "DISCOUNT_PER_UNIT"
                                    ? `ลด ฿${c.instantRule.discountValue}/${c.instantRule.targetCategory === "KILO" ? "Kg" : "Unit"}`
                                    : c.instantRule.discountMode === "PERCENTAGE"
                                      ? `ลด ${c.instantRule.discountValue}%`
                                      : `ลด ฿${c.instantRule.discountValue}`}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800">
                                Spent ≥ ฿{c.conditions?.minOrderSubtotal?.toLocaleString()} {c.conditions?.excludeDeliveryFee ? "(ไม่รวมค่าส่ง)" : ""}
                              </span>
                              <span className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800">
                                Get {c.reward?.couponName} ({c.reward?.discountType === "PERCENTAGE" ? `-${c.reward.discountValue}%` : c.reward?.discountType === "FREE_DELIVERY" ? "Free Delivery" : `-฿${c.reward?.discountValue}`})
                              </span>
                              <span className="px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-800">
                                {getCategoryIcon(c.reward?.applicableCategory)} {getCategoryLabel(c.reward?.applicableCategory)}
                              </span>
                            </>
                          )}
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
                              Member Eligible (ร่วมได้)
                            </span>
                          )}

                          {(c.conditions?.disallowMemberWallet || c.instantRule?.disallowMemberWallet) && (
                            <span className="px-2 py-0.5 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold border border-rose-300 dark:border-rose-800 text-[10px]">
                              🚫 No Deduct Member (ห้ามตัดเครดิตสมาชิก)
                            </span>
                          )}

                          {c.conditions?.allowVIP === false || c.conditions?.excludeVIP ? (
                            <span className="px-2 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold border border-rose-200 dark:border-rose-800 text-[10px]">
                              Exclude VIP (ยกเว้น)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-bold border border-purple-200 dark:border-purple-800 text-[10px]">
                              VIP Eligible (ร่วมได้)
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
                          <span>Period (ระยะเวลาโปรฯ): {c.startDate?.slice(0, 10)} to {c.endDate?.slice(0, 10)}</span>
                          {!isInstant && (
                            <>
                              <span>•</span>
                              <span className="font-semibold text-amber-600 dark:text-amber-400">
                                {c.rewardCouponExpiryType === "FIXED_DATE" && c.rewardCouponExpiryDate
                                  ? `Fixed Expiry (หมดอายุพร้อมกัน): ${c.rewardCouponExpiryDate.slice(0, 10)}`
                                  : `Validity (อายุวอยเชอร์): ${c.rewardCouponValidityDays || 30} Days (วัน)`}
                              </span>
                            </>
                          )}
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
                  )})}
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

              {/* CAMPAIGN MODE SELECTOR */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div
                  onClick={() => setCampaignMode("INSTANT_DISCOUNT")}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    campaignMode === "INSTANT_DISCOUNT"
                      ? "border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 ring-2 ring-amber-500/40"
                      : "border-border bg-card hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center gap-2 font-black text-xs text-foreground">
                    <input
                      type="radio"
                      name="campaignMode"
                      checked={campaignMode === "INSTANT_DISCOUNT"}
                      onChange={() => setCampaignMode("INSTANT_DISCOUNT")}
                      className="accent-amber-500"
                    />
                    <span>⚡ Instant Service Promo / Auto Promo Code (ลดราคาบริการทันทีตามน้ำหนัก/จำนวน)</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 ml-5">
                    เช่น Wash Iron Fold 120 บาท/Kg เมื่อครบ 4 Kg ขึ้นไป ใส่ Promo Code ให้อัตโนมัติ (รองรับเงื่อนไขห้ามใช้ Deduct Member)
                  </p>
                </div>

                <div
                  onClick={() => setCampaignMode("ISSUE_COUPON")}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    campaignMode === "ISSUE_COUPON"
                      ? "border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/30 ring-2 ring-indigo-500/40"
                      : "border-border bg-card hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center gap-2 font-black text-xs text-foreground">
                    <input
                      type="radio"
                      name="campaignMode"
                      checked={campaignMode === "ISSUE_COUPON"}
                      onChange={() => setCampaignMode("ISSUE_COUPON")}
                      className="accent-indigo-600"
                    />
                    <span>🎟️ Spend & Get Voucher (ซักครบยอด แจกวอยเชอร์ใช้บิลถัดไป)</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 ml-5">
                    เช่น ซักครบ 1,000 บาท รับวอยเชอร์ส่วนลดซักรองเท้า 100 บาท สำหรับนำมาใช้ในครั้งถัดไป
                  </p>
                </div>
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
                      placeholder="e.g. 11.11 Wash Iron Fold 120 บาท/Kg (ขั้นต่ำ 4 Kg)"
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
                    <Label className="text-[11px] font-bold mb-1 block">📅 Start Date (วันเริ่มแคมเปญ)</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="h-9 text-xs font-bold"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-bold mb-1 block">📅 End Date (วันสิ้นสุดแคมเปญ)</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="h-9 text-xs font-bold"
                      required
                    />
                  </div>
                </div>

                {/* Expiry Mode Options (Only for ISSUE_COUPON) */}
                {campaignMode === "ISSUE_COUPON" && (
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
                )}
              </div>

              {/* SECTION 2A: INSTANT SERVICE PROMO RULES (Shown when INSTANT_DISCOUNT) */}
              {campaignMode === "INSTANT_DISCOUNT" && (
                <div className="space-y-4 p-4 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/20">
                  <div className="flex items-center justify-between pb-2 border-b border-amber-200/80 dark:border-amber-800/60">
                    <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-300 text-xs">
                      <Sparkles size={14} className="text-amber-600" />
                      <span>Instant Service Promo Configuration (ตั้งค่าโปรโมชั่นลดราคาบริการ & Auto Promo Code)</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-[11px] font-bold mb-1 block">🏷️ Promo Code (รหัสโปรโมชั่น)</Label>
                      <Input
                        value={instantPromoCode}
                        onChange={(e) => setInstantPromoCode(e.target.value.toUpperCase())}
                        placeholder="e.g. WIF120"
                        className="h-9 text-xs font-black font-mono uppercase"
                        required
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">รหัสที่จะแสดงในบิลและใช้เช็คสิทธิ์ลูกค้า</p>
                    </div>

                    <div>
                      <Label className="text-[11px] font-bold mb-1 block">🎯 Target Service (บริการที่ร่วมรายการ)</Label>
                      <select
                        value={instantTargetServiceId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setInstantTargetServiceId(val);
                          const found = availableServices.find(s => s.id === val);
                          if (found) {
                            setInstantTargetServiceName(found.name);
                            setInstantTargetCategory(found.category || "KILO");
                            if (instantDiscountMode === "SPECIAL_UNIT_PRICE") {
                              const diff = Math.max(0, Number(found.price) - Number(instantPromoUnitPrice || 0));
                              setInstantDiscountValue(diff);
                            }
                          }
                        }}
                        className="h-9 w-full px-3 text-xs font-bold rounded-xl border border-border bg-background cursor-pointer"
                      >
                        <option value="KIL-WIR-002">WASH/IRON (ซัก อบ รีด พับ — ปกติ ฿159/Kg)</option>
                        {availableServices
                          .filter(s => s.id !== "KIL-WIR-002" && s.isActive !== false)
                          .map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.category} — ฿{s.price}/{s.unit || "unit"})
                            </option>
                          ))}
                        <option value="ALL_CATEGORY">🌐 All Services in Selected Category (ทุกบริการในหมวดหมู่)</option>
                      </select>
                    </div>

                    <div>
                      <Label className="text-[11px] font-bold mb-1 block">⚖️ Min Quantity / Weight (ขั้นต่ำ Kg หรือ ชิ้น)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={instantMinQuantity}
                        onChange={(e) => setInstantMinQuantity(e.target.value)}
                        className="h-9 text-xs font-black"
                        min={0.1}
                        required
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">เช่น 4 = ต้องใช้บริการตั้งแต่ 4 Kg ขึ้นไป</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                    <div>
                      <Label className="text-[11px] font-bold mb-1 block">💸 Pricing / Discount Mode (รูปแบบการลดราคา)</Label>
                      <select
                        value={instantDiscountMode}
                        onChange={(e) => setInstantDiscountMode(e.target.value as InstantDiscountMode)}
                        className="h-9 w-full px-3 text-xs font-bold rounded-xl border border-border bg-background cursor-pointer"
                      >
                        <option value="SPECIAL_UNIT_PRICE">Special Unit Price (กำหนดราคาโปรฯ ต่อ Kg/ชิ้น เช่น 120 ฿/Kg)</option>
                        <option value="DISCOUNT_PER_UNIT">Discount Per Unit (ลดต่อ Kg/ชิ้น เช่น ลด Kg ละ 39 ฿)</option>
                        <option value="FIXED">Fixed Bill Discount ฿ (ลดท้ายบิลคงที่ ฿)</option>
                        <option value="PERCENTAGE">Percentage Discount % (ลดเป็นเปอร์เซ็นต์ %)</option>
                      </select>
                    </div>

                    {instantDiscountMode === "SPECIAL_UNIT_PRICE" ? (
                      <div>
                        <Label className="text-[11px] font-bold mb-1 block">✨ Promo Unit Price (ราคาโปรโมชั่น บาท/Kg หรือ ชิ้น)</Label>
                        <Input
                          type="number"
                          value={instantPromoUnitPrice}
                          onChange={(e) => {
                            const val = e.target.value;
                            setInstantPromoUnitPrice(val);
                            const found = availableServices.find(s => s.id === instantTargetServiceId);
                            const normalPrice = found ? Number(found.price) : 159;
                            setInstantDiscountValue(Math.max(0, normalPrice - (Number(val) || 0)));
                          }}
                          className="h-9 text-xs font-black text-emerald-700"
                          min={0}
                          required
                        />
                        <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                          เช่น 120 บาท/Kg (ระบบจะคำนวณส่วนลดอัตโนมัติตามน้ำหนักจริง)
                        </p>
                      </div>
                    ) : (
                      <div>
                        <Label className="text-[11px] font-bold mb-1 block">
                          {instantDiscountMode === "PERCENTAGE" ? "Discount % (ลดกี่ %)" : "Discount Amount ฿ (จำนวนเงินที่ลด ฿)"}
                        </Label>
                        <Input
                          type="number"
                          value={instantDiscountValue}
                          onChange={(e) => setInstantDiscountValue(e.target.value)}
                          className="h-9 text-xs font-black"
                          min={0}
                          required
                        />
                      </div>
                    )}

                    <div>
                      <Label className="text-[11px] font-bold mb-1 block">👤 Limit Per Customer (จำกัดสิทธิ์ต่อลูกค้า)</Label>
                      <Input
                        type="number"
                        value={limitPerCustomer}
                        onChange={(e) => setLimitPerCustomer(e.target.value)}
                        className="h-9 text-xs font-bold"
                        min={0}
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">1 = คนละ 1 ครั้งตลอดแคมเปญ (0 = ไม่จำกัด)</p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-amber-200/60 flex flex-col gap-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={instantAutoApply}
                        onChange={(e) => setInstantAutoApply(e.target.checked)}
                        className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs font-bold text-foreground">
                        ⚡ Auto-Apply Promo Code (ใส่รหัสโปรโมชั่นและคำนวณส่วนลดให้อัตโนมัติทันทีเมื่อเลือกบริการและน้ำหนักครบตามเงื่อนไข)
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* SECTION 2: Issuance Conditions & Customer Eligibility */}
              <div className="space-y-3 p-4 rounded-2xl border border-border bg-muted/10">
                <div className="flex items-center gap-1.5 font-bold text-foreground text-xs pb-1 border-b border-border/60">
                  <ShieldCheck size={14} className="text-emerald-500" />
                  <span>
                    {campaignMode === "INSTANT_DISCOUNT"
                      ? "Customer Eligibility & Payment Rules (กลุ่มลูกค้าที่มีสิทธิ์ & เงื่อนไขการชำระเงิน)"
                      : "Issuance Conditions (เงื่อนไขยอดบิล & การได้รับสิทธิ์)"}
                  </span>
                </div>

                {campaignMode === "ISSUE_COUPON" && (
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
                )}

                <div className="space-y-3 pt-1">
                  {campaignMode === "ISSUE_COUPON" && (
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
                  )}

                  <div className="pt-1">
                    <Label className="text-[11px] font-bold mb-1.5 block text-foreground flex items-center gap-1.5">
                      <Users size={13} className="text-indigo-600" />
                      <span>Customer Eligibility (กลุ่มลูกค้าที่มีสิทธิ์เข้าร่วมแคมเปญ)</span>
                    </Label>

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
                            {allowMember && <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-bold">Eligible (ร่วมได้)</span>}
                          </span>
                          <span className="block text-[10px] text-muted-foreground mt-0.5">
                            {allowMember ? "ลูกค้าสมาชิกสามารถเข้าร่วมโปรโมชั่นนี้ได้" : "❌ Excluded (ยกเว้นลูกค้าสมาชิก)"}
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
                            {allowVIP && <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-800 font-bold">Eligible (ร่วมได้)</span>}
                          </span>
                          <span className="block text-[10px] text-muted-foreground mt-0.5">
                            {allowVIP ? "ลูกค้า VIP สามารถเข้าร่วมโปรโมชั่นนี้ได้" : "❌ Excluded (ยกเว้นลูกค้า VIP)"}
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
                            {allowGeneral && <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 font-bold">Eligible (ร่วมได้)</span>}
                          </span>
                          <span className="block text-[10px] text-muted-foreground mt-0.5">
                            {allowGeneral ? "ลูกค้าทั่วไปสามารถเข้าร่วมโปรโมชั่นนี้ได้" : "❌ Excluded (ยกเว้นลูกค้าทั่วไป)"}
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
                            {!excludeCorporate && <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-bold">Eligible (ร่วมได้)</span>}
                          </span>
                          <span className="block text-[10px] text-muted-foreground mt-0.5">
                            {!excludeCorporate ? "ลูกค้านิติบุคคลสามารถเข้าร่วมโปรโมชั่นนี้ได้" : "❌ Excluded (ยกเว้นราคาองค์กร)"}
                          </span>
                        </div>
                      </label>
                    </div>

                    {/* Member Payment Restriction (No Deduct Member) */}
                    {campaignMode === "INSTANT_DISCOUNT" && (allowMember || allowVIP) && (
                      <div className="mt-3 p-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20">
                        <label className="flex items-start gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={disallowMemberWallet}
                            onChange={(e) => setDisallowMemberWallet(e.target.checked)}
                            className="w-4 h-4 mt-0.5 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                          />
                          <div className="text-xs">
                            <span className="font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                              <span>🚫 Disallow "Deduct Member" Payment (ลูกค้า Member ร่วมโปรฯ ได้ แต่ต้องชำระแยก ไม่หักเครดิตสมาชิก)</span>
                            </span>
                            <span className="block text-[10px] text-rose-700/80 dark:text-rose-400 mt-0.5">
                              เมื่อเปิดใช้งาน: หากลูกค้า Member ใช้โปรโมชั่นนี้ ระบบจะปลดล็อกช่องทางชำระเงินให้เลือกจ่ายด้วย เงินสด / โอนเงิน / บัตรเครดิต เท่านั้น (ไม่ให้นำเครดิตในกระเป๋าสมาชิกมาตัดจ่ายซ้อนกับโปรโมชั่น)
                            </span>
                          </div>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION 3: Reward Voucher (Only for ISSUE_COUPON) */}
              {campaignMode === "ISSUE_COUPON" && (
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
              )}

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
